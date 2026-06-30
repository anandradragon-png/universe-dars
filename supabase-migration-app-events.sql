-- ====================================================================
-- Таблица app_events — журнал действий пользователей для аналитики
-- ====================================================================
-- Заполняется приложением (api/_lib/notify.js -> logEvent).
-- Нужна для ежедневной сводки админу (Тип Б): сколько заходов,
-- какие Дары смотрели чаще, сколько расшифровок/Оракулов,
-- попытки и успешные оплаты.
--
-- Применить: Supabase Dashboard → SQL Editor → New query → Run
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.app_events (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,
  props       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_events_created_at ON public.app_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_events_type       ON public.app_events(event_type);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.app_events IS 'Журнал действий пользователей для ежедневной сводки админу.';
