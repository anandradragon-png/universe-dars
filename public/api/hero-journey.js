const { requireUser } = require('./lib/auth');
const { getOrCreateUser, addCrystals, getHeroJourney, upsertHeroJourney, getAllHeroJourneys, getUserDars } = require('./lib/db');
const { getReward } = require('./lib/crystals');
const { FIELD_CONFIGS, buildAwakeningPrompt, buildBattlePrompt, buildRiddlePrompt, buildTrialPrompt, buildMeditationPrompt, buildTransformPrompt, buildCoronationPrompt } = require('./lib/hero-prompts');

// DeepSeek (primary) / Groq (fallback)
let deepseek, groqSdk;
try { deepseek = require('./lib/deepseek'); } catch(e) {}

async function callAI(systemPrompt, userMessage, maxTokens = 1200) {
  // Пробуем DeepSeek
  if (deepseek && deepseek.isDeepSeekConfigured()) {
    try {
      const result = await deepseek.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          ...(userMessage ? [{ role: 'user', content: userMessage }] : [])
        ],
        model: 'deepseek-chat',
        temperature: 0.85,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      });
      return result.choices[0].message.content;
    } catch(e) {
      console.warn('[hero-journey] DeepSeek failed, trying Groq:', e.message);
    }
  }

  // Fallback на Groq
  if (!groqSdk) {
    const Groq = require('groq-sdk');
    groqSdk = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  const result = await groqSdk.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...(userMessage ? [{ role: 'user', content: userMessage }] : [])
    ],
    temperature: 0.85,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' }
  });
  return result.choices[0].message.content;
}

function parseJSON(text) {
  try {
    // Убираем markdown обёртки если есть
    let clean = text.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(clean);
  } catch(e) {
    console.error('[hero-journey] JSON parse error:', e.message, 'text:', text.slice(0, 200));
    return null;
  }
}

// Загрузка данных даров
let darContentCache = null;
let fieldsCache = null;

function loadDarContent() {
  if (!darContentCache) {
    try { darContentCache = require('../../dar-content.json'); } catch(e) {
      try { darContentCache = require('../dar-content.json'); } catch(e2) {
        darContentCache = {};
      }
    }
  }
  return darContentCache;
}

function loadFields() {
  if (!fieldsCache) {
    try { fieldsCache = require('../../fields.json'); } catch(e) {
      try { fieldsCache = require('../fields.json'); } catch(e2) {
        fieldsCache = {};
      }
    }
  }
  return fieldsCache;
}

function getFieldId(darCode) {
  // KUN - третья цифра кода дара - определяет поле
  const parts = String(darCode).split('-');
  return parseInt(parts[2]) || 1;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const tgUser = requireUser(req, res);
  if (!tgUser) return;

  try {
    const user = await getOrCreateUser(tgUser);
    const { action, dar_code } = req.body || {};

    // ---- get_all: все путешествия юзера ----
    if (action === 'get_all') {
      const journeys = await getAllHeroJourneys(user.id);
      return res.json({ journeys });
    }

    // Остальные действия требуют dar_code
    if (!dar_code) {
      return res.status(400).json({ error: 'Нужен код дара' });
    }

    // ---- get_status: статус конкретного путешествия ----
    if (action === 'get_status') {
      const journey = await getHeroJourney(user.id, dar_code);
      return res.json({ journey: journey || null });
    }

    // ---- start: начать или продолжить путешествие ----
    if (action === 'start') {
      let journey = await getHeroJourney(user.id, dar_code);

      // Если путешествие уже есть и шаг имеет сгенерированный контент - вернуть как есть
      if (journey && journey.step_state && journey.step_state.scenes) {
        return res.json({ journey, step_content: journey.step_state });
      }
      // Если битва - тоже вернуть как есть
      if (journey && journey.step_state && (journey.step_state.hero_hp !== undefined)) {
        return res.json({ journey, step_content: journey.step_state });
      }

      const darContent = loadDarContent();
      const dar = darContent[dar_code] || {};
      const fieldId = getFieldId(dar_code);
      const fieldConfig = FIELD_CONFIGS[fieldId] || FIELD_CONFIGS[9];
      const userName = user.real_first_name || user.first_name || '';
      const gender = user.gender || '';

      const currentStep = (journey && journey.step) || 1;

      // Генерируем контент в зависимости от текущего шага
      let prompt;
      const choicesMade = journey?.step_state?.choices_made || [];
      switch (currentStep) {
        case 1: prompt = buildAwakeningPrompt(fieldId, dar, dar_code, userName, gender); break;
        case 3: prompt = buildRiddlePrompt(fieldId, dar, dar_code, userName, gender, choicesMade); break;
        case 4: prompt = buildTrialPrompt(fieldId, dar, dar_code, userName, gender); break;
        case 5: prompt = buildMeditationPrompt(fieldId, dar, dar_code, userName, gender); break;
        case 7: prompt = buildCoronationPrompt(fieldId, dar, dar_code, userName, gender, journey?.completed_steps); break;
        default: prompt = buildAwakeningPrompt(fieldId, dar, dar_code, userName, gender); break;
      }

      // Шаги 2 и 6 - битвы, не нужна генерация сцен
      if (currentStep === 2 || currentStep === 6) {
        journey = await upsertHeroJourney(user.id, dar_code, {
          step: currentStep,
          step_state: { hero_hp: 100, shadow_hp: 100, round: 0, history: [], battle_started: false }
        });
        return res.json({ journey, step_content: journey.step_state });
      }

      const aiResponse = await callAI(prompt, 'Сгенерируй квест.');
      const content = parseJSON(aiResponse);

      if (!content || !content.scenes) {
        return res.status(500).json({ error: 'Не удалось сгенерировать квест. Попробуй ещё раз.' });
      }

      // Добавляем мета-информацию
      content.mechanic = fieldConfig.mechanic;
      content.field_name = fieldConfig.name;
      content.field_emoji = fieldConfig.emoji;
      content.field_color = fieldConfig.color;
      content.world = fieldConfig.world;
      content.current_scene = 0;
      content.choices_made = [];

      journey = await upsertHeroJourney(user.id, dar_code, {
        step: currentStep,
        step_state: content
      });

      return res.json({ journey, step_content: content });
    }

    // ---- step_action: действие внутри шага ----
    if (action === 'step_action') {
      const { choice_index, answer } = req.body;
      let journey = await getHeroJourney(user.id, dar_code);

      if (!journey) {
        return res.status(400).json({ error: 'Сначала начни путешествие' });
      }

      const state = journey.step_state || {};
      const step = journey.step;

      // ШАГИ СО СЦЕНАМИ (1, 3, 4, 5, 7) - обработка выбора
      if ([1, 3, 4, 5, 7].includes(step)) {
        const currentScene = state.current_scene || 0;
        const scenes = state.scenes || [];

        if (choice_index !== undefined && currentScene < scenes.length) {
          const choices = state.choices_made || [];
          choices.push(choice_index);
          const nextScene = currentScene + 1;

          if (nextScene >= scenes.length) {
            // Все сцены пройдены! Завершаем шаг
            const rewardType = step === 1 ? 'hero_awakening' : step === 7 ? 'hero_journey_complete' : 'hero_step_complete';
            const reward = getReward(rewardType, user.access_level);
            const newBalance = await addCrystals(user.id, reward, rewardType, { dar_code, step });

            const completedSteps = [...(journey.completed_steps || [])];
            if (!completedSteps.includes(step)) completedSteps.push(step);

            const nextStep = step + 1;
            const isJourneyComplete = step === 7;

            // Подготавливаем следующий шаг
            let nextState = {};
            if (nextStep === 2 || nextStep === 6) {
              // Битва
              nextState = { hero_hp: 100, shadow_hp: 100, round: 0, history: [], battle_started: false };
            }

            journey = await upsertHeroJourney(user.id, dar_code, {
              step: isJourneyComplete ? 7 : nextStep,
              step_state: nextState,
              completed_steps: completedSteps,
              crystals_earned: (journey.crystals_earned || 0) + reward,
              completed_at: isJourneyComplete ? new Date().toISOString() : null
            });

            return res.json({
              result: isJourneyComplete ? 'journey_complete' : 'step_complete',
              victory_text: state.victory || 'Шаг пройден!',
              reward,
              new_balance: newBalance,
              journey,
              next_step: isJourneyComplete ? null : nextStep
            });
          }

          // Переход к следующей сцене
          journey = await upsertHeroJourney(user.id, dar_code, {
            step_state: { ...state, current_scene: nextScene, choices_made: choices }
          });

          return res.json({
            result: 'next_scene',
            scene_index: nextScene,
            scene: scenes[nextScene],
            journey
          });
        }
      }

      // ШАГИ-БИТВЫ (2, 6) - обработка ответа
      if (step === 2 || step === 6) {
        if (!answer || answer.trim().length < 10) {
          return res.status(400).json({ error: 'Напиши более развёрнутый ответ (хотя бы 10 символов)' });
        }

        const darContent = loadDarContent();
        const dar = darContent[dar_code] || {};
        const fieldId = getFieldId(dar_code);
        const fieldConfig = FIELD_CONFIGS[fieldId] || FIELD_CONFIGS[9];

        const round = (state.round || 0) + 1;
        const heroHp = state.hero_hp || 100;
        const shadowHp = state.shadow_hp || 100;
        const history = state.history || [];
        const userName = user.real_first_name || user.first_name || '';
        const gender = user.gender || '';

        // Шаг 6 использует более сложный промпт
        const prompt = step === 6
          ? buildTransformPrompt(fieldId, dar, dar_code, userName, gender, round, heroHp, shadowHp, answer, history)
          : buildBattlePrompt(fieldId, dar, dar_code, userName, gender, round, heroHp, shadowHp, answer, history);
        const aiResponse = await callAI(prompt, null, 600);
        const battleResult = parseJSON(aiResponse);

        if (!battleResult) {
          return res.status(500).json({ error: 'Тень молчит... Попробуй ещё раз.' });
        }

        const newHistory = [
          ...history,
          { role: 'hero', text: answer },
          { role: 'shadow', text: battleResult.shadow_response || '' }
        ];

        const newHeroHp = battleResult.new_hero_hp ?? Math.max(0, heroHp - (battleResult.damage_to_hero || 18));
        const newShadowHp = battleResult.new_shadow_hp ?? Math.max(0, shadowHp - (battleResult.damage_to_shadow || 20));
        const battleOver = battleResult.battle_over || newShadowHp <= 0 || newHeroHp <= 0 || round >= 5;
        const heroWon = battleResult.hero_won || newShadowHp <= 0 || (round >= 5 && newShadowHp < newHeroHp);

        if (battleOver) {
          let reward = 0;
          let newBalance = user.crystals;

          if (heroWon) {
            reward = getReward('hero_shadow_battle', user.access_level);
            newBalance = await addCrystals(user.id, reward, 'hero_shadow_battle', { dar_code, step });
          }

          const completedSteps = [...(journey.completed_steps || [])];
          if (!completedSteps.includes(step)) completedSteps.push(step);

          const nextStep = step + 1;

          journey = await upsertHeroJourney(user.id, dar_code, {
            step: nextStep,
            step_state: {
              hero_hp: newHeroHp, shadow_hp: newShadowHp, round,
              history: newHistory, battle_over: true, hero_won: heroWon
            },
            completed_steps: completedSteps,
            crystals_earned: (journey.crystals_earned || 0) + reward
          });

          return res.json({
            result: heroWon ? 'battle_won' : 'battle_lost',
            battle: battleResult,
            hero_hp: newHeroHp, shadow_hp: newShadowHp, round,
            reward, new_balance: newBalance, journey,
            next_step: nextStep,
            field_name: fieldConfig.name, field_emoji: fieldConfig.emoji
          });
        }

        // Битва продолжается
        journey = await upsertHeroJourney(user.id, dar_code, {
          step_state: {
            hero_hp: newHeroHp, shadow_hp: newShadowHp, round,
            history: newHistory, battle_started: true
          }
        });

        return res.json({
          result: 'battle_continues',
          battle: battleResult,
          hero_hp: newHeroHp, shadow_hp: newShadowHp, round, journey,
          field_name: fieldConfig.name, field_emoji: fieldConfig.emoji
        });
      }

      return res.status(400).json({ error: 'Неизвестный шаг: ' + step });
    }

    return res.status(400).json({ error: 'Неизвестное действие: ' + action });

  } catch (err) {
    console.error('[hero-journey] error:', err);
    return res.status(500).json({ error: 'Что-то пошло не так. Попробуй ещё раз.' });
  }
};
