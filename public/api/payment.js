/**
 * API для создания Telegram Stars invoices
 *
 * POST /api/payment
 *   action: 'create_book_invoice' — создаёт invoice для покупки Книги ($10 = 700⭐)
 *   action: 'create_donation'     — создаёт invoice для добровольного пожертвования
 *     body: { amount: number }    — сумма в Stars (мин 1)
 *
 * Возвращает: { invoice_url: '...' }
 * Клиент вызывает Telegram.WebApp.openInvoice(url, callback)
 */

const { requireUser } = require('./_lib/auth');
const { getOrCreateUser, getOrCreateUserByEmail } = require('./_lib/db');
const pricing = require('./_lib/pricing');
const rates = require('./_lib/rates');
const { notifyAdmin, logEvent, escapeHtml } = require('./_lib/notify');
const subApply = require('./_lib/subscription_apply');
const rateLimit = require('./_lib/ratelimit');

// Тип А: попытка оплаты — счёт/ссылка на оплату успешно создан(а).
// Fire-and-forget: не ждём и не роняем ответ юзеру.
function notifyPayAttempt(provider, item, priceText, user, telegramId) {
  const who = escapeHtml((user && (user.first_name || user.username)) || ('id' + (telegramId || '?')));
  notifyAdmin(
    '💳 <b>Попытка оплаты</b>\n\n' +
    `Кто: ${who}\n` +
    `Что: ${escapeHtml(item)}\n` +
    `Сумма: ${escapeHtml(priceText)}\n` +
    `Способ: ${escapeHtml(provider)}\n\n` +
    `Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК`
  );
  logEvent('pay_attempt', { provider: provider, item: item, price: priceText, telegram_id: telegramId || null });
}

// YupPay (DarAI/NEAR) - Supabase Edge Function
// Ключ — публичный anon-ключ проекта YuPay. Берём из env (YUPPAY_ANON_KEY),
// с фолбэком на прежнее значение, чтобы платежи не сломались до установки env.
// После установки YUPPAY_ANON_KEY на сервере фолбэк можно удалить.
const YUPPAY_API_URL = 'https://jkjgpbawhxtafmwsrseb.supabase.co/functions/v1/yuppay-api';
const YUPPAY_ANON_KEY = process.env.YUPPAY_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpramdwYmF3aHh0YWZtd3Nyc2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMDA3NjgsImV4cCI6MjA3NTg3Njc2OH0.Il2w6Vd40hGnosvI0QJKn2bHlZNrNvnl7UZxB92_vAQ';

// Раздельные вшитые цены на Книгу удалены 02.07.2026 — теперь все валюты
// (кроме ₽) считаются ЖИВО из ₽-базы pricing.BOOK_PRODUCT.rub тем же helper'ом,
// что и /api/pricing (rates.priceAllCurrenciesWith). displayed == charged.

// Хелпер raw-amount DarAI (NEP-141, 18 decimals) из целого числа токенов.
// BigInt — чтобы не словить экспоненту/потерю точности на больших числах.
function daraiRaw(tokens) {
  return (BigInt(Math.round(tokens)) * (10n ** 18n)).toString();
}

// Вызов Telegram Bot API
async function callTelegramAPI(method, body) {
  const token = (process.env.BOT_TOKEN || '').trim();
  if (!token) throw new Error('BOT_TOKEN not configured');
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (!data.ok) {
    console.error(`[payment] Telegram API ${method} failed:`, data);
    throw new Error(data.description || 'Telegram API error');
  }
  return data.result;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate-limit создания инвойсов: 15 в минуту на клиента. Живой человек столько
  // счетов не создаёт — режется только автоматический флуд платёжного шлюза.
  if (!rateLimit.enforce(req, res, { bucket: 'payment', limit: 15, windowMs: 60000 })) return;

  try {
    // Мягкая авторизация: пробуем получить юзера, но если не удалось —
    // всё равно создаём invoice (это просто ссылка на оплату, безвредная).
    // Настоящая проверка происходит в webhook при successful_payment.
    // softInitData: допускаем HMAC-валидную, но устаревшую подпись, а также
    // гостевой отрицательный _web_uid. НЕ доверяем не-подписанному user из
    // initData. strictId=true: деньги/скидки завязаны на identity, поэтому
    // положительный НЕподписанный x-telegram-id здесь ЗАПРЕЩЁН (вектор подмены —
    // применить скидку/создать инвойс от чужого id). Это отличается от
    // нестрогих путей (профиль/контент), где такой id пускается low-trust.
    const { getUser } = require('./_lib/auth');
    let tgUser = getUser(req, { softInitData: true, strictId: true });
    let user = null;

    if (tgUser && tgUser.id) {
      try {
        user = await getOrCreateUser(tgUser);
      } catch (e) {
        console.warn('[payment] getOrCreateUser failed:', e.message);
      }
    }

    // Если совсем не удалось — создаём invoice без привязки к юзеру
    const telegramId = tgUser?.id || 0;

    const { action, amount } = req.body || {};

    // === ВЕБ-ПОКУПКА БЕЗ TELEGRAM ===
    // Юзер из веб-версии (нет Telegram) может оплатить картой (ЮKassa). Чтобы
    // доступ выдался автоматически (а не вручную), заводим/находим постоянный
    // аккаунт по email ДО создания счёта. Тогда user.id есть везде, meta.user_id
    // заполнен, и webhook сможет привязать оплату к этому аккаунту.
    // Работает только для покупок (не для донатов) и только при валидном email.
    const PURCHASE_ACTIONS = new Set([
      'create_subscription', 'create_addon',
      'create_yookassa_book', 'create_book_invoice', 'create_darai_book_invoice'
    ]);
    if ((!user || !user.id) && PURCHASE_ACTIONS.has(action)) {
      const bodyEmail = String((req.body && req.body.email) || '').trim().toLowerCase();
      if (bodyEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(bodyEmail)) {
        try {
          user = await getOrCreateUserByEmail(bodyEmail);
        } catch (e) {
          console.warn('[payment] getOrCreateUserByEmail failed:', e.message);
        }
      }
    }

    // ========== ПОКУПКА КНИГИ ($10 = 700⭐) ==========
    if (action === 'create_book_invoice') {
      // Проверяем что юзер ещё не купил
      if (user && (user.access_level === 'extended' || user.access_level === 'premium')) {
        return res.json({
          already_purchased: true,
          message: 'У тебя уже есть полный доступ!'
        });
      }

      // Живой расчёт цены Книги от ₽-базы (тот же helper, что и /api/pricing →
      // displayed == charged). getRates() не бросает; при битом снимке — фолбэк.
      let bookSnap = null;
      try { bookSnap = await rates.getRates(); }
      catch (e) { console.warn('[payment] getRates failed (book stars), fallback:', e.message); }
      const price = rates.priceAllCurrenciesWith(pricing.BOOK_PRODUCT.rub, bookSnap).stars;
      const userId = user ? user.id : telegramId;
      const payload = `book_full_access_${userId}_${Date.now()}`;

      console.log('[payment] Creating book invoice:', {
        user_id: user.id,
        telegram_id: tgUser.id,
        price,
        payload
      });

      const invoiceUrl = await callTelegramAPI('createInvoiceLink', {
        title: 'Книга Даров - полный доступ',
        description: 'Полная Книга Даров (94 главы) + уровень Хранитель (3 слота для близких, безлимит Оракула) + 50 кристаллов мудрости + дизайнерская PDF-версия в подарок',
        payload,
        currency: 'XTR',
        prices: [{ label: 'Полный доступ к Книге Даров', amount: price }]
      });

      notifyPayAttempt('Telegram Stars', 'Книга — полный доступ', `${price}⭐`, user, telegramId);
      return res.json({
        invoice_url: invoiceUrl,
        price,
        currency: 'XTR'
      });
    }

    // ========== ДОНЕЙШН (произвольная сумма) ==========
    if (action === 'create_donation') {
      const donationAmount = parseInt(amount, 10);
      if (!donationAmount || donationAmount < 1) {
        return res.status(400).json({ error: 'Укажи сумму пожертвования (минимум 1 звезда)' });
      }
      if (donationAmount > 100000) {
        return res.status(400).json({ error: 'Максимум 100 000 звёзд за раз' });
      }

      const donUserId = user ? user.id : telegramId;
      const payload = `donation_${donUserId}_${Date.now()}`;
      const bonusCrystals = Math.max(1, Math.floor(donationAmount / 10));

      console.log('[payment] Creating donation invoice:', {
        user_id: user.id,
        amount: donationAmount,
        bonus_crystals: bonusCrystals
      });

      const invoiceUrl = await callTelegramAPI('createInvoiceLink', {
        title: 'Поддержать YupDar',
        description: `Добровольное пожертвование на развитие проекта. В благодарность: +${bonusCrystals} кристаллов мудрости`,
        payload,
        currency: 'XTR',
        prices: [{ label: 'Пожертвование', amount: donationAmount }]
      });

      notifyPayAttempt('Telegram Stars', 'Пожертвование', `${donationAmount}⭐`, user, telegramId);
      return res.json({
        invoice_url: invoiceUrl,
        amount: donationAmount,
        bonus_crystals: bonusCrystals,
        currency: 'XTR'
      });
    }

    // ========== ПОКУПКА КНИГИ ЧЕРЕЗ DARAI (YupPay) ==========
    if (action === 'create_darai_book_invoice') {
      if (user && (user.access_level === 'extended' || user.access_level === 'premium')) {
        return res.json({ already_purchased: true, message: 'У тебя уже есть полный доступ!' });
      }

      const yuppayKey = (process.env.YUPPAY_API_KEY || '').trim();
      if (!yuppayKey) {
        return res.status(503).json({ error: 'Оплата в DarAI временно недоступна' });
      }

      // Цена в DarAI считается ЖИВО от ₽-базы Книги (тот же helper, что и
      // /api/pricing → displayed == charged). Raw-units через BigInt (18 decimals).
      let bookSnap = null;
      try { bookSnap = await rates.getRates(); }
      catch (e) { console.warn('[payment] getRates failed (book darai), fallback:', e.message); }
      const bookDarai = rates.priceAllCurrenciesWith(pricing.BOOK_PRODUCT.rub, bookSnap).darai;
      const DARAI_PRICE = daraiRaw(bookDarai);

      try {
        const resp = await fetch(YUPPAY_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': YUPPAY_ANON_KEY,
            'Authorization': 'Bearer ' + YUPPAY_ANON_KEY,
            'x-yuppay-api-key': yuppayKey
          },
          body: JSON.stringify({
            action: 'create_invoice',
            token_contract_id: 'darai.tkn.near',
            amount_raw: DARAI_PRICE,
            metadata: {
              payment_type: 'book',
              telegram_chat_id: telegramId,
              user_id: user ? user.id : null,
              return_url: 'https://t.me/YupDarBot'
            }
          })
        });

        const respText = await resp.text();
        console.log('[payment] YupPay response:', resp.status, respText);

        let data;
        try { data = JSON.parse(respText); } catch { data = {}; }

        if (!resp.ok) {
          console.error('[payment] YupPay HTTP error:', resp.status, respText);
          throw new Error(data.message || data.error || `YupPay HTTP ${resp.status}`);
        }

        if (!data.ok && !data.pay_tg_url && !data.pay_url) {
          console.error('[payment] YupPay create_invoice failed:', data);
          throw new Error(data.error || data.message || 'YupPay error');
        }

        const daraiLabel = `${(bookDarai / 1_000_000).toFixed(1)}M DarAI`;
        notifyPayAttempt('DarAI', 'Книга — полный доступ', daraiLabel, user, telegramId);
        return res.json({
          invoice_url: data.pay_url,
          invoice_tg_url: data.pay_tg_url || (data.links && data.links.telegram_mini_app),
          price: daraiLabel,
          currency: 'DARAI'
        });
      } catch (e) {
        console.error('[payment] YupPay error:', e.message);
        return res.status(500).json({ error: 'Не удалось создать платёж в DarAI: ' + e.message });
      }
    }

    // ========== ДОНЕЙШН ЧЕРЕЗ DARAI ==========
    if (action === 'create_darai_donation') {
      const donAmount = req.body.amount_raw;
      if (!donAmount) {
        return res.status(400).json({ error: 'Укажи сумму' });
      }

      const yuppayKey = (process.env.YUPPAY_API_KEY || '').trim();
      if (!yuppayKey) {
        return res.status(503).json({ error: 'Оплата в DarAI временно недоступна' });
      }

      try {
        const resp = await fetch(YUPPAY_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': YUPPAY_ANON_KEY,
            'Authorization': 'Bearer ' + YUPPAY_ANON_KEY,
            'x-yuppay-api-key': yuppayKey
          },
          body: JSON.stringify({
            action: 'create_invoice',
            token_contract_id: 'darai.tkn.near',
            amount_raw: donAmount,
            metadata: {
              payment_type: 'donation',
              telegram_chat_id: telegramId,
              user_id: user ? user.id : null,
              return_url: 'https://t.me/YupDarBot'
            }
          })
        });

        const respText = await resp.text();
        let data;
        try { data = JSON.parse(respText); } catch { data = {}; }

        if (!resp.ok || (!data.ok && !data.pay_tg_url && !data.pay_url)) {
          throw new Error(data.error || data.message || 'YupPay error');
        }

        notifyPayAttempt('DarAI', 'Пожертвование', String(donAmount) + ' DarAI', user, telegramId);
        return res.json({
          invoice_url: data.pay_url,
          invoice_tg_url: data.pay_tg_url || (data.links && data.links.telegram_mini_app),
          currency: 'DARAI'
        });
      } catch (e) {
        console.error('[payment] YupPay donation error:', e.message);
        return res.status(500).json({ error: 'Не удалось создать платёж: ' + e.message });
      }
    }

    // ========== ПОКУПКА КНИГИ ЧЕРЕЗ ЮKASSA ==========
    if (action === 'create_yookassa_book') {
      // Тестовый режим полностью удалён 27.04.2026 — все продажи боевые (749 ₽).
      if (user && (user.access_level === 'extended' || user.access_level === 'premium')) {
        return res.json({ already_purchased: true, message: 'У тебя уже есть полный доступ!' });
      }

      const yooShopId = (process.env.YOOKASSA_SHOP_ID || '').trim();
      const yooSecret = (process.env.YOOKASSA_SECRET_KEY || '').trim();
      if (!yooShopId || !yooSecret) {
        return res.status(503).json({ error: 'Оплата картой временно недоступна. Попробуй Stars или DarAI.' });
      }

      // ₽-цена Книги — из единого источника (pricing.BOOK_PRODUCT.rub), не литерал.
      const amountValue = `${pricing.BOOK_PRODUCT.rub}.00`;
      const description = 'Книга Даров — полный доступ + Хранитель';

      // Контакт от веб-юзера (вне Telegram Mini App): нужен либо TG-username, либо email.
      // Сценарии:
      //   1. Mini App → telegram_id есть, контакты не нужны
      //   2. Web с TG → пользователь вводит @username (приоритет)
      //   3. Web без TG → пользователь вводит email
      const userEmail = String(req.body.email || '').trim().toLowerCase();
      const userTgUsername = String(req.body.tg_username || '').trim().replace(/^@/, '').toLowerCase();
      const isWebUser = !user && !telegramId;
      if (isWebUser && !userEmail && !userTgUsername) {
        return res.status(400).json({ error: 'Укажи Telegram-username или email — без этого мы не сможем активировать доступ' });
      }

      const yooUserId = user ? user.id : (telegramId || userEmail || 'guest');
      const idempotenceKey = `yookassa_book_${yooUserId}_${Date.now()}`;
      const auth = Buffer.from(`${yooShopId}:${yooSecret}`).toString('base64');

      // ЮKassa email-чек: если задан email, передаём в receipt.customer для отправки чека по 54-ФЗ.
      // Это требует что у магазина включена услуга «Самозанятые» в ЮKassa, иначе чек игнорируется.
      const receiptBlock = userEmail ? {
        receipt: {
          customer: { email: userEmail },
          items: [{
            description: description.slice(0, 128),
            quantity: '1.00',
            amount: { value: amountValue, currency: 'RUB' },
            vat_code: 1,                // НДС не облагается (для самозанятых)
            payment_subject: 'service',
            payment_mode: 'full_payment'
          }]
        }
      } : {};

      try {
        const resp = await fetch('https://api.yookassa.ru/v3/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
            'Idempotence-Key': idempotenceKey
          },
          body: JSON.stringify({
            amount: { value: amountValue, currency: 'RUB' },
            confirmation: { type: 'redirect', return_url: 'https://t.me/YupDarBot' },
            capture: true,
            description,
            ...receiptBlock,
            metadata: {
              payment_type: 'book',
              telegram_id: String(telegramId || ''),
              user_id: user ? String(user.id) : '',
              email: userEmail,
              tg_username: userTgUsername
            }
          })
        });

        const respText = await resp.text();
        let data;
        try { data = JSON.parse(respText); } catch { data = {}; }

        if (!resp.ok) {
          console.error('[payment] YooKassa create failed:', resp.status, respText);
          return res.status(502).json({ error: data.description || 'Не удалось создать платёж в ЮKassa' });
        }

        const confirmUrl = data.confirmation && data.confirmation.confirmation_url;
        if (!confirmUrl) {
          console.error('[payment] YooKassa no confirmation_url:', data);
          return res.status(502).json({ error: 'ЮKassa не вернула ссылку на оплату' });
        }

        console.log('[payment] YooKassa book invoice created:', {
          payment_id: data.id,
          amount: amountValue,
          user_id: user ? user.id : null
        });

        notifyPayAttempt('ЮKassa (карта)', 'Книга — полный доступ', `${amountValue}₽`, user, telegramId);
        return res.json({
          invoice_url: confirmUrl,
          payment_id: data.id,
          price: amountValue,
          currency: 'RUB'
        });
      } catch (e) {
        console.error('[payment] YooKassa book error:', e.message);
        return res.status(500).json({ error: 'Не удалось создать платёж: ' + e.message });
      }
    }

    // ========== ДОНЕЙШН ЧЕРЕЗ ЮKASSA ==========
    if (action === 'create_yookassa_donation') {
      const donAmount = parseInt(amount, 10);
      if (!donAmount || donAmount < 10) {
        return res.status(400).json({ error: 'Минимальная сумма пожертвования — 10 ₽' });
      }
      if (donAmount > 100000) {
        return res.status(400).json({ error: 'Максимум 100 000 ₽ за раз' });
      }

      const yooShopId = (process.env.YOOKASSA_SHOP_ID || '').trim();
      const yooSecret = (process.env.YOOKASSA_SECRET_KEY || '').trim();
      if (!yooShopId || !yooSecret) {
        return res.status(503).json({ error: 'Оплата картой временно недоступна.' });
      }

      const yooUserId = user ? user.id : telegramId;
      const idempotenceKey = `yookassa_donation_${yooUserId}_${Date.now()}`;
      const auth = Buffer.from(`${yooShopId}:${yooSecret}`).toString('base64');
      const amountValue = `${donAmount}.00`;
      const bonusCrystals = Math.max(1, Math.floor(donAmount / 10));

      try {
        const resp = await fetch('https://api.yookassa.ru/v3/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
            'Idempotence-Key': idempotenceKey
          },
          body: JSON.stringify({
            amount: { value: amountValue, currency: 'RUB' },
            confirmation: { type: 'redirect', return_url: 'https://t.me/YupDarBot' },
            capture: true,
            description: `Пожертвование на развитие YupDar (+${bonusCrystals} кристаллов)`,
            metadata: {
              payment_type: 'donation',
              telegram_id: String(telegramId || ''),
              user_id: user ? String(user.id) : '',
              bonus_crystals: String(bonusCrystals)
            }
          })
        });

        const respText = await resp.text();
        let data;
        try { data = JSON.parse(respText); } catch { data = {}; }

        if (!resp.ok) {
          console.error('[payment] YooKassa donation create failed:', resp.status, respText);
          return res.status(502).json({ error: data.description || 'Не удалось создать платёж' });
        }

        const confirmUrl = data.confirmation && data.confirmation.confirmation_url;
        if (!confirmUrl) {
          return res.status(502).json({ error: 'ЮKassa не вернула ссылку на оплату' });
        }

        notifyPayAttempt('ЮKassa (карта)', 'Пожертвование', `${amountValue}₽`, user, telegramId);
        return res.json({
          invoice_url: confirmUrl,
          payment_id: data.id,
          amount: donAmount,
          bonus_crystals: bonusCrystals,
          currency: 'RUB'
        });
      } catch (e) {
        console.error('[payment] YooKassa donation error:', e.message);
        return res.status(500).json({ error: 'Не удалось создать платёж: ' + e.message });
      }
    }

    // =====================================================================
    // ============== НОВЫЕ ACTIONS ДЛЯ ПОДПИСОК И ADD-ONS (11.05.2026) =====
    // =====================================================================
    //
    // Все три провайдера (stars/yookassa/darai) принимают один body:
    //   { action, kind: 'plan'|'addon', key: 'guardian_1m'|'oracle_unlimited_7d'|..., provider, email? }
    //
    // Применение скидки -50% (промо первого месяца) делается на сервере, чтобы
    // юзер не мог подсунуть свою цену.

    if (action === 'create_subscription' || action === 'create_addon') {
      const kind = req.body.kind || (action === 'create_subscription' ? 'plan' : 'addon');
      const key = req.body.key;
      const provider = (req.body.provider || 'yookassa').toLowerCase();

      if (!key) return res.status(400).json({ error: 'key обязателен' });
      if (!['stars', 'yookassa', 'darai'].includes(provider)) {
        return res.status(400).json({ error: 'provider должен быть stars, yookassa или darai' });
      }
      if (!user || !user.id) {
        // Веб-юзеру без Telegram доступна оплата картой (ЮKassa) — но нужен email
        // (на него придёт чек и к нему привяжется доступ). Stars/DarAI требуют Telegram.
        return res.status(401).json({
          error: provider === 'yookassa'
            ? 'Укажи email — на него придёт чек и откроется доступ.'
            : 'Оплата через Stars/DarAI доступна только в Telegram. Для оплаты картой открой веб-версию и укажи email.'
        });
      }

      // Найти цену
      const product = kind === 'plan' ? pricing.PLANS[key] : pricing.ADDONS[key];
      if (!product) {
        return res.status(400).json({ error: 'Неизвестный тариф или add-on: ' + key });
      }

      // Промо: -50% «первый месяц любого тарифа» — только первая покупка юзера,
      // только plan и только МЕСЯЧНЫЙ период (_1m). На 3m/6m/12m, add-ons и Книгу
      // скидка НЕ действует. Это ровно то, что показывает клиент (pricing.html:
      // promoApplies = ... && UI.period === '1m'), поэтому displayed == charged.
      // H3: право на промо определяем от !first_purchase_at, но саму скидку выдаём
      // только после АТОМАРНОГО резерва промо за юзером. Два одновременных _1m-инвойса
      // оба видят first_purchase_at=NULL — но conditional UPDATE вернёт строку лишь
      // одному; второй идёт по полной цене (displayed == charged у обоих).
      // DarAI цену не дисконтирует (промо на DarAI не действует) — там резерв промо
      // не делаем, иначе промо «сгорит» без выгоды для юзера.
      const eligibleFirstPurchasePromo =
        kind === 'plan' && !user.first_purchase_at && /_1m$/.test(key) && provider !== 'darai';
      let promoClaimed = false;
      if (eligibleFirstPurchasePromo) {
        try {
          const claim = await subApply.claimFirstPurchasePromo(user.id);
          promoClaimed = claim.granted;
        } catch (e) {
          // При сбое гарда не блокируем покупку — просто без промо (полная цена).
          console.warn('[payment] promo claim failed, charging full price:', e.message);
          promoClaimed = false;
        }
      }
      const isFirstPurchasePromo = eligibleFirstPurchasePromo && promoClaimed;
      const discount = isFirstPurchasePromo ? 0.5 : 1.0;

      // Если промо зарезервировано, но инвойс у провайдера так и не создался —
      // вернуть резерв, чтобы промо не «сгорело» из-за тех. ошибки.
      const releasePromoOnFail = async () => {
        if (promoClaimed) {
          try { await subApply.releaseFirstPurchasePromo(user.id); }
          catch (e) { console.warn('[payment] promo release failed:', e.message); }
        }
      };

      // Живой расчёт цен от ₽-базы (тот же helper, что и /api/pricing → displayed == charged
      // в пределах 10-мин окна кэша). getRates() не бросает; при битом снимке — внутренний фолбэк.
      let snap = null;
      try { snap = await rates.getRates(); }
      catch (e) { console.warn('[payment] getRates failed, using fallback:', e.message); }
      const dyn = rates.priceAllCurrenciesWith(product.rub, snap);

      // Подсчитать цену в нужной валюте с учётом скидки
      const priceRub = Math.round(product.rub * discount);
      const priceStars = Math.max(1, Math.round(dyn.stars * discount));
      const priceUsd = Math.round(dyn.usd * discount * 100) / 100;
      const priceDarai = dyn.darai; // DarAI по живому курсу, без скидки (промо на DarAI не действует)

      // Описание
      const label = product.label || (kind === 'plan' ? 'Подписка YupDar' : 'Покупка YupDar');
      const description = isFirstPurchasePromo ? `${label} (промо: -50% на первый месяц)` : label;

      // Метаданные для webhook
      const meta = {
        payment_type: kind,           // 'plan' | 'addon'
        product_key: key,             // 'guardian_1m' | 'oracle_unlimited_7d' | ...
        plan_days: product.days || null,
        user_id: String(user.id),
        telegram_id: String(telegramId || ''),
        provider,
        first_purchase_promo: isFirstPurchasePromo ? '1' : '0',
        original_rub: String(product.rub),
        discount_applied: String(discount)
      };

      // Для Hero Journey unlock add-ons — обязателен dar_code в body, кладём в metadata
      const isHJAddon = kind === 'addon' && (
        key === 'hero_journey_unlock' ||
        key === 'hero_journey_unlock_relative' ||
        key === 'hero_journey_upgrade_preview'
      );
      if (isHJAddon) {
        const darCode = req.body.dar_code;
        if (!darCode) {
          return res.status(400).json({ error: 'Для этой покупки нужен dar_code в body' });
        }
        meta.dar_code = darCode;
      }

      // === STARS ===
      if (provider === 'stars') {
        try {
          // Для HJ unlock дополнительно кодируем dar_code в payload через "@"
          const payloadSuffix = isHJAddon && meta.dar_code ? `@${meta.dar_code}` : '';
          const payload = `${kind}_${key}_${user.id}_${Date.now()}${payloadSuffix}`;
          const invoiceUrl = await callTelegramAPI('createInvoiceLink', {
            title: label.slice(0, 32),
            description: description.slice(0, 255),
            payload,
            currency: 'XTR',
            prices: [{ label: label.slice(0, 32), amount: priceStars }]
          });
          notifyPayAttempt('Telegram Stars', label, `${priceStars}⭐`, user, telegramId);
          return res.json({
            invoice_url: invoiceUrl,
            price: priceStars,
            currency: 'XTR',
            promo_applied: isFirstPurchasePromo
          });
        } catch (e) {
          console.error('[payment] subscription stars error:', e.message);
          await releasePromoOnFail();
          return res.status(500).json({ error: 'Не удалось создать счёт Stars: ' + e.message });
        }
      }

      // === YOOKASSA ===
      if (provider === 'yookassa') {
        const yooShopId = (process.env.YOOKASSA_SHOP_ID || '').trim();
        const yooSecret = (process.env.YOOKASSA_SECRET_KEY || '').trim();
        if (!yooShopId || !yooSecret) {
          await releasePromoOnFail();
          return res.status(503).json({ error: 'Оплата картой временно недоступна. Попробуй Stars или DarAI.' });
        }

        const idempotenceKey = `${kind}_${key}_${user.id}_${Date.now()}`;
        const auth = Buffer.from(`${yooShopId}:${yooSecret}`).toString('base64');
        const amountValue = `${priceRub}.00`;
        const userEmail = String(req.body.email || '').trim().toLowerCase();

        const receiptBlock = userEmail ? {
          receipt: {
            customer: { email: userEmail },
            items: [{
              description: description.slice(0, 128),
              quantity: '1.00',
              amount: { value: amountValue, currency: 'RUB' },
              vat_code: 1,
              payment_subject: 'service',
              payment_mode: 'full_payment'
            }]
          }
        } : {};

        try {
          const resp = await fetch('https://api.yookassa.ru/v3/payments', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${auth}`,
              'Idempotence-Key': idempotenceKey
            },
            body: JSON.stringify({
              amount: { value: amountValue, currency: 'RUB' },
              confirmation: { type: 'redirect', return_url: 'https://t.me/YupDarBot' },
              capture: true,
              description,
              ...receiptBlock,
              metadata: { ...meta, email: userEmail }
            })
          });
          const respText = await resp.text();
          let data; try { data = JSON.parse(respText); } catch { data = {}; }
          if (!resp.ok) {
            console.error('[payment] yookassa subscription failed:', resp.status, respText);
            await releasePromoOnFail();
            return res.status(502).json({ error: data.description || 'Не удалось создать платёж' });
          }
          const confirmUrl = data.confirmation && data.confirmation.confirmation_url;
          if (!confirmUrl) {
            await releasePromoOnFail();
            return res.status(502).json({ error: 'ЮKassa не вернула ссылку' });
          }
          notifyPayAttempt('ЮKassa (карта)', label, `${priceRub}₽`, user, telegramId);
          return res.json({
            invoice_url: confirmUrl,
            payment_id: data.id,
            price: priceRub,
            currency: 'RUB',
            promo_applied: isFirstPurchasePromo
          });
        } catch (e) {
          console.error('[payment] yookassa subscription threw:', e.message);
          await releasePromoOnFail();
          return res.status(500).json({ error: 'Не удалось создать платёж: ' + e.message });
        }
      }

      // === DARAI ===
      if (provider === 'darai') {
        const yuppayKey = (process.env.YUPPAY_API_KEY || '').trim();
        if (!yuppayKey) {
          return res.status(503).json({ error: 'Оплата в DarAI временно недоступна' });
        }
        // DarAI по живому курсу, в base units (×10^18 для NEP-141). BigInt — надёжно.
        const amountRaw = daraiRaw(priceDarai);
        try {
          const resp = await fetch(YUPPAY_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': YUPPAY_ANON_KEY,
              'Authorization': 'Bearer ' + YUPPAY_ANON_KEY,
              'x-yuppay-api-key': yuppayKey
            },
            body: JSON.stringify({
              action: 'create_invoice',
              token_contract_id: 'darai.tkn.near',
              amount_raw: amountRaw,
              metadata: { ...meta, return_url: 'https://t.me/YupDarBot' }
            })
          });
          const respText = await resp.text();
          let data; try { data = JSON.parse(respText); } catch { data = {}; }
          if (!resp.ok || (!data.ok && !data.pay_tg_url && !data.pay_url)) {
            console.error('[payment] darai subscription failed:', resp.status, respText);
            return res.status(500).json({ error: data.error || data.message || 'YupPay error' });
          }
          notifyPayAttempt('DarAI', label, `${(priceDarai / 1_000_000).toFixed(0)}M DarAI`, user, telegramId);
          return res.json({
            invoice_url: data.pay_url,
            invoice_tg_url: data.pay_tg_url || (data.links && data.links.telegram_mini_app),
            price: `${(priceDarai / 1_000_000).toFixed(0)}M DarAI`,
            currency: 'DARAI',
            promo_applied: false // на DarAI промо не действует — цена фиксирована
          });
        } catch (e) {
          console.error('[payment] darai subscription threw:', e.message);
          return res.status(500).json({ error: 'Не удалось создать платёж DarAI: ' + e.message });
        }
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[payment] Error:', e.message);
    return res.status(500).json({ error: 'Не удалось создать платёж. Попробуй позже.' });
  }
};
