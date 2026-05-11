-- =============================================
-- Hero Journey 2.0 — система открытия даров
-- Дата: 11.05.2026
-- =============================================
--
-- Что добавляет:
--  1. Таблица hero_journey_unlocks — явный реестр «у юзера открыт дар X»
--  2. Поле unlock_source в hero_journeys (для аналитики)
--
-- Идемпотентно, безопасно для прода.

CREATE TABLE IF NOT EXISTS hero_journey_unlocks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  dar_code VARCHAR(10) NOT NULL,
  source VARCHAR(30) NOT NULL,
  -- 'own'                — свой родной дар
  -- 'relative'           — родственник из Семьи (extended/premium)
  -- 'subscription'       — открыто пока действует Мастер-подписка
  -- 'referral_preview'   — друг рассчитал дар → только превью (1 шаг)
  -- 'referral_full'      — друг купил что-то → полное Путешествие
  -- 'crystals'           — куплено за кристаллы
  -- 'crystals_relative'  — родственник за кристаллы (-50%)
  -- 'purchase'           — куплено за деньги (stars/yookassa/darai)
  -- 'purchase_relative'  — родственник за деньги (-50%)
  -- 'upgrade_paid'       — доплачено после превью (-30%)
  -- 'admin_grant'        — выдано админом вручную
  is_preview_only BOOLEAN DEFAULT FALSE,
  -- TRUE = доступен только 1-й шаг (Пробуждение), для апгрейда нужна доплата
  -- FALSE = доступны все 7 шагов

  source_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  upgraded_at TIMESTAMPTZ,
  -- Заполняется когда превью апгрейдится до полного (через доплату или покупку друга)

  UNIQUE(user_id, dar_code)
);

CREATE INDEX IF NOT EXISTS idx_hju_user ON hero_journey_unlocks(user_id);
CREATE INDEX IF NOT EXISTS idx_hju_dar ON hero_journey_unlocks(dar_code);

ALTER TABLE hero_journey_unlocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON hero_journey_unlocks;
CREATE POLICY "Service access" ON hero_journey_unlocks FOR ALL USING (true);

-- Поле в hero_journeys для аналитики и проверок
ALTER TABLE hero_journeys ADD COLUMN IF NOT EXISTS unlock_source VARCHAR(30);
ALTER TABLE hero_journeys ADD COLUMN IF NOT EXISTS is_preview_only BOOLEAN DEFAULT FALSE;

-- Проверка
SELECT 'hero_journey_unlocks created' AS msg,
       COUNT(*) AS rows_initial FROM hero_journey_unlocks;
