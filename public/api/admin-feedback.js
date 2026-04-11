const { requireUser } = require('./lib/auth');
const { getSupabase } = require('./lib/db');

// ID администраторов, которым разрешён доступ к фидбэку
const ADMIN_IDS = [269932434]; // Светлана @AnandraDragon

module.exports = async (req, res) => {
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
};
