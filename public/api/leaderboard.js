/**
 * Консолидированный leaderboard endpoint:
 *  - mode=leaderboard (default)   — рейтинг интуиции + отправка очков
 *  - mode=hall-of-fame            — зал славы (лавры за периоды)
 *
 * Роутинг по req.query.mode или URL.
 */

const { getUser, requireUser } = require('./_lib/auth');
const { getSupabase, getOrCreateUser, updateUser, addCrystals } = require('./_lib/db');

// =====================================================================
// ========== LEADERBOARD HELPERS ======================================
// =====================================================================

// Helper: возвращает ключи текущих периодов (локальные даты, YYYY-MM-DD)
function periodKeysLeaderboard() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const day = `${y}-${m}-${d}`;

  // Неделя: понедельник как первый день
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const week = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

  // Месяц: первое число
  const month = `${y}-${m}-01`;

  return { day, week, month };
}

function getDisplayName(user) {
  const type = user.leaderboard_name_type || 'real';
  if (type === 'custom' && user.leaderboard_custom_name) {
    return user.leaderboard_custom_name.slice(0, 40);
  }
  if (type === 'real' && user.real_first_name) {
    const last = user.real_last_name || '';
    return (user.real_first_name + (last ? ' ' + last.charAt(0) + '.' : '')).slice(0, 40);
  }
  const tg = (user.first_name || '') + (user.last_name ? ' ' + user.last_name.charAt(0) + '.' : '');
  return (tg || 'Странник').slice(0, 40);
}

async function getOrCreateScoreRow(db, userId) {
  const { data: existing } = await db
    .from('intuition_scores')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (existing) return existing;

  const keys = periodKeysLeaderboard();
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

function resetOutdatedPeriods(row) {
  const keys = periodKeysLeaderboard();
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

async function handleLeaderboard(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const db = getSupabase();

    if (req.method === 'GET') {
      const period = (req.query && req.query.period) || 'daily';
      const difficulty = (req.query && req.query.difficulty) || 'all';
      const limit = Math.min(parseInt((req.query && req.query.limit) || '20', 10), 50);

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
      const winsField = period === 'weekly' ? 'games_won_weekly'
                      : period === 'monthly' ? 'games_won_monthly'
                      : 'games_won_daily';
      const keys = periodKeysLeaderboard();
      const currentPeriod = period === 'weekly' ? keys.week
                          : period === 'monthly' ? keys.month
                          : keys.day;

      let scores = null;
      let winsFieldActual = winsField;
      let firstTry = await db
        .from('intuition_scores')
        .select('user_id, display_name, ' + scoreField + ', ' + periodField + ', ' + winsField)
        .eq(periodField, currentPeriod)
        .gt(scoreField, 0)
        .order(scoreField, { ascending: false })
        .limit(limit);

      if (firstTry.error) {
        const msg = (firstTry.error.message || '').toLowerCase();
        const missingColumn = msg.includes('column') && (msg.includes('does not exist') || msg.includes('not found'));
        if (missingColumn) {
          console.warn('[leaderboard] per-period wins columns missing, falling back to games_won.');
          winsFieldActual = 'games_won';
          const fallback = await db
            .from('intuition_scores')
            .select('user_id, display_name, ' + scoreField + ', ' + periodField + ', games_won')
            .eq(periodField, currentPeriod)
            .gt(scoreField, 0)
            .order(scoreField, { ascending: false })
            .limit(limit);
          if (fallback.error) throw fallback.error;
          scores = fallback.data;
        } else {
          throw firstTry.error;
        }
      } else {
        scores = firstTry.data;
      }

      let myRank = null;
      let myScore = 0;
      const tgUser = getUser(req);
      if (tgUser && tgUser.id) {
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
          games_won: row[winsFieldActual] || 0,
          is_me: (tgUser && tgUser.id) && row.user_id === (tgUser.id ? undefined : null)
        })),
        me: (tgUser && tgUser.id) ? { rank: myRank, score: myScore } : null
      });
    }

    if (req.method === 'POST') {
      const tgUser = requireUser(req, res);
      if (!tgUser) return;

      const user = await getOrCreateUser(tgUser);
      const body = req.body || {};
      const points = body.points;
      const difficulty = body.difficulty || 'all';
      const won = body.won;
      const streak = body.streak;
      const crystalsEarned = Math.max(0, Math.min(1000, parseInt(body.crystals_earned, 10) || 0));
      const addPoints = Math.max(0, Math.min(1000, parseInt(points, 10) || 0));

      // ============ ЛИМИТ 5 РАУНДОВ В ДЕНЬ ДЛЯ БЕСПЛАТНОГО ТАРИФА ============
      // Подписчики (extended/premium) играют без ограничений.
      // Бесплатные (basic) могут сыграть 5 раундов в день — победа или проигрыш
      // считаются одинаково. Дальше — либо ждать завтра, либо купить
      // дополнительную попытку за 10 ⭐ (даёт +1 к лимиту на день).
      // Каждый раунд пишется в crystal_log с reason='intuition_round' (amount=0)
      // — лимит считаем по их количеству. Идемпотентность не нужна (один submit = один раунд).
      if (user.access_level === 'basic') {
        try {
          const todayStart = new Date();
          todayStart.setUTCHours(0, 0, 0, 0);

          const { data: roundsLog } = await db
            .from('crystal_log')
            .select('id')
            .eq('user_id', user.id)
            .eq('reason', 'intuition_round')
            .gte('created_at', todayStart.toISOString());
          const roundsToday = (roundsLog || []).length;

          const { data: extrasLog } = await db
            .from('crystal_log')
            .select('id')
            .eq('user_id', user.id)
            .eq('reason', 'intuition_extra_attempt')
            .gte('created_at', todayStart.toISOString());
          const extrasToday = (extrasLog || []).length;

          const dailyLimit = 5 + extrasToday;

          if (roundsToday >= dailyLimit) {
            // Раунд не засчитывается — ни кристаллов, ни очков рейтинга, новой записи raund нет.
            return res.status(200).json({
              success: false,
              daily_limit_reached: true,
              rounds_today: roundsToday,
              daily_limit: dailyLimit,
              extras_purchased_today: extrasToday,
              user_crystals: user.crystals || 0,
              extra_attempt_cost: 10,
              message: `Сегодня ты сыграл${user.gender === 'female' ? 'а' : ''} ${roundsToday} раунд${roundsToday === 1 ? '' : roundsToday < 5 ? 'а' : 'ов'} ✨ Возвращайся завтра или купи доп. попытку за 10 ⭐`
            });
          }

          // Лимит не достигнут — пишем раунд в журнал. Это amount=0 запись,
          // только для подсчёта raunds_today. Победа/проигрыш и кристаллы
          // обрабатываются дальше как раньше.
          await addCrystals(user.id, 0, 'intuition_round', {
            difficulty,
            won: !!won,
            points: addPoints
          });
        } catch (limitErr) {
          // Если проверка упала — пропускаем (не блокируем юзера из-за нашей ошибки)
          console.warn('[leaderboard] daily limit check failed:', limitErr.message);
        }
      }

      // Кристаллы за победу — пишем в users.crystals и crystal_log.
      // Дневной кэп 40 ⭐: считаем сколько уже начислено за сегодня
      // (reason=intuition_win) и режем добавление, чтобы не было фарма
      // на безлимитных тарифах. Песочница (easy) даёт 0 — не учитывается.
      const DAILY_CRYSTALS_CAP = 40;
      let crystalsActuallyAdded = 0;
      if (crystalsEarned > 0) {
        try {
          // Сумма уже начисленного за сегодня (UTC-день, как в crystal_log.created_at)
          const todayStart = new Date();
          todayStart.setUTCHours(0, 0, 0, 0);
          const { data: todayLog } = await db
            .from('crystal_log')
            .select('amount')
            .eq('user_id', user.id)
            .eq('reason', 'intuition_win')
            .gte('created_at', todayStart.toISOString());
          const todaySum = (todayLog || []).reduce((s, r) => s + (r.amount || 0), 0);
          const remaining = Math.max(0, DAILY_CRYSTALS_CAP - todaySum);
          crystalsActuallyAdded = Math.min(crystalsEarned, remaining);

          if (crystalsActuallyAdded > 0) {
            await addCrystals(user.id, crystalsActuallyAdded, 'intuition_win', {
              difficulty,
              streak: parseInt(streak, 10) || 0,
              points: addPoints,
              earned_full: crystalsEarned,
              capped: crystalsActuallyAdded < crystalsEarned
            });
          }
        } catch (cryErr) {
          console.warn('[leaderboard] addCrystals failed:', cryErr.message);
        }
      }

      let row = await getOrCreateScoreRow(db, user.id);

      const resetUpdates = resetOutdatedPeriods(row);
      if (Object.keys(resetUpdates).length > 0) {
        Object.assign(row, resetUpdates);
      }

      const wonInc = won ? 1 : 0;
      const baseWonDaily   = resetUpdates.period_day   !== undefined ? 0 : (row.games_won_daily   || 0);
      const baseWonWeekly  = resetUpdates.period_week  !== undefined ? 0 : (row.games_won_weekly  || 0);
      const baseWonMonthly = resetUpdates.period_month !== undefined ? 0 : (row.games_won_monthly || 0);

      const updates = Object.assign({}, resetUpdates, {
        score_daily: (row.score_daily || 0) + addPoints,
        score_weekly: (row.score_weekly || 0) + addPoints,
        score_monthly: (row.score_monthly || 0) + addPoints,
        score_alltime: (row.score_alltime || 0) + addPoints,
        games_played: (row.games_played || 0) + 1,
        games_won: (row.games_won || 0) + wonInc,
        games_won_daily:   baseWonDaily   + wonInc,
        games_won_weekly:  baseWonWeekly  + wonInc,
        games_won_monthly: baseWonMonthly + wonInc,
        best_streak: Math.max(row.best_streak || 0, parseInt(streak, 10) || 0),
        display_name: getDisplayName(user),
        last_played_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

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

      if (resetUpdates.score_daily !== undefined) {
        if (updates.score_daily_medium === undefined) updates.score_daily_medium = 0;
        if (updates.score_daily_hard === undefined) updates.score_daily_hard = 0;
        if (updates.score_daily_expert === undefined) updates.score_daily_expert = 0;
      }

      let updErr;
      ({ error: updErr } = await db
        .from('intuition_scores')
        .update(updates)
        .eq('user_id', user.id));

      if (updErr && /column.*(does not exist|not found)/i.test(updErr.message || '')) {
        console.warn('[leaderboard] missing per-period wins columns on update, falling back');
        delete updates.games_won_daily;
        delete updates.games_won_weekly;
        delete updates.games_won_monthly;
        ({ error: updErr } = await db
          .from('intuition_scores')
          .update(updates)
          .eq('user_id', user.id));
      }

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
        score_alltime: updates.score_alltime,
        crystals_added: crystalsActuallyAdded,
        crystals_capped: crystalsEarned > 0 && crystalsActuallyAdded < crystalsEarned
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('leaderboard error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}

// =====================================================================
// ========== HALL OF FAME =============================================
// =====================================================================

const TITLE_REWARDS = {
  day: 30,
  week: 100,
  month: 300
};

function periodKeysHallOfFame() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const day = `${y}-${m}-${d}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const prevDay = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  const lastMonday = new Date(now);
  const dow = lastMonday.getDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  lastMonday.setDate(lastMonday.getDate() - daysSinceMonday - 7);
  const prevWeek = `${lastMonday.getFullYear()}-${String(lastMonday.getMonth() + 1).padStart(2, '0')}-${String(lastMonday.getDate()).padStart(2, '0')}`;

  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;

  return { day, prevDay, prevWeek, prevMonth };
}

async function checkAndAwardPrevPeriods(db) {
  const keys = periodKeysHallOfFame();

  const checks = [
    { type: 'day', periodStart: keys.prevDay, scoreField: 'score_daily', periodField: 'period_day' },
    { type: 'week', periodStart: keys.prevWeek, scoreField: 'score_weekly', periodField: 'period_week' },
    { type: 'month', periodStart: keys.prevMonth, scoreField: 'score_monthly', periodField: 'period_month' }
  ];

  for (const check of checks) {
    try {
      const { data: existing } = await db
        .from('hall_of_fame')
        .select('id')
        .eq('title_type', check.type)
        .eq('period_start', check.periodStart)
        .limit(1);
      if (existing && existing.length > 0) continue;

      const { data: winners } = await db
        .from('intuition_scores')
        .select('user_id, display_name, ' + check.scoreField + ', ' + check.periodField)
        .eq(check.periodField, check.periodStart)
        .gt(check.scoreField, 0)
        .order(check.scoreField, { ascending: false })
        .limit(1);

      if (!winners || winners.length === 0) continue;

      const winner = winners[0];
      const score = winner[check.scoreField] || 0;
      if (score <= 0) continue;

      const reward = TITLE_REWARDS[check.type] || 0;
      const { error: insErr } = await db
        .from('hall_of_fame')
        .insert({
          user_id: winner.user_id,
          title_type: check.type,
          period_start: check.periodStart,
          score: score,
          crystals_awarded: reward
        });
      if (insErr) {
        if (insErr.code !== '23505') {
          console.warn('hall-of-fame insert error:', insErr.message);
        }
        continue;
      }

      if (reward > 0) {
        try {
          await addCrystals(winner.user_id, reward, 'title_' + check.type, {
            period: check.periodStart,
            score: score
          });
        } catch (e) {
          console.warn('addCrystals error for title:', e.message);
        }
      }
    } catch (e) {
      console.warn('checkAndAward error for ' + check.type + ':', e.message);
    }
  }
}

const EMPTY_HOF_RESPONSE = { titles: [], counts: { day: 0, week: 0, month: 0 } };

async function handleHallOfFame(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

    const db = getSupabase();
    let user;
    try {
      user = await getOrCreateUser(tgUser);
    } catch (e) {
      console.warn('hall-of-fame: getOrCreateUser failed:', e.message);
      return res.status(200).json(EMPTY_HOF_RESPONSE);
    }

    try {
      await checkAndAwardPrevPeriods(db);
    } catch (e) {
      console.warn('checkAndAwardPrevPeriods failed:', e.message);
    }

    let titles = [];
    try {
      const { data, error } = await db
        .from('hall_of_fame')
        .select('*')
        .eq('user_id', user.id)
        .order('awarded_at', { ascending: false })
        .limit(50);
      if (error) {
        console.warn('hall-of-fame select error:', error.message, error.code);
        return res.status(200).json(EMPTY_HOF_RESPONSE);
      }
      titles = data || [];
    } catch (e) {
      console.warn('hall-of-fame select threw:', e.message);
      return res.status(200).json(EMPTY_HOF_RESPONSE);
    }

    const counts = { day: 0, week: 0, month: 0 };
    for (const t of titles) {
      if (counts[t.title_type] !== undefined) counts[t.title_type]++;
    }

    return res.status(200).json({
      titles: titles.map(t => ({
        title_type: t.title_type,
        period_start: t.period_start,
        score: t.score,
        crystals_awarded: t.crystals_awarded,
        awarded_at: t.awarded_at
      })),
      counts
    });
  } catch (e) {
    console.error('hall-of-fame fatal:', e.message);
    return res.status(200).json(EMPTY_HOF_RESPONSE);
  }
}

// =====================================================================
// ========== MAIN ROUTER ==============================================
// =====================================================================

module.exports = async (req, res) => {
  const mode = (req.query && req.query.mode) || '';
  const url = req.url || '';

  if (mode === 'hall-of-fame' || url.includes('/hall-of-fame')) {
    return handleHallOfFame(req, res);
  }

  // По умолчанию — leaderboard
  return handleLeaderboard(req, res);
};
