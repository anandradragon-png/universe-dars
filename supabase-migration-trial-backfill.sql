-- =====================================================================
-- 7-ДНЕВНЫЙ ПРОБНЫЙ МАСТЕР — начисление ВСЕМ существующим пользователям.
-- =====================================================================
-- Запустить ОДИН РАЗ в Supabase → SQL Editor.
-- Идемпотентно: повторный запуск ничего не сломает (гард по subscription_log).
--
-- Логика (та же, что в коде ensureTrialAccess):
--   • у кого НЕТ активной платной подписки → тариф Мастер (premium) на 7 дней;
--   • у кого ЕСТЬ активная платная подписка → её срок +7 дней бонусом
--     (тариф и план не меняем, оплаченные дни не сгорают);
--   • админам и заблокированным — не начисляем;
--   • кому триал уже выдавали (есть запись в subscription_log) — пропускаем.
-- Новые пользователи получают триал автоматически при первом входе (в коде).

BEGIN;

-- Кандидаты: кто ещё НИ РАЗУ не получал триал.
CREATE TEMP TABLE _elig ON COMMIT DROP AS
SELECT u.id,
       (u.subscription_end > NOW()
        AND u.subscription_plan IS NOT NULL
        AND u.subscription_plan <> 'trial_7d'
        AND u.access_level <> 'basic') AS is_paid
FROM users u
WHERE COALESCE(u.is_admin, false) = false
  AND COALESCE(u.is_blocked, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM subscription_log l
    WHERE l.user_id = u.id AND l.event_type IN ('trial', 'trial_bonus')
  );

-- Платным — бонус +7 дней к сроку.
UPDATE users u
SET subscription_end = u.subscription_end + INTERVAL '7 days'
FROM _elig e
WHERE u.id = e.id AND e.is_paid;

-- Бесплатным — свежий триал Мастера.
UPDATE users u
SET access_level     = 'premium',
    subscription_plan = 'trial_7d',
    subscription_start = NOW(),
    subscription_end   = NOW() + INTERVAL '7 days'
FROM _elig e
WHERE u.id = e.id AND NOT e.is_paid;

-- Журнал (гард от повторной выдачи + аудит).
INSERT INTO subscription_log (user_id, event_type, plan, provider, amount_paid, currency, period_days)
SELECT e.id,
       CASE WHEN e.is_paid THEN 'trial_bonus' ELSE 'trial' END,
       'trial_7d', 'system', 0, 'FREE', 7
FROM _elig e;

COMMIT;

-- Проверка результата:
-- SELECT access_level, subscription_plan, COUNT(*) FROM users GROUP BY 1,2 ORDER BY 3 DESC;
