-- =============================================
-- Миграция: идемпотентность наград за квесты
-- Дата: 02.07.2026
--
-- ⚠ БЕЗОПАСНА для прода — только ДОБАВЛЯЕТ уникальный индекс.
--   Перед созданием индекса схлопывает уже существующие дубликаты
--   (оставляя самую раннюю запись по completed_at), чтобы CREATE UNIQUE
--   не упал на исторических данных.
--
-- Проблема: POST /api/game-actions?action=quest не имел идемпотентности —
-- повторный (или параллельный) submit того же квеста создавал новую строку
-- user_quests и начислял reward ещё раз (латентный безлимитный фарм кристаллов,
-- когда заморозка наград будет снята).
--
-- Решение: уникальность на (user_id, dar_code, section_index, quest_type).
-- Обработчик делает claim-before-grant: пытается вставить запись; повтор падает
-- с 23505 (unique_violation) → награда не начисляется второй раз.
-- =============================================

-- 1) Схлопнуть исторические дубликаты (оставить самую раннюю запись).
DELETE FROM user_quests uq
USING user_quests dup
WHERE uq.user_id = dup.user_id
  AND uq.dar_code = dup.dar_code
  AND uq.section_index = dup.section_index
  AND uq.quest_type = dup.quest_type
  AND uq.id > dup.id;

-- 2) Уникальный индекс = констрейнт идемпотентности.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_quests_unique
  ON user_quests(user_id, dar_code, section_index, quest_type);

-- Проверка
SELECT 'uq_user_quests_unique' AS what,
       (SELECT count(*) FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'uq_user_quests_unique') AS exists;
