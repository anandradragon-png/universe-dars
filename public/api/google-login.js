/**
 * Вход через Google (веб-версия yupdar.com без Telegram).
 *
 * POST /api/google-login
 *   body: { access_token }  — OAuth access token, который отдаёт своя жёлтая
 *                             кнопка через google.accounts.oauth2 (token flow).
 *
 * Что делает:
 *   1. Проверяет токен у самого Google (tokeninfo): что он выпущен ИМЕННО для
 *      нашего Client ID (aud) — защита от подмены токена, выданного другому
 *      приложению. Берёт срок годности.
 *   2. Узнаёт подтверждённую почту (userinfo, если tokeninfo её не отдал).
 *   3. По почте находит/создаёт постоянный аккаунт (getOrCreateUserByEmail) —
 *      синтетический telegram_id из почты. Один Google-аккаунт = одна строка
 *      users, данные и Сокровищница сохраняются между входами.
 *   4. Выдаёт тот же токен веб-сессии, что и Telegram-вход (issueSession).
 *
 * Client Secret НЕ нужен: identity подтверждается токеном + проверкой aud.
 * Client ID публичный. Оплата картой (ЮKassa) для таких аккаунтов работает —
 * payment.js находит юзера по веб-сессии и привязывает покупку к нему.
 */

const { issueSession } = require('./_lib/websession');
const { getOrCreateUserByEmail, findUserByLink } = require('./_lib/db');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  || '92870739232-rv2av7o1gnjg26tl4q4ed5a6tghilvsp.apps.googleusercontent.com';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) return res.status(500).json({ error: 'Сервер не настроен' });

  const accessToken = (req.body || {}).access_token;
  if (!accessToken || typeof accessToken !== 'string') {
    return res.status(400).json({ error: 'Нет данных Google' });
  }

  try {
    // 1. Проверяем, что токен выпущен для НАШЕГО приложения (иначе — подмена).
    const ti = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken)
    );
    if (!ti.ok) {
      return res.status(401).json({ error: 'Google не подтвердил вход' });
    }
    const tinfo = await ti.json();
    const aud = tinfo.aud || tinfo.azp;
    if (aud !== GOOGLE_CLIENT_ID) {
      console.warn('[google-login] wrong aud:', aud);
      return res.status(401).json({ error: 'Вход Google не для этого приложения' });
    }
    const exp = parseInt(tinfo.exp || '0', 10);
    if (!exp || (Date.now() / 1000) > exp) {
      return res.status(401).json({ error: 'Токен Google истёк, попробуй ещё раз' });
    }

    // 2. Почта: tokeninfo часто её отдаёт; если нет — спрашиваем userinfo.
    let email = tinfo.email;
    let verified = tinfo.email_verified;
    if (!email) {
      const ui = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: 'Bearer ' + accessToken }
      });
      if (ui.ok) {
        const u = await ui.json();
        email = u.email;
        verified = u.email_verified;
      }
    }
    const emailVerified = (verified === true || verified === 'true');
    if (!email || !emailVerified) {
      return res.status(401).json({ error: 'Почта Google не подтверждена' });
    }

    // 3-4. Аккаунт + сессия.
    // Сначала: не привязана ли эта почта к существующему аккаунту (например, к
    // Telegram-аккаунту)? Если да — входим в него, а не в отдельный веб-аккаунт.
    // Так «две двери ведут в один кабинет».
    const clean = String(email).trim().toLowerCase();
    const linked = await findUserByLink('google', clean);
    const dbUser = linked || await getOrCreateUserByEmail(clean);
    const token = issueSession(dbUser.telegram_id, botToken);

    return res.status(200).json({
      ok: true,
      token,
      user: { id: dbUser.id, first_name: dbUser.first_name || '' }
    });
  } catch (e) {
    console.error('[google-login] error:', e.message);
    return res.status(500).json({ error: 'Ошибка входа' });
  }
};
