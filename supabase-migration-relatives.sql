-- =============================================
-- Миграция: "Моя семья и близкие" (user_relatives)
-- Запустить в SQL Editor на dashboard.supabase.com
-- =============================================
-- Хранит близких людей пользователя - для каждого можно
-- рассчитать дар и (в будущем) получать персональные послания Оракула.
--
-- Бизнес-правила:
-- - Странник (basic): 0 слотов
-- - Хранитель (extended): 3 слота
-- - Мастер (premium): безлимит
-- - Заполненный слот НЕЛЬЗЯ заменить (защита от подмены).
--   Можно только удалить и добавить нового — для этого есть аудит created_at.

CREATE TABLE IF NOT EXISTS user_relatives (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- Данные близкого
  name TEXT NOT NULL,                       -- имя (макс 50 в API)
  relationship VARCHAR(20) NOT NULL,        -- mother / father / son / daughter /
                                            -- partner / friend / sibling / other
  birth_date VARCHAR(10) NOT NULL,          -- DD.MM.YYYY (как в users.birth_date)
  gender VARCHAR(10),                       -- 'male' / 'female' / NULL

  -- Вычислено из birth_date (для быстрого поиска и фильтра)
  dar_code VARCHAR(10) NOT NULL,            -- например '2-8-1'

  -- Опциональные поля для будущего расширенного Оракула
  birth_time VARCHAR(5),                    -- 'HH:MM'
  birth_place TEXT,
  birth_lat NUMERIC(8, 5),
  birth_lon NUMERIC(8, 5),

  -- Аудит
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Защита от дубликатов: нельзя добавить того же человека дважды
  -- (по сочетанию имя + дата рождения для одного юзера)
  UNIQUE(user_id, name, birth_date)
);

CREATE INDEX IF NOT EXISTS idx_user_relatives_user_id ON user_relatives(user_id);
CREATE INDEX IF NOT EXISTS idx_user_relatives_dar_code ON user_relatives(dar_code);

-- RLS: доступ только через service key (как и остальные таблицы)
ALTER TABLE user_relatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service access" ON user_relatives FOR ALL USING (true);
