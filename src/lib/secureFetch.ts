const AUTH_FAILURE_STATUS = new Set([401, 403]);

type SessionChecker = () => boolean | Promise<boolean>;
type AuthFailureHandler = (reason: string) => void | Promise<void>;

type SecureFetchOptions = {
  isProtected?: boolean;
};

let sessionChecker: SessionChecker | null = null;
let authFailureHandler: AuthFailureHandler | null = null;
let hasTriggeredAuthFailure = false;

const pendingControllers = new Set<AbortController>();

const isDev = import.meta.env.DEV;

const debugLog = (...args: unknown[]) => {
  if (!isDev) return;
  console.info("[secure-fetch]", ...args);
};

export class AuthSessionError extends Error {
  constructor(message = "Sesion no valida o expirada.") {
    super(message);
    this.name = "AuthSessionError";
  }
}

export const registerSessionChecker = (checker: SessionChecker | null) => {
  sessionChecker = checker;
};

export const registerAuthFailureHandler = (
  handler: AuthFailureHandler | null
) => {
  authFailureHandler = handler;
};

export const resetAuthFailureGuard = () => {
  hasTriggeredAuthFailure = false;
};

export const abortAllProtectedRequests = (reason = "auth_logout") => {
  debugLog("Abortando requests pendientes", {
    reason,
    count: pendingControllers.size
  });
  pendingControllers.forEach((controller) => controller.abort(reason));
  pendingControllers.clear();
};

const triggerAuthFailureOnce = async (reason: string) => {
  if (hasTriggeredAuthFailure) {
    debugLog("Auth failure ya en curso, evitando duplicado", { reason });
    return;
  }

  hasTriggeredAuthFailure = true;
  debugLog("Auth failure detectado", { reason });
  abortAllProtectedRequests(reason);

  if (authFailureHandler) await authFailureHandler(reason);
};

const isAbortError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || /aborted/i.test(error.message);
};

const combineSignals = (
  externalSignal: AbortSignal | null | undefined,
  localController: AbortController
) => {
  if (!externalSignal) return localController.signal;

  if (externalSignal.aborted) {
    localController.abort();
    return localController.signal;
  }

  externalSignal.addEventListener("abort", () => localController.abort(), {
    once: true
  });
  return localController.signal;
};

export const secureApiFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  options: SecureFetchOptions = {}
) => {
  const isProtected = options.isProtected ?? true;

  if (isProtected && sessionChecker) {
    const hasValidSession = await sessionChecker();
    if (!hasValidSession) {
      await triggerAuthFailureOnce("blocked_before_request_invalid_session");
      throw new AuthSessionError("Sesion expirada. Vuelve a iniciar sesion.");
    }
  }

  const controller = new AbortController();
  pendingControllers.add(controller);
  const signal = combineSignals(init?.signal, controller);

  try {
    const response = await fetch(input, { ...init, signal });

    if (isProtected && AUTH_FAILURE_STATUS.has(response.status)) {
      await triggerAuthFailureOnce(`http_${response.status}`);
      throw new AuthSessionError(
        `Sesion invalida detectada por respuesta HTTP ${response.status}.`
      );
    }

    return response;
  } catch (error) {
    if (isAbortError(error)) {
      debugLog("Request abortada", {
        input: typeof input === "string" ? input : String(input)
      });
      throw error;
    }

    throw error;
  } finally {
    pendingControllers.delete(controller);
  }
};

export const clearSupabaseAuthStorage = () => {
  const shouldClearKey = (key: string) =>
    (key.startsWith("sb-") && key.endsWith("-auth-token")) ||
    key.includes("supabase.auth.token");

  try {
    const localKeys = Object.keys(localStorage);
    localKeys.forEach((key) => {
      if (shouldClearKey(key)) localStorage.removeItem(key);
    });
  } catch (error) {
    debugLog("No se pudo limpiar localStorage", error);
  }

  try {
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach((key) => {
      if (shouldClearKey(key)) sessionStorage.removeItem(key);
    });
  } catch (error) {
    debugLog("No se pudo limpiar sessionStorage", error);
  }
};
