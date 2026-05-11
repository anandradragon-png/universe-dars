-- =============================================
-- Миграция: новая система тарифов и подписок YupDar
-- Дата: 11.05.2026
-- Ветка: feat/pricing-v2
--
-- ⚠ ВАЖНО: эта миграция БЕЗОПАСНА для прода.
-- Она только ДОБАВЛЯЕТ новые поля и таблицы.
-- Старый код их не использует.
-- Применять можно до merge — никаких разрушений данных.
-- =============================================

-- ============== ПОДПИСКИ ==============

-- 1. Новые поля в users для подписочной модели
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(30);
-- Возможные значения:
-- NULL                  — нет активной подписки
-- 'guardian_1m'         — Хранитель 1 месяц
-- 'guardian_3m'         — Хранитель 3 месяца
-- 'guardian_6m'         — Хранитель 6 месяцев
-- 'guardian_12m'        — Хранитель 12 месяцев
-- 'master_1m', 'master_3m', 'master_6m', 'master_12m'
-- 'master_year_gift'    — подарок (Алина)

ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end TIMESTAMPTZ;
-- NULL = бессрочно (подарки, спец-доступ)
-- < NOW() = подписка истекла, надо откатить access_level в код

ALTER TABLE users ADD COLUMN IF NOT EXISTS book_purchased BOOLEAN DEFAULT FALSE;
-- TRUE = купил Книгу как разовый продукт. Сохраняется даже после окончания подписки.

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_purchase_at TIMESTAMPTZ;
-- Для промо «-50% на первый месяц». NULL = ещё ни разу не платил.

CREATE INDEX IF NOT EXISTS idx_users_subscription_end ON users(subscription_end)
  WHERE subscription_end IS NOT NULL;

-- 2. Лог подписочных операций (для аналитики и отладки)
CREATE TABLE IF NOT EXISTS subscription_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,
  -- 'subscribe' = новая подписка
  -- 'extend' = продление (доплатил)
  -- 'upgrade' = переход на больший тариф
  -- 'expire' = подписка истекла (автоматически)
  -- 'admin_grant' = админ выдал вручную
  -- 'admin_revoke' = админ отозвал
  plan VARCHAR(30),
  provider VARCHAR(20),
  -- 'yookassa' | 'stars' | 'darai' | 'admin' | 'system'
  amount_paid NUMERIC(10, 2),
  currency VARCHAR(10),
  period_days INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscription_log_user ON subscription_log(user_id, created_at DESC);
ALTER TABLE subscription_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON subscription_log;
CREATE POLICY "Service access" ON subscription_log FOR ALL USING (true);

-- ============== ДНЕВНЫЙ ЛИМИТ ОРАКУЛА ==============

-- 3. Счётчик использования Оракула в день
-- Альтернатива - считать каждый раз из oracle_cache, но это медленнее.
CREATE TABLE IF NOT EXISTS daily_oracle_usage (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date_key DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, date_key)
);
ALTER TABLE daily_oracle_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON daily_oracle_usage;
CREATE POLICY "Service access" ON daily_oracle_usage FOR ALL USING (true);

-- ============== СОВМЕСТИМОСТЬ — МЕСЯЧНЫЙ ЛИМИТ ==============

-- 4. Счётчик совместимостей в месяце (для Хранителя — 5/мес, Странник — 1 всего)
CREATE TABLE IF NOT EXISTS compatibility_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  month_key VARCHAR(7) NOT NULL, -- '2026-05'
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, month_key)
);
CREATE INDEX IF NOT EXISTS idx_compat_usage_user ON compatibility_usage(user_id, month_key);
ALTER TABLE compatibility_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON compatibility_usage;
CREATE POLICY "Service access" ON compatibility_usage FOR ALL USING (true);

-- ============== ПРОГРЕССИВНЫЙ DAILY LOGIN ==============

-- 5. Поля для прогрессивного бонуса при ежедневном входе.
-- Цикл 7 дней: 1,2,4,6,10,12,15💎, затем заново.
-- Пропуск дня = откат на день 1.
-- Уже есть users.streak_count и users.last_streak_date — переиспользуем.
-- daily_streak_day хранит позицию в 7-дневном цикле (1..7).
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_streak_day SMALLINT DEFAULT 0;

-- ============== AD-ON ПОКУПКИ (одноразовые временные бонусы) ==============

-- 6. Активные одноразовые покупки (например, безлимит Оракула на 7 дней)
CREATE TABLE IF NOT EXISTS user_addons (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  addon_type VARCHAR(30) NOT NULL,
  -- 'oracle_unlimited_7d' — безлимит Оракула 7 дней
  -- 'compatibility_pdf' — глубокая совместимость PDF (разовый)
  -- 'child_book_chapter' — 1 глава Книги для Родителей
  expires_at TIMESTAMPTZ, -- NULL = разовый продукт без срока (например глава)
  consumed_at TIMESTAMPTZ, -- для разовых: когда применил
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_addons_user ON user_addons(user_id);
CREATE INDEX IF NOT EXISTS idx_addons_active ON user_addons(user_id, addon_type)
  WHERE consumed_at IS NULL;
ALTER TABLE user_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON user_addons;
CREATE POLICY "Service access" ON user_addons FOR ALL USING (true);

-- ============== HERO JOURNEY ANTI-FARM ==============

-- 7. Защита от повторной выдачи кристаллов за прохождение Hero Journey.
-- В hero_journeys уже есть completed_at и crystals_earned — этого достаточно,
-- но добавим явный флаг чтобы было прозрачно.
ALTER TABLE hero_journeys ADD COLUMN IF NOT EXISTS crystals_paid_out BOOLEAN DEFAULT FALSE;
-- TRUE = за это путешествие УЖЕ выданы кристаллы, повторно не давать.

-- ============== ПРОВЕРКА ==============

-- Покажет какие новые поля и таблицы появились
SELECT 'users new fields' AS what, count(*) AS n
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('subscription_plan', 'subscription_start', 'subscription_end',
                      'book_purchased', 'first_purchase_at', 'daily_streak_day');

SELECT 'new tables' AS what, count(*) AS n
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('subscription_log', 'daily_oracle_usage',
                     'compatibility_usage', 'user_addons');

-- Должно быть: 6 новых полей в users + 4 новые таблицы
