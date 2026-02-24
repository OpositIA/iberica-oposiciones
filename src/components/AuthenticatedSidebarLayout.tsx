import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { applyTheme, getStoredTheme, type AppTheme } from "@/lib/theme";
import {
  Bell,
  Brain,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  FileText,
  Home,
  LogOut,
  Menu,
  Moon,
  NotebookText,
  Sparkles,
  Sun,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router-dom";

const sanitizeAvatarForRender = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("data:") || lower.startsWith("blob:")) return "";
  return trimmed;
};

const AuthenticatedSidebarLayout = () => {
  const location = useLocation();
  const { t } = useTranslation(["profile"]);
  const { user, forceLogout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [accountName, setAccountName] = useState(
    t("profile:layout.defaults.account")
  );
  const [avatarUrl, setAvatarUrl] = useState("");
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());

  const menuGroups = useMemo(
    () => [
      {
        title: t("profile:layout.menuGroups.general"),
        items: [
          {
            label: t("profile:layout.menuItems.dashboard"),
            to: "/dashboard",
            icon: Home
          },
          {
            label: t("profile:layout.menuItems.ia"),
            to: "/perfil/oposia",
            icon: Brain
          }
        ]
      },
      {
        title: t("profile:layout.menuGroups.preparation"),
        items: [
          {
            label: t("profile:layout.menuItems.test"),
            to: "/perfil/test",
            icon: FileText
          },
          {
            label: t("profile:layout.menuItems.syllabus"),
            to: "/perfil/temario",
            icon: NotebookText
          },
          {
            label: t("profile:layout.menuItems.calendar"),
            to: "/perfil/calendario",
            icon: CalendarDays
          }
        ]
      }
    ],
    [t]
  );

  useEffect(() => {
    let isMounted = true;

    const loadProfileSnapshot = async () => {
      if (!user) {
        if (!isMounted) return;
        setAccountName(t("profile:layout.defaults.account"));
        setAvatarUrl("");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!isMounted) return;

      const firstName = String(data?.first_name ?? "").trim();
      const lastName = String(data?.last_name ?? "").trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const avatar = sanitizeAvatarForRender(String(data?.avatar_url ?? ""));

      setAccountName(
        fullName ||
          data?.email ||
          user.email ||
          t("profile:layout.defaults.account")
      );
      setAvatarUrl(avatar);
    };

    void loadProfileSnapshot();

    return () => {
      isMounted = false;
    };
  }, [t, user]);

  const closeMobileSidebar = () => setIsMobileOpen(false);

  const handleToggleTheme = () => {
    const nextTheme: AppTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    setTheme(nextTheme);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await forceLogout("manual_sign_out");
    setIsSigningOut(false);
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-charcoal/10 blur-3xl" />

      <header className="border-b border-border/70 bg-background/85 backdrop-blur relative z-30">
        <div className="w-full max-w-[110rem] mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4 transition-all duration-300 lg:pl-72">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:bg-secondary transition-colors lg:hidden"
              aria-label={t("profile:layout.mobileMenuOpen")}
            >
              <Menu className="h-4 w-4" />
            </button>

            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 lg:hidden"
              onClick={closeMobileSidebar}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="font-semibold text-lg text-foreground">
                {t("profile:layout.panel")}
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button className="h-10 w-10 border border-border bg-background hover:bg-secondary transition-colors inline-flex items-center justify-center">
              <Bell className="h-4 w-4 text-muted-foreground" />
            </button>
            <Link
              to="/perfil/mi-perfil"
              className="h-10 w-10 border border-border bg-background hover:bg-secondary transition-colors inline-flex items-center justify-center rounded-full overflow-hidden"
              aria-label={t("profile:layout.openProfile")}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={t("profile:myProfile.avatarAlt")}
                  className="h-full w-full object-cover"
                />
              ) : (
                <CircleUserRound className="h-4 w-4 text-muted-foreground" />
              )}
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="h-10 px-4 border border-border hover:bg-secondary transition-colors text-xs font-semibold tracking-widest uppercase inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isSigningOut
                ? t("profile:layout.signingOut")
                : t("profile:layout.signOut")}
            </button>
          </div>
        </div>
      </header>

      {isMobileOpen && (
        <button
          type="button"
          aria-label={t("profile:layout.mobileMenuClose")}
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={closeMobileSidebar}
        />
      )}

      <aside
        className={`fixed top-0 start-0 bottom-0 z-50 w-72 max-[480px]:w-[86vw] border-r border-border/70 bg-background/90 backdrop-blur-xl shadow-2xl transition-transform duration-300 transform ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        role="dialog"
        aria-label={t("profile:layout.sidebarAriaLabel")}
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
              <span className="font-semibold text-lg text-foreground">
                {t("profile:layout.panel")}
              </span>
            </Link>

            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleTheme}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary transition-colors"
                aria-label={
                  theme === "dark"
                    ? t("profile:layout.theme.activateLight")
                    : t("profile:layout.theme.activateDark")
                }
                title={
                  theme === "dark"
                    ? t("profile:layout.theme.lightTitle")
                    : t("profile:layout.theme.darkTitle")
                }
              >
                {theme === "dark" ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={closeMobileSidebar}
                className="lg:hidden inline-flex h-8 w-8 items-center justify-center border border-border text-muted-foreground hover:bg-secondary transition-colors rounded-full"
                aria-label={t("profile:layout.closeSidebar")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
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
                          {active && (
                            <span className="ml-auto h-2 w-2 rounded-full bg-primary-foreground/80" />
                          )}
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
              <Link
                to="/perfil/mi-perfil"
                onClick={closeMobileSidebar}
                className="mb-3 flex items-center gap-2 rounded-xl border border-border/70 bg-background px-2.5 py-2 transition-colors hover:bg-secondary/70"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={t("profile:myProfile.avatarAlt")}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <CircleUserRound className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {accountName}
                  </span>
                  <span className="block text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                    {t("profile:layout.myProfile")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>

              <div className="mb-3 inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                {t("profile:layout.activePlan")}
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full inline-flex items-center justify-center gap-2 border border-border px-3 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-secondary transition-colors disabled:opacity-60"
              >
                <LogOut className="h-3.5 w-3.5" />
                {isSigningOut
                  ? t("profile:layout.signingOut")
                  : t("profile:layout.closeSession")}
              </button>
            </div>
          </footer>
        </div>
      </aside>

      <main className="w-full max-w-[110rem] mx-auto px-4 md:px-6 py-8 lg:py-10 relative z-10 transition-all duration-300 lg:pl-72">
        <Outlet />
      </main>
    </div>
  );
};

export default AuthenticatedSidebarLayout;
