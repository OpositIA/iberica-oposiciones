import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isSessionExpired } from "@/lib/session";
import {
  clearSupabaseAuthStorage,
  resetAuthFailureGuard,
} from "@/lib/secureFetch";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isAuthReady: boolean;
  isAuthenticated: boolean;
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
  return (key.startsWith("sb-") && key.endsWith("-auth-token")) || key.includes("supabase.auth.token");
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const logoutPromiseRef = useRef<Promise<void> | null>(null);

  const setLoggedOutState = useCallback(() => {
    setSession(null);
    setUser(null);
    setIsAuthReady(true);
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
          pathname: window.location.pathname,
        });

        setLoggedOutState();
        clearSupabaseAuthStorage();
        resetAuthFailureGuard();

        if (window.location.pathname !== "/login") {
          navigate("/login", { replace: true, state: { reason } });
        }
      })();

      try {
        await logoutPromiseRef.current;
      } finally {
        logoutPromiseRef.current = null;
      }
    },
    [navigate, setLoggedOutState],
  );

  useEffect(() => {
    let isMounted = true;

    const onValidSession = (nextSession: Session) => {
      if (!isMounted) return;
      setSession(nextSession);
      setUser(nextSession.user ?? null);
      setIsAuthReady(true);
      resetAuthFailureGuard();
    };

    const onInvalidSession = (reason: string) => {
      if (!isMounted) return;
      authLog("Sesion invalida detectada", { reason });
      setLoggedOutState();
      clearSupabaseAuthStorage();
    };

    const initAuth = async () => {
      authLog("Inicializando auth");
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
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

      onValidSession(currentSession);
      authLog("Sesion inicial valida", { userId: currentSession.user?.id });
    };

    void initAuth();

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, nextSession) => {
        authLog("onAuthStateChange", {
          event,
          hasSession: Boolean(nextSession),
          expired: nextSession ? isSessionExpired(nextSession) : true,
        });

        if (event === "SIGNED_OUT") {
          if (!isMounted) return;
          setLoggedOutState();
          clearSupabaseAuthStorage();
          if (window.location.pathname !== "/login") {
            navigate("/login", { replace: true });
          }
          return;
        }

        if (!nextSession || isSessionExpired(nextSession)) {
          onInvalidSession(`invalid_session_event:${event}`);
          return;
        }

        onValidSession(nextSession);
      },
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
  }, [forceLogout, navigate, setLoggedOutState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isAuthReady,
      isAuthenticated: Boolean(user && session && !isSessionExpired(session)),
      forceLogout,
    }),
    [forceLogout, isAuthReady, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider.");
  }
  return context;
};
