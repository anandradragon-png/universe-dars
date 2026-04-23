/**
 * Консолидированный handler игровых действий:
 *  - action=quest     — выполнение квестов (GET/POST)
 *  - action=referral  — реферальная механика (GET/POST)
 *  - action=treasury  — сокровищница, открытие даров/секций (GET/POST)
 *
 * Роутинг по req.query.action или URL (через rewrites).
 */

const { requireUser } = require('./lib/auth');
const {
  getOrCreateUser,
  completeQuest,
  getUserQuests,
  addCrystals,
  unlockSection,
  unlockDar,
  getUserDars,
  createReferral,
  getReferralCount,
  getSupabase
} = require('./lib/db');
const { getCost, getReward } = require('./lib/crystals');

// =====================================================================
// ========== QUEST ====================================================
// =====================================================================

async function handleQuest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

    const user = await getOrCreateUser(tgUser);

    if (req.method === 'GET') {
      const { dar_code } = req.query || {};
      if (!dar_code) return res.status(400).json({ error: 'dar_code required' });

      const quests = await getUserQuests(user.id, dar_code);
      return res.json({
        dar_code,
        completed: quests.map(q => ({
          section_index: q.section_index,
          quest_type: q.quest_type,
          completed_at: q.completed_at
        }))
      });
    }

    if (req.method === 'POST') {
      const { dar_code, section_index, quest_type, answer_text } = req.body;

      if (!dar_code || !section_index || !quest_type) {
        return res.status(400).json({ error: 'dar_code, section_index, quest_type required' });
      }

      // Таблица наград по типу задания
      // Должна совпадать с константами reward в treasury.js при вызовах submitQuest
      const QUEST_REWARDS = {
        // Старые типы (legacy)
        read: 1,
        question: 3,
        reflection: 7,
        practice: 5,
        report: 10,
        // Новые типы коучинг-диалога (должны совпадать с treasury.js)
        essence: 5,       // Суть дара
        meditation: 7,    // Активация дара (медитация)
        shadow_work: 7,   // Работа с тенью (грани)
        shadow: 7         // Alias для shadow_work
      };

      const reward = QUEST_REWARDS[quest_type] || 1;
      console.log('[quest] submitting:', { user_id: user.id, dar_code, section_index, quest_type, reward, answer_len: (answer_text || '').length });

      try {
        await completeQuest(user.id, dar_code, section_index, quest_type, answer_text || '');
      } catch (questErr) {
        console.error('[quest] completeQuest failed:', questErr.message, questErr.code, questErr.details);
        return res.status(500).json({ error: 'Не удалось записать квест: ' + (questErr.message || 'неизвестная ошибка') });
      }

      let newBalance;
      try {
        newBalance = await addCrystals(user.id, reward, 'quest_complete', {
          dar_code, section: section_index, type: quest_type
        });
      } catch (crystalErr) {
        console.error('[quest] addCrystals failed:', crystalErr.message);
        return res.json({
          success: true,
          crystals_earned: 0,
          total_crystals: user.crystals,
          section_unlocked: section_index,
          warning: 'Квест засчитан, но кристаллы не начислились. Обратись в поддержку.'
        });
      }

      try {
        await unlockSection(user.id, dar_code, section_index);
      } catch (unlockErr) {
        console.error('[quest] unlockSection failed:', unlockErr.message);
      }

      console.log('[quest] success:', { dar_code, section_index, quest_type, reward, newBalance });
      return res.json({
        success: true,
        crystals_earned: reward,
        total_crystals: newBalance,
        section_unlocked: section_index
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[quest] FATAL error:', e.message, e.stack?.slice(0, 300));
    return res.status(500).json({ error: 'На сервере произошла ошибка. Мы уже знаем и чиним. Нажми ещё раз кнопку "Готова двигаться дальше".' });
  }
}

// =====================================================================
// ========== REFERRAL =================================================
// =====================================================================

async function handleReferral(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

    const user = await getOrCreateUser(tgUser);

    if (req.method === 'GET') {
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

      if (parseInt(referrer_telegram_id) === user.telegram_id) {
        return res.json({ success: false, message: 'Cannot refer yourself' });
      }

      const db = getSupabase();
      const { data: referrer } = await db
        .from('users')
        .select('*')
        .eq('telegram_id', parseInt(referrer_telegram_id))
        .single();

      if (!referrer) {
        return res.json({ success: false, message: 'Referrer not found' });
      }

      const referrerDars = await getUserDars(referrer.id);
      const darAlreadyInTreasury = referrerDars.some(d => d.dar_code === new_user_dar_code);

      // Логика наград:
      // - Если дар друга ЕЩЁ НЕ в сокровищнице реферера → открываем дар (без кристаллов)
      // - Если дар ЕСТЬ → даём кристаллы
      let darUnlocked = false;
      let referrerCrystals = 0;

      if (!darAlreadyInTreasury) {
        await unlockDar(referrer.id, new_user_dar_code, 'referral');
        darUnlocked = true;
      } else {
        referrerCrystals = getReward('referral', referrer.access_level);
        await addCrystals(referrer.id, referrerCrystals, 'referral_duplicate', {
          referred_dar: new_user_dar_code
        });
      }

      await createReferral(referrer.id, user.id, new_user_dar_code, darUnlocked);

      const newUserCrystals = getReward('referral', user.access_level);
      await addCrystals(user.id, newUserCrystals, 'was_referred');

      return res.json({
        success: true,
        dar_unlocked: darUnlocked,
        dar_already_in_treasury: darAlreadyInTreasury,
        referrer_crystals: referrerCrystals,
        new_user_crystals: newUserCrystals
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('referral error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// =====================================================================
// ========== TREASURY =================================================
// =====================================================================

async function handleTreasury(req, res) {
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

      if (action === 'unlock_random') {
        const cost = getCost('unlock_random_dar');
        if (user.crystals < cost) {
          return res.status(400).json({ error: 'Not enough crystals', need: cost, have: user.crystals });
        }

        const userDars = await getUserDars(user.id);
        const unlockedCodes = new Set(userDars.map(d => d.dar_code));

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
    console.error('treasury error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// =====================================================================
// ========== MAIN ROUTER ==============================================
// =====================================================================

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const url = req.url || '';

  if (action === 'quest' || url.includes('/quest')) {
    return handleQuest(req, res);
  }
  if (action === 'referral' || url.includes('/referral')) {
    return handleReferral(req, res);
  }
  if (action === 'treasury' || url.includes('/treasury')) {
    return handleTreasury(req, res);
  }

  return res.status(400).json({ error: 'Unknown action. Expected: quest, referral, treasury' });
};
