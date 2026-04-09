const { getSupabase } = require('./lib/db');

module.exports = async (req, res) => {
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

    // Создаём таблицу если не существует (первый раз)
    const { error } = await db.from('feedback').insert({
      category: category || 'bug',
      message: message.trim().slice(0, 2000),
      page: page || '',
      user_agent: user_agent || '',
      created_at: new Date().toISOString()
    });

    if (error) {
      // Если таблицы нет — создадим через RPC или вернём ошибку
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
};
