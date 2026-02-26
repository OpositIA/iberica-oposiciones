import i18n from "@/i18n/config";
import { normalizeLocale, type AppLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";

export type Oposicion = {
  id: string;
  nombre: string;
  cuerpo: string;
  temas: string[];
  temasDetalle: {
    code: string;
    title: string;
    subtopics: string[];
  }[];
};

export type OppositionOption = {
  id: string;
  name: string;
  body: string;
};

type ResolveOppositionParams = {
  preferredOppositionId: string | null | undefined;
  preferredOppositionName: string | null | undefined;
  locale: string | null | undefined;
};

const normalizeId = (value: string | null | undefined) =>
  String(value ?? "").trim();

const humanizeCode = (value: string) => {
  const normalized = value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return value;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const ensureOppositionNamespace = async () => {
  await i18n.loadNamespaces("oppositions");
};

const translateOppositionName = (locale: AppLocale, oppositionId: string) =>
  i18n.t(`catalog.${oppositionId}.name`, {
    ns: "oppositions",
    lng: locale,
    defaultValue: humanizeCode(oppositionId)
  });

const translateOppositionBody = (locale: AppLocale, oppositionId: string) =>
  i18n.t(`catalog.${oppositionId}.body`, {
    ns: "oppositions",
    lng: locale,
    defaultValue: ""
  });

const translateTopic = (
  locale: AppLocale,
  oppositionId: string,
  topicCode: string
) =>
  i18n.t(`topics.${oppositionId}.${topicCode}.title`, {
    ns: "oppositions",
    lng: locale,
    defaultValue: i18n.t(`topics.${oppositionId}.${topicCode}`, {
      ns: "oppositions",
      lng: locale,
      defaultValue: humanizeCode(topicCode)
    })
  });

const translateSubtopic = (
  locale: AppLocale,
  oppositionId: string,
  topicCode: string,
  subtopicCode: string
) =>
  i18n.t(`subtopics.${oppositionId}.${topicCode}.${subtopicCode}`, {
    ns: "oppositions",
    lng: locale,
    defaultValue: humanizeCode(subtopicCode)
  });

const fallbackUnknownOpposition = (locale: AppLocale) =>
  i18n.t("fallback.unknownName", {
    ns: "oppositions",
    lng: locale,
    defaultValue: "Oposicion"
  });

export const fetchOppositionOptions = async (
  localeValue: string | null | undefined
): Promise<OppositionOption[]> => {
  const locale = normalizeLocale(localeValue);
  await ensureOppositionNamespace();

  const { data, error } = await supabase
    .from("oppositions")
    .select("id, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error || !data || data.length === 0) return [];

  return data.map((row) => ({
    id: row.id,
    name: translateOppositionName(locale, row.id),
    body: translateOppositionBody(locale, row.id)
  }));
};

export const resolveOppositionNameById = (
  oppositionId: string | null | undefined,
  options: OppositionOption[]
) => {
  const normalizedId = normalizeId(oppositionId);
  if (!normalizedId) return "";
  return options.find((option) => option.id === normalizedId)?.name ?? "";
};

export const fetchOppositionById = async (
  oppositionId: string | null | undefined,
  localeValue: string | null | undefined
): Promise<Oposicion | null> => {
  const normalizedId = normalizeId(oppositionId);
  if (!normalizedId) return null;

  const locale = normalizeLocale(localeValue);
  await ensureOppositionNamespace();

  const { data: oppositionRow, error: oppositionError } = await supabase
    .from("oppositions")
    .select("id")
    .eq("id", normalizedId)
    .eq("is_active", true)
    .maybeSingle();

  if (oppositionError || !oppositionRow) return null;

  const { data: topicRows } = await supabase
    .from("opposition_topics")
    .select("id, topic_code, order_index")
    .eq("opposition_id", normalizedId)
    .order("order_index", { ascending: true })
    .order("id", { ascending: true });

  const topicIds = (topicRows ?? []).map((row) => row.id);
  const topicCodeById = new Map(
    (topicRows ?? []).map((row) => [row.id, row.topic_code])
  );
  const { data: subtopicRows } =
    topicIds.length > 0
      ? await supabase
          .from("opposition_subtopics")
          .select("opposition_topic_id, subtopic_code, order_index")
          .in("opposition_topic_id", topicIds)
          .order("order_index", { ascending: true })
          .order("id", { ascending: true })
      : { data: [] as Array<{
          opposition_topic_id: number;
          subtopic_code: string;
          order_index: number;
        }> };

  const subtopicsByTopicId = new Map<number, string[]>();
  (subtopicRows ?? []).forEach((row) => {
    if (!subtopicsByTopicId.has(row.opposition_topic_id))
    subtopicsByTopicId.set(row.opposition_topic_id, []);
    subtopicsByTopicId
      .get(row.opposition_topic_id)
      ?.push(
        translateSubtopic(
          locale,
          oppositionRow.id,
          topicCodeById.get(row.opposition_topic_id) ?? "",
          row.subtopic_code
        )
      );
  });

  const temasDetalle = (topicRows ?? []).map((row) => ({
    code: row.topic_code,
    title: translateTopic(locale, oppositionRow.id, row.topic_code),
    subtopics: subtopicsByTopicId.get(row.id) ?? []
  }));

  return {
    id: oppositionRow.id,
    nombre: translateOppositionName(locale, oppositionRow.id),
    cuerpo: translateOppositionBody(locale, oppositionRow.id),
    temas: temasDetalle
      .flatMap((topic) =>
        topic.subtopics.length > 0 ? topic.subtopics : [topic.title]
      )
      .filter((topic) => topic.length > 0),
    temasDetalle
  };
};

export const resolveOppositionFromProfile = async ({
  preferredOppositionId,
  preferredOppositionName,
  locale
}: ResolveOppositionParams): Promise<Oposicion> => {
  const resolvedLocale = normalizeLocale(locale);
  const fromId = await fetchOppositionById(preferredOppositionId, resolvedLocale);
  if (fromId) return fromId;

  const fromLegacyCode = await fetchOppositionById(
    preferredOppositionName,
    resolvedLocale
  );
  if (fromLegacyCode) return fromLegacyCode;

  await ensureOppositionNamespace();
  const fallbackName = normalizeId(preferredOppositionName);
  return {
    id: normalizeId(preferredOppositionId),
    nombre: fallbackName || fallbackUnknownOpposition(resolvedLocale),
    cuerpo: "",
    temas: [],
    temasDetalle: []
  };
};
