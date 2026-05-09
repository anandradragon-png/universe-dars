/**
 * Лента платежей: ЮKassa + Telegram Stars.
 *
 * GET /api/admin/payments?period=7d|30d|90d|all&provider=stars|yookassa|all&limit=200
 *
 * Источник — crystal_log с reason типа 'telegram_stars_*', 'yookassa_*', 'telegram_payment_*'.
 * Подтягиваем имена пользователей по user_id.
 */

const { requireAdmin } = require('../_lib/auth');
const { getSupabase } = require('../_lib/db');

function periodToFrom(period) {
  const ms = {
    '7d': 7 * 24 * 3600 * 1000,
    '30d': 30 * 24 * 3600 * 1000,
    '90d': 90 * 24 * 3600 * 1000
  }[period];
  if (!ms) return null;
  return new Date(Date.now() - ms).toISOString();
}

function classifyReason(reason) {
  const r = (reason || '').toLowerCase();
  if (r.includes('yookassa') || r.includes('yoomoney')) return 'yookassa';
  if (r.includes('stars') || r.includes('telegram_payment')) return 'stars';
  return 'other';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const period = (req.query.period || '30d').toString();
  const provider = (req.query.provider || 'all').toString();
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  const fromIso = periodToFrom(period);

  const db = getSupabase();

  try {
    let q = db
      .from('crystal_log')
      .select('id, user_id, amount, reason, metadata, created_at')
      .or('reason.ilike.%stars%,reason.ilike.%yookassa%,reason.ilike.%yoomoney%,reason.ilike.%telegram_payment%')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fromIso) q = q.gte('created_at', fromIso);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // Фильтр по провайдеру (если выбран)
    let payments = (data || []).map(r => ({ ...r, provider: classifyReason(r.reason) }));
    if (provider === 'stars' || provider === 'yookassa') {
      payments = payments.filter(p => p.provider === provider);
    }

    // Подтянем имена пользователей
    const userIds = [...new Set(payments.map(p => p.user_id))];
    const usersMap = {};
    if (userIds.length) {
      const { data: users } = await db
        .from('users')
        .select('id, telegram_id, username, first_name')
        .in('id', userIds);
      for (const u of (users || [])) usersMap[u.id] = u;
    }

    // Обогатим и посчитаем сводку
    let starsSum = 0, rubSum = 0;
    const enriched = payments.map(p => {
      const m = p.metadata || {};
      const stars = parseInt(m.stars || m.amount_stars || 0) || 0;
      const rub = parseFloat(m.amount_rub || (p.provider === 'yookassa' ? m.amount : 0) || 0) || 0;
      starsSum += stars;
      rubSum += rub;
      return {
        id: p.id,
        date: p.created_at,
        provider: p.provider,
        reason: p.reason,
        user: usersMap[p.user_id] || { id: p.user_id },
        amount_stars: stars,
        amount_rub: rub,
        product: m.product || m.description || '',
        metadata: m
      };
    });

    return res.json({
      period,
      provider,
      total: enriched.length,
      summary: {
        stars: starsSum,
        rub: Math.round(rubSum * 100) / 100
      },
      payments: enriched
    });
  } catch (e) {
    console.error('[admin/payments]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
