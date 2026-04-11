const { requireUser } = require('./lib/auth');
const { getOrCreateUser, updateUser, addCrystals } = require('./lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

    const user = await getOrCreateUser(tgUser);
    const { code } = req.body;

    if (!code) return res.status(400).json({ error: 'code required' });

    // Коды из env: PROMO_CODES_EXTENDED (дают extended доступ), PROMO_CODES_PREMIUM
    const extendedCodes = (process.env.PROMO_CODES_EXTENDED || 'DARBOOK2024,UNIVERSE777').split(',').map(c => c.trim().toUpperCase());
    const premiumCodes = (process.env.PROMO_CODES_PREMIUM || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

    const inputCode = code.trim().toUpperCase();

    if (premiumCodes.includes(inputCode)) {
      await updateUser(user.id, { access_level: 'premium' });
      await addCrystals(user.id, 50, 'promo_premium');
      return res.json({ success: true, access_level: 'premium', crystals_bonus: 50 });
    }

    if (extendedCodes.includes(inputCode)) {
      if (user.access_level === 'premium') {
        return res.json({ success: true, message: 'Already premium', access_level: 'premium' });
      }
      await updateUser(user.id, { access_level: 'extended' });
      await addCrystals(user.id, 20, 'promo_extended');
      return res.json({ success: true, access_level: 'extended', crystals_bonus: 20 });
    }

    return res.json({ success: false, message: 'Invalid code' });
  } catch (e) {
    console.error('promo.js error:', e);
    return res.status(500).json({ error: e.message });
  }
};
