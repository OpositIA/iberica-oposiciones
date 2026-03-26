import { sanitizeSingleLineText } from "@/lib/inputSanitization";

type SupportSubmissionStatus = "sent" | "unconfigured";

export type SupportSubmissionResult = {
  endpoint: string | null;
  status: SupportSubmissionStatus;
};

const resolveEndpoint = (value: string | undefined) => {
  const sanitized = sanitizeSingleLineText(value, 2048);
  if (!sanitized) return null;

  try {
    return new URL(sanitized, window.location.origin).toString();
  } catch {
    return null;
  }
};

const CONTACT_ENDPOINT = resolveEndpoint(
  import.meta.env.VITE_SUPPORT_CONTACT_ENDPOINT
);
const REPORT_ENDPOINT = resolveEndpoint(
  import.meta.env.VITE_SUPPORT_REPORT_ENDPOINT
);

export const supportChannelAvailability = {
  contact: CONTACT_ENDPOINT !== null,
  report: REPORT_ENDPOINT !== null
};

const submitSupportPayload = async (
  endpoint: string | null,
  payload: unknown
): Promise<SupportSubmissionResult> => {
  if (!endpoint) {
    return {
      endpoint: null,
      status: "unconfigured"
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(
      responseText || `support_request_failed_${response.status}`
    );
  }

  return {
    endpoint,
    status: "sent"
  };
};

export const submitSupportContactForm = (payload: unknown) =>
  submitSupportPayload(CONTACT_ENDPOINT, payload);

export const submitSupportQuestionReport = (payload: unknown) =>
  submitSupportPayload(REPORT_ENDPOINT, payload);
