/**
 * Админ-эндпоинты управления промокодами.
 *
 *   GET  /api/admin/promo                  — список всех кодов
 *   POST /api/admin/promo?action=create    — body: { code, type, value, max_uses, expires_at, comment }
 *   POST /api/admin/promo?action=toggle    — body: { id, is_active }
 *   POST /api/admin/promo?action=delete    — body: { id }
 *   GET  /api/admin/promo?action=uses&id=N — кто и когда активировал данный код
 */

const { requireAdmin, logAdminAction } = require('../_lib/auth');
const { getSupabase } = require('../_lib/db');

async function handleList(req, res, db) {
  const { data, error } = await db
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ codes: data || [] });
}

async function handleCreate(req, res, db, admin) {
  const { code, type, value, max_uses, expires_at, comment } = req.body || {};
  if (!code || !type || value === undefined) {
    return res.status(400).json({ error: 'Обязательные поля: code, type, value' });
  }
  if (!['crystals', 'tier', 'discount'].includes(type)) {
    return res.status(400).json({ error: 'type должен быть crystals, tier или discount' });
  }

  const codeUpper = code.trim().toUpperCase();
  if (codeUpper.length < 3 || codeUpper.length > 50) {
    return res.status(400).json({ error: 'Код должен быть от 3 до 50 символов' });
  }

  const insertData = {
    code: codeUpper,
    type,
    value: typeof value === 'object' ? value : { amount: value },
    max_uses: max_uses ? parseInt(max_uses) : null,
    expires_at: expires_at || null,
    is_active: true,
    created_by: admin.id,
    comment: (comment || '').slice(0, 500)
  };

  const { data, error } = await db.from('promo_codes').insert(insertData).select().single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Такой код уже существует' });
    return res.status(500).json({ error: error.message });
  }

  await logAdminAction(admin.id, 'create_promo', null, { code: codeUpper, type, value });
  return res.json({ ok: true, code: data });
}

async function handleToggle(req, res, db, admin) {
  const { id, is_active } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id обязателен' });
  const active = is_active === true || is_active === 'true';

  const { error } = await db.from('promo_codes').update({ is_active: active }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  await logAdminAction(admin.id, active ? 'activate_promo' : 'deactivate_promo', null, { promo_id: id });
  return res.json({ ok: true, is_active: active });
}

async function handleDelete(req, res, db, admin) {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id обязателен' });

  // Получим код перед удалением для лога
  const { data: existing } = await db.from('promo_codes').select('code').eq('id', id).single();

  const { error } = await db.from('promo_codes').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });

  await logAdminAction(admin.id, 'delete_promo', null, { promo_id: id, code: existing?.code });
  return res.json({ ok: true });
}

async function handleUses(req, res, db) {
  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'id обязателен' });

  const { data: promo } = await db.from('promo_codes').select('code').eq('id', id).single();
  if (!promo) return res.status(404).json({ error: 'Промокод не найден' });

  // Активации лежат в crystal_log с reason='promo_*' и metadata.code = code
  const { data } = await db
    .from('crystal_log')
    .select('user_id, amount, reason, created_at, metadata')
    .like('reason', 'promo_%')
    .eq('metadata->>code', promo.code)
    .order('created_at', { ascending: false })
    .limit(200);

  // Подтянуть имена пользователей
  const userIds = [...new Set((data || []).map(r => r.user_id))];
  const usersMap = {};
  if (userIds.length) {
    const { data: users } = await db
      .from('users')
      .select('id, telegram_id, username, first_name')
      .in('id', userIds);
    for (const u of (users || [])) usersMap[u.id] = u;
  }

  const uses = (data || []).map(r => ({
    user: usersMap[r.user_id] || { id: r.user_id },
    amount: r.amount,
    reason: r.reason,
    created_at: r.created_at
  }));

  return res.json({ code: promo.code, uses });
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
    if (req.method === 'GET' && !action) return await handleList(req, res, db);
    if (req.method === 'GET' && action === 'uses') return await handleUses(req, res, db);
    if (req.method === 'POST' && action === 'create') return await handleCreate(req, res, db, admin);
    if (req.method === 'POST' && action === 'toggle') return await handleToggle(req, res, db, admin);
    if (req.method === 'POST' && action === 'delete') return await handleDelete(req, res, db, admin);
    return res.status(400).json({ error: 'Неизвестный action' });
  } catch (e) {
    console.error('[admin/promo]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
