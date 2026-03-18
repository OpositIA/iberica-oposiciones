type SanitizeTextOptions = {
  maxLength?: number;
  trim?: boolean;
  collapseWhitespace?: boolean;
  preserveNewlines?: boolean;
};

/* eslint-disable no-control-regex */
const CONTROL_CHARS_WITH_NEWLINES_RE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]",
  "g"
);
const CONTROL_CHARS_SINGLE_LINE_RE = new RegExp(
  "[\\u0000-\\u001F\\u007F]",
  "g"
);
/* eslint-enable no-control-regex */

const normalizeUnicode = (value: string) => {
  try {
    return value.normalize("NFC");
  } catch {
    return value;
  }
};

export const sanitizeText = (
  value: unknown,
  {
    maxLength = Number.POSITIVE_INFINITY,
    trim = true,
    collapseWhitespace = true,
    preserveNewlines = false
  }: SanitizeTextOptions = {}
): string => {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  )
    return "";

  let sanitized = normalizeUnicode(String(value));
  sanitized = preserveNewlines
    ? sanitized
        .replace(/\r\n?/g, "\n")
        .replace(CONTROL_CHARS_WITH_NEWLINES_RE, "")
    : sanitized.replace(CONTROL_CHARS_SINGLE_LINE_RE, "");

  if (collapseWhitespace) {
    sanitized = preserveNewlines
      ? sanitized
          .replace(/[^\S\n]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/ *\n */g, "\n")
      : sanitized.replace(/\s+/g, " ");
  }

  if (trim) sanitized = sanitized.trim();
  if (Number.isFinite(maxLength) && maxLength >= 0)
    sanitized = sanitized.slice(0, maxLength);

  return sanitized;
};

export const sanitizeSingleLineText = (value: unknown, maxLength = 200) =>
  sanitizeText(value, {
    maxLength,
    collapseWhitespace: true,
    preserveNewlines: false
  });

export const sanitizeMultilineText = (value: unknown, maxLength = 4000) =>
  sanitizeText(value, {
    maxLength,
    collapseWhitespace: true,
    preserveNewlines: true
  });

export const sanitizeEmail = (value: unknown, maxLength = 254) =>
  sanitizeSingleLineText(value, maxLength).toLowerCase();

export const sanitizeCode = (value: unknown, maxLength = 120) =>
  sanitizeSingleLineText(value, maxLength).replace(/[^A-Za-z0-9._:-]/g, "");

export const sanitizeUrl = (
  value: unknown,
  allowedProtocols = new Set(["http:", "https:"])
) => {
  const candidate = sanitizeSingleLineText(value, 2048);
  if (!candidate) return "";

  try {
    const parsed = new URL(candidate);
    if (!allowedProtocols.has(parsed.protocol)) return "";
    if (parsed.username || parsed.password) return "";
    return parsed.toString();
  } catch {
    return "";
  }
};

export const sanitizeInteger = (
  value: unknown,
  {
    min,
    max,
    fallback = null
  }: {
    min: number;
    max: number;
    fallback?: number | null;
  }
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

export const containsUnsafeControlChars = (value: string) =>
  CONTROL_CHARS_SINGLE_LINE_RE.test(value);
