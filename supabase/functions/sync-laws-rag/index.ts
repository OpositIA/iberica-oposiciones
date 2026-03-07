/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.3";
import {
  parseJsonBody,
  sanitizeBoolean,
  sanitizeCode,
  sanitizeInteger,
  sanitizeStringArray,
} from "../_shared/inputSanitization.ts";

type RequestPayload = {
  boe_ids?: string[];
  force?: boolean;
  dry_run?: boolean;
  cursor_boe_id?: string;
  max_laws?: number;
};

type SyncTarget = {
  boeId: string;
  label: string;
};

type LawMetadata = {
  boeId: string;
  tituloLey: string;
  fechaActualizacion: string | null;
  fechaIso: string | null;
  urlNorma: string;
  eli: string | null;
};

type LawBlock = {
  bloqueId: string;
  bloqueTitulo: string;
  url: string;
};

type LawUnit = {
  bloqueId: string;
  bloqueTitulo: string;
  unitId: string;
  unitType: string;
  unitTitle: string;
  content: string;
  fechaVigencia: string | null;
  fechaPublicacion: string | null;
};

type LawChunk = {
  chunkIndex: number;
  title: string;
  content: string;
  contentHash: string;
  metadata: Record<string, unknown>;
};

type SyncLogRow = {
  boe_id: string;
  fecha_actualizacion: string | null;
};

type RagSourceRow = {
  id: number;
  is_current: boolean;
};

type ChunkIndexRow = {
  id: number;
  chunk_index: number;
};

type TargetBatch = {
  targets: SyncTarget[];
  hasMore: boolean;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-edge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

const UPSERT_BATCH_SIZE = 100;
const splitRe = /(\n\n+)|(\n)|(?<=\.)\s+|(?<=;)\s+|(?<=:)\s+/u;
const enumRe = /^\s*(\d+\.|\d+\)|[a-zA-Z]\)|[IVXLC]+\.)\s+/u;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function s(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function textContent(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") 
    return String(value).trim();
  

  if (Array.isArray(value)) 
    return normalizeText(value.map((item) => textContent(item)).filter(Boolean).join(" "));
  

  if (typeof value !== "object") return "";

  const parts: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("@_")) continue;
    const text = textContent(child);
    if (text) parts.push(text);
  }

  return normalizeText(parts.join(" "));
}

function collectByKey(value: unknown, targetKey: string, out: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectByKey(item, targetKey, out);
    return;
  }

  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;

  for (const [key, child] of Object.entries(record)) {
    if (key === targetKey) {
      for (const item of asArray(child)) {
        if (item && typeof item === "object" && !Array.isArray(item)) 
          out.push(item as Record<string, unknown>);
        
      }
    }

    if (key.startsWith("@_")) continue;
    collectByKey(child, targetKey, out);
  }
}

function collectTextsByKey(value: unknown, targetKey: string, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTextsByKey(item, targetKey, out);
    return;
  }

  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;

  for (const [key, child] of Object.entries(record)) {
    if (key === targetKey) {
      for (const item of asArray(child)) {
        const text = textContent(item);
        if (text) out.push(text);
      }
    }

    if (key.startsWith("@_")) continue;
    collectTextsByKey(child, targetKey, out);
  }
}

function findFirstTextByKeys(value: unknown, keys: Set<string>): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstTextByKeys(item, keys);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  for (const [key, child] of Object.entries(record)) {
    if (keys.has(key)) {
      const text = textContent(child);
      if (text) return text;
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (key.startsWith("@_")) continue;
    const found = findFirstTextByKeys(child, keys);
    if (found) return found;
  }

  return null;
}

function boeTsToIso(value: string | null): string | null {
  const raw = s(value);
  if (!raw || raw.length < 8 || !/^\d{8}/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function yyyymmddInt(value: string | null | undefined): number {
  const raw = s(value);
  if (!raw || raw.length < 8 || !/^\d{8}/.test(raw)) return 0;
  return Number(raw.slice(0, 8));
}

function mapUnitType(rawType: string): string {
  const value = rawType.toLowerCase();
  if (value.includes("precepto")) return "articulo";
  if (value.includes("preambulo")) return "preambulo";
  if (value.includes("anexo")) return "anexo";
  if (value.includes("adicional")) return "disposicion_adicional";
  if (value.includes("transitoria")) return "disposicion_transitoria";
  if (value.includes("derogatoria")) return "disposicion_derogatoria";
  if (value.includes("final")) return "disposicion_final";
  return "estructura";
}

function smartChunk(text: string, maxChars = 7000, minChars = 800, overlapChars = 800): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const parts = normalized.split(splitRe).filter((part) => part && part.trim());
  const chunks: string[] = [];
  let buffer = "";

  const pushBuffer = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) chunks.push(trimmed);
  };

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    if (!buffer) {
      buffer = part;
      continue;
    }

    if (buffer.length + 1 + part.length <= maxChars) {
      buffer += enumRe.test(part) ? `\n${part}` : ` ${part}`;
      continue;
    }

    if (buffer.length < minChars && part.length < maxChars) {
      buffer += ` ${part}`;
      continue;
    }

    pushBuffer(buffer);

    if (overlapChars > 0 && buffer.length > overlapChars) 
      buffer = `${buffer.slice(-overlapChars)} ${part}`.trim();
     else 
      buffer = part;
    
  }

  pushBuffer(buffer);

  const merged: string[] = [];
  for (const chunk of chunks) {
    if (merged.length > 0 && chunk.length < minChars) 
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n${chunk}`.trim();
     else 
      merged.push(chunk);
    
  }

  return merged;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseXml(xmlText: string): Record<string, unknown> {
  const parsed = parser.parse(xmlText);
  if (!parsed || typeof parsed !== "object") 
    throw new Error("Invalid BOE XML");
  
  return parsed as Record<string, unknown>;
}

async function fetchTextWithRetry(url: string, accept: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: accept,
          "User-Agent": "study-brilliance-law-sync/1.0",
        },
      });

      if (response.status === 404) 
        throw new Error(`404 Not Found: ${url}`);
      

      if (!response.ok) 
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      

      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.includes("404 Not Found")) throw lastError;
      const waitMs = 1000 * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw new Error(`GET fallo tras reintentos: ${url} | ${lastError?.message ?? "unknown"}`);
}

async function getMetadata(boeId: string): Promise<LawMetadata> {
  const xmlText = await fetchTextWithRetry(
    `https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/${boeId}/metadatos`,
    "application/xml,text/xml,*/*",
  );
  const root = parseXml(xmlText);
  const tituloLey = findFirstTextByKeys(root, new Set(["titulo"])) ?? boeId;
  const fechaActualizacion = findFirstTextByKeys(root, new Set(["fecha_actualizacion"]));
  const urlNorma = findFirstTextByKeys(root, new Set(["url_html_consolidada"]))
    ?? `https://www.boe.es/buscar/act.php?id=${encodeURIComponent(boeId)}`;
  const eli = findFirstTextByKeys(root, new Set(["eli"]));

  return {
    boeId,
    tituloLey,
    fechaActualizacion,
    fechaIso: boeTsToIso(fechaActualizacion),
    urlNorma,
    eli,
  };
}

async function getIndexBlocks(boeId: string): Promise<LawBlock[]> {
  const xmlText = await fetchTextWithRetry(
    `https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/${boeId}/texto/indice`,
    "application/xml,text/xml,*/*",
  );
  const root = parseXml(xmlText);
  const rawBlocks: Record<string, unknown>[] = [];
  collectByKey(root, "bloque", rawBlocks);

  const byId = new Map<string, LawBlock>();
  for (const rawBlock of rawBlocks) {
    const bloqueId = textContent(rawBlock.id);
    if (!bloqueId) continue;
    const bloqueTitulo = textContent(rawBlock.titulo);
    const url = textContent(rawBlock.url)
      || `https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/${boeId}/texto/bloque/${encodeURIComponent(bloqueId)}`;
    byId.set(bloqueId, {
      bloqueId,
      bloqueTitulo,
      url,
    });
  }

  return Array.from(byId.values());
}

function pickLatestVersion(rawVersions: unknown): Record<string, unknown> | null {
  const versions = asArray(rawVersions).filter((item): item is Record<string, unknown> =>
    Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
  if (versions.length === 0) return null;

  return versions.reduce((best, current) => {
    const bestKey = [
      yyyymmddInt(s(best["@_fecha_vigencia"])),
      yyyymmddInt(s(best["@_fecha_publicacion"])),
    ];
    const currentKey = [
      yyyymmddInt(s(current["@_fecha_vigencia"])),
      yyyymmddInt(s(current["@_fecha_publicacion"])),
    ];

    if (currentKey[0] > bestKey[0]) return current;
    if (currentKey[0] < bestKey[0]) return best;
    return currentKey[1] > bestKey[1] ? current : best;
  });
}

function extractUnitFromBlock(rawBlock: Record<string, unknown>, rootBlock: LawBlock): LawUnit | null {
  const unitId = s(rawBlock["@_id"]) || rootBlock.bloqueId;
  const unitType = mapUnitType(s(rawBlock["@_tipo"]));
  const unitTitle = (
    s(rawBlock["@_titulo"])
    || rootBlock.bloqueTitulo
    || unitId
    || "Unidad"
  ).slice(0, 250);

  const version = pickLatestVersion(rawBlock.version);
  if (!version) return null;

  const paragraphs: string[] = [];
  collectTextsByKey(version, "p", paragraphs);
  const content = normalizeText(paragraphs.length > 0 ? paragraphs.join("\n") : textContent(version));
  if (!content) return null;

  return {
    bloqueId: rootBlock.bloqueId,
    bloqueTitulo: rootBlock.bloqueTitulo,
    unitId,
    unitType,
    unitTitle,
    content,
    fechaVigencia: boeTsToIso(s(version["@_fecha_vigencia"]) || null),
    fechaPublicacion: boeTsToIso(s(version["@_fecha_publicacion"]) || null),
  };
}

async function getBlockUnits(block: LawBlock): Promise<LawUnit[]> {
  const xmlText = await fetchTextWithRetry(block.url, "application/xml,text/xml,*/*");
  const root = parseXml(xmlText);
  const rawBlocks: Record<string, unknown>[] = [];
  collectByKey(root, "bloque", rawBlocks);

  const units: LawUnit[] = [];
  for (const rawBlock of rawBlocks) {
    const unit = extractUnitFromBlock(rawBlock, block);
    if (unit) units.push(unit);
  }
  return units;
}

async function buildChunks(target: SyncTarget, metadata: LawMetadata, units: LawUnit[]): Promise<LawChunk[]> {
  const chunks: LawChunk[] = [];
  let chunkIndex = 0;

  for (const unit of units) {
    const unitChunks = smartChunk(unit.content);
    for (let ordinal = 0; ordinal < unitChunks.length; ordinal += 1) {
      const content = unitChunks[ordinal];
      const contentHash = await sha256Hex(content);
      const title = unitChunks.length === 1 ? unit.unitTitle : `${unit.unitTitle} (${ordinal + 1}/${unitChunks.length})`;
      chunks.push({
        chunkIndex,
        title: title.slice(0, 500),
        content,
        contentHash,
        metadata: {
          boe_id: metadata.boeId,
          label: target.label,
          titulo_ley: metadata.tituloLey,
          eli: metadata.eli,
          fecha_actualizacion: metadata.fechaActualizacion,
          fecha_iso: metadata.fechaIso,
          bloque_id: unit.bloqueId,
          bloque_titulo: unit.bloqueTitulo,
          unit_id: unit.unitId,
          unit_type: unit.unitType,
          unit_title: unit.unitTitle,
          chunk_ordinal: ordinal + 1,
          unit_chunks_total: unitChunks.length,
          fecha_vigencia: unit.fechaVigencia,
          fecha_publicacion: unit.fechaPublicacion,
          source_kind: "supporting_law",
        },
      });
      chunkIndex += 1;
    }
  }

  if (chunks.length === 0) 
    throw new Error(`No se generaron chunks para ${metadata.boeId}`);
  

  return chunks;
}

async function buildSourceHash(boeId: string, chunks: LawChunk[]): Promise<string> {
  const payload = chunks.map((chunk) => ({
    boe_id: boeId,
    chunk_index: chunk.chunkIndex,
    content_hash: chunk.contentHash,
    title: chunk.title,
  }));
  return await sha256Hex(JSON.stringify(payload));
}

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) 
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getRuntimeSecret(
  supabase: ReturnType<typeof createServiceClient>,
  name: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_runtime_secret", { p_name: name });
  if (error) throw new Error(`get_runtime_secret(${name}) failed: ${error.message}`);
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

async function ensureEdgeSecret(
  req: Request,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<Response | null> {
  const expected = await getRuntimeSecret(supabase, "rag_edge_secret");
  if (!expected) return json({ error: "Missing rag_edge_secret" }, 500);

  const received = req.headers.get("x-edge-secret")?.trim();
  if (!received || received !== expected) 
    return json({ error: "Unauthorized (x-edge-secret)" }, 401);
  
  return null;
}

async function getTargets(
  supabase: ReturnType<typeof createServiceClient>,
  boeIds: string[],
  cursorBoeId: string | null,
  maxLaws: number,
): Promise<TargetBatch> {
  const cleanIds = boeIds.map((value) => value.trim()).filter(Boolean);

  if (cleanIds.length === 0) {
    let query = supabase
      .from("law_watchlist")
      .select("boe_id, label")
      .eq("is_active", true)
      .order("boe_id", { ascending: true });

    if (cursorBoeId) 
      query = query.gt("boe_id", cursorBoeId);
    

    const { data, error } = await query.limit(maxLaws + 1);

    if (error) throw new Error(`Load law_watchlist failed: ${error.message}`);
    const rows = data ?? [];
    return {
      targets: rows.slice(0, maxLaws).map((row) => ({
        boeId: String(row.boe_id),
        label: String(row.label),
      })),
      hasMore: rows.length > maxLaws,
    };
  }

  const { data, error } = await supabase
    .from("law_watchlist")
    .select("boe_id, label")
    .in("boe_id", cleanIds);

  if (error) throw new Error(`Load explicit laws failed: ${error.message}`);

  const labels = new Map<string, string>();
  for (const row of data ?? []) 
    labels.set(String(row.boe_id), String(row.label));
  

  return {
    targets: cleanIds.map((boeId) => ({
      boeId,
      label: labels.get(boeId) ?? boeId,
    })),
    hasMore: false,
  };
}

async function enqueueNextBatch(
  supabase: ReturnType<typeof createServiceClient>,
  lastBoeId: string,
  force: boolean,
  maxLaws: number,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("invoke_internal_edge_function", {
    p_function_name: "sync-laws-rag",
    p_body: {
      force,
      cursor_boe_id: lastBoeId,
      max_laws: maxLaws,
    },
    p_timeout_milliseconds: 300000,
  });

  if (error) throw new Error(`Enqueue next sync-laws-rag batch failed: ${error.message}`);
  return typeof data === "number" ? data : null;
}

async function getSyncLog(
  supabase: ReturnType<typeof createServiceClient>,
  boeId: string,
): Promise<SyncLogRow | null> {
  const { data, error } = await supabase
    .from("law_sync_log")
    .select("boe_id, fecha_actualizacion")
    .eq("boe_id", boeId)
    .maybeSingle();

  if (error) throw new Error(`Load law_sync_log failed: ${error.message}`);
  return (data as SyncLogRow | null) ?? null;
}

async function getSourceByHash(
  supabase: ReturnType<typeof createServiceClient>,
  boeId: string,
  sourceHash: string,
): Promise<RagSourceRow | null> {
  const { data, error } = await supabase
    .from("rag_sources")
    .select("id, is_current")
    .eq("source_type", "law")
    .eq("law_boe_id", boeId)
    .eq("source_hash", sourceHash)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Load rag_source failed: ${error.message}`);
  return (data as RagSourceRow | null) ?? null;
}

async function insertSource(
  supabase: ReturnType<typeof createServiceClient>,
  metadata: LawMetadata,
  target: SyncTarget,
  sourceHash: string,
  chunksTotal: number,
  unitsTotal: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("rag_sources")
    .insert({
      source_type: "law",
      opposition_id: null,
      syllabus_id: null,
      law_boe_id: metadata.boeId,
      title: metadata.tituloLey,
      source_url: metadata.urlNorma,
      source_hash: sourceHash,
      is_current: false,
      metadata: {
        label: target.label,
        eli: metadata.eli,
        fecha_actualizacion: metadata.fechaActualizacion,
        fecha_iso: metadata.fechaIso,
        chunks_total: chunksTotal,
        units_total: unitsTotal,
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(`Insert rag_source failed: ${error.message}`);
  return Number(data.id);
}

async function updateExistingSource(
  supabase: ReturnType<typeof createServiceClient>,
  sourceId: number,
  metadata: LawMetadata,
  target: SyncTarget,
  sourceHash: string,
  chunksTotal: number,
  unitsTotal: number,
): Promise<void> {
  const { error } = await supabase
    .from("rag_sources")
    .update({
      title: metadata.tituloLey,
      source_url: metadata.urlNorma,
      source_hash: sourceHash,
      metadata: {
        label: target.label,
        eli: metadata.eli,
        fecha_actualizacion: metadata.fechaActualizacion,
        fecha_iso: metadata.fechaIso,
        chunks_total: chunksTotal,
        units_total: unitsTotal,
      },
    })
    .eq("id", sourceId);

  if (error) throw new Error(`Update rag_source failed: ${error.message}`);
}

async function syncChunks(
  supabase: ReturnType<typeof createServiceClient>,
  sourceId: number,
  chunks: LawChunk[],
): Promise<void> {
  const { data: existingRows, error: existingError } = await supabase
    .from("rag_chunks")
    .select("id, chunk_index")
    .eq("rag_source_id", sourceId);

  if (existingError) throw new Error(`Load rag_chunks failed: ${existingError.message}`);

  const existingIndexes = new Set<number>((existingRows as ChunkIndexRow[] ?? []).map((row) => Number(row.chunk_index)));
  const newIndexes = new Set<number>(chunks.map((chunk) => chunk.chunkIndex));

  for (let index = 0; index < chunks.length; index += UPSERT_BATCH_SIZE) {
    const batch = chunks.slice(index, index + UPSERT_BATCH_SIZE);
    const payload = batch.map((chunk) => ({
      rag_source_id: sourceId,
      opposition_id: null,
      syllabus_id: null,
      source_type: "law",
      chunk_index: chunk.chunkIndex,
      title: chunk.title,
      content: chunk.content,
      content_hash: chunk.contentHash,
      metadata: chunk.metadata,
      is_current: true,
    }));

    const { error } = await supabase
      .from("rag_chunks")
      .upsert(payload, { onConflict: "rag_source_id,chunk_index" });

    if (error) throw new Error(`Upsert rag_chunks failed: ${error.message}`);
  }

  const staleIndexes = Array.from(existingIndexes).filter((value) => !newIndexes.has(value));
  for (let index = 0; index < staleIndexes.length; index += UPSERT_BATCH_SIZE) {
    const batch = staleIndexes.slice(index, index + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from("rag_chunks")
      .update({ is_current: false })
      .eq("rag_source_id", sourceId)
      .in("chunk_index", batch);

    if (error) throw new Error(`Mark stale rag_chunks failed: ${error.message}`);
  }
}

async function setCurrentSource(
  supabase: ReturnType<typeof createServiceClient>,
  boeId: string,
  sourceId: number,
): Promise<void> {
  const rpc = await supabase.rpc("set_current_rag_source", { p_rag_source_id: sourceId });
  if (!rpc.error) return;

  const { data: oldRows, error: oldError } = await supabase
    .from("rag_sources")
    .select("id")
    .eq("source_type", "law")
    .eq("law_boe_id", boeId)
    .neq("id", sourceId)
    .eq("is_current", true);

  if (oldError) throw new Error(`Load current law rag_sources failed: ${oldError.message}`);
  const oldSourceIds = (oldRows ?? []).map((row) => Number(row.id));

  const { error: markOldSourcesError } = await supabase
    .from("rag_sources")
    .update({ is_current: false })
    .eq("source_type", "law")
    .eq("law_boe_id", boeId)
    .neq("id", sourceId);

  if (markOldSourcesError) throw new Error(`Mark old rag_sources failed: ${markOldSourcesError.message}`);

  if (oldSourceIds.length > 0) {
    const { error: markOldChunksError } = await supabase
      .from("rag_chunks")
      .update({ is_current: false })
      .in("rag_source_id", oldSourceIds);

    if (markOldChunksError) throw new Error(`Mark old rag_chunks failed: ${markOldChunksError.message}`);
  }

  const { error: markSourceError } = await supabase
    .from("rag_sources")
    .update({ is_current: true })
    .eq("id", sourceId);

  if (markSourceError) throw new Error(`Mark new rag_source current failed: ${markSourceError.message}`);

  const { error: markChunksError } = await supabase
    .from("rag_chunks")
    .update({ is_current: true })
    .eq("rag_source_id", sourceId);

  if (markChunksError) throw new Error(`Mark new rag_chunks current failed: ${markChunksError.message}`);
}

async function upsertSyncLog(
  supabase: ReturnType<typeof createServiceClient>,
  metadata: LawMetadata,
  chunksTotal: number,
): Promise<void> {
  const { error } = await supabase
    .from("law_sync_log")
    .upsert({
      boe_id: metadata.boeId,
      titulo_ley: metadata.tituloLey,
      fecha_actualizacion: metadata.fechaActualizacion,
      fecha_iso: metadata.fechaIso,
      url_norma: metadata.urlNorma,
      eli: metadata.eli,
      chunks_total: chunksTotal,
      last_sync_at: new Date().toISOString(),
    }, { onConflict: "boe_id" });

  if (error) throw new Error(`Upsert law_sync_log failed: ${error.message}`);
}

async function ensureReindexJob(
  supabase: ReturnType<typeof createServiceClient>,
  boeId: string,
  sourceId: number,
  reason: string,
): Promise<void> {
  const { data: pending, error: pendingError } = await supabase
    .from("rag_reindex_jobs")
    .select("id, status")
    .eq("source_type", "law")
    .eq("law_boe_id", boeId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingError) throw new Error(`Load pending rag_reindex_jobs failed: ${pendingError.message}`);

  if (pending?.id != null) {
    const { error } = await supabase
      .from("rag_reindex_jobs")
      .update({
        rag_source_id: sourceId,
        status: "pending",
        reason,
        error_text: null,
      })
      .eq("id", pending.id);

    if (error) throw new Error(`Update rag_reindex_job failed: ${error.message}`);
    return;
  }

  const { error } = await supabase
    .from("rag_reindex_jobs")
    .insert({
      source_type: "law",
      opposition_id: null,
      syllabus_id: null,
      rag_source_id: sourceId,
      law_boe_id: boeId,
      status: "pending",
      reason,
      error_text: null,
    });

  if (error) throw new Error(`Insert rag_reindex_job failed: ${error.message}`);
}

async function syncOne(
  supabase: ReturnType<typeof createServiceClient>,
  target: SyncTarget,
  force: boolean,
  dryRun: boolean,
): Promise<Record<string, unknown>> {
  const metadata = await getMetadata(target.boeId);
  const syncLog = await getSyncLog(supabase, target.boeId);

  if (!force && syncLog?.fecha_actualizacion && metadata.fechaActualizacion === syncLog.fecha_actualizacion) {
    return {
      boe_id: target.boeId,
      label: target.label,
      status: "unchanged",
      fecha_actualizacion: metadata.fechaActualizacion,
    };
  }

  const blocks = await getIndexBlocks(target.boeId);
  const units: LawUnit[] = [];
  for (const block of blocks) {
    try {
      units.push(...await getBlockUnits(block));
    } catch (error) {
      console.warn(JSON.stringify({
        msg: "law_block_skipped",
        boe_id: target.boeId,
        bloque_id: block.bloqueId,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  if (units.length === 0) 
    throw new Error(`No se extrajo contenido util para ${target.boeId}`);
  

  const chunks = await buildChunks(target, metadata, units);
  const sourceHash = await buildSourceHash(target.boeId, chunks);
  const existingSource = await getSourceByHash(supabase, target.boeId, sourceHash);

  if (dryRun) {
    return {
      boe_id: target.boeId,
      label: target.label,
      status: "dry_run",
      source_hash: sourceHash,
      blocks_total: blocks.length,
      units_total: units.length,
      chunks_total: chunks.length,
      existing_source_id: existingSource?.id ?? null,
      created_new_source: existingSource == null,
    };
  }

  let sourceId: number | null = null;
  let createdNewSource = false;

  try {
    if (existingSource) {
      sourceId = Number(existingSource.id);
      await updateExistingSource(supabase, sourceId, metadata, target, sourceHash, chunks.length, units.length);
    } else {
      sourceId = await insertSource(supabase, metadata, target, sourceHash, chunks.length, units.length);
      createdNewSource = true;
    }

    await syncChunks(supabase, sourceId, chunks);
    await setCurrentSource(supabase, target.boeId, sourceId);
    await upsertSyncLog(supabase, metadata, chunks.length);
    await ensureReindexJob(supabase, target.boeId, sourceId, "law-updated");

    return {
      boe_id: target.boeId,
      label: target.label,
      status: "synced",
      source_id: sourceId,
      source_hash: sourceHash,
      blocks_total: blocks.length,
      units_total: units.length,
      chunks_total: chunks.length,
      created_new_source: createdNewSource,
    };
  } catch (error) {
    if (createdNewSource && sourceId != null) 
      await supabase.from("rag_sources").delete().eq("id", sourceId);
    
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createServiceClient();
    const authError = await ensureEdgeSecret(req, supabase);
    if (authError) return authError;

    let parsedBody: RequestPayload;
    try {
      parsedBody = await parseJsonBody<RequestPayload>(req);
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid JSON body") 
        return json({ error: error.message }, 400);
      
      throw error;
    }
    const body: RequestPayload = {
      boe_ids: sanitizeStringArray(parsedBody.boe_ids, {
        maxItems: 25,
        maxLength: 40,
      }).map((value) => sanitizeCode(value, 40)).filter(Boolean),
      force: sanitizeBoolean(parsedBody.force),
      dry_run: sanitizeBoolean(parsedBody.dry_run),
      cursor_boe_id: sanitizeCode(parsedBody.cursor_boe_id, 40) || undefined,
      max_laws:
        sanitizeInteger(parsedBody.max_laws, { min: 1, max: 5, fallback: 1 }) ?? 1,
    };
    const force = body.force === true;
    const dryRun = body.dry_run === true;
    const maxLaws = Math.max(1, Math.min(5, Number(body.max_laws ?? 1)));
    const batch = await getTargets(
      supabase,
      body.boe_ids ?? [],
      body.cursor_boe_id?.trim() || null,
      maxLaws,
    );
    const targets = batch.targets;

    if (targets.length === 0) {
      return json({
        ok: true,
        force,
        dry_run: dryRun,
        laws_processed: 0,
        has_more: false,
        results: [],
      });
    }

    const results: Record<string, unknown>[] = [];
    for (const target of targets) {
      try {
        results.push(await syncOne(supabase, target, force, dryRun));
      } catch (error) {
        results.push({
          boe_id: target.boeId,
          label: target.label,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const shouldChain = !dryRun && (body.boe_ids?.length ?? 0) === 0 && batch.hasMore;
    let nextRequestId: number | null = null;
    if (shouldChain) {
      nextRequestId = await enqueueNextBatch(
        supabase,
        targets[targets.length - 1].boeId,
        force,
        maxLaws,
      );
    }

    return json({
      ok: true,
      force,
      dry_run: dryRun,
      laws_processed: targets.length,
      has_more: batch.hasMore,
      next_request_id: nextRequestId,
      results,
    });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
