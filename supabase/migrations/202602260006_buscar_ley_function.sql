DO $$
DECLARE
  v_id_type TEXT;
  v_sql TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
  INTO v_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'leyes_boe'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_id_type IS NULL THEN
    v_id_type := 'bigint';
  END IF;

  EXECUTE 'DROP FUNCTION IF EXISTS public.buscar_ley(vector, double precision, integer, text, text)';

  v_sql := format($fn$
CREATE FUNCTION public.buscar_ley(
    query_embedding  vector(3072),
    match_threshold  FLOAT    DEFAULT 0.35,
    match_count      INT      DEFAULT 8,
    filter_id_boe    TEXT     DEFAULT NULL,
    filter_unit_type TEXT     DEFAULT NULL
)
RETURNS TABLE (
    id              %s,
    id_boe          TEXT,
    titulo_ley      TEXT,
    articulo_num    TEXT,
    unit_type       TEXT,
    unit_id         TEXT,
    apartado_path   TEXT,
    contenido       TEXT,
    url_norma       TEXT,
    fecha_actualizacion DATE,
    fecha_vigencia  DATE,
    fecha_publicacion DATE,
    eli             TEXT,
    similarity      FLOAT
)
LANGUAGE sql STABLE AS $body$
    SELECT
        lb.id,
        lb.id_boe,
        lb.titulo_ley,
        lb.articulo_num,
        lb.unit_type,
        lb.unit_id,
        lb.apartado_path,
        lb.contenido,
        lb.url_norma,
        lb.fecha_actualizacion,
        lb.fecha_vigencia,
        lb.fecha_publicacion,
        lb.eli,
        1 - (lb.embedding <=> query_embedding) AS similarity
    FROM leyes_boe lb
    WHERE
        (filter_id_boe IS NULL OR lb.id_boe = filter_id_boe)
        AND (filter_unit_type IS NULL OR lb.unit_type = filter_unit_type)
        AND 1 - (lb.embedding <=> query_embedding) >= match_threshold
    ORDER BY lb.embedding <=> query_embedding
    LIMIT match_count;
$body$;
$fn$, v_id_type);

  EXECUTE v_sql;
END $$;
