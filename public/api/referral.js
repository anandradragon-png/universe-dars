const { getUser } = require('./lib/auth');
const { getOrCreateUser, unlockDar, addCrystals, createReferral, getReferralCount } = require('./lib/db');
const { getReward } = require('./lib/crystals');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const tgUser = getUser(req);
    if (!tgUser) return res.status(401).json({ error: 'Unauthorized' });

    const user = await getOrCreateUser(tgUser);

    if (req.method === 'GET') {
      // Получить реферальную статистику
      const count = await getReferralCount(user.id);
      return res.json({
        referral_count: count,
        referral_link: `https://t.me/${process.env.BOT_USERNAME}?startapp=ref_${user.telegram_id}`
      });
    }

    if (req.method === 'POST') {
      const { referrer_telegram_id, new_user_dar_code } = req.body;

      if (!referrer_telegram_id || !new_user_dar_code) {
        return res.status(400).json({ error: 'referrer_telegram_id and new_user_dar_code required' });
      }

      // Не реферить самого себя
      if (parseInt(referrer_telegram_id) === user.telegram_id) {
        return res.json({ success: false, message: 'Cannot refer yourself' });
      }

      // Найти реферера
      const { getSupabase } = require('./lib/db');
      const db = getSupabase();
      const { data: referrer } = await db
        .from('users')
        .select('*')
        .eq('telegram_id', parseInt(referrer_telegram_id))
        .single();

      if (!referrer) {
        return res.json({ success: false, message: 'Referrer not found' });
      }

      // Проверить: дар нового пользователя отличается от дара реферера?
      const darUnlocked = referrer.dar_code !== new_user_dar_code;

      // Записать реферал
      await createReferral(referrer.id, user.id, new_user_dar_code, darUnlocked);

      // Кристаллы рефереру
      let referrerCrystals = getReward('referral', referrer.access_level);
      if (darUnlocked) {
        // Открыть дар в сокровищнице реферера
        await unlockDar(referrer.id, new_user_dar_code, 'referral');
        referrerCrystals += getReward('referral_new_dar', referrer.access_level);
      }
      await addCrystals(referrer.id, referrerCrystals, 'referral', {
        referred_dar: new_user_dar_code,
        dar_unlocked: darUnlocked
      });

      // Кристаллы новому пользователю тоже
      const newUserCrystals = getReward('referral', user.access_level);
      await addCrystals(user.id, newUserCrystals, 'was_referred');

      return res.json({
        success: true,
        dar_unlocked: darUnlocked,
        referrer_crystals: referrerCrystals,
        new_user_crystals: newUserCrystals
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('referral.js error:', e);
    return res.status(500).json({ error: e.message });
  }
};
