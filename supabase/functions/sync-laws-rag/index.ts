import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.3";

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

const OPENROUTER_BASE_URL = Deno.env.get("OPENROUTER_BASE_URL")?.trim() || "https://openrouter.ai/api/v1";
const OPENROUTER_EMBEDDING_MODEL = "qwen/qwen3-embedding-8b";
const OPENROUTER_APP_URL = Deno.env.get("OPENROUTER_APP_URL")?.trim() || "https://opositai.com";
const OPENROUTER_APP_NAME = Deno.env.get("OPENROUTER_APP_NAME")?.trim() || "OpositAI";
const OPENROUTER_TIMEOUT_MS = Math.max(5000, Number(Deno.env.get("OPENROUTER_TIMEOUT_MS") ?? "45000"));
const EMBEDDING_DIM = 4096;
const EMBEDDING_BATCH_SIZE = Math.max(
  1,
  Math.min(64, Number(Deno.env.get("OPENROUTER_EMBEDDING_BATCH_SIZE") ?? "8")),
);
const UPSERT_BATCH_SIZE = 100;
const MAX_CHUNKS_PER_RUN_DEFAULT = Math.max(
  1,
  Math.min(200, Number(Deno.env.get("SYNC_LAWS_MAX_CHUNKS_PER_RUN") ?? "200")),
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeText = (value: unknown, max = 5000) => {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "";
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
};

const normalizeText = (value: string) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const stripAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const asArray = <T>(value: T | T[] | null | undefined): T[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];

function textContent(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return normalizeText(value.map((item) => textContent(item)).filter(Boolean).join(" "));
  }

  if (!isRecord(value)) return "";

  const parts: string[] = [];
  for (const [key, child] of Object.entries(value)) {
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

  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === targetKey) {
      for (const item of asArray(child)) {
        if (isRecord(item)) out.push(item);
      }
    }

    if (!key.startsWith("@_")) collectByKey(child, targetKey, out);
  }
}

function collectTextsByKey(value: unknown, targetKey: string, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTextsByKey(item, targetKey, out);
    return;
  }

  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === targetKey) {
      for (const item of asArray(child)) {
        const text = textContent(item);
        if (text) out.push(text);
      }
    }

    if (!key.startsWith("@_")) collectTextsByKey(child, targetKey, out);
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

  if (!isRecord(value)) return null;

  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key)) {
      const text = textContent(child);
      if (text) return text;
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith("@_")) continue;
    const found = findFirstTextByKeys(child, keys);
    if (found) return found;
  }

  return null;
}

const normalizeDateToIso = (value: string | null): string | null => {
  const raw = safeText(value, 20);
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const m = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
};

const sanitizeCode = (value: unknown, max = 80) => safeText(value, max).replace(/[^A-Za-z0-9._:-]/g, "");

function splitIntoChunks(text: string, maxChars = 7000, overlap = 800): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const words = normalized.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
      continue;
    }

    chunks.push(current);
    current = overlap > 0 && current.length > overlap
      ? `${current.slice(-overlap)} ${word}`.trim()
      : word;
  }

  if (current) chunks.push(current);
  return chunks;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseXml(xmlText: string): Record<string, unknown> {
  const parsed = parser.parse(xmlText);
  if (!isRecord(parsed)) throw new Error("Invalid BOE XML");
  return parsed;
}

async function fetchTextWithRetry(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/xml,text/xml,*/*",
          "User-Agent": "study-brilliance-law-sync/1.0",
        },
      });

      if (response.status === 404) throw new Error(`404 Not Found: ${url}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.includes("404 Not Found")) throw lastError;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
    }
  }

  throw new Error(`GET failed: ${url} | ${lastError?.message ?? "unknown"}`);
}

type SyncTarget = { boeId: string; label: string };
type ParagraphNode = { text: string; className: string | null };
type LawUnit = { unitId: string; unitTitle: string; content: string; paragraphs: ParagraphNode[] };
type Chunk = { chunkIndex: number; title: string; content: string; contentHash: string; metadata: Record<string, unknown> };

const ARTICLE_REFERENCE_RE = /\barticulo\s+(\d+(?:[.,]\d+)?(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies))?)/i;
const PARAGRAPH_REFERENCE_RE = /^(\d+)\.\s*(.*)$/;

function collectParagraphNodes(value: unknown, out: ParagraphNode[], insideNote = false): void {
  if (Array.isArray(value)) {
    for (const item of value) collectParagraphNodes(item, out, insideNote);
    return;
  }

  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const nextInsideNote = insideNote || key === "blockquote";

    if (key === "p") {
      for (const item of asArray(child)) {
        const text = normalizeText(textContent(item));
        if (!text) continue;
        const className = isRecord(item) ? safeText(item["@_class"], 80) || null : null;
        if (nextInsideNote || (className && /^nota_/i.test(className))) continue;
        out.push({ text, className });
      }
    }

    if (!key.startsWith("@_")) collectParagraphNodes(child, out, nextInsideNote);
  }
}

function selectLatestVersionNode(value: unknown): Record<string, unknown> | null {
  const versions: Record<string, unknown>[] = [];
  collectByKey(value, "version", versions);
  if (versions.length === 0) return null;

  const sortable = versions.map((node, idx) => {
    const vigencia = normalizeDateToIso(safeText(node["@_fecha_vigencia"], 20));
    const publicacion = normalizeDateToIso(safeText(node["@_fecha_publicacion"], 20));
    return {
      node,
      idx,
      sortDate: vigencia || publicacion || "0000-00-00",
    };
  });

  sortable.sort((a, b) => {
    const byDate = a.sortDate.localeCompare(b.sortDate);
    return byDate !== 0 ? byDate : a.idx - b.idx;
  });

  return sortable[sortable.length - 1]?.node ?? null;
}

const normalizeArticleRef = (value: string) =>
  stripAccents(value)
    .toLowerCase()
    .replace(/\bart(?:iculo)?s?\.?\s*/g, "")
    .replace(/[\u00BA\u00AA]/g, "")
    .replace(/,/g, ".")
    .replace(/\s+/g, "")
    .replace(/[^0-9a-z.]/g, "")
    .trim();

const extractArticleRef = (value: string): string | null => {
  const normalized = stripAccents(value);
  const match = normalized.match(ARTICLE_REFERENCE_RE);
  if (!match) return null;
  const ref = normalizeArticleRef(match[1]);
  return ref || null;
};

const chunkUnitIdForParagraph = (unitId: string, paragraphRef: string) =>
  `${unitId}_p${paragraphRef.replace(/[^0-9a-z.]+/gi, "_")}`;

function createServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getRuntimeSecret(supabase: ReturnType<typeof createServiceClient>, name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_runtime_secret", { p_name: name });
  if (error) throw new Error(`get_runtime_secret(${name}) failed: ${error.message}`);
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

async function ensureEdgeSecret(req: Request, supabase: ReturnType<typeof createServiceClient>): Promise<Response | null> {
  const expected = await getRuntimeSecret(supabase, "rag_edge_secret");
  if (!expected) return json({ error: "Missing rag_edge_secret" }, 500);

  const received = req.headers.get("x-edge-secret")?.trim();
  if (!received || received !== expected) return json({ error: "Unauthorized (x-edge-secret)" }, 401);
  return null;
}

async function getTargets(
  supabase: ReturnType<typeof createServiceClient>,
  boeIds: string[],
  cursorBoeId: string | null,
  maxLaws: number,
): Promise<{ targets: SyncTarget[]; hasMore: boolean }> {
  const cleanIds = boeIds.map((v) => sanitizeCode(v, 40)).filter(Boolean);

  if (cleanIds.length > 0) {
    const { data, error } = await supabase
      .from("law_watchlist")
      .select("boe_id, label")
      .eq("is_active", true)
      .in("boe_id", cleanIds);

    if (error) throw new Error(`Load explicit laws failed: ${error.message}`);
    const byId = new Map<string, string>();
    for (const row of data ?? []) byId.set(String(row.boe_id), String(row.label));

    return {
      targets: cleanIds.filter((id) => byId.has(id)).map((id) => ({ boeId: id, label: byId.get(id) ?? id })),
      hasMore: false,
    };
  }

  let query = supabase
    .from("law_watchlist")
    .select("boe_id, label")
    .eq("is_active", true)
    .order("boe_id", { ascending: true });

  if (cursorBoeId) query = query.gt("boe_id", cursorBoeId);

  const { data, error } = await query.limit(maxLaws + 1);
  if (error) throw new Error(`Load law_watchlist failed: ${error.message}`);

  const rows = data ?? [];
  return {
    targets: rows.slice(0, maxLaws).map((row) => ({ boeId: String(row.boe_id), label: String(row.label) })),
    hasMore: rows.length > maxLaws,
  };
}

async function callOpenRouterEmbeddings(apiKey: string, texts: string[]): Promise<number[][]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": OPENROUTER_APP_URL,
        "X-Title": OPENROUTER_APP_NAME,
      },
      body: JSON.stringify({
        model: OPENROUTER_EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIM,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const p = isRecord(payload) ? payload : {};
      const e = isRecord(p.error) ? p.error : {};
      const detail = safeText(e.message, 500) || safeText(p.message, 500) || `HTTP ${response.status}`;
      throw new Error(`OpenRouter embeddings failed: ${detail}`);
    }

    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new Error("OpenRouter embeddings payload invalido");
    }

    const byIndex = new Map<number, number[]>();
    for (let i = 0; i < payload.data.length; i += 1) {
      const item = payload.data[i];
      if (!isRecord(item) || !Array.isArray(item.embedding)) throw new Error("OpenRouter item invalido");
      const vector = item.embedding.map((v) => Number(v));
      if (vector.length !== EMBEDDING_DIM || vector.some((v) => !Number.isFinite(v))) {
        throw new Error(`Embedding invalido: dim=${vector.length}`);
      }
      const index = typeof item.index === "number" ? Math.floor(item.index) : i;
      byIndex.set(index, vector);
    }

    const ordered: number[][] = [];
    for (let i = 0; i < texts.length; i += 1) {
      const v = byIndex.get(i);
      if (!v) throw new Error(`Missing embedding index ${i}`);
      ordered.push(v);
    }
    return ordered;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("OpenRouter embeddings timeout");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function embedWithRetry(apiKey: string, texts: string[]): Promise<number[][]> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await callOpenRouterEmbeddings(apiKey, texts);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, 1200 * (2 ** attempt)));
    }
  }
  throw new Error(`OpenRouter embeddings retry failed: ${lastError?.message ?? "unknown"}`);
}

async function fetchLawData(target: SyncTarget) {
  const boeId = target.boeId;

  const metadataXml = await fetchTextWithRetry(
    `https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/${boeId}/metadatos`,
  );
  const metadataRoot = parseXml(metadataXml);

  const title = findFirstTextByKeys(metadataRoot, new Set(["titulo"])) || boeId;
  const fechaActualizacion = findFirstTextByKeys(metadataRoot, new Set(["fecha_actualizacion"]));
  const fechaVigencia = normalizeDateToIso(
    findFirstTextByKeys(metadataRoot, new Set(["fecha_vigencia"])),
  ) || "";
  const fechaPublicacion = normalizeDateToIso(
    findFirstTextByKeys(metadataRoot, new Set(["fecha_publicacion"])),
  ) || "";
  const urlNorma =
    findFirstTextByKeys(metadataRoot, new Set(["url_html_consolidada"])) ||
    `https://www.boe.es/buscar/act.php?id=${encodeURIComponent(boeId)}`;
  const eli = findFirstTextByKeys(metadataRoot, new Set(["eli"])) || "";

  const indexXml = await fetchTextWithRetry(
    `https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/${boeId}/texto/indice`,
  );
  const indexRoot = parseXml(indexXml);

  const rawBlocks: Record<string, unknown>[] = [];
  collectByKey(indexRoot, "bloque", rawBlocks);

  const blocks: Array<{ id: string; title: string; url: string }> = [];
  const seen = new Set<string>();

  for (const block of rawBlocks) {
    const id = textContent(block.id) || safeText(block["@_id"], 120);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const blockTitle = textContent(block.titulo) || safeText(block["@_titulo"], 250) || id;
    const blockUrl =
      textContent(block.url) ||
      `https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/${boeId}/texto/bloque/${encodeURIComponent(id)}`;

    blocks.push({ id, title: blockTitle, url: blockUrl });
  }

  const unitTexts: LawUnit[] = [];

  for (const block of blocks) {
    try {
      const blockXml = await fetchTextWithRetry(block.url);
      const blockRoot = parseXml(blockXml);
      const currentVersion = selectLatestVersionNode(blockRoot) ?? blockRoot;
      const paragraphs: ParagraphNode[] = [];
      collectParagraphNodes(currentVersion, paragraphs);
      const content = normalizeText(paragraphs.map((item) => item.text).join("\n"));
      if (!content) continue;
      unitTexts.push({ unitId: block.id, unitTitle: block.title, content, paragraphs });
    } catch (error) {
      console.warn(
        JSON.stringify({
          msg: "sync_block_error",
          boe_id: boeId,
          block_id: block.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  if (unitTexts.length === 0) throw new Error(`No content extracted for ${boeId}`);

  return {
    boeId,
    label: target.label,
    title,
    fechaActualizacion,
    fechaIso: normalizeDateToIso(fechaActualizacion),
    fechaVigencia,
    fechaPublicacion,
    urlNorma,
    eli,
    units: unitTexts,
    blocksTotal: blocks.length,
  };
}

async function buildChunks(law: Awaited<ReturnType<typeof fetchLawData>>): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;
  const pushChunk = async (
    title: string,
    content: string,
    metadata: Record<string, unknown>,
  ) => {
    const normalizedContent = normalizeText(content);
    if (!normalizedContent) return;
    chunks.push({
      chunkIndex,
      title,
      content: normalizedContent,
      contentHash: await sha256Hex(normalizedContent),
      metadata: {
        boe_id: law.boeId,
        titulo_ley: law.title,
        ...metadata,
      },
    });
    chunkIndex += 1;
  };

  for (const unit of law.units) {
    const articleRef = extractArticleRef(unit.unitTitle) ?? extractArticleRef(unit.content);

    if (!articleRef) {
      const parts = splitIntoChunks(unit.content, 4500, 300);
      for (let i = 0; i < parts.length; i += 1) {
        await pushChunk(
          parts.length === 1 ? unit.unitTitle : `${unit.unitTitle} (${i + 1}/${parts.length})`,
          `${unit.unitTitle}\n${parts[i]}`,
          {
            unit_id: unit.unitId,
            unit_type: "estructura",
            article: unit.unitTitle,
            apartado_path: unit.unitId,
          },
        );
      }
      continue;
    }

    const articleContent = [unit.unitTitle, ...unit.paragraphs.map((item) => item.text)].join("\n");
    const articleParts = splitIntoChunks(articleContent, 5500, 250);
    for (let i = 0; i < articleParts.length; i += 1) {
      await pushChunk(
        articleParts.length === 1 ? unit.unitTitle : `${unit.unitTitle} (${i + 1}/${articleParts.length})`,
        articleParts[i],
        {
          unit_id: unit.unitId,
          unit_type: "article",
          article: articleRef,
          apartado_path: articleRef,
        },
      );
    }

    let currentParagraphRef: string | null = null;
    let currentParagraphLines: string[] = [];

    const flushParagraph = async () => {
      if (!currentParagraphRef || currentParagraphLines.length === 0) return;
      await pushChunk(
        `${unit.unitTitle} - apartado ${currentParagraphRef}`,
        [unit.unitTitle, ...currentParagraphLines].join("\n"),
        {
          unit_id: chunkUnitIdForParagraph(unit.unitId, currentParagraphRef),
          unit_type: "article_paragraph",
          article: currentParagraphRef,
          apartado_path: currentParagraphRef,
        },
      );
      currentParagraphRef = null;
      currentParagraphLines = [];
    };

    for (const paragraph of unit.paragraphs) {
      const text = normalizeText(paragraph.text);
      if (!text) continue;

      if (paragraph.className === "articulo") continue;

      const paragraphMatch = text.match(PARAGRAPH_REFERENCE_RE);
      if (paragraphMatch) {
        await flushParagraph();
        currentParagraphRef = `${articleRef}.${paragraphMatch[1]}`;
        currentParagraphLines = [text];
        continue;
      }

      if (currentParagraphRef) {
        currentParagraphLines.push(text);
      }
    }

    await flushParagraph();
  }

  if (chunks.length === 0) throw new Error(`No chunks for ${law.boeId}`);
  return chunks;
}

async function sourceHashFromChunks(boeId: string, chunks: Chunk[]): Promise<string> {
  const payload = chunks.map((c) => ({ boe_id: boeId, chunk_index: c.chunkIndex, content_hash: c.contentHash }));
  return await sha256Hex(JSON.stringify(payload));
}

async function upsertSource(
  supabase: ReturnType<typeof createServiceClient>,
  law: Awaited<ReturnType<typeof fetchLawData>>,
  sourceHash: string,
  chunksTotal: number,
): Promise<{ sourceId: number; created: boolean }> {
  const { data: existing, error: existingError } = await supabase
    .from("rag_sources")
    .select("id")
    .eq("source_type", "law")
    .eq("law_boe_id", law.boeId)
    .eq("source_hash", sourceHash)
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(`Load rag_source failed: ${existingError.message}`);

  if (existing) {
    const sourceId = Number(existing.id);
    const { error } = await supabase
      .from("rag_sources")
      .update({
        title: law.title,
        source_url: law.urlNorma,
        metadata: {
          eli: law.eli,
          fecha_actualizacion: law.fechaActualizacion,
          fecha_iso: law.fechaIso,
          fecha_vigencia: law.fechaVigencia,
          fecha_publicacion: law.fechaPublicacion,
        },
      })
      .eq("id", sourceId);

    if (error) throw new Error(`Update rag_source failed: ${error.message}`);
    return { sourceId, created: false };
  }

  const { data, error } = await supabase
    .from("rag_sources")
    .insert({
      source_type: "law",
      opposition_id: null,
      syllabus_id: null,
      law_boe_id: law.boeId,
      title: law.title,
      source_url: law.urlNorma,
      source_hash: sourceHash,
      is_current: false,
      metadata: {
        eli: law.eli,
        fecha_actualizacion: law.fechaActualizacion,
        fecha_iso: law.fechaIso,
        fecha_vigencia: law.fechaVigencia,
        fecha_publicacion: law.fechaPublicacion,
      },
    })
    .select("id")
    .single();

  if (error) throw new Error(`Insert rag_source failed: ${error.message}`);
  return { sourceId: Number(data.id), created: true };
}

async function upsertChunksPartial(
  supabase: ReturnType<typeof createServiceClient>,
  sourceId: number,
  chunks: Chunk[],
  apiKey: string,
  maxChunksPerRun: number,
): Promise<{ embeddedNow: number; pendingBefore: number; remainingAfter: number }> {
  const existingRows: Record<string, unknown>[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("rag_chunks")
      .select("chunk_index, embedding_content_hash, embedding_updated_at")
      .eq("rag_source_id", sourceId)
      .order("chunk_index", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Load existing chunk indexes failed: ${error.message}`);

    const page = (data ?? []) as Record<string, unknown>[];
    existingRows.push(...page);
    if (page.length < pageSize) break;
  }

  const existingByIndex = new Map<number, Record<string, unknown>>();
  for (const row of existingRows) {
    const idx = Number((row as Record<string, unknown>).chunk_index);
    if (Number.isFinite(idx)) existingByIndex.set(idx, row as Record<string, unknown>);
  }

  const pending = chunks.filter((chunk) => {
    const row = existingByIndex.get(chunk.chunkIndex);
    if (!row) return true;
    const embeddedHash = safeText(row.embedding_content_hash, 128);
    const embeddedAt = safeText(row.embedding_updated_at, 64);
    return embeddedHash !== chunk.contentHash || !embeddedAt;
  });

  const toEmbed = pending.slice(0, maxChunksPerRun);
  let embedded = 0;

  for (let i = 0; i < toEmbed.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + EMBEDDING_BATCH_SIZE);
    const vectors = await embedWithRetry(apiKey, batch.map((c) => c.content));
    const nowIso = new Date().toISOString();

    const payload = batch.map((chunk, idx) => ({
      rag_source_id: sourceId,
      opposition_id: null,
      syllabus_id: null,
      source_type: "law",
      chunk_index: chunk.chunkIndex,
      title: chunk.title,
      content: chunk.content,
      content_hash: chunk.contentHash,
      embedding: vectors[idx],
      embedding_content_hash: chunk.contentHash,
      embedding_provider: "openrouter",
      embedding_model: OPENROUTER_EMBEDDING_MODEL,
      embedding_updated_at: nowIso,
      embedding_error: null,
      metadata: chunk.metadata,
      is_current: true,
    }));

    const { error } = await supabase.from("rag_chunks").upsert(payload, {
      onConflict: "rag_source_id,chunk_index",
    });

    if (error) throw new Error(`Upsert rag_chunks failed: ${error.message}`);
    embedded += batch.length;
  }

  const pendingBefore = pending.length;
  const remainingAfter = Math.max(0, pendingBefore - toEmbed.length);

  // Only cleanup stale rows once the full source has been embedded.
  if (remainingAfter === 0) {
    const validIndexes = new Set(chunks.map((c) => c.chunkIndex));
    const stale = existingRows
      .map((r) => Number((r as Record<string, unknown>).chunk_index))
      .filter((idx) => Number.isFinite(idx) && !validIndexes.has(idx));

    for (let i = 0; i < stale.length; i += UPSERT_BATCH_SIZE) {
      const part = stale.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from("rag_chunks")
        .update({ is_current: false })
        .eq("rag_source_id", sourceId)
        .in("chunk_index", part);
      if (error) throw new Error(`Mark stale chunks failed: ${error.message}`);
    }
  }

  return { embeddedNow: embedded, pendingBefore, remainingAfter };
}

async function markCurrentSource(
  supabase: ReturnType<typeof createServiceClient>,
  boeId: string,
  sourceId: number,
): Promise<void> {
  const { data: oldRows, error: oldError } = await supabase
    .from("rag_sources")
    .select("id")
    .eq("source_type", "law")
    .eq("law_boe_id", boeId)
    .neq("id", sourceId)
    .eq("is_current", true);

  if (oldError) throw new Error(`Load previous sources failed: ${oldError.message}`);
  const oldIds = (oldRows ?? []).map((r) => Number(r.id));

  const { error: setNewSourceError } = await supabase
    .from("rag_sources")
    .update({ is_current: true })
    .eq("id", sourceId);
  if (setNewSourceError) throw new Error(`Set new source current failed: ${setNewSourceError.message}`);

  const { error: setNewChunksError } = await supabase
    .from("rag_chunks")
    .update({ is_current: true })
    .eq("rag_source_id", sourceId);
  if (setNewChunksError) throw new Error(`Set new chunks current failed: ${setNewChunksError.message}`);

  if (oldIds.length > 0) {
    const { error: oldSourceError } = await supabase
      .from("rag_sources")
      .update({ is_current: false })
      .in("id", oldIds);
    if (oldSourceError) throw new Error(`Unset old sources current failed: ${oldSourceError.message}`);

    const { error: oldChunksError } = await supabase
      .from("rag_chunks")
      .update({ is_current: false })
      .in("rag_source_id", oldIds);
    if (oldChunksError) throw new Error(`Unset old chunks current failed: ${oldChunksError.message}`);
  }
}

async function upsertSyncLog(
  supabase: ReturnType<typeof createServiceClient>,
  law: Awaited<ReturnType<typeof fetchLawData>>,
  chunksTotal: number,
): Promise<void> {
  const { error } = await supabase
    .from("law_sync_log")
    .upsert(
      {
        boe_id: law.boeId,
        titulo_ley: law.title,
        fecha_actualizacion: law.fechaActualizacion,
        fecha_iso: law.fechaIso,
        url_norma: law.urlNorma,
        eli: law.eli,
        chunks_total: chunksTotal,
        last_sync_at: new Date().toISOString(),
      },
      { onConflict: "boe_id" },
    );

  if (error) throw new Error(`Upsert law_sync_log failed: ${error.message}`);
}

async function enqueueNextBatch(
  supabase: ReturnType<typeof createServiceClient>,
  lastBoeId: string,
  force: boolean,
  maxLaws: number,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("invoke_internal_edge_function", {
    p_function_name: "sync-laws-rag",
    p_body: { force, cursor_boe_id: lastBoeId, max_laws: maxLaws },
    p_timeout_milliseconds: 300000,
  });

  if (error) throw new Error(`Enqueue next sync-laws-rag batch failed: ${error.message}`);
  return typeof data === "number" ? data : null;
}

async function enqueueSameLaw(
  supabase: ReturnType<typeof createServiceClient>,
  boeId: string,
  force: boolean,
  maxChunksPerRun: number,
): Promise<number | null> {
  const { data, error } = await supabase.rpc("invoke_internal_edge_function", {
    p_function_name: "sync-laws-rag",
    p_body: {
      force,
      boe_ids: [boeId],
      max_laws: 1,
      max_chunks_per_run: maxChunksPerRun,
    },
    p_timeout_milliseconds: 300000,
  });

  if (error) throw new Error(`Enqueue same-law continuation failed: ${error.message}`);
  return typeof data === "number" ? data : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createServiceClient();
    const authError = await ensureEdgeSecret(req, supabase);
    if (authError) return authError;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const boeIds = Array.isArray(body.boe_ids)
      ? body.boe_ids.map((v) => sanitizeCode(v, 40)).filter(Boolean)
      : [];
    const force = body.force === true;
    const dryRun = body.dry_run === true;
    const cursorBoeId = sanitizeCode(body.cursor_boe_id, 40) || null;
    const maxLawsRaw = Number(body.max_laws ?? 1);
    const maxLaws = Number.isFinite(maxLawsRaw) ? Math.max(1, Math.min(5, Math.floor(maxLawsRaw))) : 1;
    const maxChunksRaw = Number(body.max_chunks_per_run ?? MAX_CHUNKS_PER_RUN_DEFAULT);
    const maxChunksPerRun = Number.isFinite(maxChunksRaw)
      ? Math.max(1, Math.min(200, Math.floor(maxChunksRaw)))
      : MAX_CHUNKS_PER_RUN_DEFAULT;

    const targetBatch = await getTargets(supabase, boeIds, cursorBoeId, maxLaws);
    const targets = targetBatch.targets;

    if (targets.length === 0) {
      return json({ ok: true, force, dry_run: dryRun, laws_processed: 0, has_more: false, results: [] });
    }

    const openRouterApiKey =
      (await getRuntimeSecret(supabase, "openrouter_api_key").catch(() => null)) ||
      (Deno.env.get("OPENROUTER_API_KEY")?.trim() || "");

    if (!dryRun && !openRouterApiKey) {
      return json(
        { ok: false, error: "Missing OPENROUTER_API_KEY (env) or runtime secret openrouter_api_key" },
        500,
      );
    }

    const results: Record<string, unknown>[] = [];
    let hasPartial = false;
    let partialNextRequestId: number | null = null;

    for (const target of targets) {
      try {
        const law = await fetchLawData(target);

        const syncLog = await supabase
          .from("law_sync_log")
          .select("fecha_actualizacion")
          .eq("boe_id", target.boeId)
          .maybeSingle();
        if (syncLog.error) throw new Error(`Load law_sync_log failed: ${syncLog.error.message}`);

        const previousFecha = safeText(syncLog.data?.fecha_actualizacion, 20) || null;
        if (!force && previousFecha && previousFecha === law.fechaActualizacion) {
          results.push({
            boe_id: target.boeId,
            label: target.label,
            status: "unchanged",
            fecha_actualizacion: law.fechaActualizacion,
          });
          continue;
        }

        const chunks = await buildChunks(law);
        const sourceHash = await sourceHashFromChunks(law.boeId, chunks);

        if (dryRun) {
          results.push({
            boe_id: target.boeId,
            label: target.label,
            status: "dry_run",
            source_hash: sourceHash,
            blocks_total: law.blocksTotal,
            units_total: law.units.length,
            chunks_total: chunks.length,
            embedding_model: OPENROUTER_EMBEDDING_MODEL,
            embedding_dim: EMBEDDING_DIM,
          });
          continue;
        }

        const { sourceId, created } = await upsertSource(supabase, law, sourceHash, chunks.length);
        const chunkRun = await upsertChunksPartial(
          supabase,
          sourceId,
          chunks,
          openRouterApiKey,
          maxChunksPerRun,
        );

        if (chunkRun.remainingAfter === 0) {
          await markCurrentSource(supabase, law.boeId, sourceId);
          await upsertSyncLog(supabase, law, chunks.length);

          results.push({
            boe_id: target.boeId,
            label: target.label,
            status: "synced",
            source_id: sourceId,
            source_hash: sourceHash,
            blocks_total: law.blocksTotal,
            units_total: law.units.length,
            chunks_total: chunks.length,
            embedded_chunks: chunkRun.embeddedNow,
            embedding_model: OPENROUTER_EMBEDDING_MODEL,
            embedding_dim: EMBEDDING_DIM,
            created_new_source: created,
          });
        } else {
          hasPartial = true;
          const continuationId = await enqueueSameLaw(supabase, law.boeId, true, maxChunksPerRun);
          if (partialNextRequestId == null && continuationId != null) partialNextRequestId = continuationId;

          results.push({
            boe_id: target.boeId,
            label: target.label,
            status: "partial",
            source_id: sourceId,
            source_hash: sourceHash,
            blocks_total: law.blocksTotal,
            units_total: law.units.length,
            chunks_total: chunks.length,
            embedded_chunks: chunkRun.embeddedNow,
            pending_chunks_before: chunkRun.pendingBefore,
            remaining_chunks: chunkRun.remainingAfter,
            max_chunks_per_run: maxChunksPerRun,
            next_request_id: continuationId,
            embedding_model: OPENROUTER_EMBEDDING_MODEL,
            embedding_dim: EMBEDDING_DIM,
            created_new_source: created,
          });
        }
      } catch (error) {
        results.push({
          boe_id: target.boeId,
          label: target.label,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const shouldChain = !dryRun && boeIds.length === 0 && targetBatch.hasMore && !hasPartial;
    const nextRequestId = shouldChain
      ? await enqueueNextBatch(supabase, targets[targets.length - 1].boeId, force, maxLaws)
      : (partialNextRequestId ?? null);

    return json({
      ok: true,
      force,
      dry_run: dryRun,
      laws_processed: targets.length,
      has_more: targetBatch.hasMore || hasPartial,
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

