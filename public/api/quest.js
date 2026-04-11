const { requireUser } = require('./lib/auth');
const { getOrCreateUser, completeQuest, getUserQuests, addCrystals, unlockSection } = require('./lib/db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

    const user = await getOrCreateUser(tgUser);

    // Получить выполненные задания для конкретного дара
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

    // Отправить ответ на задание
    if (req.method === 'POST') {
      const { dar_code, section_index, quest_type, answer_text } = req.body;

      if (!dar_code || !section_index || !quest_type) {
        return res.status(400).json({ error: 'dar_code, section_index, quest_type required' });
      }

      // Таблица наград по типу задания
      const QUEST_REWARDS = {
        read: 1,
        question: 3,
        reflection: 7,
        practice: 5,
        report: 10
      };

      const reward = QUEST_REWARDS[quest_type] || 1;

      // Записать задание
      await completeQuest(user.id, dar_code, section_index, quest_type, answer_text || '');

      // Начислить кристаллы
      const newBalance = await addCrystals(user.id, reward, 'quest_complete', {
        dar_code, section: section_index, type: quest_type
      });

      // Автоматически открыть следующую секцию
      await unlockSection(user.id, dar_code, section_index);

      return res.json({
        success: true,
        crystals_earned: reward,
        total_crystals: newBalance,
        section_unlocked: section_index
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('quest.js error:', e);
    return res.status(500).json({ error: e.message });
  }
};
