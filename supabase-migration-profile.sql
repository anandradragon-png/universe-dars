-- =============================================
-- Миграция: расширенный профиль пользователя
-- Запустить в SQL Editor на dashboard.supabase.com
-- =============================================

-- Добавить новые поля в таблицу users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS real_first_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS real_last_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender VARCHAR(10) DEFAULT '',
  ADD COLUMN IF NOT EXISTS birth_time VARCHAR(5) DEFAULT '',
  ADD COLUMN IF NOT EXISTS birth_place TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

-- Индекс по флагу заполнённости профиля (для быстрого поиска незаполненных)
CREATE INDEX IF NOT EXISTS idx_users_profile_completed ON users(profile_completed);

-- Готово. После запуска в Supabase новые поля появятся и код заработает.
