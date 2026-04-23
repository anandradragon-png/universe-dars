/**
 * Консолидированный feedback endpoint:
 *  - POST /api/feedback                — отправить фидбэк (публично)
 *  - GET  /api/feedback?action=admin   — получить список фидбэка (только админы)
 */

const { requireUser } = require('./lib/auth');
const { getSupabase } = require('./lib/db');

// ID администраторов, которым разрешён доступ к фидбэку
const ADMIN_IDS = [269932434]; // Светлана @AnandraDragon

async function handleAdminGet(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const tgUser = requireUser(req, res);
  if (!tgUser) return;
  if (!ADMIN_IDS.includes(tgUser.id)) return res.status(403).json({ error: 'Forbidden' });

  try {
    const db = getSupabase();
    const { data, error } = await db
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Admin feedback fetch error:', error.message);
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return res.json({ feedback: [], note: 'Таблица feedback ещё не создана в Supabase' });
      }
      throw error;
    }

    return res.json({ feedback: data || [], count: (data || []).length });
  } catch (e) {
    console.error('Admin feedback error:', e.message);
    return res.status(500).json({ error: 'Ошибка загрузки' });
  }
}

async function handlePublicPost(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { category, message, page, user_agent } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  try {
    const db = getSupabase();

    const { error } = await db.from('feedback').insert({
      category: category || 'bug',
      message: message.trim().slice(0, 2000),
      page: page || '',
      user_agent: user_agent || '',
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error('Feedback insert error:', error.message);
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return res.status(200).json({ ok: true, note: 'Таблица feedback ещё не создана в Supabase. Создай её вручную.' });
      }
      throw error;
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Feedback error:', e.message);
    return res.status(500).json({ error: 'Ошибка сохранения' });
  }
}

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const url = req.url || '';

  // Админский GET: ?action=admin ИЛИ URL /admin-feedback
  if (action === 'admin' || url.includes('/admin-feedback')) {
    return handleAdminGet(req, res);
  }

  // По умолчанию — публичный POST фидбэка
  return handlePublicPost(req, res);
};
