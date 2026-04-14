import CustomButton from "@/components/ui/custom-button";
import { applyTheme, getStoredTheme, type AppTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ThemeToggleButtonProps = {
  className?: string;
};

const ThemeToggleButton = ({ className }: ThemeToggleButtonProps) => {
  const { t } = useTranslation(["profile"]);
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  const handleToggleTheme = () => {
    const nextTheme: AppTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    setTheme(nextTheme);
  };

  const nextThemeLabel =
    theme === "dark"
      ? t("profile:layout.theme.activateLight")
      : t("profile:layout.theme.activateDark");

  return (
    <CustomButton
      type="button"
      onClick={handleToggleTheme}
      styleType="ghost"
      size="icon"
      radius="full"
      className={cn("h-10 w-10", className)}
      aria-label={nextThemeLabel}
      title={nextThemeLabel}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </CustomButton>
  );
};

export default ThemeToggleButton;
