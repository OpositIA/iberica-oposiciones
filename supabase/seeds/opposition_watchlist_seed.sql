insert into public.opposition_watchlist (
  opposition_id,
  label,
  search_terms,
  exclude_terms,
  direct_boe_id,
  direct_xml_url,
  search_days_back,
  is_active
)
values
  (
    'agente-hacienda',
    'Agentes de la Hacienda Publica',
    array[
      'agentes de la hacienda publica',
      'agencia estatal de administracion tributaria'
    ]::text[],
    array[
      'correccion de errores',
      'nombramiento'
    ]::text[],
    'BOE-A-2025-27056',
    'https://www.boe.es/diario_boe/xml.php?id=BOE-A-2025-27056',
    30,
    true
  ),
  (
    'tecnicos-hacienda',
    'Tecnicos de Hacienda',
    array[
      'tecnicos de hacienda',
      'agencia estatal de administracion tributaria'
    ]::text[],
    array[
      'correccion de errores',
      'nombramiento'
    ]::text[],
    'BOE-A-2025-27149',
    'https://www.boe.es/diario_boe/xml.php?id=BOE-A-2025-27149',
    30,
    true
  )
on conflict (opposition_id, label) do update
set
  search_terms = excluded.search_terms,
  exclude_terms = excluded.exclude_terms,
  direct_boe_id = excluded.direct_boe_id,
  direct_xml_url = excluded.direct_xml_url,
  search_days_back = excluded.search_days_back,
  is_active = excluded.is_active,
  updated_at = now();
