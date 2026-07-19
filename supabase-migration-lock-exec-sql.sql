-- Ограничение доступа к exec_sql (SECURITY DEFINER бэкдор для DDL).
-- Причина: exec_sql выполняет произвольный DDL от владельца. Наружу
-- (anon/authenticated/public) вызываться не должен — только service_role
-- (наш автономный канал «Supabase Run»). Защита в глубину: у главного проекта
-- anon-ключ и так не выдан клиенту, но право EXECUTE забираем явно.
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
