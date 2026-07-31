/**
 * Веб-сессия для входа через Telegram Login Widget.
 *
 * Зачем: часть аудитории (в основном РФ) заходит не из Telegram Mini App, а с
 * обычного браузера на yupdar.com. Mini App даёт подписанный initData — здесь его
 * нет. Официальный Telegram Login Widget (кнопка «Войти через Telegram») отдаёт
 * набор полей с ПОДПИСЬЮ (hash), которую сервер проверяет. Убедившись, что это
 * настоящий Telegram-юзер, мы выдаём СВОЙ короткий токен веб-сессии — им клиент
 * подтверждает identity в последующих запросах (заголовок x-web-session).
 *
 * Токен = base64url(JSON{id, auth_date}) + '.' + HMAC_SHA256(payload, BOT_TOKEN).
 * Подпись секретом сервера (BOT_TOKEN) → клиент подделать не может. Тот же
 * telegram_id, что и в боте → веб и Telegram = ОДИН аккаунт (одна строка users).
 */

const crypto = require('crypto');

// Сколько живёт веб-сессия. Дольше — удобнее (реже переспрашиваем вход),
// короче — безопаснее при утечке токена. 60 дней — разумный баланс.
const SESSION_TTL_SEC = 60 * 24 * 60 * 60;

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payloadB64, botToken) {
  return crypto.createHmac('sha256', String(botToken).trim()).update(payloadB64).digest('hex');
}

/**
 * Проверка подписи данных Telegram Login Widget.
 * https://core.telegram.org/widgets/login#checking-authorization
 * ВНИМАНИЕ: ключ подписи здесь = SHA256(bot_token) — это ОТЛИЧАЕТСЯ от Mini App
 * initData, где ключ = HMAC_SHA256(bot_token, 'WebAppData'). Не перепутать.
 *
 * data — объект полей от виджета (id, first_name, username, photo_url, auth_date, hash).
 * Возвращает { id, first_name, last_name, username, auth_date } либо { error }.
 */
function verifyLoginWidget(data, botToken) {
  if (!data || typeof data !== 'object') return { error: 'no_data' };
  if (!botToken) return { error: 'no_bot_token' };
  const hash = data.hash;
  if (!hash) return { error: 'no_hash' };

  const cleanToken = String(botToken).trim();
  const secretKey = crypto.createHash('sha256').update(cleanToken).digest();

  const dataCheckString = Object.keys(data)
    .filter((k) => k !== 'hash')
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');

  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(String(hash), 'hex');
  if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { error: 'bad_hash' };
  }

  // Виджет не должен быть старше суток (защита от переигрывания старого ответа).
  const authDate = parseInt(data.auth_date || '0', 10);
  if (!authDate || (Date.now() / 1000 - authDate) > 86400) {
    return { error: 'expired' };
  }

  const id = parseInt(data.id, 10);
  if (!Number.isFinite(id) || id <= 0) return { error: 'no_id' };

  return {
    id,
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    username: data.username || '',
    auth_date: authDate
  };
}

/**
 * Выпустить токен веб-сессии для подтверждённого telegram_id.
 */
function issueSession(telegramId, botToken) {
  const payload = { id: telegramId, iat: Math.floor(Date.now() / 1000) };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = sign(payloadB64, botToken);
  return payloadB64 + '.' + sig;
}

/**
 * Проверить токен веб-сессии из заголовка x-web-session.
 * Возвращает user-объект { id, ... } как из validateTelegramData, либо null.
 */
function verifySession(token, botToken) {
  try {
    if (!token || !botToken) return null;
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const payloadB64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = sign(payloadB64, botToken);
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const json = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    const id = parseInt(payload.id, 10);
    if (!Number.isFinite(id) || id <= 0) return null;
    const iat = parseInt(payload.iat || '0', 10);
    if (!iat || (Date.now() / 1000 - iat) > SESSION_TTL_SEC) return null;

    return {
      id,
      first_name: '',
      last_name: '',
      username: '',
      auth_date: iat,
      web_session: true
    };
  } catch (e) {
    return null;
  }
}

module.exports = { verifyLoginWidget, issueSession, verifySession, SESSION_TTL_SEC };
