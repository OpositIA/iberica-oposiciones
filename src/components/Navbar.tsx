import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-sm font-bold tracking-widest uppercase text-primary-foreground">
            OposiTest
          </span>
        </Link>
        <div className="hidden md:flex items-center gap-6">
          {["Oposiciones", "Esquemas", "Cursos", "Test gratis"].map((item) => (
            <Link
              key={item}
              to="/"
              className="text-xs font-medium tracking-widest uppercase text-primary-foreground/70 hover:text-primary-foreground transition-colors"
            >
              {item}
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Link
          to="/dashboard"
          className="text-xs font-medium tracking-widest uppercase text-primary-foreground/70 hover:text-primary-foreground transition-colors"
        >
          Mi cuenta
        </Link>
        <Link
          to="/login"
          className="text-xs font-medium tracking-widest uppercase text-primary-foreground/70 hover:text-primary-foreground transition-colors"
        >
          Iniciar sesión
        </Link>
        <Link
          to="/registro"
          className="bg-primary text-primary-foreground px-5 py-2.5 text-xs font-semibold tracking-widest uppercase hover:bg-primary/90 transition-colors"
        >
          Mes gratis
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
