import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.3";

export type TopicRow = {
  topic_title: string;
  topic_code: string;
  order_index: number;
};

export type SubtopicRow = {
  parent_topic_code: string;
  subtopic_code: string;
  topic_number: number;
  subtopic_title: string;
  section_title: string | null;
  order_index: number;
};

export type ParsedSyllabus = {
  documentTitle: string | null;
  publishedAt: string | null;
  sourceHash: string;
  rawText: string;
  topics: TopicRow[];
  subtopics: SubtopicRow[];
  startLineIdx: number;
  endLineIdx: number;
  numThemesDetected: number;
};

type XmlEntry = Record<string, unknown>;
type XmlNodeList = XmlEntry[];
export type ParsedLine = {
  text: string;
  className: string | null;
};

export type ParsedBoeDocument = {
  documentTitle: string | null;
  publishedAt: string | null;
  department: string | null;
  sectionCode: string | null;
  subsectionCode: string | null;
  lines: ParsedLine[];
  fullText: string;
};

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  trimValues: false,
  processEntities: true
});

const ANNEX_I_RE = /^ANEXO\s+I(?!\.\d)\b/i;
const ANNEX_II_RE = /^ANEXO\s+II(?!\.\d)\b/i;
const ANNEX_I_BLOCK_ANCHOR_RE = /^ANEXO\s+I(?:\.\d+){2,}\b/i;
const THEME_RE = /^Tema\s*(\d+)\.\s*(.+)$/i;
const BLOCK_RE = /^(Materias?\b|Bloque\b|M[o\u00f3]dulo\b|Parte\b)/i;
const CONTENT_LOCALNAMES = new Set([
  "p",
  "titulo",
  "epigrafe",
  "texto",
  "apartado",
  "subapartado",
  "item",
  "li",
  "th",
  "td",
  "caption",
  "anexo"
]);
const PUBLISHED_AT_LOCALNAMES = new Set(["fecha_publicacion", "fecha"]);
const TITLE_LOCALNAMES = new Set(["titulo"]);
const DEPARTMENT_LOCALNAMES = new Set(["departamento"]);
const SECTION_LOCALNAMES = new Set(["seccion"]);
const SUBSECTION_LOCALNAMES = new Set(["subseccion"]);
const ANNEX_SCAN_WINDOW = 250;
const ANNEX_MIN_THEME_MATCHES = 3;

function normalizeLine(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(text: string, maxLen = 120): string {
  const value = stripAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!value) return "item";
  return value.slice(0, maxLen).replace(/-+$/g, "") || "item";
}

function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let idx = 2;
  while (used.has(`${base}-${idx}`)) idx += 1;
  const value = `${base}-${idx}`;
  used.add(value);
  return value;
}

function localname(tag: string): string {
  return tag.split(":").pop()?.toLowerCase() ?? "";
}

function parseXml(xmlText: string): XmlNodeList {
  const parsed = parser.parse(xmlText);
  if (!Array.isArray(parsed)) throw new Error("Invalid BOE XML document");

  return parsed as XmlNodeList;
}

function getEntryKey(entry: XmlEntry): string | null {
  for (const key of Object.keys(entry)) if (key !== ":@") return key;

  return null;
}

function getEntryChildren(entry: XmlEntry): unknown {
  const key = getEntryKey(entry);
  return key ? entry[key] : null;
}

function getEntryAttributes(entry: XmlEntry): Record<string, unknown> | null {
  const value = entry[":@"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getEntryClassName(entry: XmlEntry): string | null {
  const attrs = getEntryAttributes(entry);
  if (!attrs) return null;

  const classCandidates = [attrs["@_class"], attrs["@class"], attrs["class"]];

  for (const candidate of classCandidates) {
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }

  return null;
}

function hasContentDescendants(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some((item) => hasContentDescendants(item));

  if (!value || typeof value !== "object") return false;

  const entry = value as XmlEntry;
  const key = getEntryKey(entry);
  if (!key) return false;
  if (CONTENT_LOCALNAMES.has(localname(key))) return true;
  return hasContentDescendants(getEntryChildren(entry));
}

function collectText(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectText(item, out);
    return;
  }

  if (!value || typeof value !== "object") return;

  const entry = value as XmlEntry;
  for (const [key, child] of Object.entries(entry)) {
    if (key === "#text") {
      if (typeof child === "string") out.push(child);
      continue;
    }
    if (key === ":@") continue;
    collectText(child, out);
  }
}

function textContent(value: unknown): string {
  const parts: string[] = [];
  collectText(value, parts);
  return normalizeLine(parts.join(" "));
}

function xmlToLines(xmlText: string): ParsedLine[] {
  const doc = parseXml(xmlText);
  const chunks: ParsedLine[] = [];

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    if (!value || typeof value !== "object") return;

    const entry = value as XmlEntry;
    const key = getEntryKey(entry);
    if (!key) return;

    const name = localname(key);
    const children = getEntryChildren(entry);

    if (CONTENT_LOCALNAMES.has(name)) {
      if (hasContentDescendants(children)) {
        visit(children);
        return;
      }

      const text = textContent(children);
      if (text) {
        chunks.push({
          text,
          className: getEntryClassName(entry)
        });
      }
      return;
    }

    visit(children);
  };

  visit(doc);

  if (chunks.length > 0 && chunks.some((line) => ANNEX_I_RE.test(line.text)))
    return chunks;

  const fallback = textContent(doc)
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean)
    .map((text) => ({ text, className: null }));

  return fallback.length > 0 ? fallback : chunks;
}

function findFirstTextByLocalName(
  value: unknown,
  names: Set<string>
): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstTextByLocalName(item, names);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  const entry = value as XmlEntry;
  const key = getEntryKey(entry);
  if (!key) return null;

  if (names.has(localname(key))) {
    const text = textContent(getEntryChildren(entry));
    if (text) return text;
  }

  return findFirstTextByLocalName(getEntryChildren(entry), names);
}

export function extractPublishedAt(doc: XmlNodeList): string | null {
  const raw = findFirstTextByLocalName(doc, PUBLISHED_AT_LOCALNAMES);
  if (!raw) return null;

  if (/^\d{8}$/.test(raw))
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  return null;
}

function extractDocumentTitle(doc: XmlNodeList): string | null {
  return findFirstTextByLocalName(doc, TITLE_LOCALNAMES);
}

function extractDepartment(doc: XmlNodeList): string | null {
  return findFirstTextByLocalName(doc, DEPARTMENT_LOCALNAMES);
}

function extractSectionCode(doc: XmlNodeList): string | null {
  const value = findFirstTextByLocalName(doc, SECTION_LOCALNAMES);
  return value ? normalizeLine(value) : null;
}

function extractSubsectionCode(doc: XmlNodeList): string | null {
  const value = findFirstTextByLocalName(doc, SUBSECTION_LOCALNAMES);
  return value ? normalizeLine(value) : null;
}

function countThemeMatches(lines: ParsedLine[]): number {
  return lines.filter((line) => THEME_RE.test(line.text)).length;
}

function findAnnexBounds(lines: ParsedLine[]): {
  startIdx: number;
  endIdx: number;
  themeCount: number;
} {
  const annexCandidates = lines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => ANNEX_I_RE.test(line.text))
    .map(({ idx }) => idx);

  if (annexCandidates.length === 0)
    throw new Error("No se encontro ANEXO I en el XML del BOE.");

  const candidateData: Array<{
    startIdx: number;
    endIdx: number;
    themeCount: number;
  }> = [];

  for (const startIdx of annexCandidates) {
    const endIdx = lines.findIndex(
      (line, idx) => idx > startIdx && ANNEX_II_RE.test(line.text)
    );
    // If no ANEXO II found, use end of document
    const effectiveEndIdx = endIdx === -1 ? lines.length : endIdx;

    const themeCount = countThemeMatches(
      lines.slice(startIdx + 1, startIdx + 1 + ANNEX_SCAN_WINDOW)
    );
    candidateData.push({ startIdx, endIdx: effectiveEndIdx, themeCount });
  }

  // Prefer candidates with enough theme matches
  const valid = candidateData.filter(
    (row) => row.themeCount >= ANNEX_MIN_THEME_MATCHES
  );
  if (valid.length > 0) {
    return valid.reduce((best, current) => {
      if (current.themeCount > best.themeCount) return current;
      if (
        current.themeCount === best.themeCount &&
        current.startIdx < best.startIdx
      )
        return current;
      return best;
    });
  }

  // Prefer candidates bounded by ANEXO II over unbounded ones
  const bounded = candidateData.filter(
    (row) => row.endIdx < lines.length
  );
  if (bounded.length > 0)
    return bounded[bounded.length - 1];

  // Last resort: use the last candidate (extends to end of document)
  return candidateData[candidateData.length - 1];
}

function shouldSkipHeading(line: ParsedLine): boolean {
  const lowered = line.text.toLowerCase();
  if (lowered.startsWith("programa para el ingreso")) return true;
  if (ANNEX_I_RE.test(line.text) || ANNEX_II_RE.test(line.text)) return true;
  return false;
}

function looksLikeThemeContinuation(
  line: ParsedLine,
  hasLastTheme: boolean
): boolean {
  if (!hasLastTheme) return false;
  if (line.className && !["parrafo", "parrafo_2"].includes(line.className))
    return false;

  const stripped = line.text.replace(/^[\s\-]+/, "");
  if (!stripped) return false;

  const first = stripped[0];
  if (first.toLowerCase() === first && first.toUpperCase() !== first)
    return true;
  if ("([{".includes(first)) return true;
  if (stripped.length >= 80) return true;
  return false;
}

function parseTopicsAndSubtopics(lines: ParsedLine[]): {
  topics: TopicRow[];
  subtopics: SubtopicRow[];
} {
  const normalizedLines = lines
    .map((line) => ({
      text: normalizeLine(line.text),
      className: line.className
    }))
    .filter((line) => line.text && !shouldSkipHeading(line));

  const topics: TopicRow[] = [];
  const subtopics: SubtopicRow[] = [];

  const usedTopicCodes = new Set<string>();
  const usedSubtopicCodes = new Set<string>();

  let currentTopicCode: string | null = null;
  let currentBlockTitle: string | null = null;
  let lastTheme: SubtopicRow | null = null;
  let isAwaitingAnchoredBlockTitle = false;
  const subtopicOrderByTopic = new Map<string, number>();

  const createTopic = (rawTitle: string): string => {
    const blockNumber = topics.length + 1;
    const displayTitle = rawTitle && rawTitle !== "General"
      ? rawTitle
      : `Bloque ${blockNumber}`;
    const code = uniqueSlug(
      slugify(displayTitle, 80) || `bloque-${blockNumber}`,
      usedTopicCodes
    );
    topics.push({
      topic_title: displayTitle,
      topic_code: code,
      order_index: topics.length + 1
    });
    subtopicOrderByTopic.set(code, 0);
    currentBlockTitle = rawTitle;
    return code;
  };

  for (const line of normalizedLines) {
    // Handle ANEXO sub-section lines (class="anexo", "anexo_num", "anexo_tit")
    if (
      line.className === "anexo" ||
      line.className === "anexo_num" ||
      line.className === "anexo_tit"
    ) {
      if (/^ANEXO\s+I(?:\.\d+)+/i.test(line.text)) {
        isAwaitingAnchoredBlockTitle = true;
      }
      lastTheme = null;
      continue;
    }

    // Centered italic text = block/section title (e.g. "Derecho Civil")
    if (line.className === "centro_cursiva") {
      currentTopicCode = createTopic(line.text);
      isAwaitingAnchoredBlockTitle = false;
      lastTheme = null;
      continue;
    }

    if (ANNEX_I_BLOCK_ANCHOR_RE.test(line.text)) {
      isAwaitingAnchoredBlockTitle = true;
      lastTheme = null;
      continue;
    }

    // Centered round text = block title (e.g. "Organización del Estado...")
    if (line.className === "centro_redonda") {
      currentTopicCode = createTopic(line.text);
      isAwaitingAnchoredBlockTitle = false;
      lastTheme = null;
      continue;
    }

    if (isAwaitingAnchoredBlockTitle && !THEME_RE.test(line.text)) {
      currentTopicCode = createTopic(line.text);
      isAwaitingAnchoredBlockTitle = false;
      lastTheme = null;
      continue;
    }

    const themeMatch = line.text.match(THEME_RE);
    if (themeMatch) {
      isAwaitingAnchoredBlockTitle = false;
      if (!currentTopicCode) currentTopicCode = createTopic("General");

      const topicNumber = Number.parseInt(themeMatch[1], 10);
      const themeName = themeMatch[2].trim().replace(/\.+$/, "");
      const subtopicTitle = `Tema ${topicNumber}. ${themeName}`;
      const nextOrder = (subtopicOrderByTopic.get(currentTopicCode) ?? 0) + 1;
      subtopicOrderByTopic.set(currentTopicCode, nextOrder);

      const rawCode = `tema-${topicNumber}-${slugify(themeName, 80)}`;
      const subtopicCode = uniqueSlug(slugify(rawCode, 140), usedSubtopicCodes);

      lastTheme = {
        parent_topic_code: currentTopicCode,
        subtopic_code: subtopicCode,
        topic_number: topicNumber,
        subtopic_title: subtopicTitle,
        section_title: currentBlockTitle,
        order_index: nextOrder
      };
      subtopics.push(lastTheme);
      continue;
    }

    if (BLOCK_RE.test(line.text)) {
      currentTopicCode = createTopic(line.text);
      isAwaitingAnchoredBlockTitle = false;
      lastTheme = null;
      continue;
    }

    if (looksLikeThemeContinuation(line, Boolean(lastTheme)) && lastTheme) {
      lastTheme.subtopic_title = normalizeLine(
        `${lastTheme.subtopic_title} ${line.text}`
      );
      continue;
    }
  }

  if (topics.length === 0 && subtopics.length > 0) {
    const topicCode = createTopic("General");
    for (const [idx, subtopic] of subtopics.entries()) {
      subtopic.parent_topic_code = topicCode;
      subtopic.order_index = idx + 1;
    }
  }

  return { topics, subtopics };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractPublishedAtFromRawXml(xmlText: string): string | null {
  const match = xmlText.match(/<fecha_publicacion>(\d{8})<\/fecha_publicacion>/);
  if (match) return `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`;
  return null;
}

export function parseBoeDocument(xmlText: string): ParsedBoeDocument {
  const doc = parseXml(xmlText);
  const lines = xmlToLines(xmlText);

  return {
    documentTitle: extractDocumentTitle(doc),
    publishedAt: extractPublishedAt(doc) ?? extractPublishedAtFromRawXml(xmlText),
    department: extractDepartment(doc),
    sectionCode: extractSectionCode(doc),
    subsectionCode: extractSubsectionCode(doc),
    lines,
    fullText: lines.map((line) => line.text).join("\n")
  };
}

export async function fetchBoeXml(
  boeId: string,
  directXmlUrl?: string | null
): Promise<string> {
  const xmlUrl =
    directXmlUrl?.trim() ||
    `https://www.boe.es/diario_boe/xml.php?id=${encodeURIComponent(boeId)}`;
  const response = await fetch(xmlUrl, {
    headers: {
      Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok)
    throw new Error(`BOE XML fetch failed (${response.status}) for ${boeId}`);

  return await response.text();
}

export async function parseBoeSyllabusXml(
  xmlText: string
): Promise<ParsedSyllabus> {
  const document = parseBoeDocument(xmlText);
  const doc = parseXml(xmlText);
  const lines = document.lines;
  const { startIdx, endIdx, themeCount } = findAnnexBounds(lines);
  const annexLines = lines.slice(startIdx, endIdx);
  const rawText = annexLines.map((line) => line.text).join("\n");
  const { topics, subtopics } = parseTopicsAndSubtopics(annexLines);
  const sourceHash = await sha256Hex(rawText);

  return {
    documentTitle: document.documentTitle ?? extractDocumentTitle(doc),
    publishedAt: document.publishedAt ?? extractPublishedAt(doc),
    sourceHash,
    rawText,
    topics,
    subtopics,
    startLineIdx: startIdx,
    endLineIdx: endIdx,
    numThemesDetected: themeCount
  };
}
