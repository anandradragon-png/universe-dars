/**
 * Админ-эндпоинты для управления пользователями.
 *
 * Маршруты (через query-параметры, чтобы один файл = одна Vercel-функция):
 *   GET  /api/admin/users?action=search&q=...&limit=50
 *   GET  /api/admin/users?action=card&id=42       — детальная карточка
 *   POST /api/admin/users?action=crystals         — body: { user_id, amount, reason }
 *   POST /api/admin/users?action=tier             — body: { user_id, tier }
 *   POST /api/admin/users?action=block            — body: { user_id, blocked: true|false }
 */

const { requireAdmin, logAdminAction } = require('../_lib/auth');
const { getSupabase } = require('../_lib/db');

async function handleSearch(req, res, db) {
  const q = (req.query.q || '').toString().trim();
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  let query = db
    .from('users')
    .select('id, telegram_id, username, first_name, last_name, dar_code, dar_name, access_level, crystals, is_admin, is_blocked, streak_count, created_at, last_active_at')
    .order('last_active_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (q) {
    // Поиск по username, first_name, last_name, telegram_id, dar_code
    const numeric = /^\d+$/.test(q);
    if (numeric) {
      query = query.or(`telegram_id.eq.${q},id.eq.${q}`);
    } else {
      // Текстовый поиск с регистронезависимым LIKE
      const safe = q.replace(/[%_]/g, '\\$&');
      query = query.or(
        `username.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,dar_code.ilike.%${safe}%`
      );
    }
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ users: data || [], total: (data || []).length, query: q });
}

async function handleCard(req, res, db) {
  const userId = parseInt(req.query.id);
  if (!userId) return res.status(400).json({ error: 'id required' });

  // Профиль
  const { data: user, error: e1 } = await db.from('users').select('*').eq('id', userId).single();
  if (e1 || !user) return res.status(404).json({ error: 'Пользователь не найден' });

  // Открытые дары
  const { data: dars } = await db
    .from('user_dars')
    .select('dar_code, unlock_source, unlocked_sections, unlocked_at')
    .eq('user_id', userId)
    .order('unlocked_at', { ascending: false });

  // Последние 50 операций по кристаллам
  const { data: crystalLog } = await db
    .from('crystal_log')
    .select('amount, reason, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  // Платежи (фильтр по reason)
  const payments = (crystalLog || []).filter(r => {
    const reason = r.reason || '';
    return reason.includes('stars') || reason.includes('yookassa') ||
           reason.includes('telegram_payment') || reason.includes('yoomoney');
  });

  // Реферальная статистика
  const { count: refCount } = await db
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', userId);

  // Последние действия админов над этим юзером
  const { data: adminActions } = await db
    .from('admin_actions_log')
    .select('action, payload, created_at, admin_user_id')
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  return res.json({
    user,
    dars: dars || [],
    crystal_log: crystalLog || [],
    payments,
    referrals_count: refCount || 0,
    admin_actions: adminActions || []
  });
}

async function handleCrystalsAction(req, res, db, admin) {
  const { user_id, amount, reason } = req.body || {};
  const userId = parseInt(user_id);
  const amt = parseInt(amount);
  if (!userId || !amt || isNaN(amt)) return res.status(400).json({ error: 'user_id и amount обязательны' });
  if (Math.abs(amt) > 100000) return res.status(400).json({ error: 'Слишком большая сумма (>100к). Если нужно — несколько операций.' });

  // Лог в crystal_log + обновить баланс
  await db.from('crystal_log').insert({
    user_id: userId,
    amount: amt,
    reason: 'admin_grant',
    metadata: { admin_id: admin.id, note: (reason || '').slice(0, 200) }
  });

  const { data: u } = await db.from('users').select('crystals').eq('id', userId).single();
  const newBalance = (u?.crystals || 0) + amt;
  await db.from('users').update({ crystals: newBalance }).eq('id', userId);

  await logAdminAction(admin.id, 'add_crystals', userId, { amount: amt, reason, new_balance: newBalance });

  return res.json({ ok: true, new_balance: newBalance });
}

async function handleTierAction(req, res, db, admin) {
  const { user_id, tier } = req.body || {};
  const userId = parseInt(user_id);
  if (!userId) return res.status(400).json({ error: 'user_id обязателен' });
  if (!['basic', 'extended', 'premium'].includes(tier)) {
    return res.status(400).json({ error: 'tier должен быть basic, extended или premium' });
  }

  const { data: before } = await db.from('users').select('access_level').eq('id', userId).single();
  await db.from('users').update({ access_level: tier }).eq('id', userId);
  await logAdminAction(admin.id, 'change_tier', userId, { from: before?.access_level, to: tier });

  return res.json({ ok: true, tier });
}

async function handleBlockAction(req, res, db, admin) {
  const { user_id, blocked } = req.body || {};
  const userId = parseInt(user_id);
  if (!userId) return res.status(400).json({ error: 'user_id обязателен' });
  const isBlocked = blocked === true || blocked === 'true';

  await db.from('users').update({ is_blocked: isBlocked }).eq('id', userId);
  await logAdminAction(admin.id, isBlocked ? 'block_user' : 'unblock_user', userId, {});

  return res.json({ ok: true, is_blocked: isBlocked });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const action = (req.query.action || '').toString();
  const db = getSupabase();

  try {
    if (req.method === 'GET' && action === 'search') return await handleSearch(req, res, db);
    if (req.method === 'GET' && action === 'card') return await handleCard(req, res, db);
    if (req.method === 'POST' && action === 'crystals') return await handleCrystalsAction(req, res, db, admin);
    if (req.method === 'POST' && action === 'tier') return await handleTierAction(req, res, db, admin);
    if (req.method === 'POST' && action === 'block') return await handleBlockAction(req, res, db, admin);
    return res.status(400).json({ error: 'Неизвестный action' });
  } catch (e) {
    console.error('[admin/users]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
