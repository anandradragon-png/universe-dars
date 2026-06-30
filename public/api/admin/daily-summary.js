/**
 * Тип Б — ежедневная сводка админу (Свете) в Telegram.
 *
 * Раз в сутки cron (см. server.js) дёргает этот эндпоинт. Он собирает
 * статистику за последние 24 часа и шлёт одно сообщение Свете:
 *   • новые пользователи
 *   • активные за сутки
 *   • сколько рассчитали Дар + какие Дары чаще
 *   • сколько расшифровок / Оракулов
 *   • попытки и успешные оплаты
 *
 * Источники:
 *   - users          — новые/активные (работает всегда)
 *   - app_events     — события приложения (нужна миграция supabase-migration-app-events.sql;
 *                      если таблицы ещё нет — эти строки покажут «нет данных», ничего не падает)
 *
 * Защита: Bearer CRON_SECRET (как у health-check). Можно дёрнуть вручную:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" https://yupdar.com/api/admin/daily-summary
 */

const { getSupabase } = require('../_lib/db');
const { notifyAdmin } = require('../_lib/notify');

// Считает события app_events по типу за период. Возвращает число или null
// (null = таблицы/данных нет — отрисуем «нет данных»).
async function countEvents(db, type, sinceIso) {
  try {
    const { count, error } = await db
      .from('app_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', type)
      .gte('created_at', sinceIso);
    if (error) return null;
    return count || 0;
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  // Защита от вызовов извне
  const authHeader = req.headers.authorization || '';
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const db = getSupabase();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();

  // — Новые пользователи за сутки —
  let newUsers = null;
  try {
    const { count } = await db
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sinceIso);
    newUsers = count || 0;
  } catch (e) { newUsers = null; }

  // — Активные за сутки (заходили) —
  let activeUsers = null;
  try {
    const { count } = await db
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gte('last_active_at', sinceIso);
    activeUsers = count || 0;
  } catch (e) { activeUsers = null; }

  // — События из app_events —
  const darCalc = await countEvents(db, 'dar_calculated', sinceIso);
  const oracles = await countEvents(db, 'oracle', sinceIso);
  const decryptions = await countEvents(db, 'decryption', sinceIso);
  const payAttempts = await countEvents(db, 'pay_attempt', sinceIso);
  const paySuccess = await countEvents(db, 'pay_success', sinceIso);

  // — Топ Даров за сутки (по тем, кто рассчитал Дар) —
  let topDarsLine = '—';
  try {
    const { data: rows } = await db
      .from('app_events')
      .select('props')
      .eq('event_type', 'dar_calculated')
      .gte('created_at', sinceIso)
      .limit(1000);
    if (rows && rows.length) {
      const tally = {};
      rows.forEach(function (r) {
        const name = (r.props && (r.props.dar_name || r.props.dar_code)) || '?';
        tally[name] = (tally[name] || 0) + 1;
      });
      const top = Object.keys(tally)
        .sort(function (a, b) { return tally[b] - tally[a]; })
        .slice(0, 5)
        .map(function (n) { return `${n} (${tally[n]})`; });
      if (top.length) topDarsLine = top.join(', ');
    }
  } catch (e) { topDarsLine = '—'; }

  // Хелпер отрисовки числа (null → «нет данных»)
  const v = function (n) { return n === null ? 'нет данных' : String(n); };

  const text =
    '📊 <b>Сводка за сутки — YupDar</b>\n' +
    `<i>${since.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} → ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК</i>\n\n` +
    `👋 Новые пользователи: <b>${v(newUsers)}</b>\n` +
    `🔄 Активных за сутки: <b>${v(activeUsers)}</b>\n` +
    `✨ Рассчитали Дар: <b>${v(darCalc)}</b>\n` +
    `🔮 Оракулов: <b>${v(oracles)}</b>\n` +
    `📖 Расшифровок: <b>${v(decryptions)}</b>\n` +
    `💳 Попыток оплаты: <b>${v(payAttempts)}</b>\n` +
    `✅ Успешных оплат: <b>${v(paySuccess)}</b>\n\n` +
    `🏆 Чаще считали Дары: ${topDarsLine}`;

  await notifyAdmin(text);

  return res.status(200).json({
    ok: true,
    period_since: sinceIso,
    new_users: newUsers,
    active_users: activeUsers,
    dar_calculated: darCalc,
    oracles,
    decryptions,
    pay_attempts: payAttempts,
    pay_success: paySuccess
  });
};
