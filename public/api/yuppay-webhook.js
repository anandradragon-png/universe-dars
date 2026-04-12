/**
 * YupPay Webhook — обработка платежей в DarAI/NEAR
 *
 * Получает POST от YupPay при успешной оплате (payment.confirmed).
 * Проверяет HMAC-SHA256 подпись, обновляет access_level юзера.
 */

const crypto = require('crypto');
const { getSupabase } = require('./lib/db');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'yuppay webhook active' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const webhookSecret = (process.env.YUPPAY_WEBHOOK_SECRET || '').trim();

    // Проверка HMAC подписи
    if (webhookSecret) {
      const signature = req.headers['x-yuppay-signature'] || '';
      const timestamp = req.headers['x-yuppay-timestamp'] || '';

      // Формат подписи: t=<timestamp>,v1=<hmac_hex>
      const sigParts = {};
      signature.split(',').forEach(part => {
        const [k, v] = part.split('=', 2);
        if (k && v) sigParts[k.trim()] = v.trim();
      });

      const rawBody = JSON.stringify(req.body);
      const signPayload = `${timestamp}.${rawBody}`;
      const expectedHmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(signPayload)
        .digest('hex');

      if (!sigParts.v1 || !crypto.timingSafeEqual(
        Buffer.from(expectedHmac, 'hex'),
        Buffer.from(sigParts.v1, 'hex')
      )) {
        console.error('[yuppay-webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { type, data } = req.body || {};

    if (type !== 'payment.confirmed') {
      console.log('[yuppay-webhook] Ignoring event type:', type);
      return res.status(200).end();
    }

    console.log('[yuppay-webhook] payment.confirmed:', JSON.stringify({
      invoice_id: data?.invoice_id,
      amount_raw: data?.amount_raw,
      token: data?.token_contract_id,
      payer: data?.payer_near_account,
      metadata: data?.metadata
    }));

    const metadata = data?.metadata || {};
    const telegramChatId = metadata.telegram_chat_id;
    const paymentType = metadata.payment_type || 'book';

    if (!telegramChatId) {
      console.warn('[yuppay-webhook] No telegram_chat_id in metadata');
      return res.status(200).end();
    }

    const db = getSupabase();

    // Находим юзера по telegram_id
    const { data: user } = await db
      .from('users')
      .select('id, access_level, crystals')
      .eq('telegram_id', telegramChatId)
      .single();

    if (!user) {
      console.error('[yuppay-webhook] User not found:', telegramChatId);
      return res.status(200).end();
    }

    if (paymentType === 'book') {
      // Апгрейд на Хранитель
      const newLevel = user.access_level === 'premium' ? 'premium' : 'extended';
      await db.from('users').update({ access_level: newLevel }).eq('id', user.id);

      // +50 кристаллов
      const { addCrystals } = require('./lib/db');
      await addCrystals(user.id, 50, 'purchase_book_darai', {
        invoice_id: data.invoice_id,
        amount_raw: data.amount_raw,
        token: data.token_contract_id,
        payer: data.payer_near_account
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
              text: '🎉 Спасибо за покупку через DarAI!\n\n' +
                '✅ Полный доступ к Книге Даров активирован\n' +
                '✅ Уровень: Хранитель 🛡\n' +
                '✅ +50 кристаллов мудрости\n\n' +
                'Открой приложение чтобы увидеть изменения. 💜'
            })
          });
        }
      } catch (e) {
        console.warn('[yuppay-webhook] sendMessage failed:', e.message);
      }

    } else if (paymentType === 'donation') {
      // Донейшн — бонусные кристаллы
      const { addCrystals } = require('./lib/db');
      const bonusCrystals = Math.max(1, Math.floor(parseInt(data.amount_raw || '0') / 1e18 * 10));
      await addCrystals(user.id, bonusCrystals, 'donation_darai', {
        invoice_id: data.invoice_id,
        amount_raw: data.amount_raw,
        payer: data.payer_near_account
      });

      try {
        const botToken = (process.env.BOT_TOKEN || '').trim();
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: `💜 Спасибо за поддержку в DarAI!\n\n+${bonusCrystals} кристаллов мудрости в благодарность ✨`
            })
          });
        }
      } catch (e) {}
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[yuppay-webhook] Error:', e.message);
    return res.status(200).end();
  }
};
