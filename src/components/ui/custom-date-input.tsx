import {
  addMonths,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfToday,
  type Locale
} from "date-fns";
import { enUS, es } from "date-fns/locale";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import * as React from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import { useTranslation } from "react-i18next";

import { normalizeLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

import CustomButton from "./custom-button";
import CustomSelect from "./custom-select";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const ISO_DATE_FORMAT = "yyyy-MM-dd";
const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type NativeInputProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "defaultValue" | "onChange" | "size" | "type" | "value"
>;

export type CustomDateInputProps = NativeInputProps & {
  contentClassName?: string;
  defaultValue?: string;
  fromYear?: number;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  toYear?: number;
  value?: string;
};

const normalizeDateValue = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const trimmedValue = value.trim();
  if (!DATE_VALUE_PATTERN.test(trimmedValue)) return "";

  const parsedDate = parseISO(trimmedValue);
  if (!isValid(parsedDate)) return "";
  if (format(parsedDate, ISO_DATE_FORMAT) !== trimmedValue) return "";

  return trimmedValue;
};

const clampDateToBounds = (
  date: Date,
  minDate?: Date,
  maxDate?: Date
): Date => {
  if (minDate && date < minDate) return minDate;
  if (maxDate && date > maxDate) return maxDate;
  return date;
};

const clampMonthToBounds = (date: Date, minDate?: Date, maxDate?: Date) => {
  const normalizedDate = startOfMonth(date);
  const minMonth = minDate ? startOfMonth(minDate) : undefined;
  const maxMonth = maxDate ? startOfMonth(maxDate) : undefined;

  if (minMonth && normalizedDate < minMonth) return minMonth;
  if (maxMonth && normalizedDate > maxMonth) return maxMonth;
  return normalizedDate;
};

const buildSyntheticChangeEvent = (name: string | undefined, value: string) => {
  const syntheticTarget = {
    name,
    value
  } as EventTarget & HTMLInputElement;

  return {
    target: syntheticTarget,
    currentTarget: syntheticTarget
  } as React.ChangeEvent<HTMLInputElement>;
};

const formatDisplayDate = (
  date: Date,
  localeKey: "es" | "en",
  dateLocale: Locale
) =>
  format(date, localeKey === "en" ? "MMMM d, yyyy" : "d 'de' MMMM yyyy", {
    locale: dateLocale
  });

const CustomDateInput = React.forwardRef<
  HTMLButtonElement,
  CustomDateInputProps
>(
  (
    {
      className,
      contentClassName,
      defaultValue,
      disabled,
      form,
      fromYear,
      id,
      max,
      min,
      name,
      onBlur,
      onChange,
      placeholder,
      required,
      toYear,
      value
    },
    ref
  ) => {
    const { t, i18n } = useTranslation("common");
    const localeKey = normalizeLocale(i18n.resolvedLanguage);
    const dateLocale = localeKey === "en" ? enUS : es;
    const todayRef = React.useRef(startOfToday());
    const today = todayRef.current;
    const normalizedMin = React.useMemo(() => normalizeDateValue(min), [min]);
    const normalizedMax = React.useMemo(() => normalizeDateValue(max), [max]);
    const minDate = React.useMemo(
      () => (normalizedMin ? parseISO(normalizedMin) : undefined),
      [normalizedMin]
    );
    const maxDate = React.useMemo(
      () => (normalizedMax ? parseISO(normalizedMax) : undefined),
      [normalizedMax]
    );
    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
      normalizeDateValue(defaultValue)
    );
    const [open, setOpen] = React.useState(false);

    const currentValue = React.useMemo(
      () => (isControlled ? normalizeDateValue(value) : uncontrolledValue),
      [isControlled, uncontrolledValue, value]
    );
    const selectedDate = React.useMemo(
      () => (currentValue ? parseISO(currentValue) : undefined),
      [currentValue]
    );
    const initialMonth = clampDateToBounds(
      selectedDate ?? today,
      minDate,
      maxDate
    );
    const [month, setMonth] = React.useState(startOfMonth(initialMonth));
    const minMonth = minDate ? startOfMonth(minDate) : undefined;
    const maxMonth = maxDate ? startOfMonth(maxDate) : undefined;

    React.useEffect(() => {
      if (!open) return;
      const nextSelectedDate = currentValue
        ? parseISO(currentValue)
        : undefined;
      setMonth(clampMonthToBounds(nextSelectedDate ?? today, minDate, maxDate));
    }, [currentValue, maxDate, minDate, open, today]);

    const resolvedFromYear =
      fromYear ??
      minDate?.getFullYear() ??
      Math.max(1900, today.getFullYear() - 100);
    const resolvedToYear =
      toYear ?? maxDate?.getFullYear() ?? today.getFullYear() + 10;
    const calendarFromYear = Math.min(resolvedFromYear, resolvedToYear);
    const calendarToYear = Math.max(resolvedFromYear, resolvedToYear);
    const disabledDays: Matcher[] = [];
    const currentViewYear = month.getFullYear();
    const monthOptions = Array.from({ length: 12 }, (_, index) => index)
      .filter((monthIndex) => {
        if (minMonth && currentViewYear === minMonth.getFullYear())
          if (monthIndex < minMonth.getMonth()) return false;

        if (maxMonth && currentViewYear === maxMonth.getFullYear())
          if (monthIndex > maxMonth.getMonth()) return false;

        return true;
      })
      .map((monthIndex) => ({
        value: String(monthIndex),
        label: format(new Date(2026, monthIndex, 1), "LLLL", {
          locale: dateLocale
        })
      }));
    const yearOptions = Array.from(
      { length: calendarToYear - calendarFromYear + 1 },
      (_, index) => calendarFromYear + index
    );
    const isPreviousMonthDisabled = Boolean(
      minMonth && month.getTime() <= minMonth.getTime()
    );
    const isNextMonthDisabled = Boolean(
      maxMonth && month.getTime() >= maxMonth.getTime()
    );

    if (minDate) disabledDays.push({ before: minDate });
    if (maxDate) disabledDays.push({ after: maxDate });

    // Disable outside days
    disabledDays.push((day: Date) => {
      return (
        day.getMonth() !== month.getMonth() ||
        day.getFullYear() !== currentViewYear
      );
    });

    const commitValue = (nextValue: string) => {
      if (!isControlled) setUncontrolledValue(nextValue);
      onChange?.(buildSyntheticChangeEvent(name, nextValue));
    };

    const handleDateSelect = (nextDate?: Date) => {
      if (!nextDate) {
        if (!required) commitValue("");
        setOpen(false);
        return;
      }

      const nextValue = format(nextDate, ISO_DATE_FORMAT);
      commitValue(nextValue);
      setMonth(startOfMonth(nextDate));
      setOpen(false);
    };

    const handleHeaderMonthChange = (
      event: React.ChangeEvent<HTMLSelectElement>
    ) => {
      const nextMonthIndex = Number.parseInt(event.target.value, 10);
      if (Number.isNaN(nextMonthIndex)) return;

      setMonth((currentMonth) =>
        clampMonthToBounds(
          new Date(currentMonth.getFullYear(), nextMonthIndex, 1),
          minDate,
          maxDate
        )
      );
    };

    const handleHeaderYearChange = (
      event: React.ChangeEvent<HTMLSelectElement>
    ) => {
      const nextYear = Number.parseInt(event.target.value, 10);
      if (Number.isNaN(nextYear)) return;

      setMonth((currentMonth) =>
        clampMonthToBounds(
          new Date(nextYear, currentMonth.getMonth(), 1),
          minDate,
          maxDate
        )
      );
    };

    const handleBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
      onBlur?.(event as unknown as React.FocusEvent<HTMLInputElement>);
    };

    const displayValue = selectedDate
      ? formatDisplayDate(selectedDate, localeKey, dateLocale)
      : (placeholder ?? t("datePicker.placeholder"));

    return (
      <Popover modal={false} onOpenChange={setOpen} open={open}>
        <input
          disabled={disabled}
          form={form}
          name={name}
          required={required}
          type="hidden"
          value={currentValue}
        />
        <PopoverTrigger asChild>
          <button
            aria-label={t("datePicker.openCalendar")}
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              selectedDate ? "text-foreground" : "text-muted-foreground",
              className
            )}
            disabled={disabled}
            id={id}
            onBlur={handleBlur}
            ref={ref}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                <CalendarDays className="h-4 w-4" />
              </span>
              <span className="truncate text-left">{displayValue}</span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 transition-transform duration-200",
                open ? "rotate-180 text-primary" : "text-muted-foreground"
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className={cn(
            "w-[min(19rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-auto rounded-[1.25rem] border border-border/70 bg-popover p-3 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)]",
            contentClassName
          )}
          collisionPadding={8}
          sideOffset={10}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <CustomSelect
                  aria-label={t("datePicker.month")}
                  contentClassName="rounded-xl border border-border/70 bg-popover shadow-[0_18px_48px_-30px_rgba(15,23,42,0.4)]"
                  onChange={handleHeaderMonthChange}
                  value={String(month.getMonth())}
                  className="h-9 min-h-9 rounded-xl border-border/70 bg-background px-3 py-2 text-sm font-medium capitalize shadow-none"
                >
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </CustomSelect>
              </div>
              <div className="w-[5.5rem] shrink-0">
                <CustomSelect
                  aria-label={t("datePicker.year")}
                  contentClassName="rounded-xl border border-border/70 bg-popover shadow-[0_18px_48px_-30px_rgba(15,23,42,0.4)]"
                  onChange={handleHeaderYearChange}
                  value={String(month.getFullYear())}
                  className="h-9 min-h-9 rounded-xl border-border/70 bg-background px-3 py-2 text-sm font-medium shadow-none"
                >
                  {yearOptions.map((yearOption) => (
                    <option key={yearOption} value={yearOption}>
                      {yearOption}
                    </option>
                  ))}
                </CustomSelect>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <CustomButton
                  aria-label={t("datePicker.previousMonth")}
                  disabled={isPreviousMonthDisabled}
                  onClick={() =>
                    setMonth((currentMonth) =>
                      clampMonthToBounds(
                        addMonths(currentMonth, -1),
                        minDate,
                        maxDate
                      )
                    )
                  }
                  radius="xl"
                  size="iconSm"
                  styleType="subtle"
                  type="button"
                  className="h-9 w-9 border-border/70"
                >
                  <ChevronLeft className="h-4 w-4" />
                </CustomButton>
                <CustomButton
                  aria-label={t("datePicker.nextMonth")}
                  disabled={isNextMonthDisabled}
                  onClick={() =>
                    setMonth((currentMonth) =>
                      clampMonthToBounds(
                        addMonths(currentMonth, 1),
                        minDate,
                        maxDate
                      )
                    )
                  }
                  radius="xl"
                  size="iconSm"
                  styleType="subtle"
                  type="button"
                  className="h-9 w-9 border-border/70"
                >
                  <ChevronRight className="h-4 w-4" />
                </CustomButton>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1rem]">
              <DayPicker
                className={cn(
                  "w-full",
                  "[&_.rdp-months]:flex [&_.rdp-months]:justify-center",
                  "[&_.rdp-month]:w-full",
                  "[&_.rdp-caption]:hidden",
                  "[&_.rdp-table]:w-full [&_.rdp-table]:border-separate [&_.rdp-table]:border-spacing-x-1 [&_.rdp-table]:border-spacing-y-1",
                  "[&_.rdp-head_cell]:h-7 [&_.rdp-head_cell]:w-9 [&_.rdp-head_cell]:px-0 [&_.rdp-head_cell]:text-center [&_.rdp-head_cell]:text-[0.68rem] [&_.rdp-head_cell]:font-semibold [&_.rdp-head_cell]:uppercase [&_.rdp-head_cell]:tracking-[0.18em] [&_.rdp-head_cell]:text-muted-foreground",
                  "[&_.rdp-cell]:h-9 [&_.rdp-cell]:w-9 [&_.rdp-cell]:p-0 [&_.rdp-cell]:text-center",
                  "[&_.rdp-day]:flex [&_.rdp-day]:h-9 [&_.rdp-day]:w-9 [&_.rdp-day]:items-center [&_.rdp-day]:justify-center [&_.rdp-day]:rounded-xl [&_.rdp-day]:border [&_.rdp-day]:border-transparent [&_.rdp-day]:text-sm [&_.rdp-day]:font-medium [&_.rdp-day]:text-foreground [&_.rdp-day]:transition-all [&_.rdp-day]:duration-200 [&_.rdp-day:hover]:border-primary/25 [&_.rdp-day:hover]:bg-primary/10 [&_.rdp-day:hover]:text-foreground",
                  "[&_.rdp-day_outside]:text-muted-foreground/45",
                  "[&_.rdp-vhidden]:sr-only"
                )}
                components={{
                  Caption: () => null
                }}
                disabled={disabledDays.length > 0 ? disabledDays : undefined}
                fixedWeeks
                fromMonth={minMonth}
                locale={dateLocale}
                mode="single"
                month={month}
                modifiersClassNames={{
                  disabled:
                    "cursor-not-allowed !border-transparent !bg-muted/45 !text-muted-foreground/50 !opacity-100 hover:!border-transparent hover:!bg-muted/45 hover:!text-muted-foreground/50",
                  selected:
                    "border-primary bg-primary text-primary-foreground shadow-[0_14px_28px_-18px_hsl(var(--primary)/0.95)] hover:border-primary hover:bg-primary hover:text-primary-foreground",
                  today: "border-accent/25 bg-accent/8 text-accent"
                }}
                onMonthChange={(nextMonth) =>
                  setMonth(clampMonthToBounds(nextMonth, minDate, maxDate))
                }
                onSelect={handleDateSelect}
                selected={selectedDate}
                showOutsideDays
                toMonth={maxMonth}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);

CustomDateInput.displayName = "CustomDateInput";

export default CustomDateInput;
