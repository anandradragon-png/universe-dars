/**
 * YupPay Webhook — обработка платежей в DarAI/NEAR
 *
 * Получает POST от YupPay при успешной оплате (payment.confirmed).
 * Проверяет HMAC-SHA256 подпись, обновляет access_level юзера.
 *
 * Документация: https://www.yupland.io/pay/api
 * Формат подписи: X-YupPay-Signature: t=<timestamp>,v1=<hmac_hex>
 * Payload для HMAC: "<timestamp>.<rawBody>"
 */

const crypto = require('crypto');
const { getSupabase, addCrystals } = require('./lib/db');

module.exports = async (req, res) => {
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
    if (data?.invoice_id) {
      const { data: existing } = await db
        .from('crystal_log')
        .select('id')
        .or(`metadata->invoice_id.eq.${data.invoice_id}`)
        .maybeSingle();

      if (existing) {
        console.log('[yuppay-webhook] Duplicate invoice, skipping:', data.invoice_id);
        return res.status(200).json({ ok: true });
      }
    }

    // Находим юзера по telegram_id
    const { data: user } = await db
      .from('users')
      .select('id, access_level, crystals')
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
};
