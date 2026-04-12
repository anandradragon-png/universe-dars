-- =============================================
-- Миграция: серверный кэш посланий Оракула
-- Запустить в SQL Editor на dashboard.supabase.com
-- =============================================
-- Раньше послания хранились только в localStorage клиента.
-- При закрытии Telegram Mini App localStorage мог сброситься,
-- и юзер терял доступ к прочитанному посланию навсегда.
-- Теперь храним на сервере: юзер всегда может вернуться к посланию.

CREATE TABLE IF NOT EXISTS oracle_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  dar_code VARCHAR(10) NOT NULL,
  mode VARCHAR(20) NOT NULL,           -- 'general', 'personal', 'card', 'relative'
  date_key DATE NOT NULL DEFAULT CURRENT_DATE,  -- день для которого послание
  prophecy TEXT NOT NULL,
  practice TEXT,
  energies JSONB,                       -- ["маркер1", "маркер2", ...]
  meditation_video JSONB,               -- {title, description, url} если есть
  relative_id INTEGER,                  -- для mode='relative': id из user_relatives
  user_query TEXT,                      -- для mode='card': вопрос юзера
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Один кэш на юзера + дар + режим + день
  -- (relative_id может быть NULL - для своего дара; или id - для близкого)
  UNIQUE(user_id, dar_code, mode, date_key)
);

CREATE INDEX IF NOT EXISTS idx_oracle_cache_user_date ON oracle_cache(user_id, date_key);
CREATE INDEX IF NOT EXISTS idx_oracle_cache_dar ON oracle_cache(dar_code, date_key);

ALTER TABLE oracle_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service access" ON oracle_cache FOR ALL USING (true);
