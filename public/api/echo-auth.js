/**
 * ВРЕМЕННАЯ диагностическая ручка. Сообщает, КАКИЕ заголовки авторизации
 * реально дошли до сервера (только факт наличия и длина, без значений/секретов).
 * Нужна, чтобы понять, не вырезается ли x-web-session по дороге (расширение
 * браузера / антивирус / корпоративный прокси). Снять после разбора инцидента.
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const h = req.headers || {};
  const ws = h['x-web-session'] || '';
  const auth = h['authorization'] || '';
  const cookie = h['cookie'] || '';
  return res.status(200).json({
    ok: true,
    has_web_session: !!ws,
    web_session_len: ws ? String(ws).length : 0,
    has_authorization: !!auth,
    has_cookie: !!cookie,
    ua: String(h['user-agent'] || '').slice(0, 120)
  });
};
