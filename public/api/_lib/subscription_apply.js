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
 * Извлечь уникальный ключ платежа провайдера из providerMetadata.
 * Используется для идемпотентности (дедуп повторной доставки вебхука).
 */
function paymentKeyFor(provider, providerMetadata) {
  const pm = providerMetadata || {};
  if (provider === 'stars') return pm.telegram_payment_charge_id || null;
  if (provider === 'darai') return pm.invoice_id || null;
  if (provider === 'yookassa') return pm.yookassa_payment_id || null;
  return null;
}

/**
 * Идемпотентность: помечаем платёж как обработанный ДО применения.
 * insert-if-absent по UNIQUE(provider, payment_key). Если запись уже была
 * (повторная доставка/replay вебхука) — вернём { alreadyProcessed: true },
 * и вызывающий код не применяет платёж повторно.
 *
 * Fail-safe: если таблицы ещё нет (миграция не накатана) — НЕ блокируем платёж
 * (лучше применить, чем потерять деньги клиента). Дедуп заработает после миграции.
 */
async function claimPayment(provider, paymentKey, userId, kind, metadata) {
  if (!paymentKey) return { alreadyProcessed: false, claimed: false };
  const db = getSupabase();
  const { error } = await db.from('processed_payments').insert({
    provider,
    payment_key: String(paymentKey),
    user_id: userId || null,
    kind: kind || null,
    metadata: metadata || null
  });
  if (!error) return { alreadyProcessed: false, claimed: true };

  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';
  // 23505 = unique_violation → платёж уже был обработан → no-op.
  if (code === '23505' || msg.includes('duplicate') || msg.includes('unique')) {
    return { alreadyProcessed: true, claimed: false };
  }
  // Таблица не создана (миграция не применена) — не блокируем платёж.
  if (msg.includes('does not exist') || msg.includes('relation') || code === '42P01') {
    console.warn('[apply] processed_payments table missing — skipping idempotency guard');
    return { alreadyProcessed: false, claimed: false };
  }
  // Прочая ошибка — тоже не блокируем оплату, только логируем.
  console.warn('[apply] claimPayment failed (continuing):', error.message);
  return { alreadyProcessed: false, claimed: false };
}

/**
 * H3-гард: атомарно зарезервировать промо «-50% первый месяц» за юзером.
 *
 * Скидка считается при СОЗДАНИИ инвойса от (!first_purchase_at). Два одновременных
 * _1m-инвойса оба видят first_purchase_at=NULL → оба берут скидку → двойное списание
 * 50%. Чтобы этого не было, ПЕРЕД выдачей скидки делаем conditional UPDATE:
 * строку получает только один запрос — он и получает скидку. Второй идёт по полной
 * цене (displayed == charged для обоих).
 *
 * @returns {Promise<{granted:boolean, guardActive:boolean}>}
 *   granted=true  → этот запрос зарезервировал промо, скидку выдаём.
 *   granted=false → промо уже занято другим запросом/использовано, скидку НЕ выдаём.
 *   guardActive=false → колонки ещё нет (миграция не накатана) → fail-open: разрешаем
 *   скидку (не ломаем happy path), гонка станет невозможной после миграции.
 */
async function claimFirstPurchasePromo(userId) {
  if (!userId) return { granted: false, guardActive: true };
  const db = getSupabase();
  const { data, error } = await db
    .from('users')
    .update({ first_purchase_promo_used_at: new Date().toISOString() })
    .eq('id', userId)
    .is('first_purchase_promo_used_at', null)
    .is('first_purchase_at', null)
    .select('id');

  if (error) {
    const msg = (error.message || '').toLowerCase();
    const code = error.code || '';
    // Колонки нет (миграция не применена) — не блокируем скидку.
    if (msg.includes('first_purchase_promo_used_at') ||
        msg.includes('does not exist') || msg.includes('column') || code === '42703') {
      console.warn('[promo] first_purchase_promo_used_at missing — skipping race guard');
      return { granted: true, guardActive: false };
    }
    // Прочая ошибка — не блокируем скидку, только логируем.
    console.warn('[promo] claimFirstPurchasePromo failed (allowing promo):', error.message);
    return { granted: true, guardActive: false };
  }

  // UPDATE ... RETURNING: строка есть → мы первыми зарезервировали промо.
  return { granted: Array.isArray(data) && data.length > 0, guardActive: true };
}

/**
 * Освободить резерв промо (обратно в NULL), если создание инвойса у провайдера
 * упало ПОСЛЕ успешного резерва — чтобы промо не «сгорело» из-за тех. ошибки.
 * Снимаем только пока first_purchase_at ещё NULL (реальной оплаты не было).
 */
async function releaseFirstPurchasePromo(userId) {
  if (!userId) return;
  try {
    const db = getSupabase();
    await db
      .from('users')
      .update({ first_purchase_promo_used_at: null })
      .eq('id', userId)
      .is('first_purchase_at', null);
  } catch (e) {
    console.warn('[promo] releaseFirstPurchasePromo failed:', e.message);
  }
}

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

  // Реферальный апгрейд превью (если есть пригласивший с превью этого дара)
  upgradeReferrerPreviewIfPaid(userId).catch(() => {});

  return { user_id: userId, book_purchased: true };
}

/**
 * Применить покупку add-on.
 *
 * Для Hero Journey add-ons (hero_journey_unlock*) дополнительно создаём/апгрейдим
 * запись в hero_journey_unlocks. dar_code должен быть передан в metadata.
 */
async function applyAddon({ userId, addonKey, provider, amountPaid, currency, providerMetadata, extraMetadata }) {
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
      metadata: { amount_paid: amountPaid, currency, provider, providerMetadata: providerMetadata || null, ...(extraMetadata || {}) }
    });
  } catch (e) {
    console.warn('[apply addon] insert failed:', e.message);
  }

  // === Hero Journey unlock: создаём запись в hero_journey_unlocks ===
  if (addonKey === 'hero_journey_unlock' ||
      addonKey === 'hero_journey_unlock_relative' ||
      addonKey === 'hero_journey_upgrade_preview') {
    const darCode = (extraMetadata && extraMetadata.dar_code) || (providerMetadata && providerMetadata.dar_code);
    if (darCode) {
      try {
        if (addonKey === 'hero_journey_upgrade_preview') {
          // Апгрейд существующего превью до полного
          const { data: existing } = await db
            .from('hero_journey_unlocks')
            .select('id')
            .eq('user_id', userId)
            .eq('dar_code', darCode)
            .maybeSingle();
          if (existing) {
            await db.from('hero_journey_unlocks').update({
              is_preview_only: false,
              source: 'upgrade_paid',
              upgraded_at: new Date().toISOString()
            }).eq('id', existing.id);
          } else {
            // Превью не было — создаём как полное
            await db.from('hero_journey_unlocks').insert({
              user_id: userId,
              dar_code: darCode,
              source: 'upgrade_paid',
              is_preview_only: false,
              source_metadata: { amount_paid: amountPaid, currency, provider }
            });
          }
        } else {
          // Новое полное открытие
          const source = addonKey === 'hero_journey_unlock_relative' ? 'purchase_relative' : 'purchase';
          await db.from('hero_journey_unlocks').upsert({
            user_id: userId,
            dar_code: darCode,
            source,
            is_preview_only: false,
            source_metadata: { amount_paid: amountPaid, currency, provider, addon_key: addonKey },
            upgraded_at: new Date().toISOString()
          }, { onConflict: 'user_id,dar_code' });
        }
        console.log('[apply addon] HJ unlock applied:', userId, darCode, addonKey);
      } catch (e) {
        console.warn('[apply addon] HJ unlock failed:', e.message);
      }
    } else {
      console.warn('[apply addon] HJ unlock requested but no dar_code in metadata');
    }
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

  // Идемпотентность: replay/повторная доставка того же платежа = no-op.
  // Помечаем платёж ДО применения; если он уже обработан — не применяем.
  const paymentKey = paymentKeyFor(provider, providerMetadata);
  const claim = await claimPayment(provider, paymentKey, userId, paymentType, {
    product_key: productKey, amount_paid: amountPaid, currency
  });
  if (claim.alreadyProcessed) {
    console.log('[apply] duplicate payment ignored:', provider, paymentKey);
    return { kind: 'duplicate', result: { already_processed: true, provider, payment_key: paymentKey } };
  }

  const extraMetadata = {};
  if (metadata.dar_code) extraMetadata.dar_code = metadata.dar_code;

  let result = null;

  if (paymentType === 'plan' && productKey) {
    result = { kind: 'plan', result: await applySubscription({
      userId, planKey: productKey, provider, amountPaid, currency, providerMetadata
    }) };
  } else if (paymentType === 'addon' && productKey) {
    result = { kind: 'addon', result: await applyAddon({
      userId, addonKey: productKey, provider, amountPaid, currency, providerMetadata, extraMetadata
    }) };
  } else if (paymentType === 'book') {
    result = { kind: 'book', result: await applyBookPurchase({
      userId, provider, amountPaid, currency, providerMetadata
    }) };
  } else {
    return { kind: null, error: 'unknown payment_type: ' + paymentType };
  }

  // === После любой успешной покупки: апгрейд превью Hero Journey пригласившему ===
  // (не блокируем основной поток, не ждём)
  upgradeReferrerPreviewIfPaid(userId).catch(err =>
    console.warn('[applyByMetadata] upgradeReferrerPreviewIfPaid failed:', err.message)
  );

  return result;
}

/**
 * При успешной оплате (любой тариф/Книга/add-on) этого пользователя —
 * если его кто-то пригласил, проверяем: у пригласившего есть превью
 * по дару этого пользователя? Если да — апгрейдим до полного.
 *
 * Это даёт виральный эффект: «друг заплатил → тебе автоматом открылся
 * полный Путь Героя по его дару».
 */
async function upgradeReferrerPreviewIfPaid(buyerUserId) {
  try {
    const db = getSupabase();

    // Кто купил
    const { data: buyer } = await db
      .from('users')
      .select('id, dar_code, first_name, username')
      .eq('id', buyerUserId)
      .single();
    if (!buyer || !buyer.dar_code) return null;

    // Кто пригласил
    const { data: refRow } = await db
      .from('referrals')
      .select('referrer_id')
      .eq('referred_id', buyerUserId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!refRow || !refRow.referrer_id) return null;

    // У реферера есть превью по дару покупателя?
    const { data: unlock } = await db
      .from('hero_journey_unlocks')
      .select('id, is_preview_only')
      .eq('user_id', refRow.referrer_id)
      .eq('dar_code', buyer.dar_code)
      .maybeSingle();

    if (unlock && unlock.is_preview_only) {
      // Апгрейдим
      await db.from('hero_journey_unlocks').update({
        is_preview_only: false,
        source: 'referral_full',
        upgraded_at: new Date().toISOString(),
        source_metadata: { referred_buyer_id: buyerUserId, upgraded_by: 'purchase' }
      }).eq('id', unlock.id);

      // Уведомление рефереру
      try {
        const { data: refUser } = await db
          .from('users')
          .select('telegram_id, first_name')
          .eq('id', refRow.referrer_id)
          .single();
        const botToken = (process.env.BOT_TOKEN || '').trim();
        if (refUser && refUser.telegram_id && botToken) {
          const friendName = buyer.first_name || buyer.username || 'твой друг';
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: refUser.telegram_id,
              text: `🎉 ${friendName} сделал(а) покупку!\n\nТебе автоматически открылся ПОЛНЫЙ Путь Героя по его дару (${buyer.dar_code}). Заходи в Путешествие Героя — теперь там доступны все 7 шагов 🗺`
            })
          });
        }
      } catch (e) {
        console.warn('[upgrade referrer] notification failed:', e.message);
      }

      console.log('[upgrade referrer] HJ preview upgraded to full for referrer', refRow.referrer_id, 'dar', buyer.dar_code);
      return { upgraded: true, referrer_id: refRow.referrer_id, dar_code: buyer.dar_code };
    }
    return null;
  } catch (e) {
    if (e && e.message && e.message.includes('does not exist')) return null;
    console.warn('[upgrade referrer] failed:', e.message);
    return null;
  }
}

module.exports = {
  applySubscription,
  applyBookPurchase,
  applyAddon,
  applyByMetadata,
  claimPayment,
  claimFirstPurchasePromo,
  releaseFirstPurchasePromo,
  paymentKeyFor,
  upgradeReferrerPreviewIfPaid
};
