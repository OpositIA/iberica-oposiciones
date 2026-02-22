import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (isMounted && data.session) {
        navigate("/dashboard", { replace: true });
      }
    };

    void checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        navigate("/dashboard", { replace: true });
      }
    });

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
        title: "Credenciales incompletas",
        description: "Introduce email y contrasena para continuar.",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "No se pudo iniciar sesion",
        description: error.message,
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
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-sm font-bold tracking-widest uppercase text-accent-foreground">
              OposiTest
            </span>
          </Link>
          <h1 className="text-5xl font-serif italic text-accent-foreground leading-tight mb-6">
            Bienvenido
            <br />
            de vuelta.
          </h1>
          <p className="text-sm text-accent-foreground/50 leading-relaxed">
            Accede a tu panel de preparacion y continua donde lo dejaste. Tu plaza te espera.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10">
            <Link to="/" className="flex items-center gap-2 mb-8">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-sm font-bold tracking-widest uppercase text-foreground">
                OposiTest
              </span>
            </Link>
          </div>

          <h2 className="text-2xl font-serif text-foreground mb-2">Iniciar sesion</h2>
          <p className="text-sm text-muted-foreground mb-10">
            Introduce tus credenciales para acceder
          </p>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="email"
                className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">
                Contrasena
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                autoComplete="current-password"
                className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="flex justify-end">
              <Link to="/" className="text-xs text-primary hover:text-primary/80 transition-colors">
                Olvidaste tu contrasena?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground py-3.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isLoading ? "Accediendo..." : "Acceder"}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              No tienes cuenta?{" "}
              <Link to="/registro" className="text-primary font-semibold hover:text-primary/80 transition-colors">
                Registrate gratis
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
