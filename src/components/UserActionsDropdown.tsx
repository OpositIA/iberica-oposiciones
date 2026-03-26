import { useAuth } from "@/auth/AuthProvider";
import CustomButton from "@/components/ui/custom-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { isPaidPlan } from "@/lib/plans";
import { applyTheme, getStoredTheme, type AppTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useUserPlanStateQuery } from "@/queries/subscriptionQueries";
import {
  Brain,
  CircleUserRound,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Moon,
  NotebookText,
  Sparkles,
  Sun,
  TimerReset
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

type UserActionsDropdownProps = {
  buttonClassName?: string;
  fallbackIconClassName?: string;
};

const UserActionsDropdown = ({
  buttonClassName,
  fallbackIconClassName
}: UserActionsDropdownProps) => {
  const { t } = useTranslation(["profile", "common"]);
  const { forceLogout, profile, user, isAuthenticated } = useAuth();
  const { data: planState } = useUserPlanStateQuery(user?.id);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const avatarUrl =
    profile?.avatarUrl ||
    (typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : "");
  const handleAvatarError = useCallback(() => setAvatarLoadError(true), []);
  const previousAvatarUrlRef = useRef(avatarUrl);
  if (previousAvatarUrlRef.current !== avatarUrl) {
    previousAvatarUrlRef.current = avatarUrl;
    if (avatarLoadError) setAvatarLoadError(false);
  }

  const accountName = useMemo(() => {
    const fullName = `${profile?.firstName ?? ""} ${
      profile?.lastName ?? ""
    }`.trim();
    return fullName || profile?.email || t("profile:layout.defaults.account");
  }, [profile, t]);

  if (!isAuthenticated) return null;

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

  const dropdownActionClassName =
    "cursor-pointer hover:bg-primary/15 hover:text-foreground data-[highlighted]:bg-primary/15 data-[highlighted]:text-foreground focus:bg-primary/15 focus:text-foreground";
  const shouldShowPlansMenuItem = !isPaidPlan(planState);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <CustomButton
          type="button"
          styleType="ghost"
          size="icon"
          radius="full"
          className={cn("h-10 w-10 overflow-hidden", buttonClassName)}
          aria-label={t("profile:layout.profileMenuLabel")}
        >
          {avatarUrl && !avatarLoadError ? (
            <img
              src={avatarUrl}
              alt={t("profile:myProfile.avatarAlt")}
              className="h-full w-full rounded-full object-cover"
              referrerPolicy="no-referrer"
              onError={handleAvatarError}
            />
          ) : (
            <CircleUserRound
              className={cn(
                "h-4 w-4 text-muted-foreground",
                fallbackIconClassName
              )}
            />
          )}
        </CustomButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="pb-1">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
            {t("profile:layout.defaults.account")}
          </p>
          <p className="truncate text-sm text-foreground">{accountName}</p>
        </DropdownMenuLabel>

        {shouldShowPlansMenuItem ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {t("profile:layout.accountMenu.sections.web")}
            </DropdownMenuLabel>
            <DropdownMenuItem asChild className={dropdownActionClassName}>
              <Link to="/perfil/planes" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {t("profile:layout.menuItems.plans")}
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {t("profile:layout.accountMenu.sections.workspace")}
        </DropdownMenuLabel>
        <DropdownMenuItem asChild className={dropdownActionClassName}>
          <Link to="/dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            {t("profile:layout.menuItems.dashboard")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={dropdownActionClassName}>
          <Link to="/perfil/mi-perfil" className="flex items-center gap-2">
            <CircleUserRound className="h-4 w-4" />
            {t("profile:layout.menuItems.profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={dropdownActionClassName}>
          <Link to="/perfil/opositAI" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            {t("profile:layout.menuItems.ia")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={dropdownActionClassName}>
          <Link to="/perfil/soporte" className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4" />
            {t("profile:layout.menuItems.support")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={dropdownActionClassName}>
          <Link to="/perfil/test" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {t("profile:layout.menuItems.test")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={dropdownActionClassName}>
          <Link to="/perfil/temario" className="flex items-center gap-2">
            <NotebookText className="h-4 w-4" />
            {t("profile:layout.menuItems.syllabus")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={dropdownActionClassName}>
          <Link to="/perfil/pomodoro" className="flex items-center gap-2">
            <TimerReset className="h-4 w-4" />
            {t("profile:layout.menuItems.study")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {t("profile:layout.accountMenu.sections.preferences")}
        </DropdownMenuLabel>
        <DropdownMenuItem
          className={dropdownActionClassName}
          onClick={handleToggleTheme}
        >
          {theme === "dark" ? (
            <Sun className="mr-2 h-4 w-4" />
          ) : (
            <Moon className="mr-2 h-4 w-4" />
          )}
          {theme === "dark"
            ? t("profile:layout.theme.activateLight")
            : t("profile:layout.theme.activateDark")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          className="cursor-pointer text-destructive hover:bg-destructive/15 hover:text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive focus:bg-destructive/15 focus:text-destructive disabled:cursor-not-allowed"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {isSigningOut
            ? t("profile:layout.signingOut")
            : t("profile:layout.closeSession")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserActionsDropdown;
