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

// Список юзеров с пожизненным тарифом (выше basic) — выдаются при логине.
// Идемпотентно: если уже extended/premium — ничего не меняем.
// Чтобы отозвать — убрать из списка И сбросить access_level в БД руками (иначе ничего не произойдёт,
// потому что мы тут только апгрейдим, не понижаем).
const LIFETIME_EXTENDED_USERNAMES = ['alina2301']; // в lowercase

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
    // Lifetime-апгрейд: если username из белого списка и уровень ниже extended — повышаем до extended.
    // Сравниваем username из БД (с поправкой на возможные изменения username в TG — берём оба источника).
    const dbUsername = (existing.username || '').toLowerCase();
    const tgUsername = (telegramUser.username || '').toLowerCase();
    const inLifetimeList = LIFETIME_EXTENDED_USERNAMES.includes(dbUsername) ||
                           LIFETIME_EXTENDED_USERNAMES.includes(tgUsername);
    const needsUpgrade = inLifetimeList &&
                         existing.access_level !== 'extended' &&
                         existing.access_level !== 'premium';

    const updates = { last_active_at: new Date().toISOString() };
    if (needsUpgrade) {
      updates.access_level = 'extended';
      console.log('[db] Lifetime upgrade applied:', telegramUser.id, existing.username, '→ extended');
    }
    await db.from('users').update(updates).eq('id', existing.id);

    // Возвращаем актуальные данные
    if (needsUpgrade) existing.access_level = 'extended';
    return existing;
  }

  // Для новых юзеров: тот же lifetime-апгрейд, чтобы Алина получила extended даже на первом логине.
  const newUserUsernameLc = (telegramUser.username || '').toLowerCase();
  const initialLevel = LIFETIME_EXTENDED_USERNAMES.includes(newUserUsernameLc) ? 'extended' : 'basic';

  const { data: newUser, error } = await db
    .from('users')
    .insert({
      telegram_id: telegramUser.id,
      first_name: telegramUser.first_name || '',
      last_name: telegramUser.last_name || '',
      username: telegramUser.username || '',
      crystals: 0,
      access_level: initialLevel
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

async function addCrystals(userId, amount, reason, metadata = null) {
  const db = getSupabase();

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
