import {
  BarChart3,
  Bell,
  Brain,
  CalendarDays,
  CircleUserRound,
  FileText,
  Home,
  LogOut,
  Menu,
  NotebookText,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const menuGroups = [
  {
    title: "General",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: Home },
      { label: "IA", to: "/perfil/oposia", icon: Brain },
    ],
  },
  {
    title: "Preparacion",
    items: [
      { label: "Test", to: "/perfil/test", icon: FileText },
      { label: "Temario", to: "/perfil/temario", icon: NotebookText },
      { label: "Calendario", to: "/perfil/calendario", icon: CalendarDays },
      { label: "Estadisticas", to: "/perfil/estadisticas", icon: BarChart3 },
    ],
  },
] as const;

const AuthenticatedSidebarLayout = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [accountName, setAccountName] = useState("Mi cuenta");

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const firstName = String(metadata.first_name ?? "").trim();
      const lastName = String(metadata.last_name ?? "").trim();
      const fullName = `${firstName} ${lastName}`.trim();
      setAccountName(fullName || user?.email || "Mi cuenta");
    };

    void loadUser();
  }, []);

  const closeMobileSidebar = () => setIsMobileOpen(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast({
        variant: "destructive",
        title: "No se pudo cerrar sesion",
        description: error.message,
      });
      setIsSigningOut(false);
      return;
    }

    navigate("/login", { replace: true });
    setIsSigningOut(false);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-charcoal/10 blur-3xl" />

      <header className="border-b border-border/70 bg-background/85 backdrop-blur relative z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-secondary transition-colors lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 lg:hidden"
              onClick={closeMobileSidebar}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="font-semibold text-lg text-foreground">Panel</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button className="h-10 w-10 border border-border bg-background hover:bg-secondary transition-colors inline-flex items-center justify-center">
              <Bell className="h-4 w-4 text-muted-foreground" />
            </button>
            <button className="h-10 w-10 border border-border bg-background hover:bg-secondary transition-colors inline-flex items-center justify-center">
              <Settings className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="h-10 px-4 border border-border hover:bg-secondary transition-colors text-xs font-semibold tracking-widest uppercase inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isSigningOut ? "Saliendo..." : "Salir"}
            </button>
          </div>
        </div>
      </header>

      {isMobileOpen && (
        <button
          type="button"
          aria-label="Cerrar menu"
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      <aside
        className={`fixed top-0 start-0 bottom-0 z-50 w-72 max-[480px]:w-[86vw] border-r border-border/70 bg-background/90 backdrop-blur-xl shadow-2xl transition-transform duration-300 transform ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        role="dialog"
        aria-label="Sidebar"
      >
        <div className="relative flex flex-col h-full max-h-full overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -right-12 h-44 w-44 rounded-full bg-primary/20 blur-3xl" />

          <header className="relative p-5 flex justify-between items-center gap-2 border-b border-border/60">
            <Link
              to="/dashboard"
              onClick={closeMobileSidebar}
              className="inline-flex items-center gap-2"
            >
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="font-semibold text-lg text-foreground">Panel</span>
            </Link>

            <button
              type="button"
              onClick={closeMobileSidebar}
              className="lg:hidden inline-flex h-8 w-8 items-center justify-center border border-border text-muted-foreground hover:bg-secondary transition-colors rounded-full"
              aria-label="Cerrar sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <nav className="relative h-full overflow-y-auto p-3 space-y-5">
            {menuGroups.map((group) => (
              <div key={group.title}>
                <p className="px-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground mb-2">
                  {group.title}
                </p>
                <ul className="space-y-1.5">
                  {group.items.map((item) => {
                    const active = location.pathname === item.to;
                    const Icon = item.icon;

                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          onClick={closeMobileSidebar}
                          className={`w-full flex items-center gap-3 py-2.5 px-3 text-sm rounded-xl transition-all ${
                            active
                              ? "bg-primary text-primary-foreground shadow-[0_8px_20px_-12px_rgba(255,119,0,0.9)]"
                              : "text-foreground hover:bg-secondary"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="font-medium">{item.label}</span>
                          {active && <span className="ml-auto h-2 w-2 rounded-full bg-primary-foreground/80" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <footer className="relative mt-auto p-3 border-t border-border/60">
            <div className="rounded-2xl border border-border bg-background/70 p-3">
              <div className="inline-flex items-center gap-2 mb-3">
                <CircleUserRound className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground truncate">{accountName}</span>
              </div>

              <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                Plan activo
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full inline-flex items-center justify-center gap-2 border border-border px-3 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors disabled:opacity-60"
              >
                <LogOut className="h-3.5 w-3.5" />
                {isSigningOut ? "Saliendo..." : "Cerrar sesion"}
              </button>
            </div>
          </footer>
        </div>
      </aside>

      <main className="max-w-7xl mx-auto px-6 py-8 lg:py-10 relative z-10 transition-all duration-300 lg:pl-72">
        <Outlet />
      </main>
    </div>
  );
};

export default AuthenticatedSidebarLayout;
