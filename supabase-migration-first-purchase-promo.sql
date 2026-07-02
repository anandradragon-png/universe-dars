-- =============================================
-- Миграция: гард промо «-50% первый месяц» от гонки (H3)
-- Дата: 02.07.2026
--
-- ⚠ БЕЗОПАСНА для прода — только ДОБАВЛЯЕТ колонку.
--
-- Проблема: скидка -50% на первый _1m-тариф считалась при СОЗДАНИИ инвойса от
-- (!user.first_purchase_at). Два одновременных инвойса оба видят first_purchase_at=NULL
-- → оба получают скидку → оба списывают 50% (двойная скидка).
--
-- Решение: перед выдачей скидки атомарно резервируем промо на юзере:
--   UPDATE users SET first_purchase_promo_used_at = NOW()
--   WHERE id = $1 AND first_purchase_promo_used_at IS NULL AND first_purchase_at IS NULL
--   RETURNING id;
-- Скидку получает только тот запрос, чей UPDATE вернул строку. Второй конкурентный
-- инвойс строки не получит → идёт по полной цене (displayed == charged).
--
-- Резервирование снимается (обратно в NULL) если создание инвойса у провайдера
-- упало — чтобы промо не «сгорело» из-за технической ошибки.
-- =============================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_purchase_promo_used_at TIMESTAMPTZ;
-- NULL = промо первого месяца ещё не зарезервировано/не использовано.
-- Заполняется атомарно при создании первого скидочного _1m-инвойса.

-- Проверка
SELECT 'users.first_purchase_promo_used_at' AS what,
       (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'first_purchase_promo_used_at') AS exists;
