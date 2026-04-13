import { useAuth } from "@/auth/AuthProvider";
import BrandLogo from "@/components/BrandLogo";
import CustomButton from "@/components/ui/custom-button";
import UserActionsDropdown from "@/components/UserActionsDropdown";
import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const Navbar = () => {
  const { t } = useTranslation(["landing", "common"]);
  const { isAuthReady, isAuthenticated } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const updateScrollState = () => {
      setIsScrolled(window.scrollY > 16);
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  const navItems = [
    t("landing:navbar.navLinks.oppositions"),
    t("landing:navbar.navLinks.outlines"),
    t("landing:navbar.navLinks.courses"),
    t("landing:navbar.navLinks.freeTests")
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 transition-all duration-300 ${
        isScrolled
          ? "border-b border-border/70 bg-background/80 backdrop-blur-xl shadow-[0_10px_35px_-20px_rgba(15,23,42,0.65)]"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2 mb-[-5px]">
          <BrandLogo className="h-16 w-auto" />
        </Link>
      </div>
      <div className="flex items-center gap-4">
        {!isAuthReady ? (
          <div className="h-10 w-20" />
        ) : isAuthenticated ? (
          <UserActionsDropdown
            buttonClassName={
              isScrolled
                ? "border-border bg-background hover:bg-secondary"
                : "border-primary-foreground/30 hover:border-primary-foreground/50 bg-charcoal/40 hover:bg-charcoal/65"
            }
            fallbackIconClassName={
              isScrolled
                ? "text-muted-foreground"
                : "text-primary-foreground/70"
            }
          />
        ) : (
          <>
            <CustomButton
              asChild
              styleType="menu"
              radius="lg"
              className={`h-10 px-5 ${
                isScrolled
                  ? "border-border/70 bg-background/70 text-foreground hover:bg-secondary"
                  : "border-primary-foreground/15 bg-white/8 text-primary-foreground hover:bg-white/12"
              }`}
            >
              <Link to="/registro">{t("landing:navbar.registerNow")}</Link>
            </CustomButton>
            <CustomButton
              asChild
              styleType="primary"
              radius="lg"
              className="h-10 px-5"
            >
              <Link to="/login">
                <LogIn className="h-3.5 w-3.5" />
                {t("landing:navbar.login")}
              </Link>
            </CustomButton>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
