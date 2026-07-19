-- Реестр применённых миграций (ledger).
-- Причина: раньше файлы supabase-migration-*.sql не отслеживались — можно было
-- забыть применить (так случилось с app_events → «0 Даров» в сводке 12.07.2026).
-- Теперь каждая миграция обязана иметь запись здесь (ЗАКОН 7 RULES.md).
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  name        TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT
);
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON public.schema_migrations;
CREATE POLICY "Service access" ON public.schema_migrations
  FOR ALL USING (true) WITH CHECK (true);
REVOKE ALL ON public.schema_migrations FROM anon, authenticated;
