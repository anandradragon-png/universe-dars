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

  // ==================== БАЗОВЫЙ ПРОФИЛЬ ====================
  const { data: user, error: e1 } = await db.from('users').select('*').eq('id', userId).single();
  if (e1 || !user) return res.status(404).json({ error: 'Пользователь не найден' });

  const last7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const last30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // Безопасный helper, чтобы карточка не падала если какой-то таблицы нет
  const safe = async (fn, fallback) => {
    try { return await fn(); } catch (e) { console.warn('[card]', e.message); return fallback; }
  };

  // ==================== СОКРОВИЩНИЦА ====================
  const dars = await safe(async () => {
    const { data } = await db
      .from('user_dars')
      .select('dar_code, unlock_source, unlocked_sections, unlocked_at')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });
    return data || [];
  }, []);

  // Квесты (выполненные задания)
  const questsStats = await safe(async () => {
    const { data } = await db
      .from('user_quests')
      .select('dar_code, section_index, quest_type, completed_at')
      .eq('user_id', userId);
    return {
      total: (data || []).length,
      by_dar: (data || []).reduce((acc, q) => {
        acc[q.dar_code] = (acc[q.dar_code] || 0) + 1;
        return acc;
      }, {}),
      last_completed: (data || []).reduce((latest, q) =>
        !latest || q.completed_at > latest ? q.completed_at : latest, null)
    };
  }, { total: 0, by_dar: {}, last_completed: null });

  // Hero Journey (Путешествие Героя)
  const heroJourneys = await safe(async () => {
    const { data } = await db
      .from('hero_journeys')
      .select('dar_code, step, completed_steps, crystals_earned, started_at, updated_at, completed_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    return data || [];
  }, []);

  // ==================== КРИСТАЛЛЫ ====================
  const crystalLog = await safe(async () => {
    const { data } = await db
      .from('crystal_log')
      .select('amount, reason, metadata, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    return data || [];
  }, []);

  // Агрегаты по кристаллам
  let crystalsTotalEarned = 0, crystalsTotalSpent = 0;
  const reasonStats = {};
  for (const r of crystalLog) {
    if (r.amount > 0) crystalsTotalEarned += r.amount;
    else crystalsTotalSpent += Math.abs(r.amount);
    const key = r.reason || 'unknown';
    if (!reasonStats[key]) reasonStats[key] = { count: 0, sum: 0 };
    reasonStats[key].count++;
    reasonStats[key].sum += r.amount;
  }

  // Платежи
  const payments = crystalLog.filter(r => {
    const reason = (r.reason || '').toLowerCase();
    return reason.includes('stars') || reason.includes('yookassa') ||
           reason.includes('telegram_payment') || reason.includes('yoomoney');
  });

  // ==================== ИГРЫ (тренажёр интуиции) ====================
  const intuition = await safe(async () => {
    const { data } = await db
      .from('intuition_scores')
      .select('*')
      .eq('user_id', userId)
      .single();
    return data;
  }, null);

  // Зал Славы — сколько раз становился Магом
  const hallOfFame = await safe(async () => {
    const { data } = await db
      .from('hall_of_fame')
      .select('title_type, period_start, score, crystals_awarded, awarded_at')
      .eq('user_id', userId)
      .order('awarded_at', { ascending: false });
    return data || [];
  }, []);
  const titlesCounts = hallOfFame.reduce((acc, t) => {
    acc[t.title_type] = (acc[t.title_type] || 0) + 1;
    return acc;
  }, {});

  // ==================== ОРАКУЛ ====================
  const oracleStats = await safe(async () => {
    const { count: totalCount } = await db
      .from('oracle_cache')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    const { count: count7d } = await db
      .from('oracle_cache')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', last7d);
    const { count: count30d } = await db
      .from('oracle_cache')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', last30d);
    const { data: latest } = await db
      .from('oracle_cache')
      .select('mode, dar_code, date_key, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    return {
      total: totalCount || 0,
      last_7d: count7d || 0,
      last_30d: count30d || 0,
      latest: latest || []
    };
  }, { total: 0, last_7d: 0, last_30d: 0, latest: [] });

  // ==================== ДНЕВНИК ДАРА ====================
  const diary = await safe(async () => {
    const { data } = await db
      .from('dar_diary')
      .select('date_key, mood, ai_insight, created_at')
      .eq('user_id', userId)
      .order('date_key', { ascending: false });
    const arr = data || [];
    const moodCounts = {};
    let withInsight = 0;
    for (const d of arr) {
      moodCounts[d.mood] = (moodCounts[d.mood] || 0) + 1;
      if (d.ai_insight) withInsight++;
    }
    return {
      total: arr.length,
      last_entry: arr[0] || null,
      mood_counts: moodCounts,
      with_ai_insight: withInsight
    };
  }, { total: 0, last_entry: null, mood_counts: {}, with_ai_insight: 0 });

  // ==================== СЕМЬЯ И БЛИЗКИЕ ====================
  const relatives = await safe(async () => {
    const { data } = await db
      .from('user_relatives')
      .select('id, name, relationship, dar_code, birth_date, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return data || [];
  }, []);

  // Книга для родителей (главы по близким)
  const childBookCount = await safe(async () => {
    if (!relatives.length) return 0;
    const ids = relatives.map(r => r.id);
    const { count } = await db
      .from('child_book_sections')
      .select('id', { count: 'exact', head: true })
      .in('relative_id', ids);
    return count || 0;
  }, 0);

  // ==================== РЕФЕРАЛЫ ====================
  const referrals = await safe(async () => {
    const { data } = await db
      .from('referrals')
      .select('referred_id, referred_dar_code, dar_unlocked, created_at')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false });
    return data || [];
  }, []);

  // Подтянем имена приглашённых
  let referralsWithNames = [];
  if (referrals.length) {
    const ids = referrals.map(r => r.referred_id).filter(Boolean);
    if (ids.length) {
      const { data: refUsers } = await db
        .from('users')
        .select('id, telegram_id, username, first_name, dar_code')
        .in('id', ids);
      const map = {};
      for (const u of (refUsers || [])) map[u.id] = u;
      referralsWithNames = referrals.map(r => ({ ...r, user: map[r.referred_id] || null }));
    }
  }

  // Кто пригласил этого юзера
  const referrer = user.referrer_id ? await safe(async () => {
    const { data } = await db
      .from('users')
      .select('id, telegram_id, username, first_name')
      .eq('id', user.referrer_id)
      .single();
    return data;
  }, null) : null;

  // ==================== ОБРАТНАЯ СВЯЗЬ ====================
  const feedback = await safe(async () => {
    const { data } = await db
      .from('feedback')
      .select('category, message, page, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    return data || [];
  }, []);

  // ==================== ДЕЙСТВИЯ АДМИНОВ ====================
  const adminActions = await safe(async () => {
    const { data } = await db
      .from('admin_actions_log')
      .select('action, payload, created_at, admin_user_id')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    return data || [];
  }, []);

  // ==================== ИТОГ: СВОДНАЯ ПО АКТИВНОСТЯМ ====================
  // Это как "оценка вовлечённости" — какие фичи юзер реально использует
  const engagement = {
    has_dar: !!user.dar_code,
    treasure_dars_opened: dars.length,
    quests_done: questsStats.total,
    hero_journeys_started: heroJourneys.length,
    hero_journeys_completed: heroJourneys.filter(h => h.completed_at).length,
    oracle_used_total: oracleStats.total,
    oracle_used_30d: oracleStats.last_30d,
    intuition_games: intuition?.games_played || 0,
    intuition_titles: hallOfFame.length,
    diary_entries: diary.total,
    relatives_added: relatives.length,
    child_book_chapters: childBookCount,
    referrals_made: referrals.length,
    feedback_sent: feedback.length,
    payments_count: payments.length
  };

  return res.json({
    user,
    referrer,
    engagement,
    dars,
    quests: questsStats,
    hero_journeys: heroJourneys,
    crystal_log: crystalLog,
    crystals_aggregate: {
      total_earned: crystalsTotalEarned,
      total_spent: crystalsTotalSpent,
      by_reason: reasonStats
    },
    payments,
    intuition,
    titles: { counts: titlesCounts, history: hallOfFame.slice(0, 10) },
    oracle: oracleStats,
    diary,
    relatives,
    child_book_chapters_count: childBookCount,
    referrals: referralsWithNames.length ? referralsWithNames : referrals,
    feedback,
    admin_actions: adminActions
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
