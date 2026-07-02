-- =============================================
-- Миграция: идемпотентность платёжных вебхуков
-- Дата: 02.07.2026
--
-- ⚠ БЕЗОПАСНА для прода — только ДОБАВЛЯЕТ таблицу.
--
-- Проблема: повторная доставка (retry/replay) успешного successful_payment /
-- payment.confirmed / payment.succeeded в НОВОЙ схеме (plan_*/addon_*) применялась
-- дважды → лишние дни подписки / дублирование покупок add-on.
--
-- Решение: перед применением платежа делаем insert-if-absent в processed_payments
-- по уникальному (provider, payment_key). UNIQUE-констрейнт делает повтор no-op:
-- вторая вставка падает с 23505 (unique_violation) → мы понимаем «уже обработан».
-- =============================================

CREATE TABLE IF NOT EXISTS processed_payments (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(20) NOT NULL,       -- 'stars' | 'darai' | 'yookassa' | 'tbank'
  payment_key VARCHAR(255) NOT NULL,   -- уникальный id платежа провайдера
  -- stars:    telegram_payment_charge_id
  -- darai:    invoice_id
  -- yookassa: yookassa_payment_id
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind VARCHAR(20),                    -- 'plan' | 'addon' | 'book' (для аудита)
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider, payment_key)
);

CREATE INDEX IF NOT EXISTS idx_processed_payments_key
  ON processed_payments(provider, payment_key);

ALTER TABLE processed_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON processed_payments;
CREATE POLICY "Service access" ON processed_payments FOR ALL USING (true);

-- Проверка
SELECT 'processed_payments' AS what,
       (SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'processed_payments') AS exists;
