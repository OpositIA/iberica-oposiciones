import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type ProtectedRouteProps = {
  children: ReactNode;
};

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const location = useLocation();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;

      setHasSession(Boolean(data.session));
      setIsCheckingSession(false);
    };

    void checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      setHasSession(Boolean(session));
      setIsCheckingSession(false);
    });

    return () => {
      isMounted = false;
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
