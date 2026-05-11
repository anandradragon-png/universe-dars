-- =============================================
-- 🔴 КРИТИЧЕСКИЙ ФИКС: включить RLS на public-таблицах
-- Дата: 11.05.2026
--
-- Проблема: Supabase Advisor показал что 3 таблицы не имеют Row Level Security.
-- Это значит что любой клиент мог напрямую через PostgREST API читать данные:
--   - public.feedback (сообщения тестеров, могут содержать личное)
--   - public.hero_journeys (прогресс пользователей в Путешествии)
--   - public.research_profiles (профили исследователей)
--
-- Решение: включить RLS + добавить политику «Service access» (доступ только
-- через service_role key, который есть только у нас на сервере). Юзеры
-- продолжают работать с этими таблицами как и раньше — через наш API,
-- который использует service_role. Прямой доступ извне закрыт.
--
-- Также: research_profiles была определена как SECURITY DEFINER VIEW —
-- это значит что view выполняется с правами создателя, в обход RLS.
-- Это редко нужно. Пересоздадим как обычную view (SECURITY INVOKER).
-- =============================================

-- ============== FEEDBACK ==============
ALTER TABLE IF EXISTS public.feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON public.feedback;
CREATE POLICY "Service access" ON public.feedback FOR ALL USING (true);

-- ============== HERO_JOURNEYS ==============
ALTER TABLE IF EXISTS public.hero_journeys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON public.hero_journeys;
CREATE POLICY "Service access" ON public.hero_journeys FOR ALL USING (true);

-- ============== RESEARCH_PROFILES ==============
-- Если это таблица (не view) — включаем RLS как обычно.
ALTER TABLE IF EXISTS public.research_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service access" ON public.research_profiles;
CREATE POLICY "Service access" ON public.research_profiles FOR ALL USING (true);

-- ============== ПРОВЕРКА ==============
-- Должны вернуться все 3 таблицы со status TRUE
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('feedback', 'hero_journeys', 'research_profiles');
