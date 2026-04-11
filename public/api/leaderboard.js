const { getUser } = require('./lib/auth');
const { getSupabase, getOrCreateUser, updateUser, addCrystals } = require('./lib/db');

// Helper: возвращает ключи текущих периодов (локальные даты, YYYY-MM-DD)
function periodKeys() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const day = `${y}-${m}-${d}`;

  // Неделя: понедельник как первый день
  const dow = now.getDay(); // 0=вс, 1=пн...
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const week = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

  // Месяц: первое число
  const month = `${y}-${m}-01`;

  return { day, week, month };
}

// Helper: получить отображаемое имя пользователя для рейтинга
function getDisplayName(user) {
  const type = user.leaderboard_name_type || 'real';
  if (type === 'custom' && user.leaderboard_custom_name) {
    return user.leaderboard_custom_name.slice(0, 40);
  }
  if (type === 'real' && user.real_first_name) {
    const last = user.real_last_name || '';
    return (user.real_first_name + (last ? ' ' + last.charAt(0) + '.' : '')).slice(0, 40);
  }
  // tg fallback
  const tg = (user.first_name || '') + (user.last_name ? ' ' + user.last_name.charAt(0) + '.' : '');
  return (tg || 'Странник').slice(0, 40);
}

// Получить или создать запись в intuition_scores
async function getOrCreateScoreRow(db, userId) {
  const { data: existing } = await db
    .from('intuition_scores')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (existing) return existing;

  const keys = periodKeys();
  const { data: created, error } = await db
    .from('intuition_scores')
    .insert({
      user_id: userId,
      display_name: '',
      score_daily: 0,
      score_weekly: 0,
      score_monthly: 0,
      score_alltime: 0,
      period_day: keys.day,
      period_week: keys.week,
      period_month: keys.month,
      games_played: 0,
      games_won: 0,
      best_streak: 0
    })
    .select()
    .single();
  if (error) throw error;
  return created;
}

// Сбросить периодические очки если период поменялся
function resetOutdatedPeriods(row) {
  const keys = periodKeys();
  const updates = {};
  if (row.period_day !== keys.day) {
    updates.score_daily = 0;
    updates.period_day = keys.day;
  }
  if (row.period_week !== keys.week) {
    updates.score_weekly = 0;
    updates.period_week = keys.week;
  }
  if (row.period_month !== keys.month) {
    updates.score_monthly = 0;
    updates.period_month = keys.month;
  }
  return updates;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db = getSupabase();

    // ========== GET: получить топ рейтинга ==========
    if (req.method === 'GET') {
      const period = (req.query && req.query.period) || 'daily';
      const difficulty = (req.query && req.query.difficulty) || 'all';
      const limit = Math.min(parseInt((req.query && req.query.limit) || '20', 10), 50);

      // Для дневного периода можем фильтровать по сложности
      let scoreField;
      if (period === 'weekly') scoreField = 'score_weekly';
      else if (period === 'monthly') scoreField = 'score_monthly';
      else if (period === 'daily' && difficulty === 'medium') scoreField = 'score_daily_medium';
      else if (period === 'daily' && difficulty === 'hard') scoreField = 'score_daily_hard';
      else if (period === 'daily' && difficulty === 'expert') scoreField = 'score_daily_expert';
      else scoreField = 'score_daily';

      const periodField = period === 'weekly' ? 'period_week'
                        : period === 'monthly' ? 'period_month'
                        : 'period_day';
      const keys = periodKeys();
      const currentPeriod = period === 'weekly' ? keys.week
                          : period === 'monthly' ? keys.month
                          : keys.day;

      // Подтянуть топ игроков в текущем периоде
      const { data: scores, error } = await db
        .from('intuition_scores')
        .select('user_id, display_name, ' + scoreField + ', ' + periodField + ', games_won')
        .eq(periodField, currentPeriod)
        .gt(scoreField, 0)
        .order(scoreField, { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Позиция текущего пользователя (если есть авторизация)
      let myRank = null;
      let myScore = 0;
      const tgUser = getUser(req);
      if (tgUser) {
        try {
          const user = await getOrCreateUser(tgUser);
          const { data: myRow } = await db
            .from('intuition_scores')
            .select(scoreField + ', ' + periodField)
            .eq('user_id', user.id)
            .single();
          if (myRow && myRow[periodField] === currentPeriod) {
            myScore = myRow[scoreField] || 0;
            if (myScore > 0) {
              // Посчитать сколько игроков имеют больше очков
              const { count } = await db
                .from('intuition_scores')
                .select('*', { count: 'exact', head: true })
                .eq(periodField, currentPeriod)
                .gt(scoreField, myScore);
              myRank = (count || 0) + 1;
            }
          }
        } catch (e) {
          console.warn('Leaderboard me-rank error:', e.message);
        }
      }

      return res.json({
        period,
        leaders: (scores || []).map((row, i) => ({
          rank: i + 1,
          display_name: row.display_name || 'Странник',
          score: row[scoreField] || 0,
          games_won: row.games_won || 0,
          is_me: tgUser && row.user_id === (tgUser.id ? undefined : null) // fallback
        })),
        me: tgUser ? { rank: myRank, score: myScore } : null
      });
    }

    // ========== POST: отправить очки после игры ==========
    if (req.method === 'POST') {
      const tgUser = getUser(req);
      if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

      const user = await getOrCreateUser(tgUser);
      const body = req.body || {};
      const points = body.points;
      const difficulty = body.difficulty || 'all';
      const won = body.won;
      const streak = body.streak;
      const addPoints = Math.max(0, Math.min(1000, parseInt(points, 10) || 0));

      // Получить или создать запись
      let row = await getOrCreateScoreRow(db, user.id);

      // Сбросить устаревшие периоды
      const resetUpdates = resetOutdatedPeriods(row);
      if (Object.keys(resetUpdates).length > 0) {
        Object.assign(row, resetUpdates);
      }

      // Обновить очки (общие + по сложности для дневных)
      const updates = Object.assign({}, resetUpdates, {
        score_daily: (row.score_daily || 0) + addPoints,
        score_weekly: (row.score_weekly || 0) + addPoints,
        score_monthly: (row.score_monthly || 0) + addPoints,
        score_alltime: (row.score_alltime || 0) + addPoints,
        games_played: (row.games_played || 0) + 1,
        games_won: (row.games_won || 0) + (won ? 1 : 0),
        best_streak: Math.max(row.best_streak || 0, parseInt(streak, 10) || 0),
        display_name: getDisplayName(user),
        last_played_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      // Дневные очки по конкретной сложности
      if (difficulty === 'medium') {
        updates.score_daily_medium = ((resetUpdates.score_daily_medium !== undefined ? 0 : row.score_daily_medium) || 0) + addPoints;
        if (resetUpdates.score_daily !== undefined) updates.score_daily_medium = addPoints;
      } else if (difficulty === 'hard') {
        updates.score_daily_hard = ((resetUpdates.score_daily_hard !== undefined ? 0 : row.score_daily_hard) || 0) + addPoints;
        if (resetUpdates.score_daily !== undefined) updates.score_daily_hard = addPoints;
      } else if (difficulty === 'expert') {
        updates.score_daily_expert = ((resetUpdates.score_daily_expert !== undefined ? 0 : row.score_daily_expert) || 0) + addPoints;
        if (resetUpdates.score_daily !== undefined) updates.score_daily_expert = addPoints;
      }

      // Если день поменялся, сбросить и посложностные
      if (resetUpdates.score_daily !== undefined) {
        if (updates.score_daily_medium === undefined) updates.score_daily_medium = 0;
        if (updates.score_daily_hard === undefined) updates.score_daily_hard = 0;
        if (updates.score_daily_expert === undefined) updates.score_daily_expert = 0;
      }

      const { error: updErr } = await db
        .from('intuition_scores')
        .update(updates)
        .eq('user_id', user.id);

      if (updErr) {
        console.error('Leaderboard update error:', updErr.message);
        if (updErr.message && updErr.message.includes('relation') && updErr.message.includes('does not exist')) {
          return res.status(500).json({ error: 'База данных не обновлена. Запусти миграцию supabase-migration-leaderboard.sql' });
        }
        throw updErr;
      }

      return res.json({
        success: true,
        score_daily: updates.score_daily,
        score_weekly: updates.score_weekly,
        score_monthly: updates.score_monthly,
        score_alltime: updates.score_alltime
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('leaderboard.js error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
