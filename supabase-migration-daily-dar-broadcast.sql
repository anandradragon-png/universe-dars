-- Ежедневная рассылка «Дар дня» в личку @YupDarBot.
-- 1) Флаг отписки именно от утренних сообщений (чтобы пользователь глушил рассылку,
--    а не блокировал бота целиком — иначе теряются все касания: оплаты, поддержка).
-- 2) Журнал отправок broadcast: и защита от двойной отправки за один день
--    (идемпотентность по send_date), и метрики (сколько отправлено/ошибок/блокировок).
-- Пишет/читает только сервер и автономный канал через service-role, поэтому RLS
-- закрыта для anon/authenticated (ЗАКОН 7 RULES.md).

-- 1) Отписка от утренней рассылки
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS daily_dar_optout boolean NOT NULL DEFAULT false;

-- 2) Журнал рассылок «Дар дня»
CREATE TABLE IF NOT EXISTS public.daily_broadcast_log (
  send_date   DATE PRIMARY KEY,
  dar_code    TEXT,
  cta_index   INT,
  recipients  INT NOT NULL DEFAULT 0,
  sent        INT NOT NULL DEFAULT 0,
  failed      INT NOT NULL DEFAULT 0,
  blocked     INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_broadcast_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON public.daily_broadcast_log;
CREATE POLICY "Service access" ON public.daily_broadcast_log
  FOR ALL USING (true) WITH CHECK (true);
REVOKE ALL ON public.daily_broadcast_log FROM anon, authenticated;

INSERT INTO public.schema_migrations (name, note)
VALUES ('supabase-migration-daily-dar-broadcast',
        'users.daily_dar_optout + daily_broadcast_log (идемпотентность+метрики)')
ON CONFLICT (name) DO NOTHING;
