/**
 * Уведомления админу (Свете) в Telegram + лог событий приложения.
 *
 * Два инструмента:
 *  1. notifyAdmin(text)     — мгновенное сообщение Свете в Telegram (Тип А).
 *                              «Fire-and-forget»: никогда не бросает ошибку и не
 *                              тормозит основной ответ пользователю.
 *  2. logEvent(type, props) — запись события в таблицу app_events (Тип Б —
 *                              для ежедневной сводки). Тоже «fire-and-forget»:
 *                              если таблицы ещё нет в Supabase — просто молчит,
 *                              ничего не ломает.
 *
 * Шаблон вызова Telegram взят 1:1 из health-check.js.
 */

const { getSupabase } = require('./db');

const SVETA_TELEGRAM_ID = 269932434;

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

// Экранируем спецсимволы HTML, чтобы parse_mode: 'HTML' не падал на именах юзеров.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Шлёт Свете сообщение в Telegram. Не ждём результата в основном потоке —
 * вызываем без await, чтобы ответ юзеру оставался быстрым.
 */
function notifyAdmin(text) {
  // Намеренно НЕ возвращаем промис «наверх» как критичный — но возвращаем,
  // чтобы при желании можно было await-нуть в фоне. Ошибки гасим внутри.
  return callTelegramAPI('sendMessage', {
    chat_id: SVETA_TELEGRAM_ID,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  }).catch(function () { return null; });
}

/**
 * Записывает событие в app_events для ежедневной сводки.
 * @param {string} type  — тип события: 'new_user', 'dar_calculated',
 *                         'oracle', 'decryption', 'pay_attempt', 'pay_success',
 *                         'user_error' и т.п.
 * @param {object} props — произвольные доп. данные (jsonb): { dar_code, plan, amount... }
 */
async function logEvent(type, props) {
  try {
    const db = getSupabase();
    await db.from('app_events').insert({
      event_type: type,
      props: props || {},
      created_at: new Date().toISOString()
    });
  } catch (e) {
    // Таблицы может ещё не быть (миграция не применена) — молча игнорируем.
  }
}

module.exports = { notifyAdmin, logEvent, escapeHtml, SVETA_TELEGRAM_ID };
