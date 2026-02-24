import opositaiHorizontalLogo from "@/assets/opositai-horizontal.png";
import { useAuth } from "@/auth/AuthProvider";
import UserActionsDropdown from "@/components/UserActionsDropdown";
import {
  Brain,
  CalendarDays,
  ChevronRight,
  CircleUserRound,
  FileText,
  Home,
  LayoutDashboard,
  Menu,
  NotebookText,
  Sparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router-dom";

const AuthenticatedSidebarLayout = () => {
  const location = useLocation();
  const { t } = useTranslation(["profile", "common"]);
  const { profile } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);
  const avatarUrl = profile?.avatarUrl ?? "";
  const accountName = useMemo(() => {
    const fullName = `${profile?.firstName ?? ""} ${
      profile?.lastName ?? ""
    }`.trim();
    return fullName || profile?.email || t("profile:layout.defaults.account");
  }, [profile, t]);

  const menuGroups = useMemo(
    () => [
      {
        title: t("profile:layout.menuGroups.web"),
        items: [
          {
            label: t("profile:layout.menuItems.mainMenu"),
            to: "/",
            icon: Home
          },
          {
            label: t("profile:layout.menuItems.plans"),
            to: "/planes",
            icon: Sparkles
          }
        ]
      },
      {
        title: t("profile:layout.menuGroups.general"),
        items: [
          {
            label: t("profile:layout.menuItems.dashboard"),
            to: "/dashboard",
            icon: LayoutDashboard
          },
          {
            label: t("profile:layout.menuItems.profile"),
            to: "/perfil/mi-perfil",
            icon: CircleUserRound
          },
          {
            label: t("profile:layout.menuItems.ia"),
            to: "/perfil/opositAI",
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

  const closeMobileSidebar = () => setIsMobileOpen(false);

  useEffect(() => {
    const updateScrollState = () => {
      setIsHeaderScrolled(window.scrollY > 12);
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-charcoal/10 blur-3xl" />

      <header
        className={`sticky top-0 relative z-30 transition-all duration-300 ${
          isHeaderScrolled
            ? "border-b border-border/70 bg-background/80 backdrop-blur-xl shadow-[0_10px_35px_-20px_rgba(15,23,42,0.65)]"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="w-full max-w-[110rem] mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4 transition-all duration-300 lg:pl-[19rem] xl:pl-[19.5rem]">
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
              to="/"
              className="inline-flex items-center gap-2"
              onClick={closeMobileSidebar}
            >
              <img
                src={opositaiHorizontalLogo}
                alt="OpositAI"
                className="h-20 w-auto"
              />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <Link
                to="/"
                className={`h-10 px-3 border border-border transition-colors text-xs font-semibold tracking-widest uppercase inline-flex items-center ${
                  location.pathname === "/"
                    ? "bg-secondary text-foreground"
                    : "hover:bg-secondary text-muted-foreground"
                }`}
              >
                {t("profile:layout.mainMenu")}
              </Link>
              <Link
                to="/planes"
                className={`h-10 px-3 border border-border transition-colors text-xs font-semibold tracking-widest uppercase inline-flex items-center ${
                  location.pathname === "/planes"
                    ? "bg-secondary text-foreground"
                    : "hover:bg-secondary text-muted-foreground"
                }`}
              >
                {t("profile:layout.plans")}
              </Link>
            </div>

            <UserActionsDropdown />
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
              to="/"
              onClick={closeMobileSidebar}
              className="inline-flex items-center gap-2"
            >
              <img
                src={opositaiHorizontalLogo}
                alt="OpositAI"
                className="h-14 w-auto"
              />
            </Link>

            <button
              type="button"
              onClick={closeMobileSidebar}
              className="lg:hidden inline-flex h-8 w-8 items-center justify-center border border-border text-muted-foreground hover:bg-secondary transition-colors rounded-full"
              aria-label={t("profile:layout.closeSidebar")}
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
            </div>
          </footer>
        </div>
      </aside>

      <main className="w-full max-w-[110rem] mx-auto px-4 md:px-6 py-8 lg:py-10 relative z-10 transition-all duration-300 lg:pl-[19rem] xl:pl-[19.5rem]">
        <Outlet />
      </main>
    </div>
  );
};

export default AuthenticatedSidebarLayout;
