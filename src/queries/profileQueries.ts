import {
  fetchOppositionOptions,
  resolveOppositionFromProfile,
  type Oposicion,
  type OppositionOption
} from "@/data/oposicionesDb";
import { normalizeLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeCode, sanitizeSingleLineText } from "@/lib/inputSanitization";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const PROFILE_BASE_SELECT =
  "preferred_opposition_id, preferred_opposition, weekly_target_hours";

type ProfileBaseRow = {
  preferred_opposition_id: string | null;
  preferred_opposition: string | null;
  weekly_target_hours: number | null;
};

export type ProfileDetailsRow = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  age: number | null;
  preferred_opposition_id: string | null;
  preferred_opposition: string | null;
  years_preparing: number | null;
  weekly_target_hours: number | null;
  tests_per_week: number | null;
  main_challenge: string | null;
  avatar_url: string | null;
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

type SyllabusPdfUrlResponse = {
  signed_url?: string;
  file_name?: string;
  error?: string;
};

const SUPABASE_FUNCTIONS_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const QUERY_STALE_MS = 5 * 60 * 1000;
const QUERY_GC_MS = 30 * 60 * 1000;

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
  paidSyllabusSubtopicFiles: (oppositionId: string) =>
    ["syllabus", "subtopic-files", oppositionId] as const
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
    preferred_opposition: data.preferred_opposition,
    weekly_target_hours: data.weekly_target_hours
  };
};

const PROFILE_DETAILS_SELECT =
  "email, first_name, last_name, age, preferred_opposition_id, preferred_opposition, years_preparing, weekly_target_hours, tests_per_week, main_challenge, avatar_url";

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
    staleTime: QUERY_STALE_MS,
    gcTime: QUERY_GC_MS
  });

export const useProfileDetailsQuery = (userId: string | null | undefined) =>
  useQuery({
    queryKey: userId
      ? profileQueryKeys.details(userId)
      : ["profiles", "details", "guest"],
    queryFn: () => fetchProfileDetails(userId as string),
    enabled: Boolean(userId),
    staleTime: QUERY_STALE_MS,
    gcTime: QUERY_GC_MS
  });

type PreferredOppositionParams = {
  userId: string | null | undefined;
  locale: string | null | undefined;
};

export const usePreferredOppositionQuery = ({
  userId,
  locale
}: PreferredOppositionParams) => {
  const queryClient = useQueryClient();
  const normalizedLocale = normalizeLocale(locale);

  return useQuery<Oposicion>({
    queryKey: userId
      ? profileQueryKeys.preferredOpposition(userId, normalizedLocale)
      : ["profiles", "preferred-opposition", "guest", normalizedLocale],
    queryFn: async () => {
      const base = await queryClient.fetchQuery({
        queryKey: profileQueryKeys.base(userId as string),
        queryFn: () => fetchProfileBase(userId as string),
        staleTime: QUERY_STALE_MS
      });

      return resolveOppositionFromProfile({
        preferredOppositionId: base?.preferred_opposition_id,
        preferredOppositionName: base?.preferred_opposition,
        locale: normalizedLocale
      });
    },
    enabled: Boolean(userId),
    staleTime: QUERY_STALE_MS,
    gcTime: QUERY_GC_MS
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
    staleTime: QUERY_STALE_MS,
    gcTime: QUERY_GC_MS
  });

export const useOppositionOptionsQuery = (locale: string | null | undefined) =>
  useQuery<OppositionOption[]>({
    queryKey: profileQueryKeys.oppositionOptions(normalizeLocale(locale)),
    queryFn: () => fetchOppositionOptions(locale),
    staleTime: QUERY_STALE_MS,
    gcTime: QUERY_GC_MS
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

const fetchPaidSyllabusSubtopicFiles = async (
  oppositionId: string
): Promise<PaidSyllabusSubtopicFileRow[]> => {
  const normalizedOppositionId = sanitizeCode(oppositionId, 160);
  if (!normalizedOppositionId) return [];

  const rpcClient = supabase as unknown as {
    rpc: (
      fn: "get_current_paid_syllabus_subtopic_files",
      args: { p_opposition_id: string }
    ) => Promise<{
      data: Record<string, unknown>[] | null;
      error: unknown;
    }>;
  };
  const { data, error } = await rpcClient.rpc(
    "get_current_paid_syllabus_subtopic_files",
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
): Promise<Uint8Array> => {
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

  return new Uint8Array(await response.arrayBuffer());
};

export const usePaidSyllabusSubtopicFilesQuery = (
  oppositionId: string | null | undefined,
  enabled = true
) =>
  useQuery<PaidSyllabusSubtopicFileRow[]>({
    queryKey: oppositionId
      ? profileQueryKeys.paidSyllabusSubtopicFiles(oppositionId)
      : ["syllabus", "subtopic-files", "guest"],
    queryFn: () => fetchPaidSyllabusSubtopicFiles(oppositionId as string),
    enabled: enabled && Boolean(oppositionId),
    staleTime: QUERY_STALE_MS,
    gcTime: QUERY_GC_MS
  });
