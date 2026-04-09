const crypto = require('crypto');

/**
 * Валидация Telegram WebApp initData
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateTelegramData(initData, botToken) {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  // Проверить что данные не старше 1 часа
  const authDate = parseInt(params.get('auth_date') || '0');
  if (Date.now() / 1000 - authDate > 3600) return null;

  try {
    const user = JSON.parse(params.get('user') || '{}');
    return {
      id: user.id,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      username: user.username || '',
      auth_date: authDate
    };
  } catch {
    return null;
  }
}

/**
 * Middleware для Vercel API — извлекает пользователя из запроса
 * В dev-режиме принимает x-telegram-id хедер
 */
function getUser(req) {
  // Production: валидация initData
  const initData = req.headers['x-telegram-init-data'];
  const botToken = process.env.BOT_TOKEN;

  if (initData && botToken) {
    return validateTelegramData(initData, botToken);
  }

  // Dev/fallback: telegram_id из хедера или body
  const devId = req.headers['x-telegram-id'] || (req.body && req.body.telegram_id);
  if (devId) {
    return {
      id: parseInt(devId),
      first_name: 'Dev',
      last_name: 'User',
      username: 'dev',
      auth_date: Math.floor(Date.now() / 1000)
    };
  }

  return null;
}

module.exports = { validateTelegramData, getUser };
