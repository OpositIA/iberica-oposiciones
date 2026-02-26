import opositaiHorizontalLogo from "@/assets/opositai-horizontal.png";
import CustomButton from "@/components/ui/custom-button";
import CustomInput from "@/components/ui/custom-input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isSessionExpired } from "@/lib/session";
import { runSingleFlight } from "@/lib/singleFlight";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

const Login = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(["auth", "common"]);
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const validateAndRedirectIfSessionActive = async () => {
      const { data, error } = await runSingleFlight(
        "login:active-session",
        () => supabase.auth.getSession(),
        { reuseResultForMs: 1200 }
      );
      const session = data.session;
      if (error || !session || isSessionExpired(session)) return;

      if (isMounted) navigate("/dashboard", { replace: true });
    };

    void validateAndRedirectIfSessionActive();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") return;
        if (!session || isSessionExpired(session)) return;

        void validateAndRedirectIfSessionActive();
      }
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      toast({
        variant: "destructive",
        title: t("auth:login.errors.incompleteCredentialsTitle"),
        description: t("auth:login.errors.incompleteCredentialsDescription")
      });
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      toast({
        variant: "destructive",
        title: t("auth:login.errors.signInFailedTitle"),
        description: error.message
      });
      setIsLoading(false);
      return;
    }

    navigate("/dashboard", { replace: true });
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-charcoal flex">
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-16">
        <div className="max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-16">
            <img
              src={opositaiHorizontalLogo}
              alt="OpositAI"
              className="h-60 w-auto"
            />
          </Link>
          <h1 className="text-5xl font-serif italic text-slate-100 leading-tight mb-6">
            {t("auth:login.heroTitleLine1")}
            <br />
            {t("auth:login.heroTitleLine2")}
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            {t("auth:login.heroDescription")}
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10">
            <Link to="/" className="flex items-center gap-2 mb-8">
              <img
                src={opositaiHorizontalLogo}
                alt="OpositAI"
                className="h-4 w-auto"
              />
            </Link>
          </div>

          <h2 className="text-2xl font-serif text-foreground mb-2">
            {t("auth:login.title")}
          </h2>
          <p className="text-sm text-muted-foreground mb-10">
            {t("auth:login.subtitle")}
          </p>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                {t("auth:login.email")}
              </label>
              <CustomInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth:login.emailPlaceholder")}
                autoComplete="email"
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                {t("auth:login.password")}
              </label>
              <CustomInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth:login.passwordPlaceholder")}
                autoComplete="current-password"
                className="w-full"
              />
            </div>

            <div className="flex justify-end">
              <Link
                to="/"
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                {t("auth:login.forgotPassword")}
              </Link>
            </div>

            <CustomButton
              type="submit"
              styleType="primary"
              disabled={isLoading}
              className="w-full py-3.5"
            >
              {isLoading ? t("auth:login.submitting") : t("auth:login.submit")}
            </CustomButton>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("auth:login.noAccount")}{" "}
              <Link
                to="/registro"
                className="text-primary font-semibold hover:text-primary/80 transition-colors"
              >
                {t("auth:login.registerFree")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
