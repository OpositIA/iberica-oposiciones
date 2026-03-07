CREATE TABLE IF NOT EXISTS public.boe_sync_log (
  id_boe              TEXT PRIMARY KEY,
  titulo_ley          TEXT,
  fecha_actualizacion TEXT,
  chunks_total        INT,
  last_sync_at        TIMESTAMPTZ DEFAULT NOW()
);
