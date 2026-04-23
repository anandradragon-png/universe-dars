/**
 * Консолидированный AI-генератор контента:
 *  - type=oracle          — послание Оракула
 *  - type=shadow-review   — коучинговый диалог (Грань/Суть/Медитация)
 *  - type=section         — генерация раздела энциклопедии дара
 *  - type=message         — психологический портрет по дару
 *  - type=compatibility   — анализ совместимости двух даров
 *  - type=child-book      — Книга Даров для Родителей
 *
 * Роутинг по req.query.type или URL (через rewrites).
 */

const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const deepseek = require('./_lib/deepseek');
const { getSupabase, getOrCreateUser } = require('./_lib/db');
const { getUser, requireUser } = require('./_lib/auth');

// ===== Общие загрузки =====
const fieldsData = require('../fields.json');

const DARS_DB = {};
fieldsData.dars.forEach(d => { DARS_DB[d.code] = d.name; });

const FIELDS_BY_ID = {};
(fieldsData.fields || []).forEach(f => { FIELDS_BY_ID[f.id] = f; });

const FIELDS_DB = {};
fieldsData.fields.forEach(f => { FIELDS_DB[f.id] = f; });

let darContent = {};
try {
  darContent = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dar-content.json'), 'utf8'));
} catch (e) {
  console.error('Failed to load dar-content.json:', e.message);
}

let oraclePredictions = {};
try {
  oraclePredictions = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'oracle-predictions.json'), 'utf8'));
  console.log('Oracle predictions loaded:', Object.keys(oraclePredictions).length);
} catch (e) {
  console.warn('oracle-predictions.json not loaded (will use fallback):', e.message);
}

let meditationsDB = { meditations: [] };
try {
  meditationsDB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'meditations.json'), 'utf8'));
  console.log('Meditations loaded:', (meditationsDB.meditations || []).length);
} catch (e) {
  console.warn('meditations.json not loaded:', e.message);
}

// Интеграторы (общий список для oracle и message)
const INTEGRATORS = {
  '1-9-1': { name: 'Архитектор Реальности', field_id: 1 },
  '2-9-2': { name: 'Хранитель Бесконечного Пространства', field_id: 2 },
  '3-9-3': { name: 'Сердце Вселенной', field_id: 3 },
  '4-9-4': { name: 'Феникс Вечного Обновления', field_id: 4 },
  '5-9-5': { name: 'Император Света', field_id: 5 },
  '6-9-6': { name: 'Повелитель Времени', field_id: 6 },
  '7-9-7': { name: 'Проводник Мирового Разума', field_id: 7 },
  '8-9-8': { name: 'Творец Совершенной Формы', field_id: 8 },
  '9-1-1': { name: 'Архитектор Вечного Порядка', field_id: 1 },
  '9-2-2': { name: 'Творец Пространства Возможностей', field_id: 2 },
  '9-3-3': { name: 'Сердце Мирового Единства', field_id: 3 },
  '9-4-4': { name: 'Феникс Глобальной Эволюции', field_id: 4 },
  '9-5-5': { name: 'Император Внутреннего Солнца', field_id: 5 },
  '9-6-6': { name: 'Повелитель Судьбоносного Потока', field_id: 6 },
  '9-7-7': { name: 'Голос Космического Разума', field_id: 7 },
  '9-8-8': { name: 'Создатель Живых Границ', field_id: 8 },
  '9-9-9': { name: 'Живое Зеркало Вселенной', field_id: 9 }
};

// Архетипы даров (общие для compatibility и child-book)
const DAR_ARCHETYPES = {"8-6-5":"Первородное солнце","8-4-3":"Купол любви","1-3-4":"Портал между мирами","2-3-5":"Усилитель реальности","4-3-7":"Архитектор реальности","6-2-8":"Танец красоты","1-7-8":"Путеводная звезда","1-1-2":"Абсолютное внимание","2-5-7":"Дыхание жизни","2-1-3":"Внутренняя вера","6-7-4":"Крылья ангела","3-8-2":"Вершина власти","3-4-7":"Архитектор единства","4-7-2":"Нить времени","4-6-1":"Внутренний вулкан","7-7-5":"Квинтэссенция жизни","1-4-5":"Алхимическая лаборатория","2-2-4":"Белый огонь","5-3-8":"Золотая спираль","1-6-7":"Змей времени","3-6-9":"Река жизни","3-7-1":"Родник силы","3-5-8":"Программист реальности","1-5-6":"Рог изобилия","2-8-1":"Гармонизатор границ","3-1-4":"Огненный щит","8-2-1":"Голос природы","4-4-8":"Театральная маска","1-2-3":"Ось мира","5-1-6":"Магнит событий","7-6-4":"Цунами вдохновения","6-1-7":"Манна небесная","7-5-3":"Хирург реальности","5-7-3":"Инкубатор реальностей","8-3-2":"Вершина мира","7-1-8":"Туннель реальности","5-4-9":"Древо миров","5-2-7":"Картограф сновидений","6-6-3":"Портал любви","8-8-7":"Выдох вселенной","7-3-1":"Место силы","1-8-9":"Осознанный выбор","3-2-5":"Ядерная радость","4-1-5":"Целительный удар","7-4-2":"Живая нить рода","8-1-9":"Живой алгоритм","5-8-4":"Духовное рождение","6-4-1":"Внутреннее солнце","8-5-4":"Семя","4-8-3":"Атланты","2-6-8":"Расширенное сознание","5-6-2":"Шут","8-7-6":"Сфера покоя","7-8-6":"Конструктор аватара","5-5-1":"Храм души","7-2-9":"Ветер перемен","6-3-9":"Фрактальное зеркало","2-4-6":"Первооткрыватель","6-8-5":"Трон воли","3-3-6":"Колесо сансары","6-5-2":"Дракон порядка","2-7-9":"Священный момент","4-5-9":"Танец жизни","4-2-6":"Фантазия"};

// ===== Общий хелпер truncate =====
function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '...';
}

// =====================================================================
// ========== TYPE: oracle =============================================
// =====================================================================

function oracleCleanText(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hasLatin(s) {
  return typeof s === 'string' && /[a-zA-Z]/.test(s);
}

const FIELD_NAMES_LIST = ['ЛОГОС', 'НИМА', 'АНДРА', 'ЗИНГРА', 'ЛУБА', 'ТУМА', 'АСТРА', 'БИТРА', 'ОМА'];
const BOUND_BEFORE = '(^|[^А-Яа-яЁё])';
const BOUND_AFTER  = '(?=[^А-Яа-яЁё]|$)';

function stripLeakedTerms(s, darName, darNamesAll) {
  if (!s || typeof s !== 'string') return s;
  let out = s;
  for (const f of FIELD_NAMES_LIST) {
    const re1 = new RegExp(BOUND_BEFORE + '[«"\u201C\u201D\']?' + f + '[»"\u201C\u201D\']?' + BOUND_AFTER, 'g');
    out = out.replace(re1, '$1');
    const stem = f.slice(0, -1);
    const reForm = new RegExp(BOUND_BEFORE + '[«"\u201C\u201D\']?' + stem + '[АЫЕОУИЯЮЁ]{1,2}[»"\u201C\u201D\']?' + BOUND_AFTER, 'g');
    out = out.replace(reForm, '$1');
  }
  const names = [darName, ...(darNamesAll || [])].filter(Boolean);
  for (const n of names) {
    if (!n || n.length < 2) continue;
    const escaped = n.replace(/[-]/g, '[\\-\\s]?');
    const re = new RegExp(BOUND_BEFORE + '[«"\u201C\u201D\']?' + escaped + '[»"\u201C\u201D\']?' + BOUND_AFTER, 'g');
    out = out.replace(re, '$1');
  }
  out = out.replace(/(^|\D)\d[-]\d[-]\d(\D|$)/g, '$1$2');
  out = out.replace(/(^|[^А-Яа-яЁё])(МА|ЖИ|КУН)\s*[=:]\s*\d+/g, '$1');
  out = out.replace(/\+\s*(МА|ЖИ|КУН)\s*=?\s*\d*/g, '');
  out = out.replace(/согласно архетипу/gi, '');
  out = out.replace(/этот дар/gi, '');
  out = out.replace(/твой дар/gi, '');
  out = out.replace(/^(Дорогой|Милый|Уважаемый)[^,.!?]{0,30}[,.!?]?\s*/i, '');
  out = out.replace(/^(Дорогая|Милая|Уважаемая)[^,.!?]{0,30}[,.!?]?\s*/i, '');
  out = out.replace(/«\s*»/g, '');
  out = out.replace(/"\s*"/g, '');
  out = out.replace(/\(\s*\)/g, '');
  out = out.replace(/(\s*\+\s*)+/g, ' ');
  out = out.replace(/\bи\s+и\b/gi, 'и');
  out = out.replace(/\s+([,.!?:;])/g, '$1');
  out = out.replace(/,\s*,/g, ',');
  out = out.replace(/\s{2,}/g, ' ');
  out = out.replace(/^\s*[+\-,.:;]\s*/, '');
  return out.trim();
}

function sanitizeOracleOutput(parsed, darName, darNamesAll) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  if (parsed.prophecy) {
    if (hasLatin(parsed.prophecy)) {
      parsed.prophecy = parsed.prophecy.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, ' ');
    }
    parsed.prophecy = stripLeakedTerms(parsed.prophecy, darName, darNamesAll);
    parsed.prophecy = oracleCleanText(parsed.prophecy);
  }
  if (parsed.practice) {
    if (hasLatin(parsed.practice)) {
      parsed.practice = parsed.practice.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, ' ');
    }
    parsed.practice = stripLeakedTerms(parsed.practice, darName, darNamesAll);
    parsed.practice = oracleCleanText(parsed.practice);
  }
  if (Array.isArray(parsed.energies)) {
    parsed.energies = parsed.energies.map(e => {
      if (typeof e !== 'string') return e;
      const cleaned = hasLatin(e) ? e.replace(/[a-zA-Z]+/g, '').trim() : e;
      const stripped = stripLeakedTerms(cleaned, darName, darNamesAll);
      return oracleCleanText(stripped);
    }).filter(e => e && e.length > 0);
  }
  return parsed;
}

let SPELLCHECK_PROTECTED = null;
function getProtectedWords() {
  if (SPELLCHECK_PROTECTED) return SPELLCHECK_PROTECTED;
  const set = new Set();
  FIELD_NAMES_LIST.forEach(f => set.add(f.toUpperCase()));
  Object.values(DARS_DB || {}).forEach(name => {
    if (!name) return;
    const up = name.toUpperCase();
    set.add(up);
    set.add(up.replace(/-/g, ''));
    set.add(up.replace(/-/g, ' '));
  });
  ['YUPDAR', 'YUP', 'ОРАКУЛ'].forEach(w => set.add(w));
  SPELLCHECK_PROTECTED = set;
  return set;
}

async function spellCheckText(text) {
  if (!text || typeof text !== 'string' || text.length < 3) return text;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const url = 'https://speller.yandex.net/services/spellservice.json/checkText'
      + '?lang=ru&options=518&text=' + encodeURIComponent(text);
    const resp = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
    if (!resp.ok) return text;
    const errors = await resp.json();
    if (!Array.isArray(errors) || errors.length === 0) return text;
    const protected_ = getProtectedWords();
    const sorted = errors.slice().sort((a, b) => b.pos - a.pos);
    let corrected = text;
    let fixedCount = 0;
    for (const err of sorted) {
      if (!err.s || !err.s.length || !err.word) continue;
      const suggestion = err.s[0];
      if (!suggestion || suggestion.length < 2) continue;
      const origUpper = err.word.toUpperCase();
      if (protected_.has(origUpper)) continue;
      if (protected_.has(origUpper.replace(/-/g, ''))) continue;
      if (protected_.has(origUpper.replace(/-/g, ' '))) continue;
      if (err.word.replace(/-/g, '').toUpperCase() === suggestion.replace(/-/g, '').toUpperCase()) continue;
      corrected = corrected.slice(0, err.pos) + suggestion + corrected.slice(err.pos + err.len);
      fixedCount++;
    }
    if (fixedCount > 0) console.log(`Yandex Speller fixed ${fixedCount} errors in text`);
    return corrected;
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('Spellcheck failed:', e.message);
    return text;
  }
}

async function spellCheckOracleOutput(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const promises = [];
  if (parsed.prophecy) {
    promises.push(spellCheckText(parsed.prophecy).then(t => { parsed.prophecy = t; }));
  }
  if (parsed.practice) {
    promises.push(spellCheckText(parsed.practice).then(t => { parsed.practice = t; }));
  }
  if (Array.isArray(parsed.energies)) {
    parsed.energies.forEach((e, i) => {
      if (typeof e === 'string') {
        promises.push(spellCheckText(e).then(t => { parsed.energies[i] = t; }));
      }
    });
  }
  await Promise.all(promises);
  return parsed;
}

function pickMeditationForDar(darCode) {
  if (!Array.isArray(meditationsDB.meditations)) return null;
  const matches = meditationsDB.meditations.filter(m => Array.isArray(m.dars) && m.dars.includes(darCode));
  if (matches.length === 0) return null;
  const dayIndex = Math.floor(Date.now() / 86400000);
  const m = matches[dayIndex % matches.length];
  return { title: m.title, description: m.description, url: m.url };
}

function buildIntegratorDarData(code) {
  const intInfo = INTEGRATORS[code];
  if (!intInfo) return null;
  const field = FIELDS_BY_ID[intInfo.field_id];
  if (!field) return null;
  return {
    essence: `${field.essence} Это универсал-интегратор поля ${field.name}, проявляющий силу всего поля целиком. ${intInfo.name}.`,
    light_power: `Полнота силы поля ${field.name}: ${field.harmony_key} Способность объединять все аспекты этого поля и действовать как живое воплощение его сути.`,
    shadow: `${field.shadow_ma} ${field.shadow_zhi}`,
    energy_pattern: field.flow,
    application: '',
    safety: field.harmony_key,
    meditation: '',
    activation: ''
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getOracleCache(userId, darCode, mode, relativeId) {
  try {
    const db = getSupabase();
    const q = db
      .from('oracle_cache')
      .select('prophecy, practice, energies, meditation_video, user_query')
      .eq('user_id', userId)
      .eq('dar_code', darCode)
      .eq('mode', mode)
      .eq('date_key', todayKey());
    if (relativeId) q.eq('relative_id', relativeId);
    else q.is('relative_id', null);
    const { data } = await q.single();
    if (data && data.prophecy) {
      console.log('[oracle] cache HIT for', darCode, mode);
      return {
        prophecy: data.prophecy,
        practice: data.practice || '',
        energies: data.energies || [],
        meditation_video: data.meditation_video || null,
        cached: true
      };
    }
  } catch (e) {}
  return null;
}

async function saveOracleCache(userId, darCode, mode, parsed, relativeId, userQuery) {
  try {
    const db = getSupabase();
    await db.from('oracle_cache').upsert({
      user_id: userId,
      dar_code: darCode,
      mode,
      date_key: todayKey(),
      prophecy: parsed.prophecy || '',
      practice: parsed.practice || '',
      energies: parsed.energies || [],
      meditation_video: parsed.meditation_video || null,
      relative_id: relativeId || null,
      user_query: userQuery || null
    }, {
      onConflict: 'user_id,dar_code,mode,date_key'
    });
    console.log('[oracle] cache SAVED for', darCode, mode);
  } catch (e) {
    console.warn('[oracle] cache save failed:', e.message);
  }
}

async function handleOracle(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { dar_code, mode, user_query, gender, relative_name, relative_relationship, relative_id } = req.body;
  if (!dar_code) { res.status(400).json({ error: 'dar_code required' }); return; }

  let userId = null;
  try {
    const tgUser = getUser(req);
    if (tgUser && tgUser.id) {
      const user = await getOrCreateUser(tgUser);
      userId = user.id;
    }
  } catch (e) {}

  if (userId && mode !== 'card') {
    const cached = await getOracleCache(userId, dar_code, mode, relative_id || null);
    if (cached) return res.status(200).json(cached);
  }

  const intInfo = INTEGRATORS[dar_code];
  const darName = intInfo ? intInfo.name : (DARS_DB[dar_code] || dar_code);

  let darData = darContent[dar_code];
  if (!darData && intInfo) {
    darData = buildIntegratorDarData(dar_code);
    console.log('[oracle] Using integrator fallback for', dar_code, '->', darName);
  }
  if (!darData) {
    res.status(400).json({ error: 'Dar not found: ' + dar_code });
    return;
  }

  const isRelative = mode === 'relative' && relative_name;
  const RELATIONSHIP_RU = {
    mother: 'мама', father: 'папа', son: 'сын', daughter: 'дочь',
    partner: 'партнёр', sibling: 'брат/сестра', friend: 'друг', other: 'близкий человек'
  };
  const relationLabel = isRelative ? (RELATIONSHIP_RU[relative_relationship] || 'близкий человек') : '';

  let genderBlock;
  if (isRelative) {
    const targetForm = gender === 'male'
      ? 'мужские формы (он, ему, его, готов, открыт)'
      : gender === 'female'
      ? 'женские формы (она, ей, её, готова, открыта)'
      : 'нейтральные формы без родовых окончаний';
    genderBlock = `Ты говоришь о ${relationLabel === 'близкий человек' ? 'близком человеке' : relationLabel} пользователя по имени ${relative_name}. Используй ${targetForm}. Обращайся к читателю на "ты", но описывай не его, а его близкого: "Сегодня твоя ${relationLabel} может почувствовать..." или "У ${relative_name} сегодня открывается...".`;
  } else {
    genderBlock = gender === 'male'
      ? 'ПОЛ ПОЛЬЗОВАТЕЛЯ: мужской. Используй мужские формы глаголов и прилагательных: "ты откладывал", "готов", "решался", "уверен".'
      : gender === 'female'
      ? 'ПОЛ ПОЛЬЗОВАТЕЛЯ: женский. Используй женские формы: "ты откладывала", "готова", "решалась", "уверена".'
      : 'ПОЛ ПОЛЬЗОВАТЕЛЯ: не указан. Используй нейтральные формы без родовых окончаний.';
  }

  const authoredPrediction = oraclePredictions[dar_code];
  let systemMsg;
  let userPrompt;

  if (authoredPrediction && authoredPrediction.prophecy) {
    if (isRelative) {
      systemMsg = `Ты Оракул YupDar. Мудрый наставник, который помогает понять близких людей через их Дары.

ТВОЯ ЗАДАЧА:
Тебе дано готовое авторское предсказание на сегодня для одного из 64 Даров. Ты должен переписать его так, чтобы оно говорило о близком человеке пользователя:
1. ПЕРЕПИШИ предсказание в третьем лице: вместо "ты можешь почувствовать" - "${relative_name} сегодня может почувствовать", вместо "тебя ждёт" - "${relative_name} ждёт". Сохрани смысл и образы, но переформулируй живо и лично.
2. Придумай ПРАКТИКУ на 2-3 предложения, как пользователь МОЖЕТ ПОДДЕРЖАТЬ ${relative_name} сегодня (мягкое слово, забота, внимание, конкретное действие). Это должно соответствовать энергиям дня.
3. Выдели 4-5 коротких маркеров энергий дня (по 2-3 слова каждый) - о ресурсах, которые сегодня доступны ${relative_name}.

${genderBlock}

СТРОГИЕ ПРАВИЛА:
- Говори про ${relative_name} в третьем лице, обращаясь к читателю на "ты": "Твоя ${relationLabel} сегодня...", "У ${relative_name} открывается...".
- Пиши только на грамматически безупречном русском языке.
- Не используй длинное тире (—), только обычный дефис или запятую.
- Не пиши иностранных слов.
- Не упоминай название дара, коды, поля, формулы, МА/ЖИ/КУН.
- Не разбивай день на утро/день/вечер.
- Не используй театральщину типа "Я вижу", "знаки небес".
- Практика - как пользователь может БЫТЬ РЯДОМ с близким сегодня. Пиши тепло, без указаний.
- В энергиях дня - только светлые качества, не тени.

МЯГКАЯ ПОДАЧА - КРИТИЧЕСКИ ВАЖНО:
- НИКОГДА не используй слова "нужно", "надо", "должен", "должна", "обязан", "требуется" - это энергия указания и давления.
- Вместо "тебе нужно / надо" пиши: "тебе важно", "хорошо", "полезно", "стоит", "попробуй", "обрати внимание".
- Не пиши "ты должен поддержать" - пиши "поддержка приходит через", "попробуй заметить", "полезно быть рядом".
- Смысл не в приказах, а в мягком приглашении к вниманию и действию.

ПРОТИВ ПОВТОРОВ:
- В одном ответе (prophecy/practice) НЕ повторяй одну и ту же конструкцию 2-3 раза подряд.
- Разнообразь: "Сегодня важно...", "Попробуй...", "Полезно...", "Ключ дня - в...", "Путь поддержки - это..."

ФОРМАТ ОТВЕТА: только валидный JSON без markdown.`;

      userPrompt = `Вот авторское предсказание на сегодня (оригинал на "вы"):

"${authoredPrediction.prophecy}"

Перепиши его так, чтобы оно говорило о близком человеке пользователя - о ${relationLabel === 'близкий человек' ? 'близком' : relationLabel} по имени ${relative_name}. Сохрани смысл, но веди речь в третьем лице. Затем придумай, как пользователь может поддержать ${relative_name} сегодня, и выдели 4-5 маркеров энергий дня для ${relative_name}.

Верни ТОЛЬКО валидный JSON:
{
  "prophecy": "переформулированное предсказание в третьем лице о ${relative_name}",
  "practice": "как пользователь может поддержать ${relative_name} сегодня (2-3 предложения)",
  "energies": ["маркер1", "маркер2", "маркер3", "маркер4"]
}`;
    } else {
      systemMsg = `Ты Оракул YupDar. Мудрый наставник, который помогает человеку настроиться на сегодняшний день.

ТВОЯ ЗАДАЧА:
Тебе дано готовое авторское предсказание на сегодня. Ты должен:
1. ПЕРЕФРАЗИРОВАТЬ его на "ты" (в оригинале обращение на "вы"), сохранив смысл и образы, но слегка переформулировав своими словами. Это должно звучать живо, но узнаваемо по сути.
2. Придумать ПРАКТИКУ на 2-3 предложения, которая соответствует энергиям дня и поможет человеку прожить день в ресурсе.
3. Выделить 4-5 коротких маркеров энергий дня (по 2-3 слова каждый), светлых и поддерживающих.

${genderBlock}

СТРОГИЕ ПРАВИЛА:
- Обращайся на "ты" (а не на "вы" как в оригинале).
- Пиши только на грамматически безупречном русском языке.
- Не используй длинное тире (—), только обычный дефис или запятую.
- Не пиши иностранных слов.
- Не упоминай название дара, коды, поля, формулы, МА/ЖИ/КУН.
- Не разбивай день на утро/день/вечер.
- Не используй театральщину типа "Я вижу", "знаки небес".
- Практика должна быть простой, без команд в повелительном наклонении. Пиши как приглашение: "Попробуй...", "Можешь...", "Позволь себе...".
- В энергиях дня - только светлые качества-ресурсы, не тени.

МЯГКАЯ ПОДАЧА - КРИТИЧЕСКИ ВАЖНО:
- НИКОГДА не используй слова "нужно", "надо", "должен", "должна", "обязан", "требуется" - это энергия указания и давления.
- Вместо "тебе нужно / надо" пиши: "тебе важно", "хорошо", "полезно", "стоит", "попробуй", "обрати внимание".
- Не пиши "ты должен восстановить" - пиши "восстановление приходит через", "попробуй дать себе", "важно".
- Смысл не в приказах, а в мягком приглашении к вниманию и действию.

ПРОТИВ ПОВТОРОВ:
- В одном ответе (prophecy/practice) НЕ повторяй одну и ту же конструкцию 2-3 раза подряд.
- Разнообразь: "Сегодня важно...", "Попробуй...", "Полезно...", "Ключ дня - в...", "Путь сегодня - это..."

ФОРМАТ ОТВЕТА: только валидный JSON без markdown.`;

      const queryBlock = (mode === 'card' && user_query)
        ? `\n\nУ человека есть вопрос, который его волнует: "${user_query}". Учти его и сделай послание чуть более направленным на этот вопрос, но не отвечай прямо - веди к ответу через энергии дня.`
        : '';

      userPrompt = `Вот авторское предсказание на сегодня (оригинал на "вы"):

"${authoredPrediction.prophecy}"

Перефразируй его на "ты", сохраняя смысл и образы, но слегка другими словами, чтобы звучало живо и лично. Потом придумай практику и маркеры энергий дня.${queryBlock}

Верни ТОЛЬКО валидный JSON:
{
  "prophecy": "переформулированное предсказание на 'ты'",
  "practice": "практика на 2-3 предложения",
  "energies": ["маркер1", "маркер2", "маркер3", "маркер4"]
}`;
    }
  }

  if (!authoredPrediction) {
    const truncLocal = (s, n) => {
      if (!s) return '';
      if (s.length <= n) return s;
      return s.slice(0, n).replace(/\s+\S*$/, '') + '...';
    };
    const context = [
      darData.essence ? `СУТЬ:\n${truncLocal(darData.essence, 400)}` : '',
      darData.light_power ? `СВЕТЛЫЕ КАЧЕСТВА:\n${truncLocal(darData.light_power, 400)}` : '',
      darData.shadow ? `ТЕНЕВЫЕ АСПЕКТЫ (упомянуть только как зону бережного внимания):\n${truncLocal(darData.shadow, 300)}` : ''
    ].filter(Boolean).join('\n\n');

    systemMsg = `Ты Оракул YupDar. Древний мудрец, который настраивает человека на сегодняшний день через энергии его Дара. Ты говоришь поэтично и точно, с теплом и уверенностью, как наставник, видящий суть.

ГЛАВНОЕ ПРАВИЛО - ЭНЕРГИИ КАК ПОТЕНЦИАЛ, А НЕ ФАКТ:
ОБРАЩАЙСЯ ЛИЧНО на "ты", как будто знаешь этого конкретного человека.

${genderBlock}

ЗАКОН ЯЗЫКА: только грамматически безупречный литературный русский.

ЗАПРЕТЫ:
- НЕ называй дар, не пиши "твой дар", "этот дар", "энергии дара", "архетип".
- НЕ упоминай поля: ЛОГОС, НИМА, АНДРА, ЗИНГРА, ЛУБА, ТУМА, АСТРА, БИТРА, ОМА.
- НЕ упоминай МА, ЖИ, КУН, коды, цифры, формулы.
- НЕ пиши иностранных слов, ни одной латинской буквы.
- НЕ используй длинное тире.

МЯГКАЯ ПОДАЧА - КРИТИЧЕСКИ ВАЖНО:
- НИКОГДА не используй слова "нужно", "надо", "должен", "должна", "обязан", "требуется" - это энергия указания и давления.
- Вместо "тебе нужно / надо" пиши: "тебе важно", "хорошо", "полезно", "стоит", "попробуй", "обрати внимание".
- Не пиши "ты должен восстановить" - пиши "восстановление приходит через", "попробуй дать себе", "важно".
- Смысл не в приказах, а в мягком приглашении к вниманию и действию.

ПРОТИВ ПОВТОРОВ:
- В одном ответе (prophecy/practice) НЕ повторяй одну и ту же конструкцию 2-3 раза подряд.
- Разнообразь: "Сегодня важно...", "Попробуй...", "Полезно...", "Ключ дня - в...", "Путь сегодня - это..."

ФОРМАТ: только валидный JSON без markdown.`;

    const contextBlock = `Качества дня (используй как внутренний компас, НЕ цитируй дословно):\n\n${context}`;

    if (mode === 'card' && user_query) {
      userPrompt = `${contextBlock}\n\nВопрос: "${user_query}"\n\nНапиши живое личное послание на "ты". Верни ТОЛЬКО JSON:\n{"prophecy":"...","practice":"...","energies":["...","...","...","..."]}`;
    } else {
      userPrompt = `${contextBlock}\n\nНапиши живое личное послание на "ты". Верни ТОЛЬКО JSON:\n{"prophecy":"...","practice":"...","energies":["...","...","...","..."]}`;
    }
  }

  const useDeepSeek = deepseek.isDeepSeekEnabled('oracle') && deepseek.isDeepSeekConfigured();

  try {
    let completion;
    let providerUsed = 'groq';
    const messages = [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userPrompt }
    ];

    if (useDeepSeek) {
      try {
        completion = await deepseek.chatCompletion({
          messages, model: 'deepseek-chat', temperature: 0.9, max_tokens: 900
        });
        providerUsed = 'deepseek';
      } catch (dsErr) {
        console.warn('[oracle] DeepSeek failed, fallback to Groq:', dsErr.message);
        const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
        completion = await groq.chat.completions.create({
          messages, model: 'llama-3.3-70b-versatile', temperature: 0.9, max_tokens: 900
        });
        providerUsed = 'groq-fallback';
      }
    } else {
      const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
      try {
        completion = await groq.chat.completions.create({
          messages, model: 'llama-3.3-70b-versatile', temperature: 0.9, max_tokens: 900
        });
      } catch (modelErr) {
        completion = await groq.chat.completions.create({
          messages, model: 'llama-3.1-8b-instant', temperature: 0.9, max_tokens: 900
        });
        providerUsed = 'groq-8b';
      }
    }

    console.log('[oracle] used provider:', providerUsed);
    const raw = completion.choices[0]?.message?.content || '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON не найден в ответе AI');
    const clean = raw.slice(start, end + 1);

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch (parseErr) { throw new Error('Ошибка разбора JSON'); }

    parsed = sanitizeOracleOutput(parsed, darName, Object.values(DARS_DB));
    try { parsed = await spellCheckOracleOutput(parsed); }
    catch (spellErr) { console.warn('Spellcheck stage failed:', spellErr.message); }

    const med = pickMeditationForDar(dar_code);
    if (med) parsed.meditation_video = med;

    if (userId && mode !== 'card') {
      saveOracleCache(userId, dar_code, mode, parsed, relative_id || null, user_query || null);
    }

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Oracle API error:', e.message);
    res.status(500).json({ error: e.message });
  }
}

// =====================================================================
// ========== MAIN ROUTER ==============================================
// =====================================================================

module.exports = async (req, res) => {
  const type = (req.query && req.query.type) || '';
  const url = req.url || '';

  if (type === 'oracle' || url.includes('/oracle')) {
    return handleOracle(req, res);
  }
  if (type === 'shadow-review' || url.includes('/shadow-review')) {
    return require('./_lib/content/shadow-review')(req, res);
  }
  if (type === 'section' || url.includes('/section')) {
    return require('./_lib/content/section')(req, res);
  }
  if (type === 'message' || url.includes('/message')) {
    return require('./_lib/content/message')(req, res);
  }
  if (type === 'compatibility' || url.includes('/compatibility')) {
    return require('./_lib/content/compatibility')(req, res);
  }
  if (type === 'child-book' || url.includes('/child-book')) {
    return require('./_lib/content/child-book')(req, res);
  }

  return res.status(400).json({ error: 'Unknown content type. Expected: oracle, shadow-review, section, message, compatibility, child-book' });
};
