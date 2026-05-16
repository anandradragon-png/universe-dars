/**
 * GET /api/admin/stats?period=7d|30d|90d|all
 *
 * Главные цифры для дашборда админа.
 *
 * Возвращает:
 * {
 *   period: '7d',
 *   users: {
 *     total,                  // всего юзеров
 *     new_today,              // зарегистрировались сегодня (с 00:00 локали сервера UTC)
 *     new_period,             // зарегистрировались за период
 *     active_period,          // last_active_at попадает в период
 *     with_dar,               // юзеров у которых рассчитан дар (есть birth_date или dar_code)
 *     by_tier: { basic, extended, premium }
 *   },
 *   crystals: {
 *     in_circulation,         // сумма crystals по всем users
 *     granted_period,         // sum(amount) положительных за период
 *     spent_period            // sum(abs(amount)) отрицательных за период
 *   },
 *   payments: {
 *     count_period,           // количество покупок (Stars + ЮKassa) за период
 *     stars_total_period,     // сумма телеграм-звёзд за период
 *     yookassa_rub_period     // сумма ЮKassa-рублей за период
 *   },
 *   referrals: { count_period },
 *   ai: {
 *     oracle_cache_size,      // строк в oracle_cache
 *     dar_sections_cache_size // строк в dar_sections_cache
 *   }
 * }
 */

const { requireAdmin } = require('../_lib/auth');
const { getSupabase } = require('../_lib/db');

function periodToFrom(period) {
  const now = new Date();
  const ms = {
    '7d': 7 * 24 * 3600 * 1000,
    '30d': 30 * 24 * 3600 * 1000,
    '90d': 90 * 24 * 3600 * 1000
  }[period];
  if (!ms) return null; // 'all' — без фильтра
  return new Date(now.getTime() - ms).toISOString();
}

function todayStartIso() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  return start.toISOString();
}

async function safeCount(db, table, builder = q => q) {
  try {
    const q = builder(db.from(table).select('id', { count: 'exact', head: true }));
    const { count, error } = await q;
    if (error) {
      console.warn('[stats] count failed for', table, error.message);
      return 0;
    }
    return count || 0;
  } catch (e) {
    console.warn('[stats] count exception for', table, e.message);
    return 0;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const period = (req.query.period || '7d').toString();
  const fromIso = periodToFrom(period);
  const todayIso = todayStartIso();

  const db = getSupabase();

  try {
    // ====== USERS ======
    const total = await safeCount(db, 'users');
    const newToday = await safeCount(db, 'users', q => q.gte('created_at', todayIso));
    const newPeriod = fromIso ? await safeCount(db, 'users', q => q.gte('created_at', fromIso)) : total;
    const activePeriod = fromIso
      ? await safeCount(db, 'users', q => q.gte('last_active_at', fromIso))
      : total;
    const withDar = await safeCount(db, 'users', q => q.not('dar_code', 'is', null));

    // by tier
    const tierCounts = { basic: 0, extended: 0, premium: 0 };
    for (const tier of Object.keys(tierCounts)) {
      tierCounts[tier] = await safeCount(db, 'users', q => q.eq('access_level', tier));
    }

    // ====== CRYSTALS ======
    let inCirculation = 0;
    try {
      const { data } = await db.from('users').select('crystals');
      inCirculation = (data || []).reduce((s, r) => s + (r.crystals || 0), 0);
    } catch (e) { console.warn('[stats] crystals sum failed:', e.message); }

    let granted = 0, spent = 0;
    try {
      let q = db.from('crystal_log').select('amount');
      if (fromIso) q = q.gte('created_at', fromIso);
      const { data } = await q;
      for (const r of (data || [])) {
        if (r.amount > 0) granted += r.amount;
        else spent += Math.abs(r.amount);
      }
    } catch (e) { console.warn('[stats] crystal_log failed:', e.message); }

    // ====== PAYMENTS ======
    // Все платежи у нас идут через crystal_log. Считаем количество и суммы.
    // Stars: 'telegram_stars_*', 'telegram_payment_*', 'purchase_book', 'donation'
    // ЮKassa: 'yookassa_*', 'yoomoney_*'
    let starsTotal = 0, yookassaRub = 0, paymentsCount = 0;
    try {
      let q = db.from('crystal_log').select('reason, amount, metadata');
      if (fromIso) q = q.gte('created_at', fromIso);
      const { data } = await q;
      for (const r of (data || [])) {
        const reason = (r.reason || '').toLowerCase();
        const m = r.metadata || {};
        const currencyUp = (m.currency || '').toUpperCase();
        const isStars =
          reason.includes('stars') ||
          reason.includes('telegram_payment') ||
          reason === 'purchase_book' ||
          reason === 'donation' ||
          currencyUp === 'XTR';
        const isYookassa =
          reason.includes('yookassa') ||
          reason.includes('yoomoney');
        if (isStars) {
          paymentsCount++;
          // Stars-сумма: явное поле или metadata.amount при currency='XTR'
          starsTotal += parseInt(
            m.stars || m.amount_stars ||
            (currencyUp === 'XTR' ? m.amount : 0) ||
            0
          ) || 0;
        } else if (isYookassa) {
          paymentsCount++;
          yookassaRub += parseFloat(m.amount_rub || m.amount || 0) || 0;
        }
      }
    } catch (e) { console.warn('[stats] payments scan failed:', e.message); }

    // ====== REFERRALS ======
    const referralsCount = fromIso
      ? await safeCount(db, 'referrals', q => q.gte('created_at', fromIso))
      : await safeCount(db, 'referrals');

    // ====== AI CACHES ======
    const oracleCache = await safeCount(db, 'oracle_cache');
    const sectionsCache = await safeCount(db, 'dar_sections_cache');

    return res.json({
      period,
      users: {
        total,
        new_today: newToday,
        new_period: newPeriod,
        active_period: activePeriod,
        with_dar: withDar,
        by_tier: tierCounts
      },
      crystals: {
        in_circulation: inCirculation,
        granted_period: granted,
        spent_period: spent
      },
      payments: {
        count_period: paymentsCount,
        stars_total_period: starsTotal,
        yookassa_rub_period: Math.round(yookassaRub * 100) / 100
      },
      referrals: { count_period: referralsCount },
      ai: {
        oracle_cache_size: oracleCache,
        dar_sections_cache_size: sectionsCache
      }
    });
  } catch (e) {
    console.error('[admin/stats] error:', e.message);
    return res.status(500).json({ error: 'Не удалось собрать статистику', detail: e.message });
  }
};
