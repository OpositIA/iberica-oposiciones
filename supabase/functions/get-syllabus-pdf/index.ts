/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  PDFDocument,
  rgb,
  StandardFonts,
} from "https://esm.sh/pdf-lib@1.17.1";

const sanitizeSingleLineText = (value: unknown, maxLength = 200) => {
  if (
    typeof value !== "string"
    && typeof value !== "number"
    && typeof value !== "boolean"
  ) {
    return "";
  }

  return String(value)
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
};

const sanitizeInteger = (
  value: unknown,
  {
    min,
    max,
    fallback = null,
  }: {
    min: number;
    max: number;
    fallback?: number | null;
  },
) => {
  const candidate =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseInt(sanitizeSingleLineText(value, 32), 10);

  if (!Number.isFinite(candidate)) return fallback;
  const normalized = Math.floor(candidate);
  if (normalized < min || normalized > max) return fallback;
  return normalized;
};

const parseJsonBody = async <T>(req: Request): Promise<T> => {
  const raw = await req.text();
  if (!raw.trim()) return {} as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
};

type RequestPayload = {
  subtopic_file_id?: number;
};

type SubtopicFileRow = {
  id: number;
  is_active: boolean;
  file_name: string;
  mime_type: string;
  opposition_id: string;
  storage_bucket: string;
  storage_path: string;
  syllabus_id: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const buildTimestampLabel = () => {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
};

const buildFooterLabel = (userId: string) =>
  `Uso personal - ${buildTimestampLabel()} - ${
    sanitizeSingleLineText(userId, 64).slice(0, 8)
  }`;

const watermarkPdfBytes = async (
  sourceBytes: Uint8Array,
  {
    footerLabel,
  }: { footerLabel: string },
) => {
  const pdfDoc = await PDFDocument.load(sourceBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    const footerFontSize = Math.max(
      9,
      Math.min(12, Math.round(Math.min(width, height) / 70)),
    );

    page.drawRectangle({
      x: 16,
      y: 12,
      width: Math.max(220, width - 32),
      height: footerFontSize + 10,
      color: rgb(1, 1, 1),
      opacity: 0.62,
    });
    page.drawText(footerLabel, {
      x: 24,
      y: 18,
      size: footerFontSize,
      font,
      color: rgb(0.22, 0.22, 0.22),
      opacity: 0.88,
    });
  }

  return await pdfDoc.save();
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    ?.trim();
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return json({ error: "Missing required environment variables" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  let payload: RequestPayload;
  try {
    payload = await parseJsonBody<RequestPayload>(req);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid JSON body") {
      return json({ error: error.message }, 400);
    }

    throw error;
  }

  const subtopicFileId = sanitizeInteger(payload.subtopic_file_id, {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  });
  if (!subtopicFileId) {
    return json({ error: "subtopic_file_id is required" }, 400);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData?.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const user = authData.user;

  const { data: planRows, error: planError } = await serviceClient.rpc(
    "get_user_plan_state",
    {
      p_user_id: user.id,
      p_tz: "Europe/Madrid",
    },
  );
  if (planError) {
    return json(
      { error: `Could not load user plan state: ${planError.message}` },
      400,
    );
  }

  const hasPaidAccess = Boolean(planRows?.[0]?.is_paid);
  if (!hasPaidAccess) {
    return json({ error: "paid_plan_required" }, 403);
  }

  const { data: fileRow, error: fileError } = await serviceClient
    .from("opposition_subtopic_files")
    .select(
      "id, is_active, file_name, mime_type, opposition_id, storage_bucket, storage_path, syllabus_id",
    )
    .eq("id", subtopicFileId)
    .maybeSingle();

  const file = (fileRow ?? null) as SubtopicFileRow | null;
  if (fileError) {
    return json(
      { error: `Could not load subtopic file: ${fileError.message}` },
      400,
    );
  }

  if (!file || !file.is_active) {
    return json({ error: "syllabus_pdf_not_found" }, 404);
  }

  const { data: syllabusRow, error: syllabusError } = await serviceClient
    .from("opposition_syllabi")
    .select("id, is_current")
    .eq("id", file.syllabus_id)
    .maybeSingle();

  if (syllabusError) {
    return json(
      {
        error: `Could not validate syllabus version: ${syllabusError.message}`,
      },
      400,
    );
  }

  if (!syllabusRow?.is_current) {
    return json({ error: "syllabus_pdf_not_available" }, 404);
  }

  const { data: downloadData, error: downloadError } = await serviceClient.storage
    .from(file.storage_bucket)
    .download(file.storage_path);

  if (downloadError || !downloadData) {
    return json(
      {
        error:
          `Could not download syllabus PDF: ${
            downloadError?.message ?? "unknown_error"
          }`,
      },
      400,
    );
  }

  let sourceBytes: Uint8Array;
  try {
    sourceBytes = new Uint8Array(await downloadData.arrayBuffer());
  } catch (error) {
    return json(
      {
        error:
          `Could not read syllabus PDF bytes: ${
            error instanceof Error ? error.message : "unknown_error"
          }`,
      },
      400,
    );
  }

  let watermarkedBytes: Uint8Array;
  try {
    watermarkedBytes = await watermarkPdfBytes(sourceBytes, {
      footerLabel: buildFooterLabel(user.id),
    });
  } catch (error) {
    return json(
      {
        error:
          `Could not watermark syllabus PDF: ${
            error instanceof Error ? error.message : "unknown_error"
          }`,
      },
      500,
    );
  }

  const safeFileName = sanitizeSingleLineText(file.file_name, 160)
    || `temario-${file.id}.pdf`;

  return new Response(watermarkedBytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeFileName}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
});
