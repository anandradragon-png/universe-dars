/**
 * Консолидированный webhook handler для трёх платёжных провайдеров:
 * - bot       (Telegram Stars)
 * - tbank     (Тинькофф/T-Bank)
 * - yuppay    (YupPay/DarAI/NEAR)
 *
 * Роутинг по req.query.provider (через vercel.json rewrites).
 *
 * Env vars:
 *   BOT_TOKEN, TBANK_PASSWORD, YUPPAY_WEBHOOK_SECRET
 */

const crypto = require('crypto');
const { getSupabase, addCrystals } = require('./_lib/db');

// =====================================================================
// ========== BOT (Telegram Stars) =====================================
// =====================================================================

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
    console.error(`[bot-webhook] Telegram API ${method} failed:`, data);
    throw new Error(data.description || 'Telegram API error');
  }
  return data.result;
}

async function handleBotWebhook(req, res) {
  // Telegram шлёт POST с JSON body
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'bot webhook active' });
  }
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const update = req.body;
    if (!update) return res.status(200).end(); // пустой update = ок

    // ========== PRE_CHECKOUT_QUERY ==========
    // Telegram требует ответить на это в течение 10 секунд, иначе оплата отменяется
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      console.log('[bot-webhook] pre_checkout_query:', JSON.stringify({
        id: query.id,
        from_id: query.from?.id,
        currency: query.currency,
        total_amount: query.total_amount,
        payload: query.invoice_payload
      }));

      // Подтверждаем оплату (можно добавить проверки если нужно)
      try {
        await callTelegramAPI('answerPreCheckoutQuery', {
          pre_checkout_query_id: query.id,
          ok: true
        });
      } catch (e) {
        console.error('[bot-webhook] answerPreCheckoutQuery failed:', e.message);
        // Пробуем отклонить если подтверждение не прошло
        try {
          await callTelegramAPI('answerPreCheckoutQuery', {
            pre_checkout_query_id: query.id,
            ok: false,
            error_message: 'Произошла ошибка. Попробуйте позже.'
          });
        } catch (e2) {}
      }
      return res.status(200).end();
    }

    // ========== SUCCESSFUL_PAYMENT ==========
    if (update.message && update.message.successful_payment) {
      const payment = update.message.successful_payment;
      const fromUser = update.message.from;
      const telegramId = fromUser?.id;

      console.log('[bot-webhook] successful_payment:', JSON.stringify({
        telegram_id: telegramId,
        currency: payment.currency,
        total_amount: payment.total_amount,
        payload: payment.invoice_payload,
        telegram_payment_charge_id: payment.telegram_payment_charge_id
      }));

      if (!telegramId) {
        console.error('[bot-webhook] No telegram_id in successful_payment');
        return res.status(200).end();
      }

      // Определяем тип покупки из payload
      const payload = payment.invoice_payload || '';
      const db = getSupabase();

      if (payload.startsWith('book_full_access_')) {
        // ===== ПОКУПКА: Полный доступ к Книге + уровень Хранитель =====
        try {
          // Находим юзера по telegram_id
          const { data: user } = await db
            .from('users')
            .select('id, telegram_id, access_level, crystals')
            .eq('telegram_id', telegramId)
            .single();

          if (!user) {
            console.error('[bot-webhook] User not found for telegram_id:', telegramId);
            return res.status(200).end();
          }

          // Обновляем уровень доступа на extended (Хранитель)
          // Не понижаем если уже premium
          const newLevel = user.access_level === 'premium' ? 'premium' : 'extended';
          await db.from('users').update({
            access_level: newLevel
          }).eq('id', user.id);

          // Начисляем бонусные кристаллы (+50)
          await addCrystals(user.id, 50, 'purchase_book', {
            payment_id: payment.telegram_payment_charge_id,
            amount: payment.total_amount,
            currency: payment.currency
          });

          console.log('[bot-webhook] User upgraded:', {
            user_id: user.id,
            telegram_id: telegramId,
            old_level: user.access_level,
            new_level: newLevel,
            crystals_bonus: 50
          });

          // Отправляем сообщение подтверждения в чат
          try {
            await callTelegramAPI('sendMessage', {
              chat_id: telegramId,
              text: '🎉 Спасибо за покупку!\n\n' +
                '✅ Полный доступ к Книге Даров активирован\n' +
                '✅ Уровень: Хранитель 🛡\n' +
                '✅ +50 кристаллов мудрости в подарок\n' +
                '✅ 3 слота для близких\n' +
                '✅ Безлимитный Оракул\n\n' +
                'Открой приложение чтобы увидеть изменения. Наслаждайся! 💜',
              parse_mode: 'HTML'
            });
          } catch (msgErr) {
            console.warn('[bot-webhook] sendMessage failed:', msgErr.message);
          }

        } catch (dbErr) {
          console.error('[bot-webhook] DB update failed:', dbErr.message);
        }

      } else if (payload.startsWith('donation_')) {
        // ===== ДОНЕЙШН =====
        try {
          const { data: user } = await db
            .from('users')
            .select('id')
            .eq('telegram_id', telegramId)
            .single();

          if (user) {
            // Логируем донейшн в crystal_log как отдельный тип
            // Бонус: 1 кристалл за каждые 10 Stars пожертвования
            const bonusCrystals = Math.max(1, Math.floor(payment.total_amount / 10));
            await addCrystals(user.id, bonusCrystals, 'donation', {
              payment_id: payment.telegram_payment_charge_id,
              amount: payment.total_amount,
              currency: payment.currency
            });

            console.log('[bot-webhook] Donation received:', {
              user_id: user.id,
              amount: payment.total_amount,
              bonus_crystals: bonusCrystals
            });
          }

          // Благодарственное сообщение
          try {
            const starsAmount = payment.total_amount;
            await callTelegramAPI('sendMessage', {
              chat_id: telegramId,
              text: `💜 Огромное спасибо за поддержку!\n\n` +
                `Ты пожертвовал(а) ${starsAmount} ⭐\n` +
                `В благодарность: +${Math.max(1, Math.floor(starsAmount / 10))} кристаллов мудрости 💎\n\n` +
                `Твоя поддержка помогает проекту развиваться. Спасибо, что веришь в YupDar! ✨`
            });
          } catch (msgErr) {
            console.warn('[bot-webhook] donation message failed:', msgErr.message);
          }

        } catch (dbErr) {
          console.error('[bot-webhook] Donation DB error:', dbErr.message);
        }

      } else {
        console.log('[bot-webhook] Unknown payload:', payload);
      }

      return res.status(200).end();
    }

    // Любые другие updates — игнорируем
    return res.status(200).end();

  } catch (e) {
    console.error('[bot-webhook] Fatal error:', e.message);
    // Telegram требует 200 даже при ошибках, иначе будет retry
    return res.status(200).end();
  }
}

// =====================================================================
// ========== TBANK (Тинькофф) =========================================
// =====================================================================

/**
 * Генерация токена для проверки подписи Тинькофф.
 * Алгоритм: собираем все параметры (кроме Token и Receipt),
 * добавляем Password, сортируем по ключу, конкатенируем значения,
 * берём SHA-256.
 */
function generateTbankToken(params, password) {
  const data = { ...params };
  delete data.Token;
  delete data.Receipt;
  delete data.DATA;
  data.Password = password;

  const sortedKeys = Object.keys(data).sort();
  const concatenated = sortedKeys.map(k => data[k]).join('');

  return crypto.createHash('sha256').update(concatenated).digest('hex');
}

async function handleTbankWebhook(req, res) {
  // GET — проверка что webhook жив
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'tbank webhook active' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const password = (process.env.TBANK_PASSWORD || '').trim();

    console.log('[tbank-webhook] Received:', JSON.stringify({
      TerminalKey: body.TerminalKey,
      OrderId: body.OrderId,
      Status: body.Status,
      Amount: body.Amount,
      PaymentId: body.PaymentId
    }));

    // Проверка подписи
    if (password) {
      const expectedToken = generateTbankToken(body, password);
      if (body.Token && body.Token !== expectedToken) {
        console.error('[tbank-webhook] Invalid token signature');
        return res.status(200).send('OK'); // Тинькофф ждёт 200 всегда
      }
    }

    // Обрабатываем только успешные платежи
    if (body.Status !== 'CONFIRMED') {
      console.log('[tbank-webhook] Ignoring status:', body.Status);
      return res.status(200).send('OK');
    }

    // OrderId формат: book_{telegramId}_{timestamp} или donation_{telegramId}_{timestamp}
    const orderId = body.OrderId || '';
    const parts = orderId.split('_');
    const paymentType = parts[0]; // book или donation
    const telegramId = parts[1];

    if (!telegramId) {
      console.warn('[tbank-webhook] No telegramId in OrderId:', orderId);
      return res.status(200).send('OK');
    }

    const db = getSupabase();

    // Находим юзера
    const { data: user } = await db
      .from('users')
      .select('id, telegram_id, access_level, crystals')
      .eq('telegram_id', telegramId)
      .single();

    if (!user) {
      console.error('[tbank-webhook] User not found:', telegramId);
      return res.status(200).send('OK');
    }

    // Проверяем дубликат (idempotency).
    // Используем ->> для текстового сравнения значения внутри JSONB.
    const { data: existingList } = await db
      .from('crystal_log')
      .select('id')
      .eq('user_id', user.id)
      .eq('metadata->>PaymentId', String(body.PaymentId))
      .limit(1);

    if (existingList && existingList.length > 0) {
      console.log('[tbank-webhook] Duplicate payment, skipping:', body.PaymentId);
      return res.status(200).send('OK');
    }

    if (paymentType === 'book') {
      // Апгрейд на Хранитель
      const newLevel = user.access_level === 'premium' ? 'premium' : 'extended';
      await db.from('users').update({ access_level: newLevel }).eq('id', user.id);

      // +50 кристаллов
      await addCrystals(user.id, 50, 'purchase_book_tbank', {
        PaymentId: body.PaymentId,
        Amount: body.Amount,
        OrderId: body.OrderId
      });

      console.log('[tbank-webhook] User upgraded:', user.id, '->', newLevel);

      // Уведомление в Telegram
      try {
        const botToken = (process.env.BOT_TOKEN || '').trim();
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramId,
              text: 'Спасибо за покупку!\n\n' +
                'Полный доступ к Книге Даров активирован\n' +
                'Уровень: Хранитель\n' +
                '+50 кристаллов мудрости\n\n' +
                'Открой приложение чтобы увидеть изменения.'
            })
          });
        }
      } catch (e) {
        console.warn('[tbank-webhook] sendMessage failed:', e.message);
      }

    } else if (paymentType === 'donation') {
      // Донейшн — бонусные кристаллы (1 кристалл за каждые 100 руб)
      const amountKopecks = parseInt(body.Amount || '0', 10);
      const bonusCrystals = Math.max(1, Math.floor(amountKopecks / 10000));

      await addCrystals(user.id, bonusCrystals, 'donation_tbank', {
        PaymentId: body.PaymentId,
        Amount: body.Amount,
        OrderId: body.OrderId
      });

      try {
        const botToken = (process.env.BOT_TOKEN || '').trim();
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramId,
              text: `Спасибо за поддержку!\n\n+${bonusCrystals} кристаллов мудрости в благодарность`
            })
          });
        }
      } catch (e) {}
    }

    // Тинькофф ждёт ответ "OK"
    return res.status(200).send('OK');
  } catch (e) {
    console.error('[tbank-webhook] Error:', e.message);
    return res.status(200).send('OK'); // Всегда 200, иначе Тинькофф будет повторять
  }
}

// =====================================================================
// ========== YUPPAY (DarAI/NEAR) ======================================
// =====================================================================

async function handleYuppayWebhook(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'yuppay webhook active' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const webhookSecret = (process.env.YUPPAY_WEBHOOK_SECRET || '').trim();

    // Получаем raw body для проверки подписи
    // Vercel может передать body как объект (уже распарсенный)
    // или как Buffer/string (если настроен raw body parsing)
    let rawBody;
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
    } else {
      // Vercel парсит JSON автоматически - re-stringify
      // Это может не совпасть байт-в-байт с оригиналом,
      // но YupPay тоже использует JSON.stringify на своей стороне
      rawBody = JSON.stringify(req.body);
    }

    // Проверка HMAC подписи
    if (webhookSecret) {
      const signature = req.headers['x-yuppay-signature'] || '';
      const timestamp = req.headers['x-yuppay-timestamp'] || '';

      if (!signature || !timestamp) {
        console.error('[yuppay-webhook] Missing signature or timestamp headers');
        return res.status(401).json({ error: 'Missing signature' });
      }

      // Формат подписи: t=<timestamp>,v1=<hmac_hex>
      const sigParts = {};
      signature.split(',').forEach(part => {
        const [k, v] = part.split('=', 2);
        if (k && v) sigParts[k.trim()] = v.trim();
      });

      const signPayload = `${timestamp}.${rawBody}`;
      const expectedHmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(signPayload)
        .digest('hex');

      if (!sigParts.v1) {
        console.error('[yuppay-webhook] No v1 in signature');
        return res.status(401).json({ error: 'Invalid signature format' });
      }

      try {
        const valid = crypto.timingSafeEqual(
          Buffer.from(expectedHmac, 'hex'),
          Buffer.from(sigParts.v1, 'hex')
        );
        if (!valid) {
          console.error('[yuppay-webhook] Signature mismatch');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      } catch (e) {
        console.error('[yuppay-webhook] Signature comparison error:', e.message);
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { type, data } = body || {};

    if (type !== 'payment.confirmed') {
      console.log('[yuppay-webhook] Ignoring event type:', type);
      return res.status(200).json({ ok: true });
    }

    console.log('[yuppay-webhook] payment.confirmed:', JSON.stringify({
      invoice_id: data?.invoice_id,
      amount_raw: data?.amount_raw,
      token: data?.token_contract_id,
      payer: data?.payer_near_account,
      settlement_tx: data?.settlement_tx_hash,
      metadata: data?.metadata
    }));

    const metadata = data?.metadata || {};
    const telegramChatId = metadata.telegram_chat_id;
    const paymentType = metadata.payment_type || 'book';

    if (!telegramChatId) {
      console.warn('[yuppay-webhook] No telegram_chat_id in metadata');
      return res.status(200).json({ ok: true });
    }

    const db = getSupabase();

    // Защита от дубликатов по invoice_id
    // Используем ->> для текстового сравнения в JSONB
    if (data?.invoice_id) {
      const { data: existingList } = await db
        .from('crystal_log')
        .select('id, metadata')
        .eq('metadata->>invoice_id', String(data.invoice_id))
        .limit(1);

      if (existingList && existingList.length > 0) {
        console.log('[yuppay-webhook] Duplicate invoice, skipping:', data.invoice_id);
        return res.status(200).json({ ok: true });
      }
    }

    // Находим юзера по telegram_id
    const { data: user } = await db
      .from('users')
      .select('id, telegram_id, access_level, crystals')
      .eq('telegram_id', String(telegramChatId))
      .single();

    if (!user) {
      console.error('[yuppay-webhook] User not found:', telegramChatId);
      return res.status(200).json({ ok: true });
    }

    if (paymentType === 'book') {
      // Апгрейд на Хранитель
      const newLevel = user.access_level === 'premium' ? 'premium' : 'extended';
      await db.from('users').update({ access_level: newLevel }).eq('id', user.id);

      // +50 кристаллов
      await addCrystals(user.id, 50, 'purchase_book_darai', {
        invoice_id: data.invoice_id,
        amount_raw: data.amount_raw,
        token: data.token_contract_id,
        payer: data.payer_near_account,
        settlement_tx: data.settlement_tx_hash
      });

      console.log('[yuppay-webhook] User upgraded:', user.id, '->', newLevel);

      // Сообщение в Telegram
      try {
        const botToken = (process.env.BOT_TOKEN || '').trim();
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: 'Спасибо за покупку через DarAI!\n\n' +
                'Полный доступ к Книге Даров активирован\n' +
                'Уровень: Хранитель\n' +
                '+50 кристаллов мудрости\n\n' +
                'Открой приложение чтобы увидеть изменения.'
            })
          });
        }
      } catch (e) {
        console.warn('[yuppay-webhook] sendMessage failed:', e.message);
      }

    } else if (paymentType === 'donation') {
      // Донейшн — бонусные кристаллы (1 кристалл за каждые 10^18 raw units)
      const bonusCrystals = Math.max(1, Math.floor(parseInt(data.amount_raw || '0') / 1e18 * 10));
      await addCrystals(user.id, bonusCrystals, 'donation_darai', {
        invoice_id: data.invoice_id,
        amount_raw: data.amount_raw,
        payer: data.payer_near_account,
        settlement_tx: data.settlement_tx_hash
      });

      try {
        const botToken = (process.env.BOT_TOKEN || '').trim();
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: `Спасибо за поддержку в DarAI!\n\n+${bonusCrystals} кристаллов мудрости в благодарность`
            })
          });
        }
      } catch (e) {}
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[yuppay-webhook] Error:', e.message, e.stack);
    // Всегда 200, иначе YupPay будет повторять
    return res.status(200).json({ ok: true });
  }
}

// =====================================================================
// ========== YOOKASSA (ЮKassa) ========================================
// =====================================================================

async function handleYookassaWebhook(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'yookassa webhook active' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const event = body && body.event;
    const obj = body && body.object;

    console.log('[yookassa-webhook] Received:', JSON.stringify({
      event,
      payment_id: obj && obj.id,
      status: obj && obj.status,
      amount: obj && obj.amount,
      metadata: obj && obj.metadata
    }));

    // Реагируем только на успешные платежи. Остальные просто логируем 200.
    if (event !== 'payment.succeeded' || !obj || obj.status !== 'succeeded') {
      return res.status(200).json({ ok: true });
    }

    // Доп. защита: дёрнем GET /v3/payments/{id} для подтверждения статуса
    // (IP можно подделать, авторитетный источник — сам API ЮKassa)
    const yooShopId = (process.env.YOOKASSA_SHOP_ID || '').trim();
    const yooSecret = (process.env.YOOKASSA_SECRET_KEY || '').trim();
    if (yooShopId && yooSecret && obj.id) {
      try {
        const auth = Buffer.from(`${yooShopId}:${yooSecret}`).toString('base64');
        const verifyResp = await fetch(`https://api.yookassa.ru/v3/payments/${obj.id}`, {
          headers: { 'Authorization': `Basic ${auth}` }
        });
        const verifyData = await verifyResp.json();
        if (verifyData.status !== 'succeeded') {
          console.warn('[yookassa-webhook] Status mismatch on verify:', verifyData.status);
          return res.status(200).json({ ok: true });
        }
      } catch (e) {
        console.warn('[yookassa-webhook] Verify call failed:', e.message);
        // не блокируем — лучше начислить чем потерять платёж
      }
    }

    const metadata = obj.metadata || {};
    const paymentType = metadata.payment_type || '';
    const telegramId = metadata.telegram_id || '';
    const userEmail = (metadata.email || '').toLowerCase();
    const userTgUsername = (metadata.tg_username || '').toLowerCase();
    const amountValue = obj.amount && obj.amount.value;

    const db = getSupabase();

    // Идемпотентность: один и тот же payment_id не обрабатывать дважды
    const { data: existingList } = await db
      .from('crystal_log')
      .select('id')
      .eq('metadata->>yookassa_payment_id', String(obj.id))
      .limit(1);

    if (existingList && existingList.length > 0) {
      console.log('[yookassa-webhook] Duplicate payment, skipping:', obj.id);
      return res.status(200).json({ ok: true });
    }

    // Ищем пользователя в порядке надёжности:
    //   1) telegram_id (если оплата из Mini App — самый надёжный источник, валидирован)
    //   2) tg_username (если веб-юзер ввёл свой @username и он совпал с username в БД)
    //   3) email (через crystal_log, если такой email уже привязывался к юзеру)
    let user = null;
    if (telegramId) {
      const { data } = await db.from('users').select('id, telegram_id, access_level, crystals')
        .eq('telegram_id', String(telegramId)).single();
      if (data) user = data;
    }
    if (!user && userTgUsername) {
      const { data } = await db.from('users').select('id, telegram_id, access_level, crystals')
        .ilike('username', userTgUsername).limit(1).single();
      if (data) user = data;
    }
    // 3) Поиск по email через предыдущие активации (если email уже встречался в metadata)
    if (!user && userEmail) {
      const { data: prevByEmail } = await db.from('crystal_log').select('user_id, metadata')
        .eq('metadata->>yookassa_email', userEmail).limit(1);
      if (prevByEmail && prevByEmail[0] && prevByEmail[0].user_id) {
        const { data } = await db.from('users').select('id, telegram_id, access_level, crystals')
          .eq('id', prevByEmail[0].user_id).single();
        if (data) user = data;
      }
    }

    if (!user) {
      // Юзер не найден — это веб-покупка, которую владелец активирует вручную.
      // Логируем максимально подробно, чтобы Света увидела платёж в Vercel Logs и Supabase.
      console.warn('[yookassa-webhook] PENDING PURCHASE — user not found:', JSON.stringify({
        payment_id: obj.id,
        amount: amountValue,
        email: userEmail,
        tg_username: userTgUsername,
        telegram_id: telegramId,
        payment_type: paymentType,
        created_at: obj.created_at
      }));
      // Сохраняем в crystal_log с user_id=null, чтобы Света могла найти запросом по metadata.
      // Если в схеме user_id NOT NULL — упадёт и просто оставим в логах (это ОК).
      try {
        await db.from('crystal_log').insert({
          user_id: null,
          amount: 0,
          reason: 'pending_yookassa',
          metadata: {
            yookassa_payment_id: obj.id,
            yookassa_email: userEmail,
            yookassa_tg_username: userTgUsername,
            yookassa_amount: amountValue,
            yookassa_payment_type: paymentType,
            yookassa_status: 'pending_manual_activation'
          }
        });
      } catch (e) {
        console.warn('[yookassa-webhook] Could not save pending row (likely user_id NOT NULL):', e.message);
      }
      return res.status(200).json({ ok: true });
    }

    // chat_id для отправки сообщения в Telegram. Если оплата пришла из Mini App —
    // metadata.telegram_id уже валидирован. Если найден по username/email — берём из user.telegram_id.
    const tgChatId = telegramId || (user.telegram_id ? String(user.telegram_id) : '');

    if (paymentType === 'book') {
      // Апгрейд на Хранитель
      const newLevel = user.access_level === 'premium' ? 'premium' : 'extended';
      await db.from('users').update({ access_level: newLevel }).eq('id', user.id);

      await addCrystals(user.id, 50, 'purchase_book_yookassa', {
        yookassa_payment_id: obj.id,
        yookassa_email: userEmail,
        yookassa_tg_username: userTgUsername,
        amount: amountValue,
        currency: obj.amount && obj.amount.currency
      });

      console.log('[yookassa-webhook] User upgraded:', user.id, '->', newLevel);

      if (tgChatId) {
        try {
          const botToken = (process.env.BOT_TOKEN || '').trim();
          if (botToken) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: tgChatId,
                text: 'Спасибо за покупку!\n\n' +
                  'Полный доступ к Книге Даров активирован\n' +
                  'Уровень: Хранитель\n' +
                  '+50 кристаллов мудрости\n\n' +
                  'Открой приложение чтобы увидеть изменения.'
              })
            });
          }
        } catch (e) {
          console.warn('[yookassa-webhook] sendMessage failed:', e.message);
        }
      }
    } else if (paymentType === 'donation') {
      const bonusCrystals = parseInt(metadata.bonus_crystals || '1', 10);
      await addCrystals(user.id, bonusCrystals, 'donation_yookassa', {
        yookassa_payment_id: obj.id,
        yookassa_email: userEmail,
        yookassa_tg_username: userTgUsername,
        amount: amountValue
      });

      if (tgChatId) {
        try {
          const botToken = (process.env.BOT_TOKEN || '').trim();
          if (botToken) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: tgChatId,
                text: `Спасибо за поддержку!\n\n+${bonusCrystals} кристаллов мудрости в благодарность`
              })
            });
          }
        } catch (e) {}
      }
    } else if (paymentType === 'test') {
      // Тестовая оплата — просто фиксируем в логе и шлём подтверждение
      await addCrystals(user.id, 0, 'test_yookassa', {
        yookassa_payment_id: obj.id,
        yookassa_email: userEmail,
        yookassa_tg_username: userTgUsername,
        amount: amountValue
      });

      if (tgChatId) {
        try {
          const botToken = (process.env.BOT_TOKEN || '').trim();
          if (botToken) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: tgChatId,
                text: 'Тестовая оплата ЮKassa прошла успешно!\nВсё подключено правильно. Можно делать рефанд в ЛК ЮKassa.'
              })
            });
          }
        } catch (e) {}
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[yookassa-webhook] Error:', e.message, e.stack);
    // Всегда 200, иначе ЮKassa будет повторять
    return res.status(200).json({ ok: true });
  }
}

// =====================================================================
// ========== MAIN ROUTER ==============================================
// =====================================================================

module.exports = async (req, res) => {
  const provider = (req.query && req.query.provider) || '';
  const url = req.url || '';

  // Роутинг по provider param или по URL (fallback)
  if (provider === 'bot' || url.includes('bot-webhook')) {
    return handleBotWebhook(req, res);
  }
  if (provider === 'tbank' || url.includes('tbank-webhook')) {
    return handleTbankWebhook(req, res);
  }
  if (provider === 'yuppay' || url.includes('yuppay-webhook')) {
    return handleYuppayWebhook(req, res);
  }
  if (provider === 'yookassa' || url.includes('yookassa-webhook')) {
    return handleYookassaWebhook(req, res);
  }

  return res.status(400).json({ error: 'Unknown webhook provider. Expected: bot, tbank, yuppay, yookassa' });
};
