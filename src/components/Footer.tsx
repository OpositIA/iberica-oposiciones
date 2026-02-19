import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-charcoal text-accent-foreground">
      <div className="max-w-7xl mx-auto px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-sm font-bold tracking-widest uppercase">OposiTest</span>
            </div>
            <p className="text-sm text-accent-foreground/50 leading-relaxed">
              Referente europeo en tecnología aplicada al estudio opositor. Rigor, elegancia y resultados desde 2012.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-widest uppercase mb-4 text-accent-foreground/70">Compañía</h4>
            <ul className="space-y-3">
              {["Nosotros", "Metodología", "Carreras", "Prensa"].map((item) => (
                <li key={item}>
                  <Link to="/" className="text-sm text-accent-foreground/50 hover:text-accent-foreground transition-colors">{item}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-widest uppercase mb-4 text-accent-foreground/70">Recursos</h4>
            <ul className="space-y-3">
              {["Blog Académico", "Guías PDF", "Calendario", "Legislación"].map((item) => (
                <li key={item}>
                  <Link to="/" className="text-sm text-accent-foreground/50 hover:text-accent-foreground transition-colors">{item}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-widest uppercase mb-4 text-accent-foreground/70">Newsletter</h4>
            <p className="text-sm text-accent-foreground/50 mb-4">Recibe inteligencia académica</p>
            <div className="flex border border-accent-foreground/20">
              <input
                type="email"
                placeholder="Tu email operativo"
                className="flex-1 bg-transparent text-sm px-4 py-2.5 text-accent-foreground placeholder:text-accent-foreground/30 focus:outline-none"
              />
              <button className="px-3 text-primary hover:text-primary/80 transition-colors">→</button>
            </div>
          </div>
        </div>
        <div className="border-t border-accent-foreground/10 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-accent-foreground/40">© 2024 OposiTest Academy. Todos los derechos reservados.</p>
          <div className="flex gap-6">
            {["Privacidad", "Términos", "Cookies"].map((item) => (
              <Link key={item} to="/" className="text-xs text-accent-foreground/40 hover:text-accent-foreground transition-colors">{item}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
