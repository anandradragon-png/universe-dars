-- ====================================================================
-- Таблица system_health — логи проверок состояния yupdar.com
-- ====================================================================
-- Заполняется Vercel Cron Job каждые 5 минут (api/health-check.js).
-- Хранит состояние «было плохо / стало хорошо» — чтобы не спамить
-- Свету одинаковыми уведомлениями.
--
-- Применить: Supabase Dashboard → SQL Editor → New query → Run
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.system_health (
  id           BIGSERIAL PRIMARY KEY,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_down      BOOLEAN NOT NULL,
  site_status  INTEGER,
  site_ms      INTEGER,
  api_status   INTEGER,
  api_ms       INTEGER,
  site_error   TEXT,
  api_error    TEXT
);

CREATE INDEX IF NOT EXISTS idx_system_health_checked_at ON public.system_health(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_is_down    ON public.system_health(is_down) WHERE is_down = true;

ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.system_health IS 'Логи мониторинга yupdar.com. Cron-задача каждые 5 минут.';
