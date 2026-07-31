/**
 * Вход через Telegram Login Widget (веб-версия yupdar.com без Mini App).
 *
 * POST /api/tg-web-login
 *   body: { id, first_name, last_name, username, photo_url, auth_date, hash }
 *         — это ровно то, что отдаёт официальный виджет telegram-widget.js.
 *
 * Что делает:
 *   1. Проверяет подпись виджета секретом бота (websession.verifyLoginWidget).
 *   2. Находит/создаёт строку users по тому же telegram_id, что и в боте
 *      (getOrCreateUser) — веб и Telegram становятся ОДНИМ аккаунтом.
 *   3. Выдаёт подписанный токен веб-сессии. Клиент кладёт его в localStorage и
 *      шлёт в заголовке x-web-session (см. auth.js — там аддитивный путь).
 *
 * Безопасность: положительный telegram_id принимаем ТОЛЬКО после проверки
 * подписи виджета. Голый id без подписи сюда не проходит.
 */

const { verifyLoginWidget, issueSession } = require('./_lib/websession');
const { getOrCreateUser } = require('./_lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const botToken = process.env.BOT_TOKEN;
  const data = req.body || {};

  const verified = verifyLoginWidget(data, botToken);
  if (!verified || !verified.id) {
    console.warn('[tg-web-login] verify failed:', verified && verified.error);
    return res.status(401).json({ error: 'Подпись Telegram не подтверждена', reason: (verified && verified.error) || 'verify_failed' });
  }

  try {
    const dbUser = await getOrCreateUser({
      id: verified.id,
      first_name: verified.first_name,
      last_name: verified.last_name,
      username: verified.username
    });

    const token = issueSession(verified.id, botToken);

    return res.status(200).json({
      ok: true,
      token,
      user: {
        id: dbUser.id,
        telegram_id: verified.id,
        first_name: dbUser.first_name || verified.first_name || ''
      }
    });
  } catch (e) {
    console.error('[tg-web-login] error:', e.message);
    return res.status(500).json({ error: 'Ошибка входа' });
  }
};
