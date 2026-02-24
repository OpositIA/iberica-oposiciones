import i18n from "@/i18n/config";
import { AppLocale, DEFAULT_LOCALE, normalizeLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import {
  clearSupabaseAuthStorage,
  resetAuthFailureGuard
} from "@/lib/secureFetch";
import { isSessionExpired } from "@/lib/session";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useNavigate } from "react-router-dom";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  locale: AppLocale;
  isAuthReady: boolean;
  isAuthenticated: boolean;
  setLocale: (locale: AppLocale) => Promise<boolean>;
  forceLogout: (reason?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const isDev = import.meta.env.DEV;

const authLog = (...args: unknown[]) => {
  if (!isDev) return;
  console.info("[auth]", ...args);
};

const isSupabaseAuthStorageKey = (key: string | null) => {
  if (!key) return false;
  return (
    (key.startsWith("sb-") && key.endsWith("-auth-token")) ||
    key.includes("supabase.auth.token")
  );
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const logoutPromiseRef = useRef<Promise<void> | null>(null);

  const applyLocale = useCallback(async (nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    if (i18n.resolvedLanguage !== nextLocale)
      await i18n.changeLanguage(nextLocale);
  }, []);

  const loadUserLocale = useCallback(
    async (userId: string): Promise<AppLocale> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("locale")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        authLog("No se pudo cargar locale desde profiles", {
          userId,
          error: error.message
        });
        return DEFAULT_LOCALE;
      }

      const nextLocale = normalizeLocale(data?.locale ?? DEFAULT_LOCALE);

      if (!data) {
        const { error: insertError } = await supabase
          .from("profiles")
          .upsert(
            { user_id: userId, locale: nextLocale },
            { onConflict: "user_id" }
          );

        if (insertError) {
          authLog("No se pudo crear profile locale por defecto", {
            userId,
            error: insertError.message
          });
        }
      }

      return nextLocale;
    },
    []
  );

  const setLoggedOutState = useCallback(() => {
    setSession(null);
    setUser(null);
    setIsAuthReady(true);
    setLocaleState(DEFAULT_LOCALE);
    void i18n.changeLanguage(DEFAULT_LOCALE);
  }, []);

  const forceLogout = useCallback(
    async (reason = "unknown_auth_failure") => {
      if (logoutPromiseRef.current) {
        authLog("Logout ya en curso, reutilizando promesa", { reason });
        await logoutPromiseRef.current;
        return;
      }

      logoutPromiseRef.current = (async () => {
        authLog("Forzando logout", {
          reason,
          pathname: window.location.pathname
        });

        setLoggedOutState();
        clearSupabaseAuthStorage();
        resetAuthFailureGuard();

        if (window.location.pathname !== "/login")
          navigate("/login", { replace: true, state: { reason } });
      })();

      try {
        await logoutPromiseRef.current;
      } finally {
        logoutPromiseRef.current = null;
      }
    },
    [navigate, setLoggedOutState]
  );

  const setLocale = useCallback(
    async (nextLocale: AppLocale) => {
      if (!user) {
        await applyLocale(DEFAULT_LOCALE);
        return false;
      }

      const previousLocale = locale;
      await applyLocale(nextLocale);

      const { error } = await supabase
        .from("profiles")
        .upsert(
          { user_id: user.id, locale: nextLocale },
          { onConflict: "user_id" }
        );

      if (error) {
        await applyLocale(previousLocale);
        return false;
      }

      return true;
    },
    [applyLocale, locale, user]
  );

  useEffect(() => {
    let isMounted = true;

    const onValidSession = async (nextSession: Session) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession.user ?? null);
      resetAuthFailureGuard();

      const loadedLocale = await loadUserLocale(nextSession.user.id);
      if (!isMounted) return;

      await applyLocale(loadedLocale);
      if (!isMounted) return;

      setIsAuthReady(true);
    };

    const onInvalidSession = (reason: string) => {
      if (!isMounted) return;
      authLog("Sesion invalida detectada", { reason });
      setLoggedOutState();
      clearSupabaseAuthStorage();
    };

    const initAuth = async () => {
      authLog("Inicializando auth");
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const currentSession = sessionData.session;

      if (sessionError) {
        onInvalidSession(`init_get_session_error:${sessionError.message}`);
        return;
      }

      if (!currentSession) {
        authLog("Sin sesion inicial");
        setLoggedOutState();
        return;
      }

      if (isSessionExpired(currentSession)) {
        onInvalidSession("init_session_expired");
        return;
      }

      await onValidSession(currentSession);
      authLog("Sesion inicial valida", { userId: currentSession.user?.id });
    };

    void initAuth();

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, nextSession) => {
        authLog("onAuthStateChange", {
          event,
          hasSession: Boolean(nextSession),
          expired: nextSession ? isSessionExpired(nextSession) : true
        });

        if (event === "SIGNED_OUT") {
          if (!isMounted) return;
          setLoggedOutState();
          clearSupabaseAuthStorage();
          if (window.location.pathname !== "/login")
            navigate("/login", { replace: true });

          return;
        }

        if (!nextSession || isSessionExpired(nextSession)) {
          onInvalidSession(`invalid_session_event:${event}`);
          return;
        }

        await onValidSession(nextSession);
      }
    );

    const onStorage = (storageEvent: StorageEvent) => {
      if (!isSupabaseAuthStorageKey(storageEvent.key)) return;
      if (storageEvent.newValue !== null) return;

      authLog("Detectado cambio de storage en otra pestana: token borrado");
      void forceLogout("cross_tab_storage_token_removed");
    };

    window.addEventListener("storage", onStorage);

    return () => {
      isMounted = false;
      authSubscription.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [applyLocale, forceLogout, loadUserLocale, navigate, setLoggedOutState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      locale,
      isAuthReady,
      isAuthenticated: Boolean(user && session && !isSessionExpired(session)),
      setLocale,
      forceLogout
    }),
    [forceLogout, isAuthReady, locale, session, setLocale, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider.");

  return context;
};
