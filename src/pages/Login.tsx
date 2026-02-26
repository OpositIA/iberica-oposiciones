import opositaiHorizontalLogo from "@/assets/opositai-horizontal.png";
import CustomButton from "@/components/ui/custom-button";
import CustomInput from "@/components/ui/custom-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isSessionExpired } from "@/lib/session";
import { runSingleFlight } from "@/lib/singleFlight";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

const EMAIL_REGEX = /\S+@\S+\.\S+/;

const isNetworkError = (message: string) =>
  /network|failed to fetch|fetch failed|timeout/i.test(message);

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    className={className}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M21.35 11.1h-9.18v2.98h5.27c-.5 2.52-2.66 3.9-5.27 3.9-3.12 0-5.65-2.57-5.65-5.73s2.53-5.73 5.65-5.73c1.41 0 2.69.53 3.67 1.4l2.2-2.24a8.89 8.89 0 0 0-5.87-2.18c-4.92 0-8.91 4.04-8.91 9.01s3.99 9.01 8.91 9.01c5.14 0 8.52-3.62 8.52-8.73 0-.58-.06-1.14-.18-1.69z"
      fill="currentColor"
    />
  </svg>
);

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(["auth", "common"]);
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

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

  useEffect(() => {
    const locationState = location.state as {
      passwordResetSuccess?: boolean;
    } | null;
    if (!locationState?.passwordResetSuccess) return;

    toast({
      title: t("auth:login.resetPasswordSuccessTitle"),
      description: t("auth:login.resetPasswordSuccessDescription")
    });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, t, toast]);

  const mapForgotPasswordError = (error: {
    status?: number;
    message?: string;
  }) => {
    if (error.status === 429) return t("auth:forgotPassword.errors.rateLimit");

    if (error.message && isNetworkError(error.message))
      return t("auth:forgotPassword.errors.network");

    return t("auth:forgotPassword.errors.generic");
  };

  const openForgotPasswordModal = () => {
    setForgotPasswordEmail(email.trim());
    setForgotPasswordMessage(null);
    setIsForgotPasswordOpen(true);
  };

  const handleForgotPasswordOpenChange = (open: boolean) => {
    setIsForgotPasswordOpen(open);
    if (!open) setForgotPasswordMessage(null);
  };

  const handleForgotPasswordSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedEmail = forgotPasswordEmail.trim();

    if (!trimmedEmail) {
      setForgotPasswordMessage({
        type: "error",
        text: t("auth:forgotPassword.errors.emailRequired")
      });
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setForgotPasswordMessage({
        type: "error",
        text: t("auth:forgotPassword.errors.invalidEmail")
      });
      return;
    }

    setIsSendingResetEmail(true);
    setForgotPasswordMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        {
          redirectTo: `${window.location.origin}/reset-password`
        }
      );

      if (error) {
        setForgotPasswordMessage({
          type: "error",
          text: mapForgotPasswordError(error)
        });
        return;
      }

      setForgotPasswordMessage({
        type: "success",
        text: t("auth:forgotPassword.successMessage")
      });
    } catch (error) {
      setForgotPasswordMessage({
        type: "error",
        text: mapForgotPasswordError(error as { message?: string })
      });
    } finally {
      setIsSendingResetEmail(false);
    }
  };

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

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      });

      if (error) {
        toast({
          variant: "destructive",
          title: t("auth:login.errors.googleSignInFailedTitle"),
          description: error.message
        });
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const isAnyLoading = isLoading || isGoogleLoading;

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
                disabled={isAnyLoading}
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
                disabled={isAnyLoading}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={openForgotPasswordModal}
                disabled={isAnyLoading}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                {t("auth:login.forgotPassword")}
              </button>
            </div>

            <CustomButton
              type="submit"
              styleType="primary"
              disabled={isAnyLoading}
              className="w-full py-3.5"
            >
              {isLoading ? t("auth:login.submitting") : t("auth:login.submit")}
            </CustomButton>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/70" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                  {t("auth:login.orContinueWith")}
                </span>
              </div>
            </div>

            <CustomButton
              type="button"
              styleType="ghost"
              className="w-full py-3.5"
              disabled={isAnyLoading}
              onClick={handleGoogleSignIn}
            >
              <GoogleIcon className="h-4 w-4" />
              {isGoogleLoading
                ? t("auth:login.googleSubmitting")
                : t("auth:login.googleSubmit")}
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

      <Dialog
        open={isForgotPasswordOpen}
        onOpenChange={handleForgotPasswordOpenChange}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth:forgotPassword.title")}</DialogTitle>
            <DialogDescription>
              {t("auth:forgotPassword.description")}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleForgotPasswordSubmit}>
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                {t("auth:forgotPassword.email")}
              </label>
              <CustomInput
                type="email"
                value={forgotPasswordEmail}
                onChange={(e) => setForgotPasswordEmail(e.target.value)}
                placeholder={t("auth:forgotPassword.emailPlaceholder")}
                autoComplete="email"
                className="w-full"
                disabled={isSendingResetEmail}
              />
            </div>

            {forgotPasswordMessage ? (
              <p
                className={
                  forgotPasswordMessage.type === "error"
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
                role={
                  forgotPasswordMessage.type === "error" ? "alert" : "status"
                }
              >
                {forgotPasswordMessage.text}
              </p>
            ) : null}

            <DialogFooter>
              <CustomButton
                type="button"
                styleType="ghost"
                onClick={() => setIsForgotPasswordOpen(false)}
                disabled={isSendingResetEmail}
              >
                {t("auth:forgotPassword.cancel")}
              </CustomButton>
              <CustomButton
                type="submit"
                styleType="primary"
                disabled={isSendingResetEmail}
              >
                {isSendingResetEmail
                  ? t("auth:forgotPassword.submitting")
                  : t("auth:forgotPassword.submit")}
              </CustomButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
