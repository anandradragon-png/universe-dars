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

      // Записать задание
      try {
        await completeQuest(user.id, dar_code, section_index, quest_type, answer_text || '');
      } catch (questErr) {
        console.error('[quest] completeQuest failed:', questErr.message, questErr.code, questErr.details);
        return res.status(500).json({ error: 'Не удалось записать квест: ' + (questErr.message || 'неизвестная ошибка') });
      }

      // Начислить кристаллы
      let newBalance;
      try {
        newBalance = await addCrystals(user.id, reward, 'quest_complete', {
          dar_code, section: section_index, type: quest_type
        });
      } catch (crystalErr) {
        console.error('[quest] addCrystals failed:', crystalErr.message);
        // Квест уже записан, кристаллы не начислились - возвращаем без кристаллов
        return res.json({
          success: true,
          crystals_earned: 0,
          total_crystals: user.crystals,
          section_unlocked: section_index,
          warning: 'Квест засчитан, но кристаллы не начислились. Обратись в поддержку.'
        });
      }

      // Автоматически открыть следующую секцию
      try {
        await unlockSection(user.id, dar_code, section_index);
      } catch (unlockErr) {
        console.error('[quest] unlockSection failed:', unlockErr.message);
        // Не критично - квест уже записан и кристаллы начислены
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
};
