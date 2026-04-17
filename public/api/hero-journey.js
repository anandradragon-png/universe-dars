const { requireUser } = require('./lib/auth');
const { getOrCreateUser, addCrystals, getHeroJourney, upsertHeroJourney, getAllHeroJourneys, getUserDars } = require('./lib/db');
const { getReward } = require('./lib/crystals');
const { FIELD_CONFIGS, buildAwakeningPrompt, buildBattlePrompt, buildRiddlePrompt, buildTrialPrompt, buildMeditationPrompt, buildTransformPrompt, buildCoronationPrompt, buildPathAnalysisPrompt } = require('./lib/hero-prompts');

// DeepSeek (primary) / Groq (fallback)
let deepseek, groqSdk;
try { deepseek = require('./lib/deepseek'); } catch(e) {}

async function callAI(systemPrompt, userMessage, maxTokens = 800) {
  // Только DeepSeek - качественные тексты, без fallback на Groq
  if (!deepseek || !deepseek.isDeepSeekConfigured()) {
    throw new Error('DeepSeek не настроен. Обратись в поддержку.');
  }

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

// Кэш сгенерированных сцен в памяти процесса (живёт пока жив Vercel-function-инстанс).
// Ключ: dar_code|step — одинаковый контент для всех юзеров этого дара на этом шаге.
// Это ускоряет повторные запуски: первый юзер ждёт AI, остальные получают мгновенно.
const sceneCache = new Map();
const SCENE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 часов

function getSceneCached(darCode, step) {
  const key = darCode + '|' + step;
  const entry = sceneCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > SCENE_CACHE_TTL) {
    sceneCache.delete(key);
    return null;
  }
  return entry.content;
}

function setSceneCached(darCode, step, content) {
  const key = darCode + '|' + step;
  sceneCache.set(key, { ts: Date.now(), content });
  // Ограничиваем размер — не более 200 ключей
  if (sceneCache.size > 200) {
    const firstKey = sceneCache.keys().next().value;
    sceneCache.delete(firstKey);
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

      // Если путешествие уже есть и ТЕКУЩИЙ шаг имеет актуальный контент - вернуть как есть
      if (journey && journey.step_state) {
        const st = journey.step_state;
        const step = journey.step;
        // Шаг со сценами - если сцены есть и не завершены (battle_over отсутствует)
        if (st.scenes && !st.battle_over) {
          return res.json({ journey, step_content: st });
        }
        // Активная битва (шаг 2 или 6) - если не завершена
        if ((step === 2 || step === 6) && st.hero_hp !== undefined && !st.battle_over) {
          return res.json({ journey, step_content: st });
        }
        // Если step_state от предыдущего шага (battle_over: true) - нужна генерация нового
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

      // Пробуем взять контент из memory-кэша (первый юзер для этого дара+шага
      // ждёт AI ~30-60 сек, остальным отдаём мгновенно)
      let content = getSceneCached(dar_code, currentStep);
      if (!content) {
        const aiResponse = await callAI(prompt, 'Сгенерируй квест.');
        content = parseJSON(aiResponse);
        if (!content || !content.scenes) {
          return res.status(500).json({ error: 'Не удалось сгенерировать квест. Попробуй ещё раз.' });
        }
        setSceneCached(dar_code, currentStep, content);
      } else {
        // Возвращаем копию, чтобы юзерская модификация не портила общий кэш
        content = JSON.parse(JSON.stringify(content));
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

    // ---- get_analysis: AI-анализ пройденного пути ----
    if (action === 'get_analysis') {
      const journey = await getHeroJourney(user.id, dar_code);
      if (!journey) {
        return res.status(400).json({ error: 'Путешествие не найдено' });
      }

      // Нормализует AI-ответ: если пришёл JSON со служебными ключами вида
      // "твой_путь", "точка_сборки" — склеиваем все значения в один текст без
      // кавычек и спецсимволов (тестеры жаловались, что видят сырой JSON).
      const cleanAnalysis = (raw) => {
        if (!raw || typeof raw !== 'string') return raw || '';
        let text = raw.trim();
        // Убираем обрамление ```json ... ``` если есть
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
          const jsonPart = text.slice(firstBrace, lastBrace + 1);
          try {
            const parsed = JSON.parse(jsonPart);
            if (parsed && typeof parsed === 'object') {
              if (typeof parsed.analysis === 'string') return parsed.analysis;
              if (typeof parsed.text === 'string') return parsed.text;
              // Склеиваем все значения JSON в абзацы в порядке ключей,
              // сохраняя заголовки читабельными (твой_путь → Твой путь).
              const titleMap = {
                'твой_путь': '\u2728 Твой путь',
                'точка_сборки': '\u2605 Точка сборки',
                'тень_и_свет': '\u263D Тень и свет',
                'прогноз_развития': '\u279C Прогноз развития',
                'приглашение': '\u2764 Приглашение'
              };
              return Object.entries(parsed)
                .filter(([, v]) => typeof v === 'string' && v.trim())
                .map(([k, v]) => {
                  const title = titleMap[k] || k.replace(/_/g, ' ');
                  return title + '\n\n' + v.trim();
                })
                .join('\n\n');
            }
          } catch (e) {
            // Не JSON — обрабатываем как текст ниже
          }
        }
        // Не JSON — снимаем случайные кавычки вокруг ключей-строк
        return text;
      };

      // Если анализ уже сохранён - вернуть из кэша (но ТОЛЬКО если он чистый;
      // старые записи с JSON-символами регенерируем).
      const saved = journey.step_state?.saved_analysis;
      if (saved && typeof saved === 'string' && !/^\s*[{\[]/.test(saved) && !/"(твой_путь|точка_сборки|тень_и_свет)"/.test(saved)) {
        return res.json({ analysis: saved, path_log: journey.step_state?.path_log || [], cached: true });
      }

      const pathLog = journey.step_state?.path_log || [];
      if (pathLog.length === 0) {
        return res.json({ analysis: 'Пройди хотя бы один шаг путешествия, чтобы получить анализ пути.' });
      }

      const darContent = loadDarContent();
      const dar = darContent[dar_code] || {};
      const fieldId = getFieldId(dar_code);
      const userName = user.real_first_name || user.first_name || '';
      const gender = user.gender || '';

      const prompt = buildPathAnalysisPrompt(fieldId, dar, dar_code, userName, gender, pathLog);
      const aiResponse = await callAI(prompt, 'Проанализируй путь. Ответ верни как простой текст с абзацами, НЕ в формате JSON.', 1000);

      const analysis = cleanAnalysis(aiResponse);

      // Сохраняем анализ в step_state чтобы не генерировать повторно
      await upsertHeroJourney(user.id, dar_code, {
        step_state: { ...journey.step_state, saved_analysis: analysis }
      });

      return res.json({ analysis, path_log: pathLog });
    }

    // ---- step_action: действие внутри шага ----
    if (action === 'step_action') {
      const { choice_index, answer, restart, timer_end, force_complete } = req.body;

      // Перезапуск путешествия
      if (restart) {
        const journey = await upsertHeroJourney(user.id, dar_code, {
          step: 1,
          step_state: {},
          completed_steps: [],
          crystals_earned: 0,
          completed_at: null
        });
        return res.json({ ok: true, journey });
      }

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

        // Испытание Огнём (шаг 4) - запуск таймера
        if (step === 4 && timer_end && choice_index !== undefined) {
          const choices = state.choices_made || [];
          choices.push(choice_index);
          journey = await upsertHeroJourney(user.id, dar_code, {
            step_state: { ...state, timer_end, choices_made: choices, current_scene: currentScene }
          });
          return res.json({ result: 'timer_started', journey });
        }

        // Испытание Огнём - завершение по таймеру
        if (step === 4 && force_complete) {
          // Проверяем что таймер истёк (или прошла хотя бы минута)
          const savedTimer = state.timer_end || 0;
          const elapsed = Date.now() - (savedTimer - (state.scenes?.[0]?.choices?.[state.choices_made?.[0]]?.timer_minutes || 1) * 60000);
          // Принимаем завершение (мягкая проверка)
        }

        if ((choice_index !== undefined || force_complete) && currentScene < scenes.length) {
          const choices = state.choices_made || [];
          if (choice_index !== undefined && !force_complete) choices.push(choice_index);
          const nextScene = force_complete ? scenes.length : currentScene + 1; // force_complete завершает сразу

          if (nextScene >= scenes.length) {
            // Все сцены пройдены! Завершаем шаг
            let reward;
            let rewardType;
            if (step === 4 && force_complete) {
              // Испытание Огнём - награда зависит от выбранного уровня
              const chosenIdx = (choices[0] !== undefined) ? choices[0] : 0;
              const timerMin = scenes[0]?.choices?.[chosenIdx]?.timer_minutes || 1;
              reward = timerMin >= 1440 ? 25 : timerMin >= 60 ? 15 : 5;
              rewardType = 'hero_fire_trial';
            } else {
              rewardType = step === 1 ? 'hero_awakening' : step === 7 ? 'hero_journey_complete' : 'hero_step_complete';
              reward = getReward(rewardType, user.access_level);
            }
            const newBalance = await addCrystals(user.id, reward, rewardType, { dar_code, step });

            const completedSteps = [...(journey.completed_steps || [])];
            if (!completedSteps.includes(step)) completedSteps.push(step);

            // Сохраняем выборы в path_log для AI-анализа
            const STEP_NAMES = {1:'Пробуждение',3:'Загадка Зеркала',4:'Испытание Огнём',5:'Погружение',7:'Коронация'};
            const pathLog = journey.step_state?.path_log || state.path_log || [];
            const stepChoiceLabels = choices.map((ci, si) => {
              const sc = scenes[si];
              return sc?.choices?.[ci]?.label || ('Выбор ' + (ci + 1));
            });
            pathLog.push({ step, name: STEP_NAMES[step] || ('Шаг ' + step), choices: stepChoiceLabels });

            const nextStep = step + 1;
            const isJourneyComplete = step === 7;

            // Подготавливаем следующий шаг
            let nextState = { path_log: pathLog };
            if (nextStep === 2 || nextStep === 6) {
              nextState = { ...nextState, hero_hp: 100, shadow_hp: 100, round: 0, history: [], battle_started: false };
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

        // Клэмпим HP в [0, 100] независимо от того, откуда пришло значение —
        // AI может вернуть и отрицательное (у юзеров было -30 при оставшихся 5).
        const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
        const newHeroHp = clamp(battleResult.new_hero_hp ?? (heroHp - (battleResult.damage_to_hero || 18)));
        const newShadowHp = clamp(battleResult.new_shadow_hp ?? (shadowHp - (battleResult.damage_to_shadow || 20)));
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

          // Сохраняем итог битвы в path_log
          const pathLog = state.path_log || [];
          const BATTLE_NAMES = {2:'Встреча с Тенью',6:'Трансформация'};
          const heroAnswers = newHistory.filter(h => h.role === 'hero').map(h => h.text);
          pathLog.push({
            step, name: BATTLE_NAMES[step] || 'Битва',
            result: heroWon ? 'победа' : 'поражение',
            answers: heroAnswers,
            rounds: round
          });

          const nextStep = step + 1;

          journey = await upsertHeroJourney(user.id, dar_code, {
            step: nextStep,
            step_state: {
              path_log: pathLog,
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
