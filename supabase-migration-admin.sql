-- =============================================
-- Миграция: Админ-панель YupDar
-- Дата: 09.05.2026
-- Запустить в Supabase Dashboard → SQL Editor → Run
-- =============================================

-- 1. Флаг "является ли админом" на пользователе
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. Флаг блокировки пользователя (понадобится для админ-действий)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;

-- 3. Таблица промо-кодов (управление через админку, без правки кода)
CREATE TABLE IF NOT EXISTS promo_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL,          -- 'crystals' | 'tier' | 'discount'
  value JSONB NOT NULL,               -- {amount: 50} | {tier: 'guardian'} | {percent: 30}
  max_uses INTEGER,                   -- NULL = безлимит
  used_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,             -- NULL = бессрочно
  is_active BOOLEAN DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  comment TEXT
);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service access" ON promo_codes FOR ALL USING (true);

-- 4. Аудит действий админов (что-кто-когда сделал)
CREATE TABLE IF NOT EXISTS admin_actions_log (
  id SERIAL PRIMARY KEY,
  admin_user_id INTEGER REFERENCES users(id),
  action VARCHAR(50) NOT NULL,        -- 'add_crystals', 'change_tier', 'block_user', 'create_promo', etc.
  target_user_id INTEGER REFERENCES users(id),
  payload JSONB,                       -- любые детали действия
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions_log(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions_log(target_user_id, created_at DESC);
ALTER TABLE admin_actions_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service access" ON admin_actions_log FOR ALL USING (true);

-- 5. Назначить Светлану админом по её Telegram username
-- Username: @AnandraDragon (в БД хранится без собаки)
-- Регистр в username не важен — сравниваем нечувствительно
UPDATE users
SET is_admin = TRUE
WHERE LOWER(username) = LOWER('AnandraDragon');

-- Проверка: должна вернуть 1 строку — Светлана
SELECT id, telegram_id, username, first_name, is_admin
FROM users
WHERE is_admin = TRUE;
