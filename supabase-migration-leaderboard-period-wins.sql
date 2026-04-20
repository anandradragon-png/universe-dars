-- =============================================
-- Миграция: побед по периодам в рейтинге
-- =============================================
-- Проблема: games_won хранил одно число за всю жизнь.
-- В рейтинге Мага Дня/Недели/Месяца показывалось одно и то же.
-- Добавляем per-period счётчики, сбрасываем при смене периода.

ALTER TABLE intuition_scores
  ADD COLUMN IF NOT EXISTS games_won_daily INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS games_won_weekly INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS games_won_monthly INTEGER DEFAULT 0;

-- Готово.
