import {
  fetchOppositionOptions,
  resolveOppositionFromProfile,
  type Oposicion,
  type OppositionOption
} from "@/data/oposicionesDb";
import { normalizeLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeCode, sanitizeSingleLineText } from "@/lib/inputSanitization";
import { useQuery } from "@tanstack/react-query";

const PROFILE_BASE_SELECT = "preferred_opposition_id, preferred_opposition";

type ProfileBaseRow = {
  preferred_opposition_id: string | null;
  preferred_opposition: string | null;
};

export type ProfileDetailsRow = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  preferred_opposition_id: string | null;
  preferred_opposition: string | null;
  avatar_url: string | null;
  product_updates_email_enabled: boolean;
  is_deleted: boolean;
  has_changed_opposition: boolean;
  locale: string | null;
};

export type PaidSyllabusSubtopicFileRow = {
  id: number;
  subtopic_id: number;
  subtopic_code: string;
  file_name: string;
  file_title: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  sort_order: number;
};

export type SyllabusDownloadOfferRow = {
  opposition_id: string;
  syllabus_id: number;
  syllabus_boe_id: string | null;
  syllabus_published_at: string | null;
  syllabus_extracted_at: string | null;
  total_pdf_count: number;
  block_count: number;
  is_purchased: boolean;
  price_cents: number;
  currency: string;
};

type SyllabusPdfUrlResponse = {
  signed_url?: string;
  file_name?: string;
  error?: string;
};

type SyllabusPdfPayload = {
  pdfBytes: Uint8Array;
  totalPages: number;
  isPreviewOnly: boolean;
};

type CheckoutSessionResponse = {
  checkout_url?: string;
  session_id?: string;
  error?: string;
};

const SUPABASE_FUNCTIONS_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const PROFILE_QUERY_CONFIG = {
  staleTime: 60 * 1000,
  gcTime: 15 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false
};

export const profileQueryKeys = {
  base: (userId: string) => ["profiles", "base", userId] as const,
  details: (userId: string) => ["profiles", "details", userId] as const,
  preferredOpposition: (userId: string, locale: string) =>
    [
      "profiles",
      "preferred-opposition",
      userId,
      normalizeLocale(locale)
    ] as const,
  resolvedOpposition: (
    preferredOppositionId: string | null | undefined,
    preferredOppositionName: string | null | undefined,
    locale: string | null | undefined
  ) =>
    [
      "oppositions",
      "resolved",
      String(preferredOppositionId ?? "").trim(),
      String(preferredOppositionName ?? "").trim(),
      normalizeLocale(locale)
    ] as const,
  oppositionOptions: (locale: string) =>
    ["oppositions", "options", normalizeLocale(locale)] as const,
  syllabusSubtopicFiles: (oppositionId: string) =>
    ["syllabus", "subtopic-files", oppositionId] as const,
  syllabusDownloadOffer: (subtopicFileId: number) =>
    ["syllabus", "download-offer", subtopicFileId] as const
};

const fetchProfileBase = async (
  userId: string
): Promise<ProfileBaseRow | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_BASE_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  if (!data) return null;

  return {
    preferred_opposition_id: data.preferred_opposition_id,
    preferred_opposition: data.preferred_opposition
  };
};

const PROFILE_DETAILS_SELECT =
  "email, first_name, last_name, date_of_birth, preferred_opposition_id, preferred_opposition, avatar_url, product_updates_email_enabled, is_deleted, has_changed_opposition, locale";

const fetchProfileDetails = async (
  userId: string
): Promise<ProfileDetailsRow | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_DETAILS_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  if (!data) return null;
  return data;
};

export const useProfileBaseQuery = (userId: string | null | undefined) =>
  useQuery({
    queryKey: userId
      ? profileQueryKeys.base(userId)
      : ["profiles", "base", "guest"],
    queryFn: () => fetchProfileBase(userId as string),
    enabled: Boolean(userId),
    ...PROFILE_QUERY_CONFIG
  });

export const useProfileDetailsQuery = (userId: string | null | undefined) =>
  useQuery({
    queryKey: userId
      ? profileQueryKeys.details(userId)
      : ["profiles", "details", "guest"],
    queryFn: () => fetchProfileDetails(userId as string),
    enabled: Boolean(userId),
    ...PROFILE_QUERY_CONFIG
  });

type PreferredOppositionParams = {
  userId: string | null | undefined;
  locale: string | null | undefined;
};

export const usePreferredOppositionQuery = ({
  userId,
  locale
}: PreferredOppositionParams) => {
  const normalizedLocale = normalizeLocale(locale);

  return useQuery<Oposicion>({
    queryKey: userId
      ? profileQueryKeys.preferredOpposition(userId, normalizedLocale)
      : ["profiles", "preferred-opposition", "guest", normalizedLocale],
    queryFn: async () => {
      const base = await fetchProfileBase(userId as string);

      return resolveOppositionFromProfile({
        preferredOppositionId: base?.preferred_opposition_id,
        preferredOppositionName: base?.preferred_opposition,
        locale: normalizedLocale
      });
    },
    enabled: Boolean(userId),
    ...PROFILE_QUERY_CONFIG
  });
};

type ResolvedOppositionParams = {
  preferredOppositionId: string | null | undefined;
  preferredOppositionName: string | null | undefined;
  locale: string | null | undefined;
  enabled?: boolean;
};

export const useResolvedOppositionQuery = ({
  preferredOppositionId,
  preferredOppositionName,
  locale,
  enabled = true
}: ResolvedOppositionParams) =>
  useQuery<Oposicion>({
    queryKey: profileQueryKeys.resolvedOpposition(
      preferredOppositionId,
      preferredOppositionName,
      locale
    ),
    queryFn: () =>
      resolveOppositionFromProfile({
        preferredOppositionId,
        preferredOppositionName,
        locale
      }),
    enabled,
    ...PROFILE_QUERY_CONFIG
  });

export const useOppositionOptionsQuery = (locale: string | null | undefined) =>
  useQuery<OppositionOption[]>({
    queryKey: profileQueryKeys.oppositionOptions(normalizeLocale(locale)),
    queryFn: () => fetchOppositionOptions(locale),
    ...PROFILE_QUERY_CONFIG
  });

const normalizePaidSyllabusSubtopicFileRow = (
  row: Record<string, unknown>
): PaidSyllabusSubtopicFileRow | null => {
  const id =
    typeof row.id === "number" && Number.isFinite(row.id)
      ? Math.floor(row.id)
      : null;
  const subtopicId =
    typeof row.subtopic_id === "number" && Number.isFinite(row.subtopic_id)
      ? Math.floor(row.subtopic_id)
      : null;
  const subtopicCode = sanitizeCode(row.subtopic_code, 220);
  const fileName = sanitizeSingleLineText(row.file_name, 220);
  if (!id || !subtopicId || !subtopicCode || !fileName) return null;

  return {
    id,
    subtopic_id: subtopicId,
    subtopic_code: subtopicCode,
    file_name: fileName,
    file_title: sanitizeSingleLineText(row.file_title, 220) || null,
    mime_type: sanitizeSingleLineText(row.mime_type, 120) || "application/pdf",
    file_size_bytes:
      typeof row.file_size_bytes === "number" &&
      Number.isFinite(row.file_size_bytes) &&
      row.file_size_bytes > 0
        ? Math.floor(row.file_size_bytes)
        : null,
    sort_order:
      typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
        ? Math.max(0, Math.floor(row.sort_order))
        : 0
  };
};

const fetchSyllabusSubtopicFiles = async (
  oppositionId: string
): Promise<PaidSyllabusSubtopicFileRow[]> => {
  const normalizedOppositionId = sanitizeCode(oppositionId, 160);
  if (!normalizedOppositionId) return [];

  const rpcClient = supabase as unknown as {
    rpc: (
      fn: "get_current_syllabus_subtopic_files",
      args: { p_opposition_id: string }
    ) => Promise<{
      data: Record<string, unknown>[] | null;
      error: unknown;
    }>;
  };
  const { data, error } = await rpcClient.rpc(
    "get_current_syllabus_subtopic_files",
    {
      p_opposition_id: normalizedOppositionId
    }
  );

  if (error) throw error;
  if (!Array.isArray(data)) return [];

  return data
    .map((row) =>
      row && typeof row === "object"
        ? normalizePaidSyllabusSubtopicFileRow(row as Record<string, unknown>)
        : null
    )
    .filter((row): row is PaidSyllabusSubtopicFileRow => Boolean(row));
};

export const getSignedSyllabusPdfUrl = async (
  subtopicFileId: number
): Promise<{ signedUrl: string; fileName: string | null }> => {
  const normalizedSubtopicFileId =
    typeof subtopicFileId === "number" && Number.isFinite(subtopicFileId)
      ? Math.max(1, Math.floor(subtopicFileId))
      : 0;

  if (!normalizedSubtopicFileId)
    throw new Error("No se ha podido identificar el PDF del temario.");

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token?.trim() ?? "";
  if (!accessToken)
    throw new Error("Debes iniciar sesion para abrir este PDF.");

  const { data, error } =
    await supabase.functions.invoke<SyllabusPdfUrlResponse>(
      "get-syllabus-pdf-url",
      {
        body: {
          subtopic_file_id: normalizedSubtopicFileId
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

  if (error) {
    let message = error.message || "No se pudo abrir el PDF del temario.";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = (await context.json()) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0)
          message = parsed.error.trim();
      } catch {
        // keep original message
      }
    }

    throw new Error(message);
  }

  const signedUrl =
    typeof data?.signed_url === "string" ? data.signed_url.trim() : "";
  if (!signedUrl)
    throw new Error("No se pudo generar la URL temporal del PDF.");

  return {
    signedUrl,
    fileName:
      typeof data?.file_name === "string" && data.file_name.trim().length > 0
        ? data.file_name.trim()
        : null
  };
};

export const getWatermarkedSyllabusPdfBytes = async (
  subtopicFileId: number
): Promise<SyllabusPdfPayload> => {
  const normalizedSubtopicFileId =
    typeof subtopicFileId === "number" && Number.isFinite(subtopicFileId)
      ? Math.max(1, Math.floor(subtopicFileId))
      : 0;

  if (!normalizedSubtopicFileId)
    throw new Error("No se ha podido identificar el PDF del temario.");

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token?.trim() ?? "";
  if (!accessToken)
    throw new Error("Debes iniciar sesion para abrir este PDF.");

  const response = await fetch(
    `${SUPABASE_FUNCTIONS_BASE_URL}/get-syllabus-pdf`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subtopic_file_id: normalizedSubtopicFileId
      }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const contentType =
      response.headers.get("Content-Type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      try {
        const parsed = (await response.json()) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0)
          throw new Error(parsed.error.trim());
      } catch (error) {
        if (error instanceof Error) throw error;
      }
    }

    throw new Error("No se pudo abrir el PDF del temario.");
  }

  const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/pdf"))
    throw new Error("La respuesta del visor no contiene un PDF valido.");

  const totalPagesHeader = Number.parseInt(
    response.headers.get("X-Syllabus-Total-Pages") ?? "",
    10
  );

  return {
    pdfBytes: new Uint8Array(await response.arrayBuffer()),
    totalPages:
      Number.isFinite(totalPagesHeader) && totalPagesHeader > 0
        ? totalPagesHeader
        : 1,
    isPreviewOnly: response.headers.get("X-Syllabus-Is-Preview") === "true"
  };
};

const normalizeSyllabusDownloadOfferRow = (
  row: Record<string, unknown>
): SyllabusDownloadOfferRow | null => {
  const oppositionId = sanitizeCode(row.opposition_id, 160);
  const syllabusId =
    typeof row.syllabus_id === "number" && Number.isFinite(row.syllabus_id)
      ? Math.floor(row.syllabus_id)
      : null;

  if (!oppositionId || !syllabusId) return null;

  return {
    opposition_id: oppositionId,
    syllabus_id: syllabusId,
    syllabus_boe_id: sanitizeSingleLineText(row.syllabus_boe_id, 80) || null,
    syllabus_published_at:
      sanitizeSingleLineText(row.syllabus_published_at, 40) || null,
    syllabus_extracted_at:
      sanitizeSingleLineText(row.syllabus_extracted_at, 80) || null,
    total_pdf_count:
      typeof row.total_pdf_count === "number" &&
      Number.isFinite(row.total_pdf_count)
        ? Math.max(0, Math.floor(row.total_pdf_count))
        : 0,
    block_count:
      typeof row.block_count === "number" && Number.isFinite(row.block_count)
        ? Math.max(0, Math.floor(row.block_count))
        : 0,
    is_purchased: Boolean(row.is_purchased),
    price_cents:
      typeof row.price_cents === "number" && Number.isFinite(row.price_cents)
        ? Math.max(0, Math.floor(row.price_cents))
        : 2999,
    currency: sanitizeSingleLineText(row.currency, 10) || "EUR"
  };
};

export const fetchCurrentSyllabusDownloadOffer = async (
  subtopicFileId: number
): Promise<SyllabusDownloadOfferRow | null> => {
  const normalizedSubtopicFileId =
    typeof subtopicFileId === "number" && Number.isFinite(subtopicFileId)
      ? Math.max(1, Math.floor(subtopicFileId))
      : 0;

  if (!normalizedSubtopicFileId)
    throw new Error("No se ha podido identificar el PDF del temario.");

  const rpcClient = supabase as unknown as {
    rpc: (
      fn: "get_current_syllabus_download_offer",
      args: { p_subtopic_file_id: number }
    ) => Promise<{
      data: Record<string, unknown>[] | null;
      error: unknown;
    }>;
  };

  const { data, error } = await rpcClient.rpc(
    "get_current_syllabus_download_offer",
    {
      p_subtopic_file_id: normalizedSubtopicFileId
    }
  );

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row !== "object") return null;

  return normalizeSyllabusDownloadOfferRow(row as Record<string, unknown>);
};

export const createSyllabusDownloadCheckoutSession = async ({
  subtopicFileId,
  successPath,
  cancelPath
}: {
  subtopicFileId: number;
  successPath?: string;
  cancelPath?: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> => {
  const normalizedSubtopicFileId =
    typeof subtopicFileId === "number" && Number.isFinite(subtopicFileId)
      ? Math.max(1, Math.floor(subtopicFileId))
      : 0;

  if (!normalizedSubtopicFileId)
    throw new Error("No se ha podido identificar el PDF del temario.");

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token?.trim() ?? "";
  if (!accessToken)
    throw new Error("Debes iniciar sesion para iniciar la pasarela de pago.");

  const { data, error } =
    await supabase.functions.invoke<CheckoutSessionResponse>(
      "create-syllabus-download-checkout",
      {
        body: {
          subtopic_file_id: normalizedSubtopicFileId,
          source: "profile_syllabus_download",
          success_path: sanitizeSingleLineText(successPath, 240),
          cancel_path: sanitizeSingleLineText(cancelPath, 240)
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

  if (error) {
    let message = "No se pudo iniciar la pasarela de pago.";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = (await context.json()) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0)
          message = parsed.error.trim();
      } catch {
        message = error.message || message;
      }
    } else if (error.message) message = error.message;

    throw new Error(message);
  }

  const checkoutUrl =
    typeof data?.checkout_url === "string" ? data.checkout_url.trim() : "";
  const sessionId =
    typeof data?.session_id === "string" ? data.session_id.trim() : "";

  if (!checkoutUrl)
    throw new Error("La pasarela de pago no devolvio una URL valida.");

  return {
    checkoutUrl,
    sessionId
  };
};

export const downloadPurchasedSyllabusArchive = async (
  subtopicFileId: number
): Promise<{ blob: Blob; fileName: string | null }> => {
  const normalizedSubtopicFileId =
    typeof subtopicFileId === "number" && Number.isFinite(subtopicFileId)
      ? Math.max(1, Math.floor(subtopicFileId))
      : 0;

  if (!normalizedSubtopicFileId)
    throw new Error("No se ha podido identificar el PDF del temario.");

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token?.trim() ?? "";
  if (!accessToken)
    throw new Error("Debes iniciar sesion para descargar este temario.");

  const response = await fetch(
    `${SUPABASE_FUNCTIONS_BASE_URL}/download-syllabus-archive`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subtopic_file_id: normalizedSubtopicFileId
      }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const contentType =
      response.headers.get("Content-Type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      try {
        const parsed = (await response.json()) as { error?: unknown };
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0)
          throw new Error(parsed.error.trim());
      } catch (error) {
        if (error instanceof Error) throw error;
      }
    }

    throw new Error("No se pudo descargar el temario completo.");
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const fileNameMatch = disposition.match(/filename="([^"]+)"/i);

  return {
    blob: await response.blob(),
    fileName: fileNameMatch?.[1]?.trim() || null
  };
};

export const useSyllabusSubtopicFilesQuery = (
  oppositionId: string | null | undefined,
  enabled = true
) =>
  useQuery<PaidSyllabusSubtopicFileRow[]>({
    queryKey: oppositionId
      ? profileQueryKeys.syllabusSubtopicFiles(oppositionId)
      : ["syllabus", "subtopic-files", "guest"],
    queryFn: () => fetchSyllabusSubtopicFiles(oppositionId as string),
    enabled: enabled && Boolean(oppositionId),
    ...PROFILE_QUERY_CONFIG
  });

export const useCurrentSyllabusDownloadOfferQuery = (
  subtopicFileId: number | null | undefined,
  enabled = true
) =>
  useQuery<SyllabusDownloadOfferRow | null>({
    queryKey:
      typeof subtopicFileId === "number" && Number.isFinite(subtopicFileId)
        ? profileQueryKeys.syllabusDownloadOffer(
            Math.max(1, Math.floor(subtopicFileId))
          )
        : ["syllabus", "download-offer", "guest"],
    queryFn: () => fetchCurrentSyllabusDownloadOffer(subtopicFileId as number),
    enabled:
      enabled &&
      typeof subtopicFileId === "number" &&
      Number.isFinite(subtopicFileId) &&
      subtopicFileId > 0,
    ...PROFILE_QUERY_CONFIG
  });
