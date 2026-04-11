const { getUser, requireUser } = require('./lib/auth');
const { getOrCreateUser, updateUser, getUserDars, addCrystals, unlockDar } = require('./lib/db');
const { getReward, getStreakBonus } = require('./lib/crystals');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

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
          real_first_name: user.real_first_name || '',
          real_last_name: user.real_last_name || '',
          gender: user.gender || '',
          birth_time: user.birth_time || '',
          birth_place: user.birth_place || '',
          birth_lat: user.birth_lat !== null && user.birth_lat !== undefined ? Number(user.birth_lat) : null,
          birth_lon: user.birth_lon !== null && user.birth_lon !== undefined ? Number(user.birth_lon) : null,
          profile_completed: !!user.profile_completed,
          leaderboard_name_type: user.leaderboard_name_type || 'real',
          leaderboard_custom_name: user.leaderboard_custom_name || '',
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

      // Сохранить расширенный профиль
      if (action === 'save_profile') {
        const { real_first_name, real_last_name, gender, birth_time, birth_place, birth_lat, birth_lon } = req.body;

        // Валидация
        if (!real_first_name || !real_first_name.trim()) {
          return res.status(400).json({ error: 'Укажи своё имя' });
        }
        if (!real_last_name || !real_last_name.trim()) {
          return res.status(400).json({ error: 'Укажи свою фамилию' });
        }
        if (gender !== 'male' && gender !== 'female') {
          return res.status(400).json({ error: 'Укажи пол' });
        }
        if (!birth_time || !/^\d{1,2}:\d{2}$/.test(birth_time)) {
          return res.status(400).json({ error: 'Укажи время рождения в формате ЧЧ:ММ' });
        }
        if (!birth_place || !birth_place.trim()) {
          return res.status(400).json({ error: 'Укажи место рождения' });
        }
        const lat = Number(birth_lat);
        const lon = Number(birth_lon);
        if (!isFinite(lat) || lat < -90 || lat > 90) {
          return res.status(400).json({ error: 'Некорректная широта. Выбери город из подсказок.' });
        }
        if (!isFinite(lon) || lon < -180 || lon > 180) {
          return res.status(400).json({ error: 'Некорректная долгота. Выбери город из подсказок.' });
        }

        try {
          await updateUser(user.id, {
            real_first_name: real_first_name.trim().slice(0, 50),
            real_last_name: real_last_name.trim().slice(0, 50),
            gender,
            birth_time,
            birth_place: birth_place.trim().slice(0, 100),
            birth_lat: lat,
            birth_lon: lon,
            profile_completed: true,
          });
          return res.json({ success: true });
        } catch (dbErr) {
          console.error('save_profile DB error:', dbErr.message);
          if (dbErr.message && dbErr.message.includes('column')) {
            return res.status(500).json({ error: 'База данных не обновлена. Запусти миграцию supabase-migration-profile.sql в Supabase SQL Editor.' });
          }
          throw dbErr;
        }
      }

      // Сохранить выбор имени для рейтинга
      if (action === 'save_leaderboard_name') {
        const { name_type, custom_name } = req.body;
        if (name_type !== 'real' && name_type !== 'tg' && name_type !== 'custom') {
          return res.status(400).json({ error: 'Неверный тип имени. Допустимые: real, tg, custom.' });
        }
        if (name_type === 'custom') {
          const trimmed = (custom_name || '').trim();
          if (trimmed.length < 2) {
            return res.status(400).json({ error: 'Твоё имя должно быть не короче 2 символов.' });
          }
          if (trimmed.length > 30) {
            return res.status(400).json({ error: 'Твоё имя не должно превышать 30 символов.' });
          }
        }
        try {
          await updateUser(user.id, {
            leaderboard_name_type: name_type,
            leaderboard_custom_name: name_type === 'custom' ? (custom_name || '').trim().slice(0, 30) : ''
          });
          return res.json({ success: true });
        } catch (dbErr) {
          console.error('save_leaderboard_name DB error:', dbErr.message);
          if (dbErr.message && dbErr.message.includes('column')) {
            return res.status(500).json({ error: 'База данных не обновлена. Запусти миграцию supabase-migration-leaderboard.sql.' });
          }
          throw dbErr;
        }
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('user.js error:', e);
    return res.status(500).json({ error: e.message });
  }
};
