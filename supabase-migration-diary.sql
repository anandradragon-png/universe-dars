-- =============================================
-- Миграция: Дневник Дара (ежедневный трекер эмоций)
-- Запустить в SQL Editor на dashboard.supabase.com
-- =============================================

CREATE TABLE IF NOT EXISTS dar_diary (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date_key DATE NOT NULL DEFAULT CURRENT_DATE,
  mood VARCHAR(20) NOT NULL,           -- joy / calm / energy / anxiety / sadness / irritation
  note TEXT,                            -- опциональная заметка от юзера
  ai_insight TEXT,                      -- AI-инсайт (заполняется при накоплении 7+ записей)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date_key)
);

CREATE INDEX IF NOT EXISTS idx_dar_diary_user_date ON dar_diary(user_id, date_key);

ALTER TABLE dar_diary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service access" ON dar_diary FOR ALL USING (true);
