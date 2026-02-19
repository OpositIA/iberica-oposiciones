import { useState } from "react";
import { Link } from "react-router-dom";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen bg-charcoal flex">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-16">
        <div className="max-w-md">
          <Link to="/" className="flex items-center gap-2 mb-16">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-sm font-bold tracking-widest uppercase text-accent-foreground">OposiTest</span>
          </Link>
          <h1 className="text-5xl font-serif italic text-accent-foreground leading-tight mb-6">
            Bienvenido<br />de vuelta.
          </h1>
          <p className="text-sm text-accent-foreground/50 leading-relaxed">
            Accede a tu panel de preparación y continúa donde lo dejaste. Tu plaza te espera.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10">
            <Link to="/" className="flex items-center gap-2 mb-8">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-sm font-bold tracking-widest uppercase text-foreground">OposiTest</span>
            </Link>
          </div>

          <h2 className="text-2xl font-serif text-foreground mb-2">Iniciar sesión</h2>
          <p className="text-sm text-muted-foreground mb-10">Introduce tus credenciales para acceder</p>

          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="flex justify-end">
              <Link to="/" className="text-xs text-primary hover:text-primary/80 transition-colors">¿Olvidaste tu contraseña?</Link>
            </div>

            <button
              type="submit"
              className="w-full bg-primary text-primary-foreground py-3.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors"
            >
              Acceder
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              ¿No tienes cuenta?{" "}
              <Link to="/registro" className="text-primary font-semibold hover:text-primary/80 transition-colors">Regístrate gratis</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
