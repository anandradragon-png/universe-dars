/**
 * T-Bank (Тинькофф) Webhook — обработка уведомлений об оплате
 *
 * POST /api/tbank-webhook
 * Тинькофф отправляет POST при изменении статуса платежа.
 * Проверяем токен (Password), обновляем access_level юзера.
 *
 * Env vars:
 *   TBANK_TERMINAL_KEY — TerminalKey из ЛК Тинькофф
 *   TBANK_PASSWORD     — Password (секрет) из ЛК Тинькофф
 */

const crypto = require('crypto');
const { getSupabase, addCrystals } = require('./lib/db');

/**
 * Генерация токена для проверки подписи Тинькофф.
 * Алгоритм: собираем все параметры (кроме Token и Receipt),
 * добавляем Password, сортируем по ключу, конкатенируем значения,
 * берём SHA-256.
 */
function generateToken(params, password) {
  const data = { ...params };
  delete data.Token;
  delete data.Receipt;
  delete data.DATA;
  data.Password = password;

  const sortedKeys = Object.keys(data).sort();
  const concatenated = sortedKeys.map(k => data[k]).join('');

  return crypto.createHash('sha256').update(concatenated).digest('hex');
}

module.exports = async (req, res) => {
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
      const expectedToken = generateToken(body, password);
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
      .select('id, access_level, crystals')
      .eq('telegram_id', telegramId)
      .single();

    if (!user) {
      console.error('[tbank-webhook] User not found:', telegramId);
      return res.status(200).send('OK');
    }

    // Проверяем дубликат (idempotency)
    const { data: existing } = await db
      .from('crystal_log')
      .select('id')
      .eq('reason', 'purchase_book_tbank')
      .eq('user_id', user.id)
      .like('metadata->PaymentId', String(body.PaymentId))
      .maybeSingle();

    if (existing) {
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
};
