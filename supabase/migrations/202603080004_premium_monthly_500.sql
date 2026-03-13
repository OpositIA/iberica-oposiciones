update public.subscription_plans
set
  name = 'Premium',
  description = 'Acceso premium mensual con IA, tests y contenido completo por 5 EUR al mes.',
  price_cents = 500,
  updated_at = timezone('utc', now())
where code = 'pro-monthly';
