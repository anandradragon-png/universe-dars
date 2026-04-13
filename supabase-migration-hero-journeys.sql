-- Миграция: таблица hero_journeys для Путешествия Героя
-- Запустить в Supabase SQL Editor

CREATE TABLE IF NOT EXISTS hero_journeys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  dar_code TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT 1,
  step_state JSONB DEFAULT '{}',
  completed_steps INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  crystals_earned INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, dar_code)
);

CREATE INDEX IF NOT EXISTS idx_hero_journeys_user ON hero_journeys(user_id);
CREATE INDEX IF NOT EXISTS idx_hero_journeys_dar ON hero_journeys(user_id, dar_code);
