-- =============================================
-- Вселенная Даров — Схема базы данных Supabase
-- Запустить в SQL Editor на dashboard.supabase.com
-- =============================================

-- Пользователи
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  username TEXT DEFAULT '',
  dar_code VARCHAR(10),
  dar_name VARCHAR(50),
  birth_date VARCHAR(10),
  crystals INTEGER DEFAULT 0,
  access_level VARCHAR(20) DEFAULT 'basic',
  referrer_id INTEGER REFERENCES users(id),
  streak_count INTEGER DEFAULT 0,
  last_streak_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- Открытые дары (Сокровищница)
CREATE TABLE user_dars (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  dar_code VARCHAR(10) NOT NULL,
  unlock_source VARCHAR(30) NOT NULL, -- 'own', 'referral', 'crystal_purchase', 'daily'
  unlocked_sections INTEGER DEFAULT 1, -- 1-9
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, dar_code)
);

-- Лог кристаллов (все начисления и траты)
CREATE TABLE crystal_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Выполненные задания
CREATE TABLE user_quests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  dar_code VARCHAR(10) NOT NULL,
  section_index INTEGER NOT NULL,
  quest_type VARCHAR(30) NOT NULL,
  answer_text TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Рефералы
CREATE TABLE referrals (
  id SERIAL PRIMARY KEY,
  referrer_id INTEGER REFERENCES users(id),
  referred_id INTEGER REFERENCES users(id),
  referred_dar_code VARCHAR(10),
  dar_unlocked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для производительности
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_user_dars_user_id ON user_dars(user_id);
CREATE INDEX idx_crystal_log_user_id ON crystal_log(user_id);
CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_user_quests_user_dar ON user_quests(user_id, dar_code);

-- RLS (Row Level Security) — выключаем, т.к. доступ через service key
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_dars ENABLE ROW LEVEL SECURITY;
ALTER TABLE crystal_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Кэш AI-генерированных секций
CREATE TABLE IF NOT EXISTS dar_sections_cache (
  id SERIAL PRIMARY KEY,
  dar_code VARCHAR(10) NOT NULL,
  section_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  quest_question TEXT,
  quest_hint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(dar_code, section_index)
);

CREATE INDEX IF NOT EXISTS idx_dar_sections_cache ON dar_sections_cache(dar_code, section_index);
ALTER TABLE dar_sections_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service access" ON dar_sections_cache FOR ALL USING (true);

-- Политики: service key обходит RLS, но на всякий случай
CREATE POLICY "Service access" ON users FOR ALL USING (true);
CREATE POLICY "Service access" ON user_dars FOR ALL USING (true);
CREATE POLICY "Service access" ON crystal_log FOR ALL USING (true);
CREATE POLICY "Service access" ON user_quests FOR ALL USING (true);
CREATE POLICY "Service access" ON referrals FOR ALL USING (true);
