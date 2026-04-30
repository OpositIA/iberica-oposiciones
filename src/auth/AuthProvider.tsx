import i18n from "@/i18n/config";
import { AppLocale, DEFAULT_LOCALE, normalizeLocale } from "@/i18n/locales";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeSingleLineText, sanitizeUrl } from "@/lib/inputSanitization";
import {
  clearGoogleRegisterContext,
  clearGoogleRegisterResolutionPending,
  clearGoogleSignupSessionActive,
  consumeGoogleRegisterSilentExit
} from "@/lib/registerFlow";
import {
  clearSupabaseAuthStorage,
  resetAuthFailureGuard
} from "@/lib/secureFetch";
import { isSessionExpired } from "@/lib/session";
import { runSingleFlight } from "@/lib/singleFlight";
import { applyLightThemeOnFirstLogin } from "@/lib/theme";
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

type UserProfileSnapshot = {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: UserProfileSnapshot | null;
  locale: AppLocale;
  isAuthReady: boolean;
  isAuthenticated: boolean;
  applyLocale: (locale: AppLocale) => Promise<void>;
  setLocale: (locale: AppLocale) => Promise<boolean>;
  refreshProfile: () => Promise<void>;
  forceLogout: (reason?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const isDev = import.meta.env.DEV;
const SIDEBAR_LOGIN_OPEN_STORAGE_KEY =
  "iberica-oposiciones:sidebar-open-on-login";

const authLog = (..._args: unknown[]) => {
  if (!isDev) return;
};

const markSidebarShouldOpenOnLogin = (userId: string) => {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(SIDEBAR_LOGIN_OPEN_STORAGE_KEY, userId);
};

const buildProfileSnapshot = (
  data:
    | {
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        avatar_url?: string | null;
      }
    | null
    | undefined,
  authUser: User
): UserProfileSnapshot => {
  const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const metadataFirstName =
    typeof metadata.first_name === "string" ? metadata.first_name : "";
  const metadataLastName =
    typeof metadata.last_name === "string" ? metadata.last_name : "";
  const metadataAvatarUrl =
    typeof metadata.avatar_url === "string" ? metadata.avatar_url : "";

  return {
    firstName: sanitizeSingleLineText(
      data?.first_name ?? metadataFirstName,
      80
    ),
    lastName: sanitizeSingleLineText(data?.last_name ?? metadataLastName, 120),
    email: sanitizeSingleLineText(data?.email ?? authUser.email, 254),
    avatarUrl: sanitizeUrl(data?.avatar_url ?? metadataAvatarUrl)
  };
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
  const [profile, setProfile] = useState<UserProfileSnapshot | null>(null);
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const logoutPromiseRef = useRef<Promise<void> | null>(null);
  const hydratedSessionFingerprintRef = useRef<string | null>(null);

  const applyLocale = useCallback(async (nextLocale: AppLocale) => {
    setLocaleState(nextLocale);
    if (i18n.resolvedLanguage !== nextLocale)
      await i18n.changeLanguage(nextLocale);
  }, []);

  const loadUserLocale = useCallback(
    async (userId: string): Promise<AppLocale> =>
      runSingleFlight(
        `auth:load-locale:${userId}`,
        async () => {
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

          return normalizeLocale(data?.locale ?? DEFAULT_LOCALE);
        },
        { reuseResultForMs: 1500 }
      ),
    []
  );

  const loadUserProfile = useCallback(
    async (authUser: User) =>
      runSingleFlight(`auth:load-profile:${authUser.id}`, async () => {
        const { data, error } = await supabase
          .from("profiles")
          .select("first_name, last_name, email, avatar_url")
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (error) {
          authLog("No se pudo cargar profile snapshot", {
            userId: authUser.id,
            error: error.message
          });
        }

        return buildProfileSnapshot(data, authUser);
      }),
    []
  );

  const setLoggedOutState = useCallback(() => {
    hydratedSessionFingerprintRef.current = null;
    setSession(null);
    setUser(null);
    setProfile(null);
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

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    const nextProfile = await loadUserProfile(user);
    setProfile(nextProfile);
  }, [loadUserProfile, user]);

  useEffect(() => {
    let isMounted = true;

    const onValidSession = async (
      nextSession: Session,
      source: AuthChangeEvent | "init"
    ) => {
      const fingerprint = `${nextSession.user.id}:${nextSession.expires_at ?? "unknown"}`;
      if (
        hydratedSessionFingerprintRef.current === fingerprint &&
        source !== "USER_UPDATED"
      ) {
        if (!isMounted) return;
        setSession(nextSession);
        setUser(nextSession.user ?? null);
        applyLightThemeOnFirstLogin({
          userId: nextSession.user.id,
          createdAt: nextSession.user.created_at,
          lastSignInAt: nextSession.user.last_sign_in_at
        });
        resetAuthFailureGuard();
        setIsAuthReady(true);
        return;
      }

      await runSingleFlight(
        `auth:hydrate-session:${fingerprint}`,
        async () => {
          if (!isMounted) return;
          setIsAuthReady(false);
          setSession(nextSession);
          setUser(nextSession.user ?? null);
          applyLightThemeOnFirstLogin({
            userId: nextSession.user.id,
            createdAt: nextSession.user.created_at,
            lastSignInAt: nextSession.user.last_sign_in_at
          });
          setProfile(buildProfileSnapshot(null, nextSession.user));
          resetAuthFailureGuard();
          hydratedSessionFingerprintRef.current = fingerprint;

          let loadedLocale = DEFAULT_LOCALE;
          let loadedProfile = buildProfileSnapshot(null, nextSession.user);
          try {
            const [resolvedLocale, resolvedProfile] = await Promise.all([
              loadUserLocale(nextSession.user.id),
              loadUserProfile(nextSession.user)
            ]);
            loadedLocale = resolvedLocale;
            loadedProfile = resolvedProfile;
          } catch (error) {
            authLog("No se pudo hidratar locale/profile tras sesion valida", {
              userId: nextSession.user.id,
              error
            });
          }

          if (!isMounted) return;

          setProfile(loadedProfile);
          try {
            await applyLocale(loadedLocale);
          } catch (error) {
            authLog("No se pudo aplicar locale tras sesion valida", {
              userId: nextSession.user.id,
              locale: loadedLocale,
              error
            });
          }
          if (!isMounted) return;
          setIsAuthReady(true);
        },
        { reuseResultForMs: 1500 }
      );
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

      await onValidSession(currentSession, "init");
      authLog("Sesion inicial valida", { userId: currentSession.user?.id });
    };

    void initAuth();

    const { data: authSubscription } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, nextSession) => {
        authLog("onAuthStateChange", {
          event,
          hasSession: Boolean(nextSession),
          expired: nextSession ? isSessionExpired(nextSession) : true
        });

        if (event === "SIGNED_OUT") {
          if (!isMounted) return;
          const isSilentGoogleRegisterExit = consumeGoogleRegisterSilentExit();
          setLoggedOutState();
          clearGoogleSignupSessionActive();
          clearGoogleRegisterResolutionPending();
          clearGoogleRegisterContext();
          clearSupabaseAuthStorage();
          window.sessionStorage.removeItem(SIDEBAR_LOGIN_OPEN_STORAGE_KEY);
          const pendingGoogleRegisterError =
            typeof window !== "undefined" &&
            window.sessionStorage.getItem("register-google-error-v1") ===
              "emailAlreadyExists";
          if (pendingGoogleRegisterError) return;
          if (isSilentGoogleRegisterExit) return;
          if (window.location.pathname === "/auth/callback") return;
          if (window.location.pathname !== "/login")
            navigate("/login", { replace: true });

          return;
        }

        if (!nextSession || isSessionExpired(nextSession)) {
          onInvalidSession(`invalid_session_event:${event}`);
          return;
        }

        if (event === "SIGNED_IN")
          markSidebarShouldOpenOnLogin(nextSession.user.id);

        // Evita bloquear otras consultas de Supabase dentro del callback de auth.
        window.setTimeout(() => {
          if (!isMounted) return;
          void onValidSession(nextSession, event);
        }, 0);
      }
    );

    const onStorage = (storageEvent: StorageEvent) => {
      if (!isSupabaseAuthStorageKey(storageEvent.key)) return;
      if (storageEvent.newValue !== null) return;

      authLog("Detectado cambio de storage en otra pestana: token borrado");
      void forceLogout("cross_tab_storage_token_removed");
    };

    window.addEventListener("storage", onStorage);

    let lastVisibleAt = Date.now();
    const STALE_TAB_THRESHOLD_MS = 60_000;

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        lastVisibleAt = Date.now();
        return;
      }

      const elapsed = Date.now() - lastVisibleAt;
      if (elapsed < STALE_TAB_THRESHOLD_MS) return;

      authLog("Tab visible tras inactividad, refrescando sesion", {
        elapsedMs: elapsed
      });

      void supabase.auth.getSession().then(({ data, error }) => {
        if (!isMounted) return;
        if (error || !data.session || isSessionExpired(data.session)) {
          onInvalidSession("visibility_stale_session");
          return;
        }
        void onValidSession(data.session, "init");
      });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isMounted = false;
      authSubscription.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    applyLocale,
    forceLogout,
    loadUserLocale,
    loadUserProfile,
    navigate,
    setLoggedOutState
  ]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      locale,
      isAuthReady,
      isAuthenticated: Boolean(user && session && !isSessionExpired(session)),
      applyLocale,
      setLocale,
      refreshProfile,
      forceLogout
    }),
    [
      applyLocale,
      forceLogout,
      isAuthReady,
      locale,
      profile,
      refreshProfile,
      session,
      setLocale,
      user
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider.");

  return context;
};
