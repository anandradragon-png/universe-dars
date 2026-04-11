-- =============================================
-- Миграция: рейтинги тренажёра интуиции + титулы победителей
-- Запустить в SQL Editor на dashboard.supabase.com
-- =============================================

-- Таблица очков тренажёра интуиции
-- Одна строка на пользователя, хранит текущие очки в трёх периодах
CREATE TABLE IF NOT EXISTS intuition_scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT '',
  -- Общие очки (суммируются все сложности)
  score_daily INTEGER DEFAULT 0,
  score_weekly INTEGER DEFAULT 0,
  score_monthly INTEGER DEFAULT 0,
  score_alltime INTEGER DEFAULT 0,
  -- Дневные очки по каждой сложности отдельно (для отдельных рейтингов на день)
  score_daily_medium INTEGER DEFAULT 0,
  score_daily_hard INTEGER DEFAULT 0,
  score_daily_expert INTEGER DEFAULT 0,
  period_day DATE,     -- какой день эти очки относятся
  period_week DATE,    -- начало недели (понедельник)
  period_month DATE,   -- первое число месяца
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_intuition_scores_daily ON intuition_scores(score_daily DESC);
CREATE INDEX IF NOT EXISTS idx_intuition_scores_weekly ON intuition_scores(score_weekly DESC);
CREATE INDEX IF NOT EXISTS idx_intuition_scores_monthly ON intuition_scores(score_monthly DESC);
CREATE INDEX IF NOT EXISTS idx_intuition_scores_daily_medium ON intuition_scores(score_daily_medium DESC);
CREATE INDEX IF NOT EXISTS idx_intuition_scores_daily_hard ON intuition_scores(score_daily_hard DESC);
CREATE INDEX IF NOT EXISTS idx_intuition_scores_daily_expert ON intuition_scores(score_daily_expert DESC);
CREATE INDEX IF NOT EXISTS idx_intuition_scores_user ON intuition_scores(user_id);

ALTER TABLE intuition_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service access" ON intuition_scores FOR ALL USING (true);

-- Таблица титулов "Зал Славы" (истории победителей)
CREATE TABLE IF NOT EXISTS hall_of_fame (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title_type VARCHAR(20) NOT NULL, -- 'day', 'week', 'month'
  period_start DATE NOT NULL,      -- дата начала периода (для day = сам день)
  score INTEGER NOT NULL,          -- с каким счётом победил
  crystals_awarded INTEGER DEFAULT 0,
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, title_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_hall_user ON hall_of_fame(user_id, awarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_hall_period ON hall_of_fame(title_type, period_start DESC);

ALTER TABLE hall_of_fame ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service access" ON hall_of_fame FOR ALL USING (true);

-- Поле в users: предпочтение имени для рейтинга
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS leaderboard_name_type VARCHAR(20) DEFAULT 'real',
  -- 'real' = real_first_name + real_last_name
  -- 'tg' = telegram first_name + last_name
  -- 'custom' = leaderboard_custom_name
  ADD COLUMN IF NOT EXISTS leaderboard_custom_name TEXT DEFAULT '';

-- Готово. Новые таблицы и колонки созданы.
