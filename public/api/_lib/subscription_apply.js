/**
 * Применение успешной оплаты к пользователю.
 *
 * Вызывается из webhooks.js когда платёж подтверждён.
 * Работает одинаково для Stars / ЮKassa / DarAI — отличается только
 * способом извлечения metadata из конкретного webhook.
 *
 * Главные правила:
 *  - Подписка ПРОДЛЕВАЕТСЯ от max(NOW, subscription_end), а не заменяется.
 *    Это защита от двойной оплаты (юзер не теряет дни).
 *  - Апгрейд (Хранитель → Мастер) меняет access_level + сохраняет/перезаписывает срок.
 *  - book_purchased = TRUE сохраняется навсегда.
 *  - first_purchase_at заполняется при первой удачной плате (для промо).
 *  - Запись в subscription_log + crystal_log.
 */

const pricing = require('./pricing');
const { getSupabase, addCrystals } = require('./db');

const TIER_PRIORITY = { basic: 0, extended: 1, premium: 2 };

/**
 * Применить покупку подписки (любой период любого тарифа).
 *
 * @param {object} args
 * @param {number} args.userId — users.id (НЕ telegram_id)
 * @param {string} args.planKey — 'guardian_1m' | 'guardian_3m' | ... | 'master_12m'
 * @param {string} args.provider — 'stars' | 'yookassa' | 'darai'
 * @param {number} args.amountPaid — сумма в валюте провайдера
 * @param {string} args.currency — 'XTR' | 'RUB' | 'DARAI'
 * @param {object} args.providerMetadata — оригинальный объект от webhook (для аудита)
 */
async function applySubscription({ userId, planKey, provider, amountPaid, currency, providerMetadata }) {
  const plan = pricing.PLANS[planKey];
  if (!plan) throw new Error('Unknown plan: ' + planKey);

  const db = getSupabase();
  const { data: user, error } = await db
    .from('users')
    .select('id, access_level, subscription_plan, subscription_end, first_purchase_at, telegram_id')
    .eq('id', userId)
    .single();
  if (error || !user) throw new Error('User not found: ' + userId);

  // Расчёт нового access_level (не понижаем)
  const newTier = plan.tier; // 'extended' | 'premium'
  const currentPriority = TIER_PRIORITY[user.access_level] || 0;
  const newPriority = TIER_PRIORITY[newTier] || 0;
  const finalLevel = newPriority >= currentPriority ? newTier : user.access_level;

  // Расчёт нового subscription_end
  // База = max(NOW, текущий subscription_end если он валиден и в будущем)
  const now = Date.now();
  const currentEnd = user.subscription_end ? new Date(user.subscription_end).getTime() : 0;
  const baseTime = (currentEnd > now) ? currentEnd : now;

  // Если апгрейд тарифа (был extended → стал premium) — НЕ продлеваем, а перезаписываем.
  // Логика: если апгрейд — даём только купленный период от сейчас (с компенсацией позже руками если нужно).
  const isUpgrade = newPriority > currentPriority && currentEnd > now;
  const startTime = isUpgrade ? now : baseTime;
  const endTime = startTime + plan.days * 24 * 3600 * 1000;

  // event_type
  let eventType;
  if (!user.subscription_end || currentEnd < now) eventType = 'subscribe';
  else if (isUpgrade) eventType = 'upgrade';
  else eventType = 'extend';

  const updates = {
    access_level: finalLevel,
    subscription_plan: planKey,
    subscription_start: new Date(isUpgrade ? now : baseTime).toISOString(),
    subscription_end: new Date(endTime).toISOString()
  };
  if (!user.first_purchase_at) {
    updates.first_purchase_at = new Date(now).toISOString();
  }

  await db.from('users').update(updates).eq('id', userId);

  // subscription_log
  try {
    await db.from('subscription_log').insert({
      user_id: userId,
      event_type: eventType,
      plan: planKey,
      provider,
      amount_paid: amountPaid,
      currency,
      period_days: plan.days,
      metadata: providerMetadata || null
    });
  } catch (e) {
    console.warn('[apply] subscription_log failed:', e.message);
  }

  // crystal_log — отдельная запись для analytics платежей
  try {
    await db.from('crystal_log').insert({
      user_id: userId,
      amount: 0, // деньги, не кристаллы
      reason: provider + '_subscription',
      metadata: {
        plan: planKey,
        amount_paid: amountPaid,
        currency,
        days: plan.days,
        event_type: eventType
      }
    });
  } catch (e) {
    console.warn('[apply] crystal_log failed:', e.message);
  }

  return { user_id: userId, new_level: finalLevel, plan: planKey, ends_at: updates.subscription_end, event_type: eventType };
}

/**
 * Применить покупку Книги (разовый продукт).
 */
async function applyBookPurchase({ userId, provider, amountPaid, currency, providerMetadata }) {
  const db = getSupabase();
  const { data: user } = await db.from('users').select('id, first_purchase_at').eq('id', userId).single();
  if (!user) throw new Error('User not found');

  const updates = { book_purchased: true };
  if (!user.first_purchase_at) {
    updates.first_purchase_at = new Date().toISOString();
  }
  await db.from('users').update(updates).eq('id', userId);

  try {
    await db.from('crystal_log').insert({
      user_id: userId,
      amount: 0,
      reason: provider + '_book_purchase',
      metadata: { amount_paid: amountPaid, currency, providerMetadata: providerMetadata || null }
    });
  } catch (e) {
    console.warn('[apply book] crystal_log failed:', e.message);
  }

  return { user_id: userId, book_purchased: true };
}

/**
 * Применить покупку add-on.
 */
async function applyAddon({ userId, addonKey, provider, amountPaid, currency, providerMetadata }) {
  const addon = pricing.ADDONS[addonKey];
  if (!addon) throw new Error('Unknown addon: ' + addonKey);

  const db = getSupabase();
  const now = new Date();
  const expiresAt = addon.days ? new Date(now.getTime() + addon.days * 24 * 3600 * 1000) : null;

  // Запись в user_addons
  try {
    await db.from('user_addons').insert({
      user_id: userId,
      addon_type: addonKey,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      consumed_at: null,
      metadata: { amount_paid: amountPaid, currency, provider, providerMetadata: providerMetadata || null }
    });
  } catch (e) {
    console.warn('[apply addon] insert failed:', e.message);
  }

  // crystal_log — для платёжной аналитики
  try {
    await db.from('crystal_log').insert({
      user_id: userId,
      amount: 0,
      reason: provider + '_addon_' + addonKey,
      metadata: { addon: addonKey, amount_paid: amountPaid, currency, days: addon.days || 0 }
    });
  } catch (e) {
    console.warn('[apply addon] crystal_log failed:', e.message);
  }

  // first_purchase_at — на случай если первая покупка вообще была add-on
  try {
    const { data: u } = await db.from('users').select('first_purchase_at').eq('id', userId).single();
    if (!u?.first_purchase_at) {
      await db.from('users').update({ first_purchase_at: new Date().toISOString() }).eq('id', userId);
    }
  } catch (e) {}

  return { user_id: userId, addon: addonKey, expires_at: expiresAt };
}

/**
 * Универсальный диспетчер. Берёт metadata из webhook и понимает что куплено.
 * Возвращает { kind: 'plan'|'book'|'addon'|'donation'|null, result }.
 */
async function applyByMetadata({ userId, metadata, provider, amountPaid, currency, providerMetadata }) {
  if (!userId) return { kind: null, error: 'no userId' };

  const paymentType = metadata.payment_type || metadata.payload_type;
  const productKey = metadata.product_key;

  // Новая схема: plan / addon
  if (paymentType === 'plan' && productKey) {
    return { kind: 'plan', result: await applySubscription({
      userId, planKey: productKey, provider, amountPaid, currency, providerMetadata
    }) };
  }
  if (paymentType === 'addon' && productKey) {
    return { kind: 'addon', result: await applyAddon({
      userId, addonKey: productKey, provider, amountPaid, currency, providerMetadata
    }) };
  }

  // Старая схема: только Книга (для обратной совместимости)
  if (paymentType === 'book') {
    return { kind: 'book', result: await applyBookPurchase({
      userId, provider, amountPaid, currency, providerMetadata
    }) };
  }

  return { kind: null, error: 'unknown payment_type: ' + paymentType };
}

module.exports = {
  applySubscription,
  applyBookPurchase,
  applyAddon,
  applyByMetadata
};
