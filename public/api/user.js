const { getUser } = require('./lib/auth');
const { getOrCreateUser, updateUser, getUserDars, addCrystals, unlockDar } = require('./lib/db');
const { getReward, getStreakBonus } = require('./lib/crystals');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const tgUser = getUser(req);
    if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      // Получить или создать профиль
      const user = await getOrCreateUser(tgUser);
      const dars = await getUserDars(user.id);

      return res.json({
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          first_name: user.first_name,
          dar_code: user.dar_code,
          dar_name: user.dar_name,
          crystals: user.crystals,
          access_level: user.access_level,
          streak_count: user.streak_count || 0,
        },
        dars: dars.map(d => ({
          dar_code: d.dar_code,
          unlock_source: d.unlock_source,
          unlocked_sections: d.unlocked_sections
        }))
      });
    }

    if (req.method === 'POST') {
      const { action } = req.body;
      const user = await getOrCreateUser(tgUser);

      // Сохранить рассчитанный дар
      if (action === 'save_dar') {
        const { dar_code, dar_name, birth_date } = req.body;
        if (!dar_code) return res.status(400).json({ error: 'dar_code required' });

        const isFirstDar = !user.dar_code;
        await updateUser(user.id, { dar_code, dar_name, birth_date });

        // Открыть свой дар в сокровищнице
        await unlockDar(user.id, dar_code, 'own');

        // Бонус за первый расчёт
        let crystalsEarned = 0;
        if (isFirstDar) {
          crystalsEarned = getReward('signup', user.access_level);
          await addCrystals(user.id, crystalsEarned, 'signup');
        }

        return res.json({ success: true, crystals_earned: crystalsEarned });
      }

      // Ежедневный вход
      if (action === 'daily_login') {
        const today = new Date().toISOString().slice(0, 10);
        const lastDate = user.last_streak_date;

        if (lastDate === today) {
          return res.json({ already_logged: true, streak: user.streak_count });
        }

        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const newStreak = (lastDate === yesterday) ? (user.streak_count || 0) + 1 : 1;

        await updateUser(user.id, { streak_count: newStreak, last_streak_date: today });

        let crystals = getReward('daily_login', user.access_level);
        const streakBonus = getStreakBonus(newStreak);
        if (streakBonus > 0) crystals += streakBonus;

        const newBalance = await addCrystals(user.id, crystals, 'daily_login', { streak: newStreak });

        return res.json({
          streak: newStreak,
          crystals_earned: crystals,
          streak_bonus: streakBonus,
          total_crystals: newBalance
        });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('user.js error:', e);
    return res.status(500).json({ error: e.message });
  }
};
