import {
  containsUnsafeControlChars,
  sanitizeCode,
  sanitizeDateInput,
  sanitizeEmail,
  sanitizeSingleLineText
} from "@/lib/inputSanitization";

export type RegisterForm = {
  name: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  dateOfBirth: string;
  preferredOpposition: string;
  acceptedTerms: boolean;
};

export const initialRegisterForm: RegisterForm = {
  name: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
  dateOfBirth: "",
  preferredOpposition: "",
  acceptedTerms: false
};

export const sanitizeRegisterForm = (form: RegisterForm): RegisterForm => ({
  ...form,
  name: sanitizeSingleLineText(form.name, 80),
  lastName: sanitizeSingleLineText(form.lastName, 120),
  email: sanitizeEmail(form.email),
  dateOfBirth: sanitizeDateInput(form.dateOfBirth),
  preferredOpposition: sanitizeCode(form.preferredOpposition, 120),
  password: form.password,
  confirmPassword: form.confirmPassword
});

export const getRegisterAccountStepError = (form: RegisterForm) => {
  const sanitizedForm = sanitizeRegisterForm(form);

  if (!sanitizedForm.name || !sanitizedForm.lastName) return "nameRequired";
  if (!/\S+@\S+\.\S+/.test(sanitizedForm.email)) return "invalidEmail";
  if (
    containsUnsafeControlChars(sanitizedForm.password) ||
    containsUnsafeControlChars(sanitizedForm.confirmPassword)
  )
    return "passwordLength";
  if (sanitizedForm.password.length < 8) return "passwordLength";
  if (sanitizedForm.password !== sanitizedForm.confirmPassword)
    return "passwordMatch";

  return null;
};

export const getRegisterProfileStepError = (
  form: RegisterForm,
  maxBirthDate: string
) => {
  const sanitizedForm = sanitizeRegisterForm(form);
  const isBirthDateValid =
    Boolean(sanitizedForm.dateOfBirth) &&
    sanitizedForm.dateOfBirth <= maxBirthDate;

  if (!isBirthDateValid) return "invalidDateOfBirth";
  if (!sanitizedForm.preferredOpposition) return "preferredOppositionRequired";
  if (!sanitizedForm.acceptedTerms) return "termsRequired";

  return null;
};

type RegisterFlowDraft = {
  form: RegisterForm;
  selectedPlanCode: string;
  step: number;
};

const STORAGE_KEY = "register-flow-draft-v1";

const getSessionStorage = () =>
  typeof window === "undefined" ? null : window.sessionStorage;

const normalizeRegisterFormDraft = (value: unknown): RegisterForm => {
  if (!value || typeof value !== "object") return initialRegisterForm;

  const candidate = value as Partial<Record<keyof RegisterForm, unknown>>;

  return {
    name: typeof candidate.name === "string" ? candidate.name : "",
    lastName: typeof candidate.lastName === "string" ? candidate.lastName : "",
    email: typeof candidate.email === "string" ? candidate.email : "",
    password: typeof candidate.password === "string" ? candidate.password : "",
    confirmPassword:
      typeof candidate.confirmPassword === "string"
        ? candidate.confirmPassword
        : "",
    dateOfBirth:
      typeof candidate.dateOfBirth === "string" ? candidate.dateOfBirth : "",
    preferredOpposition:
      typeof candidate.preferredOpposition === "string"
        ? candidate.preferredOpposition
        : "",
    acceptedTerms: candidate.acceptedTerms === true
  };
};

export const readRegisterFlowDraft = (): RegisterFlowDraft | null => {
  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    const rawValue = storage.getItem(STORAGE_KEY);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue) as Partial<RegisterFlowDraft>;

    return {
      form: normalizeRegisterFormDraft(parsed.form),
      selectedPlanCode:
        typeof parsed.selectedPlanCode === "string"
          ? sanitizeCode(parsed.selectedPlanCode, 60)
          : "",
      step: clampRegisterStep(parsed.step, 3)
    };
  } catch {
    return null;
  }
};

export const writeRegisterFlowDraft = (draft: RegisterFlowDraft) => {
  const storage = getSessionStorage();
  if (!storage) return;

  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      form: draft.form,
      selectedPlanCode: sanitizeCode(draft.selectedPlanCode, 60),
      step: clampRegisterStep(draft.step, 3)
    })
  );
};

export const clearRegisterFlowDraft = () => {
  const storage = getSessionStorage();
  if (!storage) return;

  storage.removeItem(STORAGE_KEY);
};

export const clampRegisterStep = (
  value: unknown,
  totalSteps: number
): number => {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (Number.isNaN(parsedValue)) return 1;
  return Math.min(Math.max(parsedValue, 1), totalSteps);
};

export const buildRegisterPlanSelectionPath = (planCode?: string) => {
  const nextParams = new URLSearchParams();
  nextParams.set("step", "3");

  const normalizedPlanCode = sanitizeCode(planCode, 60);
  if (normalizedPlanCode) nextParams.set("plan", normalizedPlanCode);

  return `/registro/planes?${nextParams.toString()}`;
};
