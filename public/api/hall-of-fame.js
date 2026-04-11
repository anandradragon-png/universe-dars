const { getUser } = require('./lib/auth');
const { getSupabase, getOrCreateUser, addCrystals } = require('./lib/db');

// Награды победителям за титулы
const TITLE_REWARDS = {
  day: 30,    // Маг Дня
  week: 100,  // Маг Недели
  month: 300  // Маг Месяца
};

// Получить ключи периодов (локальное время)
function periodKeys() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const day = `${y}-${m}-${d}`;

  // Предыдущий день
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const prevDay = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  // Предыдущая неделя: понедельник прошлой недели
  const lastMonday = new Date(now);
  const dow = lastMonday.getDay();
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  lastMonday.setDate(lastMonday.getDate() - daysSinceMonday - 7);
  const prevWeek = `${lastMonday.getFullYear()}-${String(lastMonday.getMonth() + 1).padStart(2, '0')}-${String(lastMonday.getDate()).padStart(2, '0')}`;

  // Предыдущий месяц: первое число
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;

  return { day, prevDay, prevWeek, prevMonth };
}

// Определить победителя за прошлый период и начислить ему титул
// Это lazy проверка - запускается при GET /hall-of-fame, проверяет не закрытые периоды
async function checkAndAwardPrevPeriods(db) {
  const keys = periodKeys();

  // Для каждого типа периода проверяем победителя вчерашнего/прошлонедельного/прошломесячного
  const checks = [
    { type: 'day', periodStart: keys.prevDay, scoreField: 'score_daily', periodField: 'period_day' },
    { type: 'week', periodStart: keys.prevWeek, scoreField: 'score_weekly', periodField: 'period_week' },
    { type: 'month', periodStart: keys.prevMonth, scoreField: 'score_monthly', periodField: 'period_month' }
  ];

  for (const check of checks) {
    try {
      // Проверить: уже есть ли титул за этот период у любого пользователя?
      const { data: existing } = await db
        .from('hall_of_fame')
        .select('id')
        .eq('title_type', check.type)
        .eq('period_start', check.periodStart)
        .limit(1);
      if (existing && existing.length > 0) continue; // Уже присвоено

      // Найти победителя прошлого периода
      // Важно: ищем тех, у кого period_* совпадает с period_start И score_* > 0
      // Но: на момент запроса периоды могли быть уже сброшены при новой игре.
      // Поэтому мы используем сам факт наличия period в базе.
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

      // Присвоить титул
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
        if (insErr.code !== '23505') { // не unique violation - игнор
          console.warn('hall-of-fame insert error:', insErr.message);
        }
        continue;
      }

      // Начислить кристаллы победителю
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const tgUser = getUser(req);
    if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

    const db = getSupabase();
    const user = await getOrCreateUser(tgUser);

    // Проверяем и присуждаем титулы за закрытые периоды (lazy подсчёт)
    try {
      await checkAndAwardPrevPeriods(db);
    } catch (e) {
      console.warn('checkAndAwardPrevPeriods failed:', e.message);
    }

    // Получаем титулы этого пользователя
    const { data: titles, error } = await db
      .from('hall_of_fame')
      .select('*')
      .eq('user_id', user.id)
      .order('awarded_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('hall-of-fame fetch error:', error.message);
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return res.json({ titles: [], note: 'Таблица hall_of_fame не создана. Запусти миграцию leaderboard.' });
      }
      throw error;
    }

    // Счётчики
    const counts = { day: 0, week: 0, month: 0 };
    for (const t of titles || []) {
      if (counts[t.title_type] !== undefined) counts[t.title_type]++;
    }

    return res.json({
      titles: (titles || []).map(t => ({
        title_type: t.title_type,
        period_start: t.period_start,
        score: t.score,
        crystals_awarded: t.crystals_awarded,
        awarded_at: t.awarded_at
      })),
      counts
    });
  } catch (e) {
    console.error('hall-of-fame.js error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
