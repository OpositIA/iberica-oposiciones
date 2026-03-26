import {
  sanitizeCode,
  sanitizeEmail,
  sanitizeMultilineText,
  sanitizeSingleLineText
} from "@/lib/inputSanitization";

const CONTACT_CATEGORY_VALUES = [
  "account",
  "billing",
  "tests",
  "ai",
  "technical"
] as const;
const CONTACT_ISSUE_TYPE_VALUES = [
  "question",
  "incident",
  "access",
  "payment",
  "content"
] as const;
const REPORT_PROBLEM_TYPE_VALUES = [
  "incorrect-question",
  "doubtful-explanation",
  "problematic-ai"
] as const;
const REPORT_CONTEXT_TYPE_VALUES = [
  "test-session",
  "question-bank",
  "ai-chat",
  "billing-flow",
  "account-area"
] as const;

export type SupportContactCategory = (typeof CONTACT_CATEGORY_VALUES)[number];
export type SupportContactIssueType =
  (typeof CONTACT_ISSUE_TYPE_VALUES)[number];
export type SupportReportProblemType =
  (typeof REPORT_PROBLEM_TYPE_VALUES)[number];
export type SupportReportContextType =
  (typeof REPORT_CONTEXT_TYPE_VALUES)[number];

export type SupportContactFormValues = {
  name: string;
  email: string;
  category: SupportContactCategory | "";
  issueType: SupportContactIssueType | "";
  context: string;
  message: string;
};

export type SupportQuestionReportFormValues = {
  questionReference: string;
  problemType: SupportReportProblemType | "";
  contextType: SupportReportContextType | "";
  description: string;
  additionalContext: string;
};

export const emptySupportContactForm: SupportContactFormValues = {
  name: "",
  email: "",
  category: "",
  issueType: "",
  context: "",
  message: ""
};

export const emptySupportQuestionReportForm: SupportQuestionReportFormValues = {
  questionReference: "",
  problemType: "",
  contextType: "",
  description: "",
  additionalContext: ""
};

const normalizeEnumValue = <T extends readonly string[]>(
  value: unknown,
  allowedValues: T
): T[number] | "" => {
  const sanitized = sanitizeSingleLineText(value, 60);
  if (!sanitized) return "";

  return allowedValues.includes(sanitized as T[number])
    ? (sanitized as T[number])
    : "";
};

export const sanitizeSupportContactForm = (
  values: SupportContactFormValues
): SupportContactFormValues => ({
  name: sanitizeSingleLineText(values.name, 80),
  email: sanitizeEmail(values.email, 254),
  category: normalizeEnumValue(values.category, CONTACT_CATEGORY_VALUES),
  issueType: normalizeEnumValue(values.issueType, CONTACT_ISSUE_TYPE_VALUES),
  context: sanitizeSingleLineText(values.context, 160),
  message: sanitizeMultilineText(values.message, 1600)
});

export const sanitizeSupportQuestionReportForm = (
  values: SupportQuestionReportFormValues
): SupportQuestionReportFormValues => ({
  questionReference: sanitizeCode(values.questionReference, 80),
  problemType: normalizeEnumValue(
    values.problemType,
    REPORT_PROBLEM_TYPE_VALUES
  ),
  contextType: normalizeEnumValue(
    values.contextType,
    REPORT_CONTEXT_TYPE_VALUES
  ),
  description: sanitizeMultilineText(values.description, 1400),
  additionalContext: sanitizeMultilineText(values.additionalContext, 1600)
});

export const isValidEmailAddress = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
