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

const { requireUser } = require('./_lib/auth');
const { getOrCreateUser } = require('./_lib/db');

// YupPay (DarAI/NEAR) - Supabase Edge Function
const YUPPAY_API_URL = 'https://jkjgpbawhxtafmwsrseb.supabase.co/functions/v1/yuppay-api';
const YUPPAY_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpramdwYmF3aHh0YWZtd3Nyc2ViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzMDA3NjgsImV4cCI6MjA3NTg3Njc2OH0.Il2w6Vd40hGnosvI0QJKn2bHlZNrNvnl7UZxB92_vAQ';

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
    const { getUser } = require('./_lib/auth');
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

    // ========== ПОКУПКА КНИГИ ЧЕРЕЗ DARAI (YupPay) ==========
    if (action === 'create_darai_book_invoice') {
      if (user && (user.access_level === 'extended' || user.access_level === 'premium')) {
        return res.json({ already_purchased: true, message: 'У тебя уже есть полный доступ!' });
      }

      const yuppayKey = (process.env.YUPPAY_API_KEY || '').trim();
      if (!yuppayKey) {
        return res.status(503).json({ error: 'Оплата в DarAI временно недоступна' });
      }

      // Цена: 40 000 000 DarAI (~$10 при курсе $0.00000025/DarAI)
      // 40000000 * 10^18 (18 decimals для NEP-141)
      const DARAI_PRICE = '40000000000000000000000000';

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

        return res.json({
          invoice_url: data.pay_url,
          invoice_tg_url: data.pay_tg_url || (data.links && data.links.telegram_mini_app),
          price: '10 DarAI',
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
      // Тестовый режим полностью удалён 27.04.2026 — все продажи боевые 990 ₽.
      if (user && (user.access_level === 'extended' || user.access_level === 'premium')) {
        return res.json({ already_purchased: true, message: 'У тебя уже есть полный доступ!' });
      }

      const yooShopId = (process.env.YOOKASSA_SHOP_ID || '').trim();
      const yooSecret = (process.env.YOOKASSA_SECRET_KEY || '').trim();
      if (!yooShopId || !yooSecret) {
        return res.status(503).json({ error: 'Оплата картой временно недоступна. Попробуй Stars или DarAI.' });
      }

      const amountValue = '990.00';
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

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[payment] Error:', e.message);
    return res.status(500).json({ error: 'Не удалось создать платёж. Попробуй позже.' });
  }
};
