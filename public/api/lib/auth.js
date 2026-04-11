const crypto = require('crypto');

/**
 * Валидация Telegram WebApp initData
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Возвращает либо объект user, либо { error: '...' } для диагностики причины отказа.
 * Старые вызовы, проверявшие result === null, теперь должны проверять result?.id.
 */
function validateTelegramData(initData, botToken) {
  if (!initData) return { error: 'no_init_data' };
  if (!botToken) return { error: 'no_bot_token' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { error: 'no_hash' };

  params.delete('hash');
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return { error: 'bad_hash' };

  // Проверить что данные не старше 24 часов (раньше был 1 час - слишком жёстко для долгих сессий)
  const authDate = parseInt(params.get('auth_date') || '0');
  const ageSec = Date.now() / 1000 - authDate;
  if (ageSec > 86400) return { error: 'expired', age_sec: Math.round(ageSec) };

  try {
    const user = JSON.parse(params.get('user') || '{}');
    if (!user.id) return { error: 'no_user' };
    return {
      id: user.id,
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      username: user.username || '',
      auth_date: authDate
    };
  } catch {
    return { error: 'parse_user_failed' };
  }
}

/**
 * Middleware для Vercel API — извлекает пользователя из запроса
 * В dev-режиме принимает x-telegram-id хедер
 *
 * Возвращает: { id, ... } при успехе, либо { error: '...' } при отказе, либо null если ничего не было.
 */
function getUser(req) {
  // Production: валидация initData
  const initData = req.headers['x-telegram-init-data'];
  const botToken = process.env.BOT_TOKEN;

  if (initData) {
    const result = validateTelegramData(initData, botToken);
    if (result && result.id) return result;
    if (result && result.error) return { error: result.error, age_sec: result.age_sec };
    return { error: 'unknown_validation_failure' };
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

/**
 * Шорткат для эндпоинтов: либо возвращает валидного user-а, либо отправляет 401 с детальной причиной.
 * Использование:
 *   const tgUser = requireUser(req, res);
 *   if (!tgUser) return; // ответ уже отправлен
 *   // ... используй tgUser.id
 */
function requireUser(req, res) {
  const result = getUser(req);
  if (result && result.id) return result;
  const reason = (result && result.error) || 'no_credentials';
  const debug = {
    error: 'Unauthorized',
    reason,
    has_init_data: !!req.headers['x-telegram-init-data'],
    has_bot_token: !!process.env.BOT_TOKEN,
  };
  if (result && result.age_sec) debug.age_sec = result.age_sec;
  res.status(401).json(debug);
  return null;
}

module.exports = { validateTelegramData, getUser, requireUser };
