/**
 * API для создания Telegram Stars invoices
 *
 * POST /api/payment
 *   action: 'create_book_invoice' — создаёт invoice для покупки Книги ($10 = 500⭐)
 *   action: 'create_donation'     — создаёт invoice для добровольного пожертвования
 *     body: { amount: number }    — сумма в Stars (мин 1)
 *
 * Возвращает: { invoice_url: '...' }
 * Клиент вызывает Telegram.WebApp.openInvoice(url, callback)
 */

const { requireUser } = require('./lib/auth');
const { getOrCreateUser } = require('./lib/db');

// Цены (в Stars)
const PRICES = {
  book_full_access: 500,  // ~$10 — полный доступ к Книге + Хранитель
};

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

  try {
    // Мягкая авторизация: пробуем получить юзера, но если не удалось —
    // всё равно создаём invoice (это просто ссылка на оплату, безвредная).
    // Настоящая проверка происходит в webhook при successful_payment.
    const { getUser } = require('./lib/auth');
    let tgUser = getUser(req);
    let user = null;

    if (tgUser && tgUser.id) {
      try {
        user = await getOrCreateUser(tgUser);
      } catch (e) {
        console.warn('[payment] getOrCreateUser failed:', e.message);
      }
    }

    // Fallback: берём telegram_id из initDataUnsafe (без валидации hash)
    if (!user) {
      try {
        const initData = req.headers['x-telegram-init-data'] || '';
        if (initData) {
          const params = new URLSearchParams(initData);
          const userJson = params.get('user');
          if (userJson) {
            const parsed = JSON.parse(userJson);
            if (parsed.id) {
              tgUser = parsed;
              user = await getOrCreateUser(parsed);
              console.log('[payment] Using unvalidated user fallback:', parsed.id);
            }
          }
        }
      } catch (e) {
        console.warn('[payment] fallback auth failed:', e.message);
      }
    }

    // Если совсем не удалось — создаём invoice без привязки к юзеру
    const telegramId = tgUser?.id || 0;

    const { action, amount } = req.body || {};

    // ========== ПОКУПКА КНИГИ ($10 = 500⭐) ==========
    if (action === 'create_book_invoice') {
      // Проверяем что юзер ещё не купил
      if (user && (user.access_level === 'extended' || user.access_level === 'premium')) {
        return res.json({
          already_purchased: true,
          message: 'У тебя уже есть полный доступ!'
        });
      }

      const price = PRICES.book_full_access;
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

      return res.json({
        invoice_url: invoiceUrl,
        amount: donationAmount,
        bonus_crystals: bonusCrystals,
        currency: 'XTR'
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[payment] Error:', e.message);
    return res.status(500).json({ error: 'Не удалось создать платёж. Попробуй позже.' });
  }
};
