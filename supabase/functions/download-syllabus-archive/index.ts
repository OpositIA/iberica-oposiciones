/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { zipSync } from "https://esm.sh/fflate@0.8.2?target=deno";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import {
  parseJsonBody,
  sanitizeInteger,
  sanitizeSingleLineText
} from "../_shared/inputSanitization.ts";

type RequestPayload = {
  subtopic_file_id?: number;
};

type TargetFileRow = {
  id: number;
  is_active: boolean;
  opposition_id: string;
  syllabus_id: number;
};

type TargetSyllabusRow = {
  boe_id: string;
  id: number;
  is_current: boolean;
  opposition_id: string;
  published_at: string | null;
};

type ArchiveRow = {
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  file_title: string | null;
  sort_order: number;
  subtopic_order: number;
  subtopic_title: string | null;
  topic_order: number;
  topic_title: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "Content-Disposition"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });

const buildUserMetadataLabel = (user: {
  id: string;
  email?: string | null;
}) => {
  const normalizedEmail = sanitizeSingleLineText(user.email, 180);
  const shortUserId = sanitizeSingleLineText(user.id, 80).slice(0, 8);
  if (normalizedEmail) return `${normalizedEmail} (${shortUserId})`;
  return `Usuario ${shortUserId}`;
};

const safeFileSegment = (value: string, fallback: string) => {
  const normalized = sanitizeSingleLineText(value, 160)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[ .]+$/g, "");

  return normalized.length > 0 ? normalized : fallback;
};

const buildZipFileName = (
  oppositionId: string,
  publishedAt: string | null,
  boeId: string
) => {
  const oppositionSegment = safeFileSegment(oppositionId, "oposicion");
  const versionSegment = safeFileSegment(
    publishedAt || boeId || new Date().toISOString().slice(0, 10),
    "actual"
  );
  return `${oppositionSegment} - temario completo - ${versionSegment}.zip`;
};

const buildPdfFileName = (row: ArchiveRow) => {
  const baseName =
    sanitizeSingleLineText(row.file_title, 160) ||
    sanitizeSingleLineText(row.subtopic_title, 160) ||
    sanitizeSingleLineText(row.file_name, 160) ||
    `tema-${row.subtopic_order}`;

  return `${String(row.subtopic_order).padStart(2, "0")} - ${safeFileSegment(baseName, `tema-${row.subtopic_order}`)}.pdf`;
};

const buildBlockFolderName = (row: ArchiveRow) => {
  const blockLabel =
    sanitizeSingleLineText(row.topic_title, 160) || `Bloque ${row.topic_order}`;
  return `${String(row.topic_order).padStart(2, "0")} - ${safeFileSegment(blockLabel, `bloque-${row.topic_order}`)}`;
};

const toUint8Array = async (blob: Blob) =>
  new Uint8Array(await blob.arrayBuffer());

const personalizePdfBytes = async (
  sourceBytes: Uint8Array,
  {
    row,
    user,
    syllabus
  }: {
    row: ArchiveRow;
    user: { id: string; email?: string | null };
    syllabus: TargetSyllabusRow;
  }
) => {
  const pdf = await PDFDocument.load(sourceBytes);
  const metadataUser = buildUserMetadataLabel(user);
  const topicTitle =
    sanitizeSingleLineText(row.topic_title, 160) || `Bloque ${row.topic_order}`;
  const documentTitle =
    sanitizeSingleLineText(row.file_title, 180) ||
    sanitizeSingleLineText(row.subtopic_title, 180) ||
    sanitizeSingleLineText(row.file_name, 180) ||
    `Tema ${row.subtopic_order}`;

  pdf.setTitle(documentTitle);
  pdf.setAuthor(metadataUser);
  pdf.setSubject(`Temario ${syllabus.opposition_id} - ${topicTitle}`);
  pdf.setKeywords(
    [
      "Iberica Oposiciones",
      syllabus.opposition_id,
      topicTitle,
      metadataUser,
      sanitizeSingleLineText(syllabus.boe_id, 60)
    ].filter(Boolean)
  );
  pdf.setProducer("Iberica Oposiciones");
  pdf.setCreator("Iberica Oposiciones");
  pdf.setLanguage("es-ES");
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());

  return await pdf.save();
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const supabaseServiceRoleKey = Deno.env
    .get("SUPABASE_SERVICE_ROLE_KEY")
    ?.trim();

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey)
    return json({ error: "Missing required environment variables" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  let payload: RequestPayload;
  try {
    payload = await parseJsonBody<RequestPayload>(req);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body")
      return json({ error: error.message }, 400);

    throw error;
  }

  const subtopicFileId = sanitizeInteger(payload.subtopic_file_id, {
    min: 1,
    max: Number.MAX_SAFE_INTEGER
  });
  if (!subtopicFileId)
    return json({ error: "subtopic_file_id is required" }, 400);

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);

  const user = authData.user;

  const { data: fileRow, error: fileError } = await serviceClient
    .from("opposition_subtopic_files")
    .select("id, is_active, opposition_id, syllabus_id")
    .eq("id", subtopicFileId)
    .maybeSingle();

  const file = (fileRow ?? null) as TargetFileRow | null;
  if (fileError)
    return json(
      { error: `target_file_lookup_failed:${fileError.message}` },
      400
    );
  if (!file || !file.is_active)
    return json({ error: "syllabus_pdf_not_found" }, 404);

  const { data: syllabusRow, error: syllabusError } = await serviceClient
    .from("opposition_syllabi")
    .select("boe_id, id, is_current, opposition_id, published_at")
    .eq("id", file.syllabus_id)
    .maybeSingle();

  const syllabus = (syllabusRow ?? null) as TargetSyllabusRow | null;
  if (syllabusError)
    return json(
      { error: `syllabus_lookup_failed:${syllabusError.message}` },
      400
    );
  if (!syllabus || !syllabus.is_current)
    return json({ error: "syllabus_download_not_available" }, 404);

  const { data: purchaseRow, error: purchaseError } = await serviceClient
    .from("syllabus_download_purchases")
    .select("id")
    .eq("user_id", user.id)
    .eq("syllabus_id", syllabus.id)
    .maybeSingle();

  if (purchaseError)
    return json(
      { error: `purchase_lookup_failed:${purchaseError.message}` },
      400
    );
  if (!purchaseRow)
    return json({ error: "syllabus_download_not_purchased" }, 403);

  const { data: archiveRows, error: archiveError } = await serviceClient
    .from("opposition_subtopic_files")
    .select(
      "storage_bucket, storage_path, file_name, file_title, sort_order, opposition_subtopics!inner(order_index, subtopic_title, opposition_topics!inner(order_index, topic_title))"
    )
    .eq("syllabus_id", syllabus.id)
    .eq("is_active", true)
    .order("subtopic_id", { ascending: true })
    .order("sort_order", { ascending: true });

  if (archiveError)
    return json(
      { error: `archive_rows_lookup_failed:${archiveError.message}` },
      400
    );
  if (!Array.isArray(archiveRows) || archiveRows.length === 0)
    return json({ error: "syllabus_download_empty" }, 404);

  const normalizedRows: ArchiveRow[] = archiveRows
    .map((row) => {
      const subtopicRelation = Array.isArray(row.opposition_subtopics)
        ? row.opposition_subtopics[0]
        : row.opposition_subtopics;
      const topicRelation =
        subtopicRelation &&
        typeof subtopicRelation === "object" &&
        "opposition_topics" in subtopicRelation
          ? Array.isArray(subtopicRelation.opposition_topics)
            ? subtopicRelation.opposition_topics[0]
            : subtopicRelation.opposition_topics
          : null;

      return {
        storage_bucket: sanitizeSingleLineText(row.storage_bucket, 120),
        storage_path: sanitizeSingleLineText(row.storage_path, 240),
        file_name: sanitizeSingleLineText(row.file_name, 180),
        file_title: sanitizeSingleLineText(row.file_title, 180) || null,
        sort_order:
          typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
            ? Math.max(0, Math.floor(row.sort_order))
            : 0,
        subtopic_order:
          subtopicRelation &&
          typeof subtopicRelation.order_index === "number" &&
          Number.isFinite(subtopicRelation.order_index)
            ? Math.max(0, Math.floor(subtopicRelation.order_index))
            : 0,
        subtopic_title:
          subtopicRelation &&
          typeof subtopicRelation.subtopic_title === "string"
            ? subtopicRelation.subtopic_title
            : null,
        topic_order:
          topicRelation &&
          typeof topicRelation.order_index === "number" &&
          Number.isFinite(topicRelation.order_index)
            ? Math.max(0, Math.floor(topicRelation.order_index))
            : 0,
        topic_title:
          topicRelation && typeof topicRelation.topic_title === "string"
            ? topicRelation.topic_title
            : null
      };
    })
    .filter(
      (row) =>
        row.storage_bucket.length > 0 &&
        row.storage_path.length > 0 &&
        row.file_name.length > 0
    )
    .sort((a, b) => {
      if (a.topic_order !== b.topic_order) return a.topic_order - b.topic_order;
      if (a.subtopic_order !== b.subtopic_order)
        return a.subtopic_order - b.subtopic_order;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.file_name.localeCompare(b.file_name, "es");
    });

  const zipEntries: Record<string, Uint8Array> = {};

  for (const row of normalizedRows) {
    const { data: downloadData, error: downloadError } =
      await serviceClient.storage
        .from(row.storage_bucket)
        .download(row.storage_path);

    if (downloadError || !downloadData)
      return json(
        {
          error: `archive_file_download_failed:${
            downloadError?.message ?? row.storage_path
          }`
        },
        400
      );

    const personalizedBytes = await personalizePdfBytes(
      await toUint8Array(downloadData),
      {
        row,
        user,
        syllabus
      }
    );

    zipEntries[`${buildBlockFolderName(row)}/${buildPdfFileName(row)}`] =
      new Uint8Array(personalizedBytes);
  }

  const zipBytes = zipSync(zipEntries, { level: 6 });
  const zipFileName = buildZipFileName(
    syllabus.opposition_id,
    syllabus.published_at,
    syllabus.boe_id
  );

  return new Response(zipBytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFileName}"`
    }
  });
});
