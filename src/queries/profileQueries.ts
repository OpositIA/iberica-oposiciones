import {
  fetchOppositionOptions,
  resolveOppositionFromProfile,
  type Oposicion,
  type OppositionOption
} from "@/data/oposicionesDb";
import { normalizeLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
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
    ["oppositions", "options", normalizeLocale(locale)] as const
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
