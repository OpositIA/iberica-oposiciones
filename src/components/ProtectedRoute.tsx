import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isSessionExpired } from "@/lib/session";

type ProtectedRouteProps = {
  children: ReactNode;
};

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const location = useLocation();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const markUnauthenticated = () => {
      if (!isMounted) return;
      setHasSession(false);
      setIsCheckingSession(false);
    };

    const validateSession = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (sessionError || !session || isSessionExpired(session)) {
        markUnauthenticated();
        return;
      }

      if (!isMounted) return;
      setHasSession(true);
      setIsCheckingSession(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void validateSession();
      }
    };

    void validateSession();

    const intervalId = window.setInterval(() => {
      void validateSession();
    }, 60_000);

    document.addEventListener("visibilitychange", onVisibilityChange);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (!isMounted) return;
        setHasSession(false);
        setIsCheckingSession(false);
        return;
      }

      if (!session || isSessionExpired(session)) {
        if (!isMounted) return;
        setHasSession(false);
        setIsCheckingSession(false);
        return;
      }

      void validateSession();
    });

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Validando sesion...</p>
      </div>
    );
  }

  if (!hasSession) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
