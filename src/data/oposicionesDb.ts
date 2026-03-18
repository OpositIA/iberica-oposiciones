import i18n from "@/i18n/config";
import { normalizeLocale, type AppLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";

export type Oposicion = {
  id: string;
  nombre: string;
  cuerpo: string;
  temas: string[];
  temarioContenido?: string | null;
  temasDetalle: {
    code: string;
    title: string;
    displayTitle: string;
    sectionTitle: string | null;
    subtopics: {
      code: string;
      title: string;
    }[];
  }[];
};

export type OppositionOption = {
  id: string;
  name: string;
  body: string;
};

type OppositionSyllabusRow = {
  id: number;
  raw_text: string | null;
};

type OppositionTopicRow = {
  id: number;
  topic_code: string;
  topic_title: string | null;
  order_index: number;
};

type OppositionSubtopicRow = {
  opposition_topic_id: number;
  subtopic_code: string;
  subtopic_title: string | null;
  section_title: string | null;
  order_index: number;
};

type ResolveOppositionParams = {
  preferredOppositionId: string | null | undefined;
  preferredOppositionName: string | null | undefined;
  locale: string | null | undefined;
};

const normalizeId = (value: string | null | undefined) =>
  String(value ?? "").trim();

const humanizeCode = (value: string) => {
  const normalized = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
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

  const { data: currentSyllabusRow } = await supabase
    .from("opposition_syllabi" as never)
    .select("id")
    .eq("opposition_id", normalizedId)
    .eq("is_current", true)
    .maybeSingle()
    .overrideTypes<Pick<OppositionSyllabusRow, "id">, { merge: false }>();

  let topicRows: OppositionTopicRow[] | null = null;

  if (currentSyllabusRow) {
    const { data } = await supabase
      .from("opposition_topics" as never)
      .select("id, topic_code, topic_title, order_index")
      .eq("syllabus_id", currentSyllabusRow.id)
      .order("order_index", { ascending: true })
      .order("id", { ascending: true })
      .overrideTypes<OppositionTopicRow[], { merge: false }>();

    topicRows = data;
  } else {
    const { data } = await supabase
      .from("opposition_topics" as never)
      .select("id, topic_code, topic_title, order_index")
      .eq("opposition_id", normalizedId)
      .order("order_index", { ascending: true })
      .order("id", { ascending: true })
      .overrideTypes<OppositionTopicRow[], { merge: false }>();

    topicRows = data;
  }

  const topicIds = (topicRows ?? []).map((row) => row.id);
  const topicCodeById = new Map(
    (topicRows ?? []).map((row) => [row.id, row.topic_code])
  );
  const { data: subtopicRows } =
    topicIds.length > 0
      ? await supabase
          // Supabase generated TS types are stale versus the real schema.
          // Use the runtime columns already verified in the database.
          .from("opposition_subtopics")
          .select(
            "opposition_topic_id, subtopic_code, subtopic_title, section_title, order_index"
          )
          .in("opposition_topic_id", topicIds)
          .order("order_index", { ascending: true })
          .order("id", { ascending: true })
          .overrideTypes<OppositionSubtopicRow[], { merge: false }>()
      : {
          data: [] as OppositionSubtopicRow[]
        };

  const { data: paidSyllabusContentRows } = await supabase
    .from("opposition_syllabi" as never)
    .select("raw_text")
    .eq("opposition_id", normalizedId)
    .eq("is_current", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("extracted_at", { ascending: false })
    .limit(1)
    .overrideTypes<
      Pick<OppositionSyllabusRow, "raw_text">[],
      { merge: false }
    >();

  const paidSyllabusContent = String(
    paidSyllabusContentRows?.[0]?.raw_text ?? ""
  ).trim();

  const subtopicsByTopicId = new Map<number, string[]>();
  const subtopicDetailsByTopicId = new Map<
    number,
    Array<{
      code: string;
      title: string;
    }>
  >();
  const sectionTitleByTopicId = new Map<number, string>();
  (subtopicRows ?? []).forEach((row) => {
    const sectionTitle = String(row.section_title ?? "").trim();
    if (sectionTitle && !sectionTitleByTopicId.has(row.opposition_topic_id))
      sectionTitleByTopicId.set(row.opposition_topic_id, sectionTitle);

    const subtopicTitle =
      String(row.subtopic_title ?? "").trim() ||
      translateSubtopic(
        locale,
        oppositionRow.id,
        String(topicCodeById.get(row.opposition_topic_id) ?? ""),
        String(row.subtopic_code ?? "")
      );

    if (!subtopicsByTopicId.has(row.opposition_topic_id))
      subtopicsByTopicId.set(row.opposition_topic_id, []);
    if (!subtopicDetailsByTopicId.has(row.opposition_topic_id))
      subtopicDetailsByTopicId.set(row.opposition_topic_id, []);
    subtopicsByTopicId.get(row.opposition_topic_id)?.push(subtopicTitle);
    subtopicDetailsByTopicId.get(row.opposition_topic_id)?.push({
      code: String(row.subtopic_code ?? "").trim(),
      title: subtopicTitle
    });
  });

  const temasDetalle = (topicRows ?? [])
    .map((row) => ({
      code: row.topic_code,
      title:
        String(row.topic_title ?? "").trim() ||
        translateTopic(locale, oppositionRow.id, row.topic_code),
      displayTitle: "",
      sectionTitle: sectionTitleByTopicId.get(row.id) ?? null,
      subtopics: subtopicDetailsByTopicId.get(row.id) ?? []
    }))
    .map((topic) => ({
      ...topic,
      displayTitle: topic.sectionTitle
        ? `${topic.title}. ${topic.sectionTitle}`
        : topic.title
    }));

  return {
    id: oppositionRow.id,
    nombre: translateOppositionName(locale, oppositionRow.id),
    cuerpo: translateOppositionBody(locale, oppositionRow.id),
    temarioContenido: paidSyllabusContent || null,
    temas: temasDetalle
      .flatMap((topic) =>
        topic.subtopics.length > 0
          ? topic.subtopics.map((subtopic) => subtopic.title)
          : [topic.title]
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
  const fromId = await fetchOppositionById(
    preferredOppositionId,
    resolvedLocale
  );
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
    temarioContenido: null,
    temas: [],
    temasDetalle: []
  };
};
