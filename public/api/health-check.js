/**
 * Cron-задача: каждые 5 минут проверяет здоровье yupdar.com.
 * Если сайт не отвечает / отвечает медленно — пишет Свете в Telegram.
 *
 * Запускается Vercel Cron Job (см. vercel.json -> crons).
 * Защищена секретом CRON_SECRET — Vercel передаёт его в заголовке Authorization.
 *
 * Что проверяет:
 *  1. HTTP 200 от https://yupdar.com/
 *  2. HTTP 200 от https://yupdar.com/api/user?telegram_id=269932434
 *     (точно отвечает 401/200, но не 500 и не таймаут)
 *
 * Спам-защита: если сайт упал — пишет 1 раз. Если упал и не восстановился
 * за 5 минут — НЕ дублирует, ждёт восстановления. Когда поднялся — пишет
 * «снова работает».
 *
 * Состояние хранится в Supabase в таблице system_health (миграция отдельным файлом).
 */

const { getSupabase } = require('./_lib/db');

const SVETA_TELEGRAM_ID = 269932434;
const SITE_URL = 'https://yupdar.com';
const API_URL = 'https://yupdar.com/api/user?telegram_id=269932434';
const TIMEOUT_MS = 8000;

async function callTelegramAPI(method, body) {
  const token = (process.env.BOT_TOKEN || '').trim();
  if (!token) return null;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await resp.json();
  } catch (e) {
    return null;
  }
}

async function checkUrl(url) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const resp = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(timer);
    const ms = Date.now() - t0;
    // 401/400/200 — нормально (API защищён). 500/502/503/504 — плохо.
    const ok = resp.status < 500;
    return { ok, status: resp.status, ms };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, error: e.message };
  }
}

module.exports = async (req, res) => {
  // Защита от случайных вызовов извне
  const authHeader = req.headers.authorization || '';
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const [site, api] = await Promise.all([
    checkUrl(SITE_URL),
    checkUrl(API_URL)
  ]);

  const isHealthy = site.ok && api.ok;
  const now = new Date().toISOString();

  // Читаем последнее состояние
  const db = getSupabase();
  const { data: lastState } = await db
    .from('system_health')
    .select('*')
    .order('checked_at', { ascending: false })
    .limit(1)
    .single();

  const wasDown = lastState && lastState.is_down === true;
  const isDown = !isHealthy;

  // Логируем чек
  await db.from('system_health').insert({
    checked_at: now,
    is_down: isDown,
    site_status: site.status,
    site_ms: site.ms,
    api_status: api.status,
    api_ms: api.ms,
    site_error: site.error || null,
    api_error: api.error || null
  });

  // Решаем нужно ли писать в TG
  let notifyText = null;

  if (isDown && !wasDown) {
    // Сайт ТОЛЬКО ЧТО упал
    notifyText = '🚨 <b>yupdar.com не отвечает</b>\n\n' +
      `Сайт: ${site.status || 'таймаут'} (${site.ms}мс)\n` +
      `API:  ${api.status || 'таймаут'} (${api.ms}мс)\n\n` +
      `Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК\n\n` +
      'Проверь Vercel Dashboard или просто подожди 5 минут.';
  } else if (!isDown && wasDown) {
    // Сайт восстановился
    const downSince = lastState ? new Date(lastState.checked_at) : new Date();
    const downMins = Math.round((Date.now() - downSince.getTime()) / 60000);
    notifyText = '✅ <b>yupdar.com снова работает</b>\n\n' +
      `Был недоступен ~${downMins} мин.\n` +
      `Сейчас: ${site.ms}мс\n\n` +
      `Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК`;
  }

  if (notifyText) {
    await callTelegramAPI('sendMessage', {
      chat_id: SVETA_TELEGRAM_ID,
      text: notifyText,
      parse_mode: 'HTML'
    });
  }

  return res.status(200).json({
    healthy: isHealthy,
    site,
    api,
    notified: !!notifyText
  });
};
