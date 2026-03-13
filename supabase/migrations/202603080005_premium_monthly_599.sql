update public.subscription_plans
set
  description = 'Acceso premium mensual con IA, tests y contenido completo por 5.99 EUR al mes.',
  price_cents = 599,
  updated_at = timezone('utc', now())
where code = 'pro-monthly';
