-- Таблица обратной связи (жалобы/идеи от пользователей).
-- Причина: таблица feedback уже существовала в проде, но была создана вручную
-- мимо канала — не было ни файла-миграции, ни записи в реестре schema_migrations
-- (дрейф схемы, ЗАКОН 7). Этот файл документирует фактическую схему прод-таблицы,
-- чтобы схема была воспроизводима. IF NOT EXISTS — существующие данные не трогаем.
-- Пишет/читает только сервер через service-role (public/api/feedback.js), поэтому
-- RLS закрыта для anon/authenticated.
CREATE TABLE IF NOT EXISTS public.feedback (
  id          BIGSERIAL PRIMARY KEY,
  category    TEXT,
  message     TEXT NOT NULL,
  page        TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON public.feedback;
CREATE POLICY "Service access" ON public.feedback
  FOR ALL USING (true) WITH CHECK (true);
REVOKE ALL ON public.feedback FROM anon, authenticated;
