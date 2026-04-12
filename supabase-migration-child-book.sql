-- =============================================
-- Миграция: кэш AI-глав "Книга Даров для Родителей"
-- Запустить в SQL Editor на dashboard.supabase.com
-- =============================================
-- Каждая глава генерируется DeepSeek персонально под ребёнка
-- (имя, возраст, пол, дар). Кэшируем чтобы не генерировать повторно.

CREATE TABLE IF NOT EXISTS child_book_sections (
  id SERIAL PRIMARY KEY,
  relative_id INTEGER REFERENCES user_relatives(id) ON DELETE CASCADE,
  section_id VARCHAR(30) NOT NULL,       -- essence / capricious / light_shadow / help / education / attention / genius
  content TEXT NOT NULL,                  -- сгенерированный HTML-текст главы
  dar_code VARCHAR(10) NOT NULL,         -- код дара ребёнка (для индексации)
  child_age_years INTEGER,               -- возраст на момент генерации
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(relative_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_child_book_relative ON child_book_sections(relative_id);

ALTER TABLE child_book_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service access" ON child_book_sections FOR ALL USING (true);
