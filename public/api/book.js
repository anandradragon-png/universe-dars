const { createClient } = require('@supabase/supabase-js');

const TOTAL_PAGES = 265;
const FREE_PAGES = 25; // Первые 25 страниц бесплатно (превью)

let supabase = null;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return supabase;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { page, action } = req.query;

    // Получить информацию о книге
    if (action === 'info') {
      // Проверить уровень доступа пользователя
      let accessLevel = 'basic';
      try {
        const { getUser } = require('./lib/auth');
        const tgUser = getUser(req);
        if (tgUser) {
          const db = getSupabase();
          const { data: user } = await db.from('users').select('access_level').eq('telegram_id', tgUser.id).single();
          if (user) accessLevel = user.access_level;
        }
      } catch(e) {}

      const maxPage = accessLevel === 'basic' ? FREE_PAGES : TOTAL_PAGES;

      return res.json({
        total_pages: TOTAL_PAGES,
        free_pages: FREE_PAGES,
        access_level: accessLevel,
        max_page: maxPage
      });
    }

    // Получить страницу
    const pageNum = parseInt(page);
    if (!pageNum || pageNum < 1 || pageNum > TOTAL_PAGES) {
      return res.status(400).json({ error: 'Invalid page number (1-' + TOTAL_PAGES + ')' });
    }

    // Проверить доступ
    let accessLevel = 'basic';
    try {
      const { getUser } = require('./lib/auth');
      const tgUser = getUser(req);
      if (tgUser) {
        const db = getSupabase();
        const { data: user } = await db.from('users').select('access_level').eq('telegram_id', tgUser.id).single();
        if (user) accessLevel = user.access_level;
      }
    } catch(e) {}

    // Бесплатные страницы доступны всем
    if (pageNum > FREE_PAGES && accessLevel === 'basic') {
      return res.status(403).json({
        error: 'Эта страница доступна после покупки книги',
        free_pages: FREE_PAGES,
        need_upgrade: true
      });
    }

    // Получить signed URL из Supabase Storage (действителен 60 секунд)
    const db = getSupabase();
    const fileName = `page_${String(pageNum).padStart(3, '0')}.jpg`;
    const { data, error } = await db.storage
      .from('book-pages')
      .createSignedUrl(fileName, 60); // URL живёт 60 секунд

    if (error) {
      console.error('Storage error:', error);
      return res.status(500).json({ error: 'Failed to get page' });
    }

    return res.json({
      page: pageNum,
      total: TOTAL_PAGES,
      url: data.signedUrl,
      is_free: pageNum <= FREE_PAGES
    });

  } catch (e) {
    console.error('book.js error:', e);
    return res.status(500).json({ error: e.message });
  }
};
