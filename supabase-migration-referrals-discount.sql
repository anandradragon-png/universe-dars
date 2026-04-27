-- Миграция для виральной партнёрки v2 (апрель 2026)
-- Добавляет в users:
--  - referred_by (FK на users.id) — кто пригласил этого юзера
--  - referred_at (timestamp) — когда был приглашён (для скидки 15% на 7 дней)
--
-- Запустить в Supabase Dashboard → SQL Editor → Run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);

-- Функция: проверить активна ли реф-скидка для юзера (7 дней с момента regs)
-- Используется payment.js перед созданием платежа в ЮKassa
CREATE OR REPLACE FUNCTION has_active_referral_discount(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN referred_by IS NULL OR referred_at IS NULL THEN false
      WHEN referred_at + interval '7 days' < now() THEN false
      ELSE true
    END
  FROM users
  WHERE id = p_user_id;
$$;

COMMENT ON FUNCTION has_active_referral_discount IS
  'Возвращает true если у пользователя ещё активна 15% скидка приглашённого (7 дней с registracii по реф-ссылке).';
