import { useAuth } from "@/auth/AuthProvider";
import BrandLogo from "@/components/BrandLogo";
import CustomButton from "@/components/ui/custom-button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import UserActionsDropdown from "@/components/UserActionsDropdown";
import { LogIn, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const Navbar = () => {
  const { t } = useTranslation(["landing", "common"]);
  const { isAuthReady, isAuthenticated } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof IntersectionObserver === "undefined"
    )
      return;

    const scrollMarker = document.createElement("span");
    scrollMarker.setAttribute("aria-hidden", "true");
    scrollMarker.style.cssText =
      "position:absolute;top:16px;left:0;width:1px;height:1px;pointer-events:none;opacity:0;";
    document.body.prepend(scrollMarker);

    const observer = new IntersectionObserver(([entry]) => {
      setIsScrolled(!entry.isIntersecting);
    });

    observer.observe(scrollMarker);

    return () => {
      observer.disconnect();
      scrollMarker.remove();
    };
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8 lg:py-5 transition-all duration-300 ${
        isScrolled
          ? "border-b border-border/70 bg-background/80 backdrop-blur-xl shadow-[0_10px_35px_-20px_rgba(15,23,42,0.65)]"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="flex min-w-0 items-center gap-8">
        <Link to="/" className="mb-[-5px] flex items-center gap-2">
          <BrandLogo className="h-11 w-auto sm:h-14 lg:h-16" />
        </Link>
      </div>
      <div className="ml-auto hidden items-center justify-end gap-3 sm:flex lg:gap-4">
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
              className={`h-9 whitespace-nowrap px-3 text-xs sm:h-10 sm:px-4 sm:text-sm lg:px-5 ${
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
              className="h-9 whitespace-nowrap px-3 text-xs sm:h-10 sm:px-4 sm:text-sm lg:px-5"
            >
              <Link to="/login">
                <LogIn className="h-3.5 w-3.5" />
                {t("landing:navbar.login")}
              </Link>
            </CustomButton>
          </>
        )}
      </div>
      {!isAuthReady ? (
        <div className="h-10 w-10 sm:hidden" />
      ) : isAuthenticated ? (
        <div className="sm:hidden">
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
        </div>
      ) : (
        <div className="sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <CustomButton
                size="icon"
                radius="full"
                styleType={isScrolled ? "menu" : "unstyled"}
                className={
                  isScrolled
                    ? "h-10 w-10"
                    : "h-10 w-10 text-primary-foreground hover:bg-white/10"
                }
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">{t("common:a11y.more")}</span>
              </CustomButton>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-[18rem] flex-col gap-6 border-l border-border bg-background px-5 py-14"
            >
              <SheetTitle className="sr-only">
                {t("common:a11y.more")}
              </SheetTitle>
              <div className="flex items-center">
                <BrandLogo className="h-12 w-auto" />
              </div>
              <div className="flex flex-col gap-3">
                <CustomButton
                  asChild
                  styleType="menu"
                  radius="lg"
                  className="h-11 justify-center px-4 text-sm"
                >
                  <Link to="/registro">{t("landing:navbar.registerNow")}</Link>
                </CustomButton>
                <CustomButton
                  asChild
                  styleType="primary"
                  radius="lg"
                  className="h-11 justify-center px-4 text-sm"
                >
                  <Link to="/login">
                    <LogIn className="h-4 w-4" />
                    {t("landing:navbar.login")}
                  </Link>
                </CustomButton>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
