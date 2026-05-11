-- =============================================
-- Зачистка тестеров + подарок Алине + админ Светлана на premium
-- Дата: 11.05.2026
-- ЗАПУСКАТЬ ТОЛЬКО ПОСЛЕ MERGE feat/pricing-v2 -> main
-- (когда Vercel задеплоит новую версию с тарифами)
-- =============================================
--
-- Что делает этот скрипт:
--  1. Закрывает доступ всем пользователям, кроме @AnandraDragon (админ) и @alina2301
--  2. Дарит Алине Мастер на год (до 11.05.2027) — за то что первая купила Книгу
--  3. Ставит Светлане Мастер бессрочно — как админу для полного доступа к фичам
--  4. Логирует подарки в subscription_log для аудита
--  5. Возвращает контрольный SELECT для проверки

-- ============== ШАГ 1: зачистка всех ==============
-- Сбросить access_level и подписочные поля для всех, кроме админа и Алины.
-- Кристаллы НЕ трогаем — они заработаны игрой, пусть остаются.
-- birth_date, dar_code, профильные данные — сохраняем.
UPDATE users
SET
  access_level = 'basic',
  subscription_plan = NULL,
  subscription_start = NULL,
  subscription_end = NULL,
  book_purchased = FALSE,
  first_purchase_at = NULL
WHERE LOWER(COALESCE(username, '')) NOT IN ('anandradragon', 'alina2301');

-- ============== ШАГ 2: Алина — Мастер на год ==============
UPDATE users
SET
  access_level = 'premium',
  subscription_plan = 'master_year_gift',
  subscription_start = NOW(),
  subscription_end = '2027-05-11T00:00:00Z',
  book_purchased = TRUE,
  first_purchase_at = COALESCE(first_purchase_at, NOW())
WHERE LOWER(username) = 'alina2301';

-- Запись в лог
INSERT INTO subscription_log (user_id, event_type, plan, provider, amount_paid, currency, period_days, metadata)
SELECT
  id,
  'admin_grant',
  'master_year_gift',
  'admin',
  0,
  'GIFT',
  365,
  jsonb_build_object(
    'reason', 'Первая покупательница Книги Даров — подарок Светланы',
    'granted_at', '2026-05-11',
    'expires_at', '2027-05-11'
  )
FROM users
WHERE LOWER(username) = 'alina2301';

-- ============== ШАГ 3: Светлана @AnandraDragon — Мастер бессрочно ==============
-- subscription_end = NULL означает «бессрочно» (см. pricing.js: если end не задано — не истекает)
UPDATE users
SET
  access_level = 'premium',
  subscription_plan = 'master_admin_lifetime',
  subscription_start = NOW(),
  subscription_end = NULL,
  book_purchased = TRUE,
  is_admin = TRUE
WHERE LOWER(username) = 'anandradragon';

INSERT INTO subscription_log (user_id, event_type, plan, provider, amount_paid, currency, period_days, metadata)
SELECT
  id,
  'admin_grant',
  'master_admin_lifetime',
  'admin',
  0,
  'ADMIN',
  NULL,
  jsonb_build_object('reason', 'Автор проекта — бессрочный Мастер')
FROM users
WHERE LOWER(username) = 'anandradragon';

-- ============== ШАГ 4: проверка ==============
-- Должны увидеть:
--  - Светлана (premium, master_admin_lifetime, end=NULL)
--  - Алина (premium, master_year_gift, end=2027-05-11)
--  - Все остальные = basic
SELECT
  username,
  first_name,
  access_level,
  subscription_plan,
  subscription_end,
  book_purchased,
  crystals,
  is_admin
FROM users
WHERE access_level != 'basic' OR is_admin = TRUE
ORDER BY access_level DESC, username;

-- Контроль остальных (должно быть много, все basic):
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE access_level = 'basic') AS basic_users,
  COUNT(*) FILTER (WHERE access_level = 'extended') AS extended_users,
  COUNT(*) FILTER (WHERE access_level = 'premium') AS premium_users
FROM users;
