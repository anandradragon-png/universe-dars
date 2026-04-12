/**
 * Telegram Bot Webhook — обработка платежей Stars
 *
 * Этот endpoint получает updates от Telegram Bot API:
 * - pre_checkout_query → подтверждаем оплату (обязательно для Stars)
 * - successful_payment → обновляем access_level юзера в БД
 *
 * Настройка webhook через BotFather:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<domain>/api/bot-webhook
 *
 * Или через запрос:
 *   curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook?url=https://public-two-beta-63.vercel.app/api/bot-webhook"
 */

const { getSupabase } = require('./lib/db');

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

module.exports = async (req, res) => {
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
            .select('id, access_level, crystals')
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
          const { addCrystals } = require('./lib/db');
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
            const { addCrystals } = require('./lib/db');
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
};
