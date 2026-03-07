export const FREE_MONTHLY_PLAN_CODE = "free-monthly";
export const PRO_MONTHLY_PLAN_CODE = "pro-monthly";

export const FREE_PLAN_TIER = "free";
export const PRO_PLAN_TIER = "pro";

export const MONTHLY_BILLING_INTERVAL = "monthly";
export const YEARLY_BILLING_INTERVAL = "yearly";

export const getPlanKey = (
  plan:
    | {
        code?: string | null;
        tier?: string | null;
      }
    | null
    | undefined
) => {
  if (plan?.code === PRO_MONTHLY_PLAN_CODE || plan?.tier === PRO_PLAN_TIER)
    return "pro" as const;
  return "free" as const;
};

export const isPaidPlan = (
  plan:
    | {
        code?: string | null;
        tier?: string | null;
      }
    | null
    | undefined
) => getPlanKey(plan) === "pro";

export const formatPlanPriceFromCents = (
  cents: number,
  locale = "es-ES",
  currency = "EUR"
) => {
  const value = Number.isFinite(cents) ? cents / 100 : 0;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
};

