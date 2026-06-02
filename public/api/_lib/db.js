const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY required');
    supabase = createClient(url, key);
  }
  return supabase;
}

// ---- Пользователи ----
//
// С 11.05.2026 убран старый список LIFETIME_EXTENDED_USERNAMES.
// Все подарочные/пожизненные подписки теперь живут в обычных полях
// subscription_plan / subscription_end (например, для Алины:
// subscription_plan='master_year_gift', subscription_end='2027-05-11').
// Никаких автоматических апгрейдов при логине — только то, что записано в БД.

async function getOrCreateUser(telegramUser) {
  // Защита: не принимаем объект-ошибку от getUser/requireUser и не создаём запись с null telegram_id
  if (!telegramUser || typeof telegramUser !== 'object') {
    throw new Error('getOrCreateUser: no telegramUser');
  }
  if (!telegramUser.id) {
    const reason = telegramUser.error || 'no_id';
    throw new Error('getOrCreateUser: invalid telegramUser (' + reason + ')');
  }
  const db = getSupabase();
  const { data: existing } = await db
    .from('users')
    .select('*')
    .eq('telegram_id', telegramUser.id)
    .single();

  if (existing) {
    // Просто обновляем last_active_at. Никаких апгрейдов access_level.
    await db.from('users').update({
      last_active_at: new Date().toISOString()
    }).eq('id', existing.id);
    return existing;
  }

  // Новый юзер всегда начинает с basic. Подарок (если кому-то) ставится через админку.
  const { data: newUser, error } = await db
    .from('users')
    .insert({
      telegram_id: telegramUser.id,
      first_name: telegramUser.first_name || '',
      last_name: telegramUser.last_name || '',
      username: telegramUser.username || '',
      crystals: 0,
      access_level: 'basic'
    })
    .select()
    .single();

  if (error) throw error;
  return newUser;
}

async function updateUser(userId, fields) {
  const db = getSupabase();
  const { data, error } = await db.from('users').update(fields).eq('id', userId).select().single();
  if (error) throw error;
  return data;
}

// ---- Сокровищница (открытые дары) ----

async function getUserDars(userId) {
  const db = getSupabase();
  const { data, error } = await db.from('user_dars').select('*').eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

async function unlockDar(userId, darCode, source) {
  const db = getSupabase();
  const { data: existing } = await db
    .from('user_dars')
    .select('id')
    .eq('user_id', userId)
    .eq('dar_code', darCode)
    .single();

  if (existing) return existing;

  const { data, error } = await db
    .from('user_dars')
    .insert({ user_id: userId, dar_code: darCode, unlock_source: source, unlocked_sections: 1 })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function unlockSection(userId, darCode, sectionIndex) {
  const db = getSupabase();
  const { data, error } = await db
    .from('user_dars')
    .update({ unlocked_sections: sectionIndex })
    .eq('user_id', userId)
    .eq('dar_code', darCode)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ---- Кристаллы ----

// 🔒 КРИСТАЛЬНАЯ ЗАМОРОЗКА (с 02.06.2026 по решению Светланы).
// Причина: «Отключи начисление кристаллов везде кроме игры в интуицию.
// До того времени пока мы не придумаем нормальное утилити для них.»
//
// Разрешены ТОЛЬКО:
//   - 'intuition_win'  — победа в игре «Найди 3 карты»
//   - 'intuition_round' — служебная запись (amount=0)
//   - все траты (отрицательный amount) — это списания, их не блокируем
//   - покупки (purchase_book_*, promo_premium и т.п.) — бонусы за реальный платёж,
//     это часть монетизации, оставляем
//
// Заблокированы:
//   - 'daily_login'  — за вход (главная жалоба)
//   - 'signup'       — бонус новичку 50💎
//   - 'profile_completed' — за заполнение профиля
//   - 'referral_*'   — реферальные бонусы (кроме покупок)
//   - 'quest_*', 'hero_*' — за квесты/Путь Героя
//   - 'diary_entry'  — за запись в дневник
//   - все остальные положительные награды
//
// Когда включать обратно: после появления внятных утилити для трат
// (АРКА премиум-разлоки / магазин эмодзи / реальные товары).
const FROZEN_REWARDS = new Set([
  'daily_login',
  'signup',
  'profile_completed',
  'diary_entry',
  'quest_complete',
  'referral_duplicate',
  'was_referred',
  'referral_buyer_bonus',
  'hero_awakening',
  'hero_shadow_battle',
  'hero_step_complete',
  'hero_journey_complete',
  'weekly_top1', 'weekly_top2', 'weekly_top3',
  'monthly_top1', 'monthly_top2', 'monthly_top3',
  'title_weekly_mage', 'title_monthly_mage',
  'streak_bonus_7', 'streak_bonus_30', 'streak_bonus_100',
  'donation', 'donation_tbank', 'donation_darai', 'donation_yookassa',
  // НЕ блокируем: intuition_win, intuition_round, purchase_book_*,
  // promo_premium, promo_extended, и все траты (amount < 0)
]);

async function addCrystals(userId, amount, reason, metadata = null) {
  const db = getSupabase();

  // 🔒 ЗАМОРОЗКА: если это положительная награда и она в списке заблокированных —
  // молча возвращаем текущий баланс БЕЗ начисления и БЕЗ записи в лог.
  // Списания (amount < 0) пропускаем всегда — это траты, не награды.
  if (amount > 0 && FROZEN_REWARDS.has(reason)) {
    const { data: user } = await db.from('users').select('crystals').eq('id', userId).single();
    return user?.crystals || 0;
  }

  // Записать в лог.
  // Metadata сохраняем как объект — поле JSONB в Supabase, не делаем JSON.stringify
  // (иначе сохранится как строка внутри jsonb и запросы вида metadata->key не работают).
  await db.from('crystal_log').insert({
    user_id: userId,
    amount,
    reason,
    metadata: metadata && typeof metadata === 'object' ? metadata : null
  });

  // Обновить баланс
  const { data: user } = await db.from('users').select('crystals').eq('id', userId).single();
  const newBalance = (user?.crystals || 0) + amount;
  await db.from('users').update({ crystals: newBalance }).eq('id', userId);

  return newBalance;
}

// ---- Рефералы ----

async function createReferral(referrerId, referredId, referredDarCode, darUnlocked) {
  const db = getSupabase();
  const { data, error } = await db
    .from('referrals')
    .insert({ referrer_id: referrerId, referred_id: referredId, referred_dar_code: referredDarCode, dar_unlocked: darUnlocked })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getReferralCount(userId) {
  const db = getSupabase();
  const { count } = await db.from('referrals').select('id', { count: 'exact' }).eq('referrer_id', userId);
  return count || 0;
}

// ---- Задания ----

async function completeQuest(userId, darCode, sectionIndex, questType, answerText) {
  const db = getSupabase();
  const { data, error } = await db
    .from('user_quests')
    .insert({ user_id: userId, dar_code: darCode, section_index: sectionIndex, quest_type: questType, answer_text: answerText })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getUserQuests(userId, darCode) {
  const db = getSupabase();
  const { data } = await db.from('user_quests').select('*').eq('user_id', userId).eq('dar_code', darCode);
  return data || [];
}

// ---- Путешествие Героя ----

async function getHeroJourney(userId, darCode) {
  const db = getSupabase();
  const { data } = await db
    .from('hero_journeys')
    .select('*')
    .eq('user_id', userId)
    .eq('dar_code', darCode)
    .single();
  return data;
}

async function upsertHeroJourney(userId, darCode, fields) {
  const db = getSupabase();
  const now = new Date().toISOString();

  // Пробуем обновить
  const { data: existing } = await db
    .from('hero_journeys')
    .select('id')
    .eq('user_id', userId)
    .eq('dar_code', darCode)
    .single();

  if (existing) {
    const { data, error } = await db
      .from('hero_journeys')
      .update({ ...fields, updated_at: now })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Создаём новую запись
  const { data, error } = await db
    .from('hero_journeys')
    .insert({
      user_id: userId,
      dar_code: darCode,
      step: 1,
      step_state: {},
      completed_steps: [],
      crystals_earned: 0,
      started_at: now,
      updated_at: now,
      ...fields
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getAllHeroJourneys(userId) {
  const db = getSupabase();
  const { data } = await db
    .from('hero_journeys')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  return data || [];
}

module.exports = {
  getSupabase,
  getOrCreateUser, updateUser,
  getUserDars, unlockDar, unlockSection,
  addCrystals,
  createReferral, getReferralCount,
  completeQuest, getUserQuests,
  getHeroJourney, upsertHeroJourney, getAllHeroJourneys
};
