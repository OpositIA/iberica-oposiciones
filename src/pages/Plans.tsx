import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const plans = [
  {
    name: "Básico",
    price: "0",
    period: "/ mes",
    description: "Ideal para explorar la plataforma y comenzar tu preparación.",
    features: ["500 preguntas tipo test", "1 área de especialización", "Estadísticas básicas", "Acceso web"],
    cta: "Comenzar gratis",
    featured: false,
  },
  {
    name: "Profesional",
    price: "19",
    period: "/ mes",
    description: "Para el opositor comprometido que busca resultados reales.",
    features: ["Preguntas ilimitadas", "Todas las áreas", "Analítica predictiva", "Acceso móvil", "Esquemas descargables", "Simulacros oficiales"],
    cta: "Empezar ahora",
    featured: true,
  },
  {
    name: "Élite",
    price: "39",
    period: "/ mes",
    description: "Acceso total con preparador virtual y soporte prioritario.",
    features: ["Todo en Profesional", "Preparador IA personal", "Soporte prioritario 24/7", "Corrección de exámenes", "Legislación en tiempo real", "Grupo exclusivo"],
    cta: "Contactar ventas",
    featured: false,
  },
];

const Plans = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Dark header for navbar */}
      <div className="bg-charcoal">
        <Navbar />
        <div className="pt-32 pb-20 px-8 max-w-7xl mx-auto text-center">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary mb-4">Tarifas</p>
          <h1 className="text-4xl md:text-6xl font-serif italic text-accent-foreground mb-4">
            Invierte en tu futuro.
          </h1>
          <p className="text-sm text-accent-foreground/50 max-w-md mx-auto">
            Planes diseñados para cada nivel de ambición. Sin compromisos, cancela cuando quieras.
          </p>
        </div>
      </div>

      {/* Plans grid */}
      <div className="max-w-5xl mx-auto px-8 -mt-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`border p-8 flex flex-col ${
                plan.featured
                  ? "border-primary bg-charcoal text-accent-foreground relative"
                  : "border-border bg-background text-foreground"
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 left-8 bg-primary text-primary-foreground px-3 py-1 text-[10px] font-semibold tracking-widest uppercase">
                  Más Popular
                </div>
              )}
              <h3 className="text-xs font-semibold tracking-widest uppercase mb-4 opacity-60">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-serif font-bold">{plan.price}€</span>
                <span className="text-sm opacity-50">{plan.period}</span>
              </div>
              <p className={`text-sm leading-relaxed mb-8 ${plan.featured ? "text-accent-foreground/60" : "text-muted-foreground"}`}>
                {plan.description}
              </p>
              <ul className="space-y-3 mb-10 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm">
                    <span className="text-primary text-xs">✓</span>
                    <span className={plan.featured ? "text-accent-foreground/80" : "text-muted-foreground"}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/registro"
                className={`text-center py-3.5 text-xs font-semibold tracking-widest uppercase transition-colors ${
                  plan.featured
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-foreground/20 text-foreground hover:border-foreground/50"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Plans;
