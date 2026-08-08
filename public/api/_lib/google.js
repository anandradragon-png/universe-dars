/**
 * Проверка Google OAuth access-токена (token flow из google.accounts.oauth2).
 * Общая логика для входа (google-login) и привязки входа (link-account).
 *
 * Убеждаемся, что токен выпущен ИМЕННО для нашего Client ID (aud) — иначе это
 * токен другого приложения (подмена). Возвращаем подтверждённую почту.
 *
 * Возвращает { email } при успехе, либо { error, status } при отказе.
 * Client Secret не нужен: identity подтверждается токеном + проверкой aud.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  || '92870739232-rv2av7o1gnjg26tl4q4ed5a6tghilvsp.apps.googleusercontent.com';

async function verifyGoogleAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') {
    return { error: 'Нет данных Google', status: 400 };
  }

  const ti = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken)
  );
  if (!ti.ok) return { error: 'Google не подтвердил вход', status: 401 };

  const tinfo = await ti.json();
  const aud = tinfo.aud || tinfo.azp;
  if (aud !== GOOGLE_CLIENT_ID) {
    console.warn('[google] wrong aud:', aud);
    return { error: 'Вход Google не для этого приложения', status: 401 };
  }
  const exp = parseInt(tinfo.exp || '0', 10);
  if (!exp || (Date.now() / 1000) > exp) {
    return { error: 'Токен Google истёк, попробуй ещё раз', status: 401 };
  }

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
    return { error: 'Почта Google не подтверждена', status: 401 };
  }

  return { email: String(email).trim().toLowerCase() };
}

module.exports = { verifyGoogleAccessToken, GOOGLE_CLIENT_ID };
