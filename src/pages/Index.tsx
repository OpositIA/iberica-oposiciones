import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import heroImage from "@/assets/hero-image.jpg";
import methodologyImage from "@/assets/methodology-image.jpg";

const stats = [
  { value: "50M+", label: "Preguntas Resueltas" },
  { value: "12k+", label: "Plazas Obtenidas" },
  { value: "200+", label: "Convocatorias" },
  { value: "4.9/5", label: "Satisfacción" },
];

const sectors = [
  { num: "01", name: "Justicia", desc: "Preparación integral para Auxilio, Tramitación y Gestión Procesal.", resources: "8.420 Recursos" },
  { num: "02", name: "Hacienda", desc: "Especialización para Agentes y Técnicos de la Hacienda Pública.", resources: "5.150 Recursos" },
  { num: "03", name: "Sanidad", desc: "Tests técnicos para Enfermería y Personal Estatutario.", resources: "12.300 Recursos" },
  { num: "04", name: "Educación", desc: "Magisterio y Secundaria en todas sus especialidades.", resources: "9.800 Recursos" },
];

const testimonials = [
  {
    text: "La sobriedad de la interfaz me permite concentrarme en lo que importa. No hay distracciones, solo conocimiento puro y práctica real.",
    name: "Lucía Méndez",
    role: "Cuerpo de Justicia",
  },
  {
    text: "Como profesional en activo, el acceso móvil y la estructura de los test han sido clave para compaginar trabajo y estudio.",
    name: "Carlos Ruiz",
    role: "Técnico de Hacienda",
  },
  {
    text: "La calidad de las explicaciones jurídicas es insuperable. Es como tener un preparador personal disponible las 24 horas.",
    name: "Marta Sánchez",
    role: "Gestión Sanitaria",
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative h-[90vh] min-h-[600px]">
        <div className="absolute inset-0">
          <img src={heroImage} alt="Hero" className="w-full h-full object-cover" />
          <div className="hero-gradient absolute inset-0" />
        </div>
        <Navbar />
        <div className="relative z-10 h-full flex items-center px-8 max-w-7xl mx-auto">
          <div className="max-w-xl">
            <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary mb-6">
              Excelencia Académica
            </p>
            <h1 className="text-5xl md:text-7xl font-serif italic leading-[1.1] text-primary-foreground mb-6">
              Forja tu futuro{" "}
              <span className="not-italic">en el sector público.</span>
            </h1>
            <p className="text-sm text-primary-foreground/60 leading-relaxed mb-10 max-w-md">
              La plataforma definitiva para el profesional ambicioso. Accede a simuladores de alta precisión y test oficiales actualizados en tiempo real.
            </p>
            <div className="flex gap-4">
              <Link
                to="/registro"
                className="bg-primary text-primary-foreground px-8 py-3.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors"
              >
                Comenzar Ahora
              </Link>
              <Link
                to="/planes"
                className="border border-primary-foreground/30 text-primary-foreground px-8 py-3.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary-foreground/10 transition-colors"
              >
                Explorar Planes
              </Link>
            </div>
          </div>
        </div>
        {/* Success cases badge */}
        <div className="absolute bottom-12 right-12 z-10 bg-charcoal/80 backdrop-blur-sm p-6 max-w-xs hidden lg:block">
          <p className="text-xs font-semibold tracking-widest uppercase text-primary mb-2">Casos de Éxito</p>
          <p className="text-sm text-primary-foreground/60 leading-relaxed">
            "+50.000 profesionales han transformado su carrera con nuestra metodología."
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border">
        <div className="max-w-7xl mx-auto px-8 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl md:text-4xl font-serif font-bold text-foreground">{stat.value}</p>
              <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Specializations */}
      <section className="max-w-7xl mx-auto px-8 py-20">
        <div className="flex justify-between items-end mb-12">
          <div>
            <h2 className="text-3xl md:text-4xl font-serif text-foreground">Especialización de Alto Nivel</h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-lg">
              Seleccionamos y estructuramos el contenido más riguroso para las áreas más exigentes de la administración.
            </p>
          </div>
          <Link to="/" className="hidden md:flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors">
            Ver todo el catálogo →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {sectors.map((sector) => (
            <div key={sector.num} className="border border-border p-8 hover:border-foreground/30 transition-colors group cursor-pointer">
              <p className="text-xs text-muted-foreground tracking-widest uppercase mb-6">Sector {sector.num}</p>
              <h3 className="text-2xl font-serif text-foreground mb-3">{sector.name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-8">{sector.desc}</p>
              <p className="text-xs text-muted-foreground tracking-widest uppercase">{sector.resources}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Methodology */}
      <section className="bg-secondary">
        <div className="max-w-7xl mx-auto px-8 py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.3em] uppercase text-muted-foreground mb-4">Metodología de Éxito</p>
              <h2 className="text-3xl md:text-5xl font-serif italic text-foreground mb-6">
                Diseñado para la<br />eficiencia máxima.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-md">
                Entendemos que tu tiempo es el activo más valioso. Nuestra arquitectura de estudio minimiza la fricción y maximiza la retención de conceptos clave.
              </p>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                    <span className="text-foreground text-lg">📋</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-1">Rigor Legislativo</h4>
                    <p className="text-sm text-muted-foreground">Actualización instantánea según las variaciones en el BOE y directivas europeas.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                    <span className="text-foreground text-lg">📊</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-1">Analítica Predictiva</h4>
                    <p className="text-sm text-muted-foreground">Identificamos tus patrones de error antes de que se conviertan en obstáculos.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <img src={methodologyImage} alt="Metodología" className="w-full aspect-square object-cover" />
              <div className="absolute bottom-6 left-6 right-6 bg-background p-5 shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-primary-foreground text-xs">✓</span>
                  </div>
                </div>
                <p className="text-sm font-serif italic text-foreground">"El estándar de oro en preparación oficial."</p>
                <p className="text-xs text-muted-foreground mt-1">— Revista Académica</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-7xl mx-auto px-8 py-20">
        <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-12">La voz de los que alcanzaron su meta</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t) => (
            <div key={t.name} className="border-t border-border pt-8">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-primary text-sm">★</span>
                ))}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-8">"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                  <span className="text-xs font-bold text-foreground">{t.name[0]}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-charcoal py-24">
        <div className="max-w-7xl mx-auto px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-serif italic text-primary-foreground mb-4">Asegura tu plaza hoy.</h2>
          <p className="text-sm text-primary-foreground/50 mb-10 max-w-md mx-auto">
            Únete a la élite de opositores que ya han dado el paso definitivo hacia su estabilidad profesional.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              to="/registro"
              className="bg-primary text-primary-foreground px-8 py-3.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors"
            >
              Registrarme Gratis
            </Link>
            <Link
              to="/planes"
              className="border border-primary-foreground/30 text-primary-foreground px-8 py-3.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary-foreground/10 transition-colors"
            >
              Consultar Tarifas
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
