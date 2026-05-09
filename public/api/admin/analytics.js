/**
 * GET /api/admin/analytics?period=7d|30d|90d|all
 *
 * Сводная аналитика по фичам — кто что использует, что востребовано,
 * что мёртвое. Показывает воронку активаций и AI-нагрузку.
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

async function safeCount(db, table, builder = q => q) {
  try {
    const { count } = await builder(db.from(table).select('id', { count: 'exact', head: true }));
    return count || 0;
  } catch (e) {
    console.warn('[analytics] count', table, e.message);
    return 0;
  }
}

async function safeUniqueUsers(db, table, builder = q => q) {
  // Сколько уникальных user_id в таблице за период (выборка, не точно но быстро)
  try {
    const { data } = await builder(db.from(table).select('user_id').limit(50000));
    const uniq = new Set((data || []).map(r => r.user_id).filter(Boolean));
    return uniq.size;
  } catch (e) {
    console.warn('[analytics] unique', table, e.message);
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

  const period = (req.query.period || '30d').toString();
  const fromIso = periodToFrom(period);
  const db = getSupabase();

  try {
    // ==================== БАЗА ====================
    const totalUsers = await safeCount(db, 'users');
    const usersWithDar = await safeCount(db, 'users', q => q.not('dar_code', 'is', null));
    const usersInPeriod = fromIso
      ? await safeCount(db, 'users', q => q.gte('last_active_at', fromIso))
      : totalUsers;

    // ==================== ВОРОНКА: % дошедших до фичи ====================
    // Считаем уникальных пользователей в каждой таблице активности.
    // За период (с lastActiveAt) — потом нормализуем в % от base.

    // Сокровищница — открыли хотя бы один дар
    const userDarsTouched = await safeUniqueUsers(db, 'user_dars',
      fromIso ? q => q.gte('unlocked_at', fromIso) : q => q
    );

    // Квесты
    const questsTouched = await safeUniqueUsers(db, 'user_quests',
      fromIso ? q => q.gte('completed_at', fromIso) : q => q
    );
    const questsCount = fromIso
      ? await safeCount(db, 'user_quests', q => q.gte('completed_at', fromIso))
      : await safeCount(db, 'user_quests');

    // Hero Journey
    const hjTouched = await safeUniqueUsers(db, 'hero_journeys',
      fromIso ? q => q.gte('updated_at', fromIso) : q => q
    );
    const hjCompleted = fromIso
      ? await safeCount(db, 'hero_journeys', q => q.not('completed_at', 'is', null).gte('completed_at', fromIso))
      : await safeCount(db, 'hero_journeys', q => q.not('completed_at', 'is', null));
    const hjStarted = fromIso
      ? await safeCount(db, 'hero_journeys', q => q.gte('started_at', fromIso))
      : await safeCount(db, 'hero_journeys');

    // Оракул
    const oracleTouched = await safeUniqueUsers(db, 'oracle_cache',
      fromIso ? q => q.gte('created_at', fromIso) : q => q
    );
    const oracleCount = fromIso
      ? await safeCount(db, 'oracle_cache', q => q.gte('created_at', fromIso))
      : await safeCount(db, 'oracle_cache');

    // Тренажёр Интуиции (intuition_scores — там games_played > 0)
    let intuitionPlayers = 0, intuitionGamesTotal = 0;
    try {
      const { data } = await db
        .from('intuition_scores')
        .select('user_id, games_played, last_played_at');
      let arr = data || [];
      if (fromIso) arr = arr.filter(r => r.last_played_at && r.last_played_at >= fromIso);
      intuitionPlayers = arr.filter(r => (r.games_played || 0) > 0).length;
      intuitionGamesTotal = arr.reduce((s, r) => s + (r.games_played || 0), 0);
    } catch (e) { console.warn('[analytics] intuition', e.message); }

    // Зал Славы — кто получил титулы
    const titlesAwarded = fromIso
      ? await safeCount(db, 'hall_of_fame', q => q.gte('awarded_at', fromIso))
      : await safeCount(db, 'hall_of_fame');

    // Дневник Дара
    const diaryTouched = await safeUniqueUsers(db, 'dar_diary',
      fromIso ? q => q.gte('created_at', fromIso) : q => q
    );
    const diaryEntries = fromIso
      ? await safeCount(db, 'dar_diary', q => q.gte('created_at', fromIso))
      : await safeCount(db, 'dar_diary');

    // Семья (relatives)
    const relativesTouched = await safeUniqueUsers(db, 'user_relatives',
      fromIso ? q => q.gte('created_at', fromIso) : q => q
    );
    const relativesCount = fromIso
      ? await safeCount(db, 'user_relatives', q => q.gte('created_at', fromIso))
      : await safeCount(db, 'user_relatives');

    // Книга для родителей (главы)
    const childBookCount = fromIso
      ? await safeCount(db, 'child_book_sections', q => q.gte('generated_at', fromIso))
      : await safeCount(db, 'child_book_sections');

    // Рефералы
    const referralsCount = fromIso
      ? await safeCount(db, 'referrals', q => q.gte('created_at', fromIso))
      : await safeCount(db, 'referrals');
    const referralsActive = await safeUniqueUsers(db, 'referrals',
      fromIso ? q => q.gte('created_at', fromIso) : q => q,
    );

    // Фидбэк
    const feedbackCount = fromIso
      ? await safeCount(db, 'feedback', q => q.gte('created_at', fromIso))
      : await safeCount(db, 'feedback');
    const feedbackUsers = await safeUniqueUsers(db, 'feedback',
      fromIso ? q => q.gte('created_at', fromIso) : q => q
    );

    // ==================== AI-нагрузка ====================
    const sectionsCacheSize = await safeCount(db, 'dar_sections_cache');
    const oracleCacheSize = await safeCount(db, 'oracle_cache');
    // AI-генерации за период по таблицам кэша
    const sectionsGeneratedPeriod = fromIso
      ? await safeCount(db, 'dar_sections_cache', q => q.gte('created_at', fromIso))
      : sectionsCacheSize;
    const oracleGeneratedPeriod = fromIso
      ? await safeCount(db, 'oracle_cache', q => q.gte('created_at', fromIso))
      : oracleCacheSize;
    const childBookGeneratedPeriod = fromIso
      ? await safeCount(db, 'child_book_sections', q => q.gte('generated_at', fromIso))
      : await safeCount(db, 'child_book_sections');

    // ==================== ВОРОНКА (% от usersInPeriod) ====================
    const denominator = usersInPeriod || totalUsers || 1;
    const pct = (n) => Math.round(100 * (n || 0) / denominator);

    const features = [
      { key: 'dar_calculated', name: 'Рассчитал свой дар', users: usersWithDar, pct: pct(usersWithDar), tier: 'core' },
      { key: 'treasure', name: 'Сокровищница (открыл дар)', users: userDarsTouched, pct: pct(userDarsTouched), tier: 'core' },
      { key: 'quests', name: 'Квесты (выполнил задание)', users: questsTouched, pct: pct(questsTouched), extra: questsCount + ' выполнений', tier: 'core' },
      { key: 'hero', name: 'Путешествие Героя', users: hjTouched, pct: pct(hjTouched), extra: hjStarted + ' начали, ' + hjCompleted + ' завершили', tier: 'core' },
      { key: 'oracle', name: 'Оракул (получил предсказание)', users: oracleTouched, pct: pct(oracleTouched), extra: oracleCount + ' генераций', tier: 'core' },
      { key: 'intuition', name: 'Тренажёр Интуиции', users: intuitionPlayers, pct: pct(intuitionPlayers), extra: intuitionGamesTotal + ' партий', tier: 'engagement' },
      { key: 'titles', name: 'Получил титул Маг X', users: titlesAwarded, pct: pct(titlesAwarded), tier: 'engagement' },
      { key: 'diary', name: 'Дневник Дара', users: diaryTouched, pct: pct(diaryTouched), extra: diaryEntries + ' записей', tier: 'engagement' },
      { key: 'relatives', name: 'Добавил близких', users: relativesTouched, pct: pct(relativesTouched), extra: relativesCount + ' карточек', tier: 'social' },
      { key: 'child_book', name: 'Книга для родителей (главы)', users: 0, pct: 0, extra: childBookCount + ' глав сгенерировано', tier: 'social' },
      { key: 'referrals', name: 'Привёл друга', users: referralsActive, pct: pct(referralsActive), extra: referralsCount + ' рефералов', tier: 'viral' },
      { key: 'feedback', name: 'Прислал фидбэк', users: feedbackUsers, pct: pct(feedbackUsers), extra: feedbackCount + ' сообщений', tier: 'support' }
    ];

    return res.json({
      period,
      base: {
        total_users: totalUsers,
        users_with_dar: usersWithDar,
        users_active_in_period: usersInPeriod,
        denominator: denominator,
        denominator_label: fromIso ? 'активных за период' : 'всего юзеров'
      },
      features,
      ai_load: {
        oracle_cache_total: oracleCacheSize,
        sections_cache_total: sectionsCacheSize,
        oracle_generated_period: oracleGeneratedPeriod,
        sections_generated_period: sectionsGeneratedPeriod,
        child_book_generated_period: childBookGeneratedPeriod
      }
    });
  } catch (e) {
    console.error('[admin/analytics]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
