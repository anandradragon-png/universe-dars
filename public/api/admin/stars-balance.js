/**
 * Stars-баланс бота из Telegram + сверка с БД.
 *
 * GET /api/admin/stars-balance?limit=100&offset=0
 *
 * Дёргает Telegram Bot API:
 *   - getMyStarBalance     → текущий баланс ⭐ бота
 *   - getStarTransactions  → история транзакций (приходы/возвраты)
 *
 * Затем сверяет с тем, что у нас залогировано в crystal_log
 * (purchase_book / donation / telegram_payment_* / telegram_stars_*).
 *
 * Env: BOT_TOKEN
 */

const { requireAdmin } = require('../_lib/auth');
const { getSupabase } = require('../_lib/db');

async function tg(method, body) {
  const token = (process.env.BOT_TOKEN || '').trim();
  if (!token) throw new Error('BOT_TOKEN not configured');
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await resp.json();
  if (!data.ok) {
    const err = new Error(`Telegram ${method} failed: ${data.description || 'unknown'}`);
    err.tg = data;
    throw err;
  }
  return data.result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const limit = Math.min(parseInt(req.query.limit) || 100, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  // 1. Текущий баланс (если метод доступен)
  let balance = null;
  let balanceError = null;
  try {
    const r = await tg('getMyStarBalance', {});
    // r = { amount, nanostar_amount? }
    balance = parseInt(r.amount) || 0;
  } catch (e) {
    balanceError = e.tg?.description || e.message;
  }

  // 2. Транзакции
  let transactions = [];
  let txError = null;
  try {
    const r = await tg('getStarTransactions', { offset, limit });
    transactions = (r.transactions || []).map(t => ({
      id: t.id,
      date: t.date,                    // unix seconds
      date_iso: new Date(t.date * 1000).toISOString(),
      amount: t.amount,                // ⭐
      source: t.source || null,        // объект — есть у пополнений (приходы)
      receiver: t.receiver || null,    // объект — есть у возвратов (расходы)
      direction: t.source ? 'in' : (t.receiver ? 'out' : 'unknown'),
      payload: t.source?.invoice_payload || null,
      telegram_user_id: t.source?.user?.id || t.receiver?.user?.id || null,
      raw: t
    }));
  } catch (e) {
    txError = e.tg?.description || e.message;
  }

  // 3. Если баланс не получили — посчитаем из транзакций (приходы минус возвраты)
  if (balance === null && transactions.length > 0) {
    let inSum = 0, outSum = 0;
    for (const t of transactions) {
      if (t.direction === 'in') inSum += t.amount;
      else if (t.direction === 'out') outSum += t.amount;
    }
    balance = inSum - outSum;
  }

  // 4. Сверка с БД: сколько у нас залогировано Stars-платежей за всё время
  let dbStarsTotal = 0;
  let dbStarsCount = 0;
  let dbError = null;
  try {
    const db = getSupabase();
    const { data } = await db
      .from('crystal_log')
      .select('reason, metadata')
      .or([
        'reason.ilike.%stars%',
        'reason.ilike.%telegram_payment%',
        'reason.eq.purchase_book',
        'reason.eq.donation'
      ].join(','));
    for (const r of (data || [])) {
      const m = r.metadata || {};
      const currencyUp = (m.currency || '').toUpperCase();
      const stars = parseInt(
        m.stars || m.amount_stars ||
        (currencyUp === 'XTR' ? m.amount : 0) ||
        0
      ) || 0;
      if (stars > 0) {
        dbStarsTotal += stars;
        dbStarsCount++;
      }
    }
  } catch (e) {
    dbError = e.message;
  }

  // 5. Сумма приходов из Telegram (для сверки)
  let tgIncomingTotal = 0;
  for (const t of transactions) {
    if (t.direction === 'in') tgIncomingTotal += t.amount;
  }

  return res.json({
    balance,                       // текущий ⭐ баланс бота (или вычислен из транзакций)
    balance_source: balanceError ? 'computed_from_transactions' : 'getMyStarBalance',
    balance_error: balanceError,
    transactions,                  // последние N транзакций
    transactions_error: txError,
    summary: {
      tg_incoming_total: tgIncomingTotal,    // сколько ⭐ пришло за выгруженный период
      db_stars_total: dbStarsTotal,          // сколько ⭐ у нас залогировано в БД (за всё время)
      db_stars_count: dbStarsCount,
      db_error: dbError
    },
    pagination: { limit, offset, returned: transactions.length }
  });
};
