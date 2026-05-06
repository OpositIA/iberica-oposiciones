import { useAuth } from "@/auth/AuthProvider";
import CustomButton from "@/components/ui/custom-button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery
} from "@/queries/notificationQueries";
import { Bell } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

type NotificationsButtonProps = {
  className?: string;
};

const formatRelativeNotificationTime = (value: string, locale: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (absSeconds < 60) return rtf.format(diffSeconds, "second");
  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");

  return rtf.format(Math.round(diffHours / 24), "day");
};

const NotificationsButton = ({ className }: NotificationsButtonProps) => {
  const { t, i18n } = useTranslation(["profile"]);
  const { user } = useAuth();
  const { data: notifications = [] } = useNotificationsQuery(user?.id);
  const [open, setOpen] = useState(false);
  const markReadMutation = useMarkNotificationReadMutation(user?.id);
  const markAllReadMutation = useMarkAllNotificationsReadMutation(user?.id);
  const unreadCount = notifications.filter(
    (notification) => !notification.readAt
  ).length;
  const hasUnread = unreadCount > 0;
  const locale = useMemo(
    () =>
      i18n.resolvedLanguage?.toLowerCase().startsWith("en") ? "en-US" : "es-ES",
    [i18n.resolvedLanguage]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <CustomButton
              type="button"
              styleType="ghost"
              size="icon"
              radius="full"
              className={cn("relative h-10 w-10", className)}
              aria-label={t("profile:layout.notifications.open")}
              title={t("profile:layout.notifications.open")}
            >
              <Bell className="h-4 w-4" />
              {hasUnread ? (
                <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-destructive" />
              ) : null}
            </CustomButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {t("profile:layout.notifications.title")}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-[min(21rem,calc(100vw-2rem))] border-border/70 p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t("profile:layout.notifications.title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {hasUnread
                ? t("profile:layout.notifications.unreadCount", {
                    count: unreadCount
                  })
                : t("profile:layout.notifications.allRead")}
            </p>
          </div>
          {hasUnread ? (
            <button
              type="button"
              className="text-xs font-medium text-primary transition-colors hover:text-primary/75 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate()}
            >
              {t("profile:layout.notifications.markAllRead")}
            </button>
          ) : null}
        </div>
        <div className="max-h-[22rem] overflow-y-auto py-1">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("profile:layout.notifications.empty")}
            </div>
          ) : (
            notifications.map((notification) => {
              const ticketUrl = notification.entityId
                ? `/soporte?tab=tickets&ticket=${notification.entityId}`
                : "/soporte?tab=tickets";
              const timeLabel = formatRelativeNotificationTime(
                notification.createdAt,
                locale
              );

              return (
                <Link
                  key={notification.id}
                  to={ticketUrl}
                  className="flex gap-3 px-4 py-3 transition-colors hover:bg-secondary/70"
                  onClick={() => {
                    if (!notification.readAt)
                      markReadMutation.mutate(notification.id);
                    setOpen(false);
                  }}
                >
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 rounded-full",
                      notification.readAt ? "bg-border" : "bg-destructive"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {t("profile:layout.notifications.supportReplyTitle", {
                        ticketCode: notification.ticketCode
                      })}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {notification.ticketSubject ||
                        t("profile:layout.notifications.supportReplyFallback")}
                    </span>
                    {timeLabel ? (
                      <span className="mt-1 block text-[11px] text-muted-foreground/80">
                        {timeLabel}
                      </span>
                    ) : null}
                  </span>
                </Link>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationsButton;
