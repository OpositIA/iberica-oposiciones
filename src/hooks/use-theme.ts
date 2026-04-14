import { applyTheme, getStoredTheme, type AppTheme } from "@/lib/theme";
import { useCallback, useEffect, useState } from "react";

export const useTheme = () => {
  const [theme, setThemeState] = useState<AppTheme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((currentTheme) =>
      currentTheme === "dark" ? "light" : "dark"
    );
  }, []);

  return { theme, setTheme, toggleTheme } as const;
};
