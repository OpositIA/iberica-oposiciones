const ARTICLE_SUFFIXES =
  "bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies";
const ARTICLE_TOKEN_SOURCE = `\\d+(?:[.\\-]\\d+)*(?:\\s*(?:${ARTICLE_SUFFIXES}))?`;
const ARTICLE_GROUP_SOURCE =
  `\\bart(?:[íi]?culos?)?\\.?\\s*` +
  `(${ARTICLE_TOKEN_SOURCE}(?:\\s*(?:,|;|\\/|\\by\\b|\\be\\b)\\s*${ARTICLE_TOKEN_SOURCE})*)`;

const stripDiacritics = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeArticleRef = (value: string) =>
  stripDiacritics(value)
    .replace(/\s+/g, "")
    .replace(/-(?=\d)/g, ".");

const uniqueTexts = (values: string[], maxItems: number, maxChars: number) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim().slice(0, maxChars).trim();
    const key = stripDiacritics(clean);
    if (clean.length < 3 || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= maxItems) break;
  }

  return result;
};

export function extractArticleReferences(
  queries: string[],
  maxRefs = 8
): string[] {
  const refs = new Set<string>();

  for (const query of queries) {
    const normalizedQuery = stripDiacritics(query);
    const groupPattern = new RegExp(ARTICLE_GROUP_SOURCE, "giu");
    let groupMatch: RegExpExecArray | null;

    while ((groupMatch = groupPattern.exec(normalizedQuery)) !== null) {
      const tokenPattern = new RegExp(ARTICLE_TOKEN_SOURCE, "giu");
      const tokens = groupMatch[1].match(tokenPattern) ?? [];
      for (const token of tokens) {
        const ref = normalizeArticleRef(token);
        if (ref) refs.add(ref);
        if (refs.size >= maxRefs) return Array.from(refs);
      }
    }
  }

  return Array.from(refs);
}

export function buildFallbackRetrievalQueries(
  question: string,
  maxQueries = 6,
  maxChars = 400
): string[] {
  const cleanQuestion = question.replace(/\s+/g, " ").trim();
  const refs = extractArticleReferences([cleanQuestion], maxQueries);
  if (refs.length <= 1) return uniqueTexts([cleanQuestion], 1, maxChars);

  const groupPattern = new RegExp(ARTICLE_GROUP_SOURCE, "iu");
  const match = groupPattern.exec(cleanQuestion);
  if (!match) return uniqueTexts([cleanQuestion], 1, maxChars);

  const queries = refs.map((ref) => {
    const start = match.index;
    const end = start + match[0].length;
    return `${cleanQuestion.slice(0, start)}artículo ${ref}${cleanQuestion.slice(end)}`;
  });

  return uniqueTexts(queries, maxQueries, maxChars);
}

const cleanRewriteLine = (line: string, maxChars: number) =>
  line
    .trim()
    .replace(/^\s*[-*•]\s+/, "")
    .replace(/^\s*\d+\s*[.)]\s+/, "")
    .replace(
      /^[\s"'`\u00AB\u00BB\u201C\u201D\u2018\u2019]+|[\s"'`\u00AB\u00BB\u201C\u201D\u2018\u2019]+$/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars)
    .trim();

export function parseRewriteQueries(
  raw: string,
  maxQueries = 6,
  maxChars = 400
): string[] {
  if (!raw) return [];

  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let candidates: unknown = null;
  try {
    const parsed = JSON.parse(text) as { queries?: unknown };
    candidates = parsed?.queries;
  } catch {
    candidates = null;
  }

  const lines = Array.isArray(candidates)
    ? candidates.filter((value): value is string => typeof value === "string")
    : text.split(/\r?\n/);

  return uniqueTexts(
    lines.map((line) => cleanRewriteLine(line, maxChars)),
    maxQueries,
    maxChars
  );
}

export type SynthesisIssue =
  | "empty"
  | "unsupported_refusal"
  | "missing_articles";

export function getSynthesisIssue(
  answer: string,
  articleRefs: string[],
  refusalMessage: string,
  hasContext: boolean
): SynthesisIssue | null {
  const cleanAnswer = answer.trim();
  if (!cleanAnswer) return "empty";
  if (cleanAnswer === refusalMessage && hasContext)
    return "unsupported_refusal";
  if (cleanAnswer === refusalMessage || articleRefs.length === 0) return null;

  const normalizedAnswer = stripDiacritics(cleanAnswer);
  const missingArticle = articleRefs.some((ref) => {
    const normalizedRef = normalizeArticleRef(ref);
    const refParts = normalizedRef.match(
      new RegExp(`^([0-9]+(?:\\.[0-9]+)*)(${ARTICLE_SUFFIXES})?$`, "i")
    );
    const refPattern = refParts
      ? `${escapeRegExp(refParts[1])}${refParts[2] ? `\\s*${refParts[2]}` : ""}`
      : escapeRegExp(normalizedRef);
    return !new RegExp(
      `\\bart(?:iculo)?\\.?\\s*${refPattern}(?![0-9a-z.])`,
      "i"
    ).test(normalizedAnswer);
  });

  return missingArticle ? "missing_articles" : null;
}
