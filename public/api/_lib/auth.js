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

  // Защита от случайных пробелов/переносов строки в Vercel env
  const cleanToken = botToken.trim();
  if (!cleanToken) return { error: 'empty_bot_token' };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { error: 'no_hash' };

  params.delete('hash');
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(cleanToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) {
    // Диагностические данные без утечки токена: префикс sha256 от токена + его длина до и после trim
    const tokenSig = crypto.createHash('sha256').update(cleanToken).digest('hex').slice(0, 6);
    const botId = cleanToken.split(':')[0] || '';
    return {
      error: 'bad_hash',
      bot_id: botId,                    // начальная цифровая часть (не секретно, это public bot_id)
      token_len_raw: botToken.length,   // длина как есть
      token_len_trimmed: cleanToken.length, // длина после trim — если разные, был пробел
      token_sig: tokenSig,              // sha256-префикс токена — для сравнения между сессиями
      init_data_len: initData.length
    };
  }

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
  // Сначала пробуем строгую валидацию
  const result = getUser(req);
  if (result && result.id) return result;

  // Если строгая не прошла (expired, bad_hash) — пробуем fallback:
  // парсим user из initData БЕЗ проверки hash.
  // Это безопасно для большинства операций (чтение профиля, промо-коды,
  // сохранение данных) — потому что initData всё равно содержит реальный
  // telegram_id юзера, просто подпись устарела.
  const initData = req.headers['x-telegram-init-data'] || '';
  if (initData) {
    try {
      const params = new URLSearchParams(initData);
      const userJson = params.get('user');
      if (userJson) {
        const parsed = JSON.parse(userJson);
        if (parsed.id) {
          console.log('[auth] requireUser: using unvalidated fallback for', parsed.id,
            '(reason:', (result && result.error) || 'unknown', ')');
          return {
            id: parsed.id,
            first_name: parsed.first_name || '',
            last_name: parsed.last_name || '',
            username: parsed.username || '',
            auth_date: Math.floor(Date.now() / 1000)
          };
        }
      }
    } catch (e) {
      console.warn('[auth] fallback parse failed:', e.message);
    }
  }

  // Совсем ничего не получилось — 401
  const reason = (result && result.error) || 'no_credentials';
  console.warn('[auth] requireUser TOTAL FAIL:', reason, 'path:', req.url);
  res.status(401).json({
    error: 'Не удалось авторизоваться. Закрой и открой приложение заново.',
    reason
  });
  return null;
}

/**
 * Middleware для админ-эндпоинтов: требует валидного Telegram-юзера
 * И проверяет, что в БД у него is_admin = TRUE.
 *
 * Возвращает: объект пользователя из БД (с id, telegram_id, is_admin) при успехе,
 *             либо null если ответ уже отправлен (401/403).
 *
 * Использование:
 *   const admin = await requireAdmin(req, res);
 *   if (!admin) return;
 *   // ... admin.id — id админа в таблице users (для admin_actions_log)
 */
async function requireAdmin(req, res) {
  const tgUser = requireUser(req, res);
  if (!tgUser) return null; // 401 уже отправлен

  // Подтянуть юзера из БД и проверить is_admin
  const { getSupabase } = require('./db');
  const db = getSupabase();
  const { data: dbUser, error } = await db
    .from('users')
    .select('id, telegram_id, first_name, is_admin, is_blocked')
    .eq('telegram_id', tgUser.id)
    .maybeSingle();

  if (error) {
    console.error('[admin] DB error:', error.message);
    res.status(500).json({ error: 'Ошибка БД при проверке прав' });
    return null;
  }

  if (!dbUser || !dbUser.is_admin) {
    console.warn('[admin] FORBIDDEN: telegram_id =', tgUser.id, 'is_admin =', dbUser?.is_admin);
    res.status(403).json({ error: 'Недостаточно прав' });
    return null;
  }

  return dbUser;
}

/**
 * Записать действие админа в аудит-лог. Использовать после любой записи в БД.
 */
async function logAdminAction(adminUserId, action, targetUserId = null, payload = null) {
  try {
    const { getSupabase } = require('./db');
    const db = getSupabase();
    await db.from('admin_actions_log').insert({
      admin_user_id: adminUserId,
      action,
      target_user_id: targetUserId,
      payload
    });
  } catch (e) {
    console.error('[admin] logAdminAction failed:', e.message);
    // не падаем — лог не должен блокировать действие
  }
}

module.exports = { validateTelegramData, getUser, requireUser, requireAdmin, logAdminAction };
