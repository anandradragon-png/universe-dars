const crypto = require('crypto');

/**
 * Сравнение двух hex-строк за постоянное время (защита от timing-атак).
 * Каркас качества 12.3: секреты/подписи нельзя сравнивать через ===.
 * Разная длина → сразу false (без утечки по времени, т.к. длина не секретна).
 */
function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Валидация Telegram WebApp initData
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Возвращает либо объект user, либо { error: '...' } для диагностики причины отказа.
 * Старые вызовы, проверявшие result === null, теперь должны проверять result?.id.
 */
function validateTelegramData(initData, botToken, opts = {}) {
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

  if (!safeEqualHex(computedHash, hash)) {
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

  // Проверить что данные не старше 24 часов (раньше был 1 час - слишком жёстко для долгих сессий).
  // opts.skipAgeCheck=true — для «мягкого» пути: подпись HMAC ВСЁ РАВНО проверена выше
  // (identity подлинная), но допускаем устаревший auth_date (долгая сессия >24ч).
  const authDate = parseInt(params.get('auth_date') || '0');
  const ageSec = Date.now() / 1000 - authDate;
  if (!opts.skipAgeCheck && ageSec > 86400) return { error: 'expired', age_sec: Math.round(ageSec) };

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
 * Разрешён ли «сырой» x-telegram-id как identity для положительного id.
 * true ТОЛЬКО в dev-окружении (localhost) — там фронт шлёт _dev_telegram_id.
 * В проде положительный x-telegram-id — это вектор подмены (можно выдать себя
 * за любого юзера/админа: их telegram_id публичны). Поэтому в проде положительный
 * id из хедера игнорируется, пока явно не выставлен ALLOW_DEV_HEADER_AUTH.
 */
function devHeaderAuthAllowed() {
  return process.env.NODE_ENV !== 'production'
    || process.env.ALLOW_DEV_HEADER_AUTH === '1'
    || process.env.ALLOW_DEV_HEADER_AUTH === 'true';
}

/**
 * Middleware для Vercel API — извлекает пользователя из запроса.
 *
 * Границы доверия (каркас 3.1 — не доверять фронту):
 *   • x-telegram-init-data — подписанный HMAC от Telegram: доверенный путь
 *     для настоящих юзеров. Валидируем подпись.
 *   • x-telegram-id (или body.telegram_id) — НЕподписанный. Принимаем как
 *     identity ТОЛЬКО когда id ОТРИЦАТЕЛЬНЫЙ (гостевой _web_uid — анонимный
 *     само-владеемый аккаунт, подделать чужого нельзя, id генерится клиентом
 *     как отрицательное число). ПОЛОЖИТЕЛЬНЫЙ id из хедера — потенциальная
 *     подмена реального Telegram-id, принимаем его лишь в dev-режиме.
 *
 * Возвращает: { id, ... } при успехе, либо { error: '...' } при отказе, либо null если ничего не было.
 *
 * opts.softInitData=true — для не-строгого пути: если строгая проверка initData
 *   упала на 'expired' (подпись валидна, но auth_date >24ч), всё равно вернуть
 *   HMAC-подтверждённого юзера. Подпись при этом ОБЯЗАТЕЛЬНО проверяется —
 *   мы НЕ доверяем не-подписанному user из initData.
 */
function getUser(req, opts = {}) {
  // Доверенный путь: подписанный initData
  const initData = req.headers['x-telegram-init-data'];
  const botToken = process.env.BOT_TOKEN;

  if (initData) {
    const result = validateTelegramData(initData, botToken);
    if (result && result.id) return result;
    // Мягкий путь: подпись валидна, но данные устарели (>24ч). Повторяем
    // валидацию БЕЗ проверки возраста — HMAC всё равно проверяется, значит
    // identity подлинная. Не доверяем не-подписанному user (в отличие от
    // старого кода, который парсил user из initData без проверки hash).
    if (opts.softInitData && result && result.error === 'expired') {
      const soft = validateTelegramData(initData, botToken, { skipAgeCheck: true });
      if (soft && soft.id) return soft;
    }
    if (result && result.error) return { error: result.error, age_sec: result.age_sec };
    return { error: 'unknown_validation_failure' };
  }

  // Неподписанный x-telegram-id / body.telegram_id
  const rawId = req.headers['x-telegram-id'] || (req.body && req.body.telegram_id);
  if (rawId !== undefined && rawId !== null && rawId !== '') {
    const id = parseInt(rawId, 10);
    if (!Number.isFinite(id) || id === 0) return null;

    // Гостевой веб-вход: отрицательный синтетический id. Безопасен —
    // само-владеемый анонимный аккаунт, не может выдать себя за чужого.
    if (id < 0) {
      return {
        id,
        first_name: 'Guest',
        last_name: '',
        username: '',
        auth_date: Math.floor(Date.now() / 1000)
      };
    }

    // Положительный id из НЕподписанного хедера — только в dev-режиме.
    if (devHeaderAuthAllowed()) {
      return {
        id,
        first_name: 'Dev',
        last_name: 'User',
        username: 'dev',
        auth_date: Math.floor(Date.now() / 1000)
      };
    }

    // Прод: положительный id без подписи — вектор подмены. Отказ.
    console.warn('[auth] Rejected unsigned positive x-telegram-id in production');
    return { error: 'unsigned_id_rejected' };
  }

  return null;
}

/**
 * Шорткат для эндпоинтов: либо возвращает валидного user-а, либо отправляет 401 с детальной причиной.
 * Использование:
 *   const tgUser = requireUser(req, res);
 *   if (!tgUser) return; // ответ уже отправлен
 *   // ... используй tgUser.id
 *
 * Параметр strict (по умолчанию false):
 *   false — золотая середина: если подпись валидна, но auth_date устарел
 *           (долгая сессия > 24ч), всё равно пускаем (softInitData). Подпись
 *           HMAC при этом ОБЯЗАТЕЛЬНО проверена — identity подлинная. Также
 *           пускаем гостевой веб-вход (отрицательный _web_uid). НЕ доверяем
 *           не-подписанному user из initData и положительному x-telegram-id
 *           в проде (это векторы подмены чужого id).
 *   true  — softInitData ЗАПРЕЩЁН: нужна свежая действительная подпись Telegram.
 *           Обязательно для повышения прав (админка) и любых операций,
 *           выдающих деньги/доступ — иначе возможна подделка чужого id
 *           (например, telegram_id админа — он публичный/угадываемый).
 */
function requireUser(req, res, strict = false) {
  // strict — только свежая подпись; non-strict — допускаем HMAC-валидную,
  // но устаревшую подпись (softInitData) и гостевой отрицательный id.
  const result = getUser(req, { softInitData: !strict });
  if (result && result.id) {
    // strict-гейт: гостевой веб-вход (отрицательный id) НЕ является Telegram-
    // подписью, поэтому в строгом режиме (админка/деньги) его не пускаем.
    if (strict && result.id < 0) {
      console.warn('[auth] requireUser STRICT: rejecting guest negative id', result.id, 'path:', req.url);
      res.status(401).json({
        error: 'Нужна подпись Telegram. Открой приложение внутри Telegram.',
        reason: 'guest_not_allowed'
      });
      return null;
    }
    return result;
  }

  // Ничего валидного — 401 с причиной.
  const reason = (result && result.error) || 'no_credentials';
  console.warn('[auth] requireUser FAIL:', reason, 'strict:', strict, 'path:', req.url);
  res.status(401).json({
    error: strict
      ? 'Не удалось подтвердить подпись. Закрой и открой приложение заново.'
      : 'Не удалось авторизоваться. Закрой и открой приложение заново.',
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
  // strict=true: для админки обязательна действительная подпись Telegram.
  // Иначе можно подделать initData с telegram_id админа (он публичный) и
  // получить права через мягкий fallback. Каркас 3.1 — не доверять фронту.
  const tgUser = requireUser(req, res, true);
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

module.exports = { validateTelegramData, getUser, requireUser, requireAdmin, logAdminAction, devHeaderAuthAllowed };
