-- ====================================================================
-- Таблица bug_reports — сообщения из чата тестеров YupDar
-- ====================================================================
-- Назначение: webhook handleBotWebhook автоматически сохраняет сюда
-- сообщения из чата тестеров (https://t.me/+YLyl125-EfcwZjJi).
-- Claude читает эту таблицу через Supabase MCP для разбора багов.
--
-- Применить: Supabase Dashboard → SQL Editor → New query → Run
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id                    BIGSERIAL PRIMARY KEY,
  telegram_message_id   BIGINT NOT NULL,
  telegram_chat_id      BIGINT NOT NULL,
  from_user_id          BIGINT,
  from_username         TEXT,
  from_first_name       TEXT,
  text                  TEXT,
  media_type            TEXT,    -- photo / video / document / voice / video_note / null
  media_file_id         TEXT,    -- file_id Telegram для последующего скачивания
  media_file_unique_id  TEXT,    -- стабильный ID файла (для дедупликации)
  reply_to_message_id   BIGINT,
  raw                   JSONB,   -- полный update.message — на случай если нужно восстановить
  sent_at               TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'new',
                          -- new / triaged / in_progress / fixed / wont_fix / duplicate
  triage_notes          TEXT,    -- куда Claude пишет свой разбор и план фикса
  fixed_in_commit       TEXT,    -- хэш коммита-фикса для трекинга
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT bug_reports_unique_msg UNIQUE (telegram_chat_id, telegram_message_id)
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_status  ON public.bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_sent_at ON public.bug_reports(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_from    ON public.bug_reports(from_user_id);

-- RLS: только service_role пишет и читает (через SUPABASE_SERVICE_KEY на сервере)
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE  public.bug_reports IS 'Сообщения из чата тестеров YupDar. Заполняется webhook автоматически.';
COMMENT ON COLUMN public.bug_reports.media_file_id IS 'file_id Telegram — скачивается через getFile когда Claude смотрит скриншот/видео';
COMMENT ON COLUMN public.bug_reports.raw           IS 'Полный JSON message от Telegram — для восстановления контекста';
COMMENT ON COLUMN public.bug_reports.status        IS 'new → triaged → in_progress → fixed | wont_fix | duplicate';
