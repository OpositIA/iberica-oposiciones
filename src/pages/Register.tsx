import { useState } from "react";
import { Link } from "react-router-dom";

const Register = () => {
  const [name, setName] = useState("");
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
            Tu plaza<br />empieza aquí.
          </h1>
          <p className="text-sm text-accent-foreground/50 leading-relaxed">
            Más de 50.000 profesionales ya han comenzado su camino hacia la estabilidad. Tu primer mes es completamente gratuito.
          </p>
          <div className="mt-12 flex gap-8">
            {[
              { val: "50M+", label: "Preguntas" },
              { val: "4.9/5", label: "Valoración" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-serif font-bold text-accent-foreground">{s.val}</p>
                <p className="text-xs text-accent-foreground/40 tracking-widest uppercase">{s.label}</p>
              </div>
            ))}
          </div>
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

          <h2 className="text-2xl font-serif text-foreground mb-2">Crear cuenta</h2>
          <p className="text-sm text-muted-foreground mb-10">Comienza tu mes gratuito hoy</p>

          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className="text-xs font-semibold tracking-widest uppercase text-muted-foreground block mb-2">Nombre completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
              />
            </div>
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
                placeholder="Mínimo 8 caracteres"
                className="w-full border border-border bg-background text-foreground px-4 py-3 text-sm focus:outline-none focus:border-foreground transition-colors placeholder:text-muted-foreground/50"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-primary text-primary-foreground py-3.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors"
            >
              Crear cuenta gratis
            </button>
          </form>

          <p className="text-xs text-muted-foreground/60 mt-6 text-center leading-relaxed">
            Al registrarte aceptas nuestros{" "}
            <Link to="/" className="text-primary">Términos</Link> y{" "}
            <Link to="/" className="text-primary">Política de Privacidad</Link>
          </p>

          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link to="/login" className="text-primary font-semibold hover:text-primary/80 transition-colors">Inicia sesión</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
