const { requireUser } = require('./lib/auth');
const { getOrCreateUser, getUserDars, unlockDar, unlockSection, addCrystals } = require('./lib/db');
const { getCost, getReward } = require('./lib/crystals');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

    const user = await getOrCreateUser(tgUser);

    if (req.method === 'GET') {
      const dars = await getUserDars(user.id);
      return res.json({
        crystals: user.crystals,
        access_level: user.access_level,
        dars: dars.map(d => ({
          dar_code: d.dar_code,
          unlock_source: d.unlock_source,
          unlocked_sections: d.unlocked_sections
        }))
      });
    }

    if (req.method === 'POST') {
      const { action, dar_code, section_index } = req.body;

      // Открыть следующую секцию дара (за кристаллы)
      if (action === 'unlock_section') {
        if (!dar_code || !section_index) return res.status(400).json({ error: 'dar_code and section_index required' });

        const cost = getCost('unlock_section');
        if (user.crystals < cost) {
          return res.status(400).json({ error: 'Not enough crystals', need: cost, have: user.crystals });
        }

        const result = await unlockSection(user.id, dar_code, section_index);
        const newBalance = await addCrystals(user.id, -cost, 'unlock_section', { dar_code, section: section_index });

        return res.json({
          success: true,
          unlocked_sections: result.unlocked_sections,
          crystals_spent: cost,
          total_crystals: newBalance
        });
      }

      // Открыть случайный дар (за кристаллы)
      if (action === 'unlock_random') {
        const cost = getCost('unlock_random_dar');
        if (user.crystals < cost) {
          return res.status(400).json({ error: 'Not enough crystals', need: cost, have: user.crystals });
        }

        // Получить уже открытые дары
        const userDars = await getUserDars(user.id);
        const unlockedCodes = new Set(userDars.map(d => d.dar_code));

        // Все 64 дара
        const ALL_DARS = ["4-6-1","3-7-1","2-8-1","8-2-1","7-3-1","6-4-1","5-5-1","1-1-2","3-8-2","4-7-2","8-3-2","7-4-2","5-6-2","6-5-2","8-4-3","2-1-3","1-2-3","7-5-3","5-7-3","6-6-3","4-8-3","1-3-4","6-7-4","2-2-4","3-1-4","7-6-4","5-8-4","8-5-4","8-6-5","2-3-5","7-7-5","1-4-5","3-2-5","4-1-5","6-8-5","1-5-6","5-1-6","8-7-6","7-8-6","2-4-6","3-3-6","4-2-6","4-3-7","2-5-7","3-4-7","1-6-7","6-1-7","5-2-7","8-8-7","6-2-8","1-7-8","5-3-8","3-5-8","4-4-8","7-1-8","2-6-8","3-6-9","5-4-9","1-8-9","8-1-9","7-2-9","6-3-9","2-7-9","4-5-9"];
        const locked = ALL_DARS.filter(c => !unlockedCodes.has(c));

        if (locked.length === 0) {
          return res.json({ success: false, message: 'All dars already unlocked!' });
        }

        const randomDar = locked[Math.floor(Math.random() * locked.length)];
        await unlockDar(user.id, randomDar, 'crystal_purchase');
        const newBalance = await addCrystals(user.id, -cost, 'unlock_random_dar', { dar_code: randomDar });

        return res.json({
          success: true,
          dar_code: randomDar,
          crystals_spent: cost,
          total_crystals: newBalance
        });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('treasury.js error:', e);
    return res.status(500).json({ error: e.message });
  }
};
