/**
 * Центральная логика тарифов и подписок YupDar.
 *
 * Все правила про лимиты, ценообразование и эффективный тариф — здесь.
 * При смене цен — менять ТОЛЬКО этот файл.
 *
 * ВАЖНО: модуль писан так, чтобы работать ДО применения миграции
 * pricing-v2. Если новых полей в БД нет — деградирует на старое поведение
 * (то что было до тарифов), не падает.
 */

const { getSupabase } = require('./db');

// =====================================================================
// ТАРИФНАЯ СЕТКА (источник истины)
// =====================================================================
// Все цены в коде. UI читает их же — никогда не дублировать в html.

const PLANS = {
  // --------- ХРАНИТЕЛЬ ---------
  guardian_1m:  { tier: 'extended', days: 30,  rub: 490,    stars: 245,  usd: 4.90,  darai: 40_000_000, label: 'Хранитель · 1 месяц' },
  guardian_3m:  { tier: 'extended', days: 90,  rub: 1290,   stars: 645,  usd: 12.90, darai: 40_000_000, label: 'Хранитель · 3 месяца' },
  guardian_6m:  { tier: 'extended', days: 180, rub: 2290,   stars: 1145, usd: 22.90, darai: 40_000_000, label: 'Хранитель · 6 месяцев' },
  guardian_12m: { tier: 'extended', days: 365, rub: 3990,   stars: 1995, usd: 39.90, darai: 40_000_000, label: 'Хранитель · 12 месяцев' },
  // --------- МАСТЕР ---------
  master_1m:    { tier: 'premium',  days: 30,  rub: 1490,   stars: 749,  usd: 14.90, darai: 40_000_000, label: 'Мастер · 1 месяц' },
  master_3m:    { tier: 'premium',  days: 90,  rub: 3990,   stars: 1995, usd: 39.90, darai: 40_000_000, label: 'Мастер · 3 месяца' },
  master_6m:    { tier: 'premium',  days: 180, rub: 6990,   stars: 3495, usd: 69.90, darai: 40_000_000, label: 'Мастер · 6 месяцев' },
  master_12m:   { tier: 'premium',  days: 365, rub: 11990,  stars: 5995, usd: 119.90,darai: 40_000_000, label: 'Мастер · 12 месяцев' }
};

// Разовый продукт — Книга (НЕ открывает тариф)
const BOOK_PRODUCT = {
  rub: 990,
  stars: 499,
  usd: 9.99,
  darai: 40_000_000,
  label: 'Книга Даров (полный доступ навсегда)'
};

// Add-ons (одноразовые покупки для Странников)
const ADDONS = {
  oracle_unlimited_7d:  { days: 7,    rub: 149, stars: 75,  usd: 1.49, darai: 40_000_000, label: 'Безлимит Оракула на 7 дней' },
  compatibility_pdf:    { days: null, rub: 249, stars: 125, usd: 2.49, darai: 40_000_000, label: 'Глубокая совместимость PDF' },
  child_book_chapter:   { days: null, rub: 199, stars: 99,  usd: 1.99, darai: 40_000_000, label: '1 глава Книги для Родителей' },

  // === Hero Journey: открытие чужих даров ===
  // dar_code и variant передаются в metadata при оплате.
  hero_journey_unlock:           { days: null, rub: 99, stars: 50, usd: 0.99, darai: 5_000_000, label: 'Путешествие Героя по чужому дару' },
  hero_journey_unlock_relative:  { days: null, rub: 49, stars: 25, usd: 0.49, darai: 2_500_000, label: 'Путешествие Героя по дару родственника' },
  hero_journey_upgrade_preview:  { days: null, rub: 69, stars: 35, usd: 0.69, darai: 3_500_000, label: 'Полный Путь Героя после превью' }
};

// Стоимость открытия за кристаллы (отдельно — не платёжный поток)
const HERO_JOURNEY_CRYSTAL_PRICES = {
  full: 300,         // полное открытие чужого дара
  relative: 150,     // дар родственника (-50%)
  upgrade: 200       // доплата после превью (-33%)
};

// =====================================================================
// ЛИМИТЫ ПО ТАРИФАМ
// =====================================================================

const LIMITS = {
  basic: {
    oracle_per_day: 1,
    family_slots: 0,
    children_book_unlocked: 0,    // сколько детей в Книге для Родителей
    sokrovishnitsa_other_dars: false, // может ли открывать ЧУЖИЕ дары в Сокровищнице
    compatibility_per_month: 1,
    hero_journey_other_dars: false,
    book_full_access: false,       // полная Книга Даров
    diary_ai_insight_days: 0       // 0 = нет AI-инсайтов
  },
  extended: { // Хранитель
    oracle_per_day: 3,
    family_slots: 3,
    children_book_unlocked: 1,
    sokrovishnitsa_other_dars: true,
    compatibility_per_month: 5,
    hero_journey_other_dars: true,  // но только по дарам семьи (проверяется отдельно)
    book_full_access: true,
    diary_ai_insight_days: 7
  },
  premium: { // Мастер
    oracle_per_day: Infinity,
    family_slots: Infinity,
    children_book_unlocked: Infinity,
    sokrovishnitsa_other_dars: true,
    compatibility_per_month: Infinity,
    hero_journey_other_dars: true,
    book_full_access: true,
    diary_ai_insight_days: 1
  }
};

// =====================================================================
// ВНУТРЕННИЕ HELPERS
// =====================================================================

/**
 * Эффективный тариф пользователя СЕЙЧАС.
 * Учитывает:
 *  - access_level в БД (как сейчас)
 *  - subscription_end (если истекла — откатить до basic)
 *  - book_purchased сохраняется отдельно
 *
 * Если новых полей в БД нет (миграция ещё не применена) — возвращает
 * текущий access_level как есть.
 */
function getEffectiveTier(user) {
  if (!user) return 'basic';

  // Если есть поле subscription_end и оно в прошлом — подписка истекла
  if (user.subscription_end) {
    const endTime = new Date(user.subscription_end).getTime();
    if (endTime < Date.now()) {
      // Подписка истекла — но book_purchased сохраняется. Возвращаем basic.
      return 'basic';
    }
  }

  // Нет subscription_end или она в будущем — используем access_level
  return user.access_level || 'basic';
}

/**
 * Эффективный тариф С УЧЁТОМ «симуляции» админом.
 * Если в req-объекте есть header x-admin-simulate-tier И юзер реально админ,
 * возвращаем симулированный тариф вместо настоящего.
 *
 * Это позволяет автору смотреть приложение глазами basic/extended/premium
 * без необходимости менять свою подписку в БД.
 */
function getEffectiveTierWithSimulation(user, req) {
  // Без симуляции — обычная логика
  if (!req || !user || !user.is_admin) return getEffectiveTier(user);

  const sim = (req.headers && req.headers['x-admin-simulate-tier']) || '';
  if (sim && ['basic', 'extended', 'premium'].includes(sim)) {
    return sim;
  }
  return getEffectiveTier(user);
}

/**
 * Получить лимиты для пользователя.
 * Если передан req — учитывает админскую симуляцию (header x-admin-simulate-tier).
 */
function getLimits(user, req) {
  const tier = req ? getEffectiveTierWithSimulation(user, req) : getEffectiveTier(user);
  return LIMITS[tier] || LIMITS.basic;
}

/**
 * Активный add-on определённого типа.
 * Возвращает запись из user_addons если активен, иначе null.
 */
async function getActiveAddon(userId, addonType) {
  try {
    const db = getSupabase();
    const { data } = await db
      .from('user_addons')
      .select('*')
      .eq('user_id', userId)
      .eq('addon_type', addonType)
      .is('consumed_at', null)
      .gte('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch (e) {
    // Таблица не существует (миграция не применена) — игнорируем
    if (e.message && e.message.includes('does not exist')) return null;
    console.warn('[pricing] getActiveAddon failed:', e.message);
    return null;
  }
}

// =====================================================================
// ПУБЛИЧНЫЕ ПРОВЕРКИ ЛИМИТОВ
// =====================================================================

/**
 * Может ли пользователь сгенерировать ещё один Оракул сегодня.
 *
 * Возвращает: { allowed: bool, reason?: string, used: number, limit: number|Infinity }
 */
async function canUseOracle(user, req) {
  const limits = getLimits(user, req);
  const limit = limits.oracle_per_day;

  // Безлимит — сразу разрешаем
  if (limit === Infinity) return { allowed: true, limit: Infinity, used: 0 };

  // Активный add-on безлимита на 7 дней
  const addon = await getActiveAddon(user.id, 'oracle_unlimited_7d');
  if (addon) return { allowed: true, limit: Infinity, used: 0, source: 'addon' };

  // Иначе считаем сегодняшний счёт
  const today = new Date().toISOString().slice(0, 10);
  try {
    const db = getSupabase();
    const { data } = await db
      .from('daily_oracle_usage')
      .select('count')
      .eq('user_id', user.id)
      .eq('date_key', today)
      .maybeSingle();
    const used = data?.count || 0;
    if (used >= limit) {
      return { allowed: false, reason: 'daily_oracle_limit', used, limit };
    }
    return { allowed: true, used, limit };
  } catch (e) {
    if (e.message && e.message.includes('does not exist')) {
      // Таблица ещё не создана — деградируем на старое поведение (без лимита)
      return { allowed: true, used: 0, limit: Infinity, source: 'no_table_fallback' };
    }
    console.warn('[pricing] canUseOracle failed:', e.message);
    return { allowed: true, used: 0, limit }; // не блокируем при технической ошибке
  }
}

/**
 * Записать факт использования Оракула. Вызывать после успешной генерации.
 */
async function trackOracleUsage(userId) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const db = getSupabase();
    // Атомарный инкремент через upsert
    const { data: existing } = await db
      .from('daily_oracle_usage')
      .select('count')
      .eq('user_id', userId)
      .eq('date_key', today)
      .maybeSingle();
    const next = (existing?.count || 0) + 1;
    await db.from('daily_oracle_usage').upsert({
      user_id: userId,
      date_key: today,
      count: next,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,date_key' });
    return next;
  } catch (e) {
    if (e.message && e.message.includes('does not exist')) return 0;
    console.warn('[pricing] trackOracleUsage failed:', e.message);
    return 0;
  }
}

/**
 * Может ли пользователь добавить ещё одного близкого?
 * Возвращает { allowed, current, limit }
 *
 * Особенность: для extended (Хранитель) лимит 3. Если у юзера было больше
 * (бывший Мастер откатился) — uniformly смотрим current >= limit.
 * Тогда НЕЛЬЗЯ добавлять новых, но старые «заморожены» (видны, не активны)
 * — это уже логика на уровне отображения.
 */
async function canAddRelative(user, req) {
  const limits = getLimits(user, req);
  const limit = limits.family_slots;
  if (limit === Infinity) return { allowed: true, current: 0, limit: Infinity };

  try {
    const db = getSupabase();
    const { count } = await db
      .from('user_relatives')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    const current = count || 0;
    return { allowed: current < limit, current, limit };
  } catch (e) {
    console.warn('[pricing] canAddRelative failed:', e.message);
    return { allowed: true, current: 0, limit };
  }
}

/**
 * Какие близкие "активны" с точки зрения тарифа.
 * Если у юзера 5 родственников, а лимит 3 — возвращаем первые 3 (старые по created_at).
 * Возвращает массив id активных родственников.
 */
async function getActiveRelativeIds(user) {
  const limits = getLimits(user);
  const limit = limits.family_slots;

  try {
    const db = getSupabase();
    const { data } = await db
      .from('user_relatives')
      .select('id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    const all = data || [];
    if (limit === Infinity) return all.map(r => r.id);
    return all.slice(0, limit).map(r => r.id);
  } catch (e) {
    console.warn('[pricing] getActiveRelativeIds failed:', e.message);
    return [];
  }
}

/**
 * Может ли пользователь сделать ещё одну проверку совместимости?
 *
 * basic: 1 за всю жизнь (когда-либо).
 * extended: 5 в месяце.
 * premium: безлимит.
 */
async function canCheckCompatibility(user, req) {
  const limits = getLimits(user, req);
  const limit = limits.compatibility_per_month;
  if (limit === Infinity) return { allowed: true, limit: Infinity };

  const monthKey = new Date().toISOString().slice(0, 7); // '2026-05'
  try {
    const db = getSupabase();
    // Для basic считаем общее количество за всё время, а не за месяц
    if (getEffectiveTier(user) === 'basic') {
      // считаем все записи в compatibility_usage за все месяцы
      const { data } = await db
        .from('compatibility_usage')
        .select('count')
        .eq('user_id', user.id);
      const total = (data || []).reduce((s, r) => s + (r.count || 0), 0);
      return { allowed: total < limit, used: total, limit };
    }
    // extended — считаем текущий месяц
    const { data } = await db
      .from('compatibility_usage')
      .select('count')
      .eq('user_id', user.id)
      .eq('month_key', monthKey)
      .maybeSingle();
    const used = data?.count || 0;
    return { allowed: used < limit, used, limit };
  } catch (e) {
    if (e.message && e.message.includes('does not exist')) {
      return { allowed: true, used: 0, limit: Infinity, source: 'no_table_fallback' };
    }
    console.warn('[pricing] canCheckCompatibility failed:', e.message);
    return { allowed: true, used: 0, limit };
  }
}

/**
 * Записать факт использования совместимости.
 */
async function trackCompatibilityUsage(userId) {
  const monthKey = new Date().toISOString().slice(0, 7);
  try {
    const db = getSupabase();
    const { data: existing } = await db
      .from('compatibility_usage')
      .select('id, count')
      .eq('user_id', userId)
      .eq('month_key', monthKey)
      .maybeSingle();
    if (existing) {
      await db.from('compatibility_usage').update({ count: existing.count + 1 }).eq('id', existing.id);
    } else {
      await db.from('compatibility_usage').insert({ user_id: userId, month_key: monthKey, count: 1 });
    }
  } catch (e) {
    if (e.message && e.message.includes('does not exist')) return;
    console.warn('[pricing] trackCompatibilityUsage failed:', e.message);
  }
}

/**
 * Может ли пользователь открыть/просматривать дар в Сокровищнице, который
 * не является его собственным?
 */
function canOpenForeignDar(user) {
  return getLimits(user).sokrovishnitsa_other_dars;
}

/**
 * Может ли пользователь читать полную Книгу Даров?
 * Учитываем book_purchased — даже после окончания подписки книга остаётся.
 */
function canReadFullBook(user) {
  if (!user) return false;
  if (user.book_purchased === true) return true;
  return getLimits(user).book_full_access;
}

/**
 * Получить раз в сколько дней пользователю положен AI-инсайт в Дневнике.
 * 0 = не положен.
 */
function getDiaryInsightCadenceDays(user) {
  return getLimits(user).diary_ai_insight_days;
}

// =====================================================================
// HERO JOURNEY UNLOCK SYSTEM
// =====================================================================

/**
 * Проверить, открыт ли дар у пользователя в hero_journey_unlocks.
 * Возвращает запись или null.
 */
async function getHeroJourneyUnlock(userId, darCode) {
  try {
    const db = getSupabase();
    const { data } = await db
      .from('hero_journey_unlocks')
      .select('*')
      .eq('user_id', userId)
      .eq('dar_code', darCode)
      .maybeSingle();
    return data || null;
  } catch (e) {
    if (e.message && e.message.includes('does not exist')) return null;
    console.warn('[pricing] getHeroJourneyUnlock failed:', e.message);
    return null;
  }
}

/**
 * Проверить, является ли дар даром родственника из Семьи.
 */
async function isDarInFamily(userId, darCode) {
  try {
    const db = getSupabase();
    const { data } = await db
      .from('user_relatives')
      .select('id')
      .eq('user_id', userId)
      .eq('dar_code', darCode)
      .limit(1);
    return (data || []).length > 0;
  } catch (e) {
    return false;
  }
}

/**
 * Проверить, может ли юзер начать/продолжить Hero Journey по дару.
 *
 * Возвращает:
 *   { allowed: true, source: '...', preview_only: bool }
 *   или
 *   { allowed: false, reason: 'locked', preview_only: false, suggestions: {...} }
 *
 * suggestions содержит цены на разные варианты открытия (для UI).
 */
async function canStartHeroJourney(user, darCode, req) {
  if (!user || !user.id) return { allowed: false, reason: 'no_user' };
  if (!darCode) return { allowed: false, reason: 'no_dar_code' };

  // 1. Свой родной дар — всегда доступен
  if (user.dar_code === darCode) {
    return { allowed: true, source: 'own', preview_only: false };
  }

  // 2. Уже открыт в hero_journey_unlocks — используем сохранённый статус
  const unlock = await getHeroJourneyUnlock(user.id, darCode);
  if (unlock) {
    return {
      allowed: true,
      source: unlock.source,
      preview_only: !!unlock.is_preview_only,
      unlock_id: unlock.id
    };
  }

  // 3. Мастер (premium) — безлимит на ВСЕ дары
  const tier = req ? getEffectiveTierWithSimulation(user, req) : getEffectiveTier(user);
  if (tier === 'premium') {
    return { allowed: true, source: 'subscription', preview_only: false };
  }

  // 4. Хранитель + дар родственника из Семьи
  if (tier === 'extended' && await isDarInFamily(user.id, darCode)) {
    return { allowed: true, source: 'relative', preview_only: false };
  }

  // 5. Не открыт — возвращаем варианты покупки
  const isRelative = await isDarInFamily(user.id, darCode);
  return {
    allowed: false,
    reason: 'locked',
    preview_only: false,
    suggestions: {
      is_relative: isRelative,
      crystals: isRelative ? HERO_JOURNEY_CRYSTAL_PRICES.relative : HERO_JOURNEY_CRYSTAL_PRICES.full,
      addon_key: isRelative ? 'hero_journey_unlock_relative' : 'hero_journey_unlock',
      addon: isRelative ? ADDONS.hero_journey_unlock_relative : ADDONS.hero_journey_unlock,
      can_invite_friend: !isRelative // для чужого дара можно пригласить друга
    }
  };
}

/**
 * Может ли юзер продолжить за пределы 1-го шага?
 * Если у него превью — нужна доплата.
 */
function canAdvancePastPreview(unlockRecord) {
  if (!unlockRecord) return false;
  return !unlockRecord.is_preview_only;
}

// =====================================================================
// ЭКСПОРТ
// =====================================================================

module.exports = {
  PLANS,
  BOOK_PRODUCT,
  ADDONS,
  LIMITS,
  HERO_JOURNEY_CRYSTAL_PRICES,
  getEffectiveTier,
  getEffectiveTierWithSimulation,
  getLimits,
  getActiveAddon,
  // Oracle
  canUseOracle,
  trackOracleUsage,
  // Family / Relatives
  canAddRelative,
  getActiveRelativeIds,
  // Compatibility
  canCheckCompatibility,
  trackCompatibilityUsage,
  // Hero Journey unlock
  getHeroJourneyUnlock,
  isDarInFamily,
  canStartHeroJourney,
  canAdvancePastPreview,
  // Other gates
  canOpenForeignDar,
  canReadFullBook,
  getDiaryInsightCadenceDays
};
