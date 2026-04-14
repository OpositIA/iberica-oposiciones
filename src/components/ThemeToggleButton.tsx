import CustomButton from "@/components/ui/custom-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

type ThemeToggleButtonProps = {
  className?: string;
};

const ThemeToggleButton = ({ className }: ThemeToggleButtonProps) => {
  const { t } = useTranslation(["profile"]);
  const { theme, toggleTheme } = useTheme();

  const handleToggleTheme = () => {
    toggleTheme();
  };

  const nextThemeLabel =
    theme === "dark"
      ? t("profile:layout.theme.activateLight")
      : t("profile:layout.theme.activateDark");
  const tooltipLabel =
    theme === "dark"
      ? t("profile:layout.theme.lightTitle")
      : t("profile:layout.theme.darkTitle");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
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
      </TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
};

export default ThemeToggleButton;
