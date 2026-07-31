-- Серверный кэш «Полного послания».
-- Послание зависит только от (gift_code, gender, lang) — одинаково для всех
-- людей с одним кодом Дара, полом и языком. Кэшируем готовый JSON, чтобы
-- повторные входы отдавались мгновенно, минуя AI-генерацию (5-15 с).
create table if not exists public.message_cache (
  gift_code  text not null,
  gender     text not null default 'none',
  lang       text not null default 'ru',
  data       jsonb not null,
  image_url  text default '',
  created_at timestamptz not null default now(),
  primary key (gift_code, gender, lang)
);

-- Наружу закрыто: писать/читать кэш только service-role (как у остального кэша).
alter table public.message_cache enable row level security;
