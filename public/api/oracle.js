const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const deepseek = require('./lib/deepseek');
const { getSupabase } = require('./lib/db');

// ===== Санитайзер-страховка вывода Оракула =====

function cleanText(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/\u2014/g, '-')    // em dash -> hyphen
    .replace(/\u2013/g, '-')    // en dash -> hyphen
    .replace(/\u2026/g, '...')  // ellipsis -> three dots
    .replace(/\u00A0/g, ' ')    // non-breaking space -> space
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hasLatin(s) {
  return typeof s === 'string' && /[a-zA-Z]/.test(s);
}

// Имена 9 полей
const FIELD_NAMES_LIST = ['ЛОГОС', 'НИМА', 'АНДРА', 'ЗИНГРА', 'ЛУБА', 'ТУМА', 'АСТРА', 'БИТРА', 'ОМА'];

// Словаре-границы для кириллицы (JS \b не работает с русским)
const BOUND_BEFORE = '(^|[^А-Яа-яЁё])';
const BOUND_AFTER  = '(?=[^А-Яа-яЁё]|$)';

function stripLeakedTerms(s, darName, darNamesAll) {
  if (!s || typeof s !== 'string') return s;
  let out = s;
  // Поля и их склонения
  for (const f of FIELD_NAMES_LIST) {
    const re1 = new RegExp(BOUND_BEFORE + '[«"\u201C\u201D\']?' + f + '[»"\u201C\u201D\']?' + BOUND_AFTER, 'g');
    out = out.replace(re1, '$1');
    const stem = f.slice(0, -1);
    const reForm = new RegExp(BOUND_BEFORE + '[«"\u201C\u201D\']?' + stem + '[АЫЕОУИЯЮЁ]{1,2}[»"\u201C\u201D\']?' + BOUND_AFTER, 'g');
    out = out.replace(reForm, '$1');
  }
  // Имена даров
  const names = [darName, ...(darNamesAll || [])].filter(Boolean);
  for (const n of names) {
    if (!n || n.length < 2) continue;
    const escaped = n.replace(/[-]/g, '[\\-\\s]?');
    const re = new RegExp(BOUND_BEFORE + '[«"\u201C\u201D\']?' + escaped + '[»"\u201C\u201D\']?' + BOUND_AFTER, 'g');
    out = out.replace(re, '$1');
  }
  // Коды 6-7-4
  out = out.replace(/(^|\D)\d[-]\d[-]\d(\D|$)/g, '$1$2');
  // МА=6, ЖИ=7, КУН=4
  out = out.replace(/(^|[^А-Яа-яЁё])(МА|ЖИ|КУН)\s*[=:]\s*\d+/g, '$1');
  out = out.replace(/\+\s*(МА|ЖИ|КУН)\s*=?\s*\d*/g, '');
  // Фразы про дар
  out = out.replace(/согласно архетипу/gi, '');
  out = out.replace(/этот дар/gi, '');
  out = out.replace(/твой дар/gi, '');
  // Обращения типа "Дорогой странник"
  out = out.replace(/^(Дорогой|Милый|Уважаемый)[^,.!?]{0,30}[,.!?]?\s*/i, '');
  out = out.replace(/^(Дорогая|Милая|Уважаемая)[^,.!?]{0,30}[,.!?]?\s*/i, '');
  // Чистка лишних знаков
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
      console.warn('Oracle: latin in prophecy, stripping');
      parsed.prophecy = parsed.prophecy.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, ' ');
    }
    parsed.prophecy = stripLeakedTerms(parsed.prophecy, darName, darNamesAll);
    parsed.prophecy = cleanText(parsed.prophecy);
  }
  if (parsed.practice) {
    if (hasLatin(parsed.practice)) {
      console.warn('Oracle: latin in practice, stripping');
      parsed.practice = parsed.practice.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, ' ');
    }
    parsed.practice = stripLeakedTerms(parsed.practice, darName, darNamesAll);
    parsed.practice = cleanText(parsed.practice);
  }
  if (Array.isArray(parsed.energies)) {
    parsed.energies = parsed.energies.map(e => {
      if (typeof e !== 'string') return e;
      const cleaned = hasLatin(e) ? e.replace(/[a-zA-Z]+/g, '').trim() : e;
      const stripped = stripLeakedTerms(cleaned, darName, darNamesAll);
      return cleanText(stripped);
    }).filter(e => e && e.length > 0);
  }
  return parsed;
}

// ===== Яндекс.Спеллер - проверка орфографии через бесплатный публичный API =====
// https://yandex.ru/dev/speller/
// Ловит опечатки и ошибки русской орфографии. Не ловит грамматику и стиль.

// Множество слов, которые спеллер НЕ должен трогать (имена даров, полей, спец. термины)
let SPELLCHECK_PROTECTED = null;
function getProtectedWords() {
  if (SPELLCHECK_PROTECTED) return SPELLCHECK_PROTECTED;
  const set = new Set();
  FIELD_NAMES_LIST.forEach(f => set.add(f.toUpperCase()));
  // Имена всех 64 даров (включая варианты с дефисом и без)
  Object.values(DARS_DB || {}).forEach(name => {
    if (!name) return;
    const up = name.toUpperCase();
    set.add(up);
    set.add(up.replace(/-/g, ''));
    set.add(up.replace(/-/g, ' '));
  });
  // Специфичные термины
  ['YUPDAR', 'YUP', 'ОРАКУЛ'].forEach(w => set.add(w));
  SPELLCHECK_PROTECTED = set;
  return set;
}

async function spellCheckText(text) {
  if (!text || typeof text !== 'string' || text.length < 3) return text;
  try {
    // Таймаут 3 секунды чтобы не блокировать ответ Оракула
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const url = 'https://speller.yandex.net/services/spellservice.json/checkText'
      + '?lang=ru&options=518&text=' + encodeURIComponent(text);
    // options=518: 2 (ignore digits) + 4 (ignore URLs) + 512 (ignore capital) = safer
    const resp = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) return text;
    const errors = await resp.json();
    if (!Array.isArray(errors) || errors.length === 0) return text;

    const protected_ = getProtectedWords();

    // Применяем исправления справа налево, чтобы позиции не сдвигались
    const sorted = errors.slice().sort((a, b) => b.pos - a.pos);
    let corrected = text;
    let fixedCount = 0;
    for (const err of sorted) {
      if (!err.s || !err.s.length || !err.word) continue;
      const suggestion = err.s[0];
      if (!suggestion || suggestion.length < 2) continue;

      // ЗАЩИТА: не трогаем имена даров, полей и защищённые термины
      const origUpper = err.word.toUpperCase();
      if (protected_.has(origUpper)) continue;
      if (protected_.has(origUpper.replace(/-/g, ''))) continue;
      if (protected_.has(origUpper.replace(/-/g, ' '))) continue;

      // ЗАЩИТА: не исправляем если suggestion = original без дефиса
      // (спеллер любит "исправлять" "ЛУ-НА" -> "ЛУНА")
      if (err.word.replace(/-/g, '').toUpperCase() === suggestion.replace(/-/g, '').toUpperCase()) continue;

      corrected = corrected.slice(0, err.pos) + suggestion + corrected.slice(err.pos + err.len);
      fixedCount++;
    }
    if (fixedCount > 0) console.log(`Yandex Speller fixed ${fixedCount} errors in text`);
    return corrected;
  } catch (e) {
    // Таймаут или сетевая ошибка - просто возвращаем исходный текст
    if (e.name !== 'AbortError') {
      console.warn('Spellcheck failed:', e.message);
    }
    return text;
  }
}

async function spellCheckOracleOutput(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  // Параллельно проверяем prophecy, practice и все energies
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

// ===== Загрузка энциклопедии =====

let darContent = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'dar-content.json'), 'utf8');
  darContent = JSON.parse(raw);
} catch (e) {
  console.error('Failed to load dar-content.json:', e.message);
}

// ===== Авторские предсказания (основной источник для Оракула) =====
let oraclePredictions = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'oracle-predictions.json'), 'utf8');
  oraclePredictions = JSON.parse(raw);
  console.log('Oracle predictions loaded:', Object.keys(oraclePredictions).length);
} catch (e) {
  console.warn('oracle-predictions.json not loaded (will use fallback):', e.message);
}

// ===== База YouTube-медитаций (дополнение к dar-content.meditation) =====
let meditationsDB = { meditations: [] };
try {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'meditations.json'), 'utf8');
  meditationsDB = JSON.parse(raw);
  console.log('Meditations loaded:', (meditationsDB.meditations || []).length);
} catch (e) {
  console.warn('meditations.json not loaded:', e.message);
}

// Подбор медитации для дара: если подходящих несколько - детерминированно выбирается одна
// по дате (чтобы в течение дня для одного дара выдавалась одна медитация, а в разные дни ротировалась).
function pickMeditationForDar(darCode) {
  if (!Array.isArray(meditationsDB.meditations)) return null;
  const matches = meditationsDB.meditations.filter(m => Array.isArray(m.dars) && m.dars.includes(darCode));
  if (matches.length === 0) return null;
  // Индекс по дню с эпохи - стабилен в пределах суток, меняется между днями
  const dayIndex = Math.floor(Date.now() / 86400000);
  const m = matches[dayIndex % matches.length];
  return { title: m.title, description: m.description, url: m.url };
}

// Имена даров
const fieldsData = require('../fields.json');
const DARS_DB = {};
fieldsData.dars.forEach(d => { DARS_DB[d.code] = d.name; });

// Имена 9 полей по id (для интеграторов используется поле)
const FIELDS_BY_ID = {};
(fieldsData.fields || []).forEach(f => { FIELDS_BY_ID[f.id] = f; });

// Интеграторы (универсалы) - дары, где одна из позиций равна 9.
// Для них нет записей в dar-content.json, поэтому строим darData из данных поля.
// Имена интеграторов из game vision (соответствует window.INTEGRATORS на клиенте).
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

function isIntegratorCode(code) {
  return !!INTEGRATORS[code];
}

// Построить darData для интегратора из данных его поля
function buildIntegratorDarData(code) {
  const intInfo = INTEGRATORS[code];
  if (!intInfo) return null;
  const field = FIELDS_BY_ID[intInfo.field_id];
  if (!field) return null;
  // Эмулируем структуру dar-content.json
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

// ===== Серверный кэш посланий Оракула =====
// Сохраняет послания в Supabase чтобы юзер не терял их при закрытии Mini App
// (localStorage в Telegram WebApp может сброситься).

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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
  } catch (e) {
    // Кэш не найден или таблица не создана — не ошибка
  }
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
    // Не критично — если таблица не создана, просто не кэшируем
    console.warn('[oracle] cache save failed:', e.message);
  }
}

// ===== Обработчик API =====

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { dar_code, mode, user_query, gender, relative_name, relative_relationship, relative_id } = req.body;
  if (!dar_code) { res.status(400).json({ error: 'dar_code required' }); return; }

  // Получаем user_id для серверного кэша (если есть авторизация)
  let userId = null;
  try {
    const { getUser } = require('./lib/auth');
    const { getOrCreateUser } = require('./lib/db');
    const tgUser = getUser(req);
    if (tgUser && tgUser.id) {
      const user = await getOrCreateUser(tgUser);
      userId = user.id;
    }
  } catch (e) {
    // Авторизация не обязательна для Оракула — работает и без неё
  }

  // Проверяем серверный кэш (если юзер авторизован)
  if (userId && mode !== 'card') {
    // mode='card' не кэшируем — каждый вопрос юзера уникален
    const cached = await getOracleCache(userId, dar_code, mode, relative_id || null);
    if (cached) {
      return res.status(200).json(cached);
    }
  }

  // Имя дара: для обычных - из DARS_DB, для интеграторов - из INTEGRATORS
  const intInfo = INTEGRATORS[dar_code];
  const darName = intInfo ? intInfo.name : (DARS_DB[dar_code] || dar_code);

  // darData: для интеграторов синтезируем из данных поля, для остальных - из dar-content.json
  let darData = darContent[dar_code];
  if (!darData && intInfo) {
    darData = buildIntegratorDarData(dar_code);
    console.log('[oracle] Using integrator fallback for', dar_code, '->', darName);
  }
  if (!darData) {
    res.status(400).json({ error: 'Dar not found: ' + dar_code });
    return;
  }

  // Если режим 'relative' - послание для близкого, не для самого юзера
  const isRelative = mode === 'relative' && relative_name;
  const RELATIONSHIP_RU = {
    mother: 'мама', father: 'папа', son: 'сын', daughter: 'дочь',
    partner: 'партнёр', sibling: 'брат/сестра', friend: 'друг', other: 'близкий человек'
  };
  const relationLabel = isRelative ? (RELATIONSHIP_RU[relative_relationship] || 'близкий человек') : '';

  // Гендерный блок
  let genderBlock;
  if (isRelative) {
    // Для близкого: пол показывает на этого человека, не на пользователя
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

  // ===== НОВАЯ ЛОГИКА: используем авторские предсказания если есть =====
  const authoredPrediction = oraclePredictions[dar_code];
  let systemMsg;
  let userPrompt;

  if (authoredPrediction && authoredPrediction.prophecy) {
    // Короткий промт: AI только перефразирует авторский текст и генерирует практику
    if (isRelative) {
      // Режим "Оракул для близкого"
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
  } else {
    // ===== СТАРАЯ ЛОГИКА (fallback): если предсказание не найдено =====
    // Эта ветка сработает только если oracle-predictions.json не загружен
    // или в нём нет нужного кода дара.
    systemMsg = null; // заполним ниже
    userPrompt = null;
  }

  // Если предсказание было найдено - пропускаем старую логику, иначе идём дальше
  if (!authoredPrediction) {

  // Контекст из энциклопедии - только самое важное, коротко
  // (полные тексты энциклопедии перегружают модель и ломают JSON)
  const truncate = (s, n) => {
    if (!s) return '';
    if (s.length <= n) return s;
    return s.slice(0, n).replace(/\s+\S*$/, '') + '...';
  };
  const context = [
    darData.essence ? `СУТЬ:\n${truncate(darData.essence, 400)}` : '',
    darData.light_power ? `СВЕТЛЫЕ КАЧЕСТВА:\n${truncate(darData.light_power, 400)}` : '',
    darData.shadow ? `ТЕНЕВЫЕ АСПЕКТЫ (упомянуть только как зону бережного внимания):\n${truncate(darData.shadow, 300)}` : ''
  ].filter(Boolean).join('\n\n');

  const systemMsg = `Ты Оракул YupDar. Древний мудрец, который настраивает человека на сегодняшний день через энергии его Дара. Ты говоришь поэтично и точно, с теплом и уверенностью, как наставник, видящий суть.

ГЛАВНОЕ ПРАВИЛО - ЭНЕРГИИ КАК ПОТЕНЦИАЛ, А НЕ ФАКТ:
ОБРАЩАЙСЯ ЛИЧНО на "ты", как будто знаешь этого конкретного человека. Не "человек может почувствовать", а "ты можешь почувствовать". Послание должно ощущаться как личный разговор, а не общий гороскоп.

Ты говоришь не о том, что ГАРАНТИРОВАННО происходит с тобой, а о ВОЗМОЖНОСТЯХ и ПОТЕНЦИАЛЕ, которые этот день открывает. У каждого своя чувствительность: один увидит и проживёт, другой не заметит, третий может принять трансформацию за сложность. Ты указываешь на открывающиеся возможности, а человек сам решает, открываться им или нет. Ответственность за использование потенциала - на самом человеке.

Говори так:
- "Сегодня ты можешь почувствовать..."
- "Этот день открывает возможность..."
- "Если прислушаешься, обнаружишь..."
- "В воздухе разлито приглашение к..."
- "Если позволишь себе, сегодня..."
- "Есть шанс ощутить..."
- "Перед тобой открывается..."
- "Внутри тебя сегодня может ожить..."

НЕ говори так:
- "Сегодня внутри тебя поднимается..." (утверждение, которого может не быть)
- "Ты чувствуешь..." (как гарантия)
- "Мне кажется, что ты..." (Оракул не гадает)
- "Я думаю, что..." / "Я вижу..." (никаких собственных впечатлений)

Ты УВЕРЕН в существовании возможности, но НЕ утверждаешь, что человек её проживёт. Это разница между проповедью и приглашением.

${genderBlock}

ЗАКОН ЯЗЫКА (превыше всего):
Ты говоришь только грамматически безупречным литературным русским языком. Проверяй каждое предложение: правильные падежи, предлоги, согласования рода и числа. Никаких калек с английского, никаких ломаных конструкций. Лучше короткая ясная фраза, чем длинная с ошибкой.

СТИЛЬ РЕЧИ:
- Живая, поэтичная речь. Красивые метафоры из природы, стихий, света, воды, огня, ветра - но без перебора.
- Тёплый, уверенный тон мудрого наставника.
- Каждое предложение содержит смысл, без воды и банальностей.
- Короткие ясные предложения. Не перегружай конструкциями.

ОБРАЩЕНИЕ:
НЕ используй приветствий типа "Дорогой странник", "Милый друг", "Путник". Начинай сразу с сути дня.

Каждое послание начинай ПО-РАЗНОМУ. Варианты начальных конструкций:
- "Этот день открывается..."
- "Сегодня внутри тебя может ожить..."
- "Тонкое [что-то] - вот что несёт этот день."
- "Перед тобой открывается возможность..."
- "День несёт в себе..."
- "Сегодня в тебе раскрывается..."
- "Этот день приглашает..."
и другие естественные варианты.

ПРАВИЛО ПРОТИВ СКРЫТЫХ ШАБЛОНОВ:
Не используй одну и ту же архитектуру предложения в разных посланиях. В частности, избегай конструкции "X разлит/а в воздухе + если ты Y, то можешь Z". Варьируй начала и структуру каждый раз естественным образом.

ПРАВИЛО ПРОТИВ ПОВТОРОВ "СЕГОДНЯ":
Используй слово "сегодня" не более 1-2 раз во всём послании, обычно в первом предложении для установления контекста. Далее избегай его повторов - временной контекст уже ясен.

ПРАВИЛО ПРОТИВ ЛЮБОЙ ТАВТОЛОГИИ:
В одном послании ни одно заметное слово или оборот не должно повторяться дважды. Перед выдачей мысленно перечитай текст и замени любые повторы синонимами. Это касается и глаголов ("начинает" дважды), и существительных ("притяжения" дважды), и прилагательных ("тонкое" дважды), и вводных оборотов ("вот что несёт этот день" дважды). Текст должен быть лексически разнообразным.

СТРУКТУРА ПОСЛАНИЯ:
5-7 тёплых содержательных предложений. В них ты:
- указываешь, какие энергии и возможности несёт этот день
- говоришь, какую грань в человеке они могут раскрыть
- подсказываешь, на что опереться
- бережно указываешь, чего избегать
- называешь источник опоры

НЕ разбивай день на утро/середину/вечер. Это шаблон.

ЗАПРЕТЫ:
- НЕ называй дар, не пиши "твой дар", "этот дар", "энергии дара", "архетип".
- НЕ упоминай поля: ЛОГОС, НИМА, АНДРА, ЗИНГРА, ЛУБА, ТУМА, АСТРА, БИТРА, ОМА.
- НЕ упоминай МА, ЖИ, КУН, коды, цифры, формулы.
- НЕ цитируй энциклопедию дословно.
- НЕ используй театральщину: "Я вижу", "знаки небес", "ткань реальности", "вибрации".
- НЕ используй приветствия: "Дорогой", "Милый", "Путник", "Странник".
- НЕ пиши иностранных слов, ни одной латинской буквы.
- НЕ используй длинное тире. Только обычный дефис, запятую или точку.
- НЕ используй многоточие как символ. Пиши три точки подряд.

ЭТИКА:
Ты даёшь поддержку, а не приговор. Тени упоминай как зоны бережного внимания, не как опасность. Говори о росте, не об ошибках. Оставляй человеку достоинство и свободу выбора.

ПРАКТИКА ДНЯ:
Простое конкретное действие на сегодня, 3-4 живых предложения. Связана с энергиями дня, применима в обычной жизни: телесная, медитативная, рефлексивная, разговорная, ритуальная. Поэтично, но без церемонии. Начинай естественно, разнообразно, не с шаблонного "Сегодня благоприятно". Варьируй начало каждый раз.

ЭНЕРГИИ ДНЯ (4-5 коротких маркеров):
Только СВЕТЛЫЕ качества-ресурсы, по 2-3 слова каждый. НЕ включай тени ("страх", "растерянность", "зависимость"). Только то, на что человек опирается: "тихая ясность", "тёплая смелость", "внутренний лад" и т.д.

ФОРМАТ ОТВЕТА: только валидный JSON без markdown-обёртки.`;

  let userPrompt;

  const contextBlock = `Качества дня, которые действуют сейчас (используй как внутренний компас, НЕ цитируй дословно, переводи в живое послание своими словами):

${context}`;

  if (mode === 'card' && user_query) {
    userPrompt = `${contextBlock}

У человека есть вопрос, который его волнует: "${user_query}"

Напиши живое личное послание на сегодняшний день, которое поможет приблизиться к ответу на этот вопрос. Говори в языке возможностей, а не утверждений. Уникальное начало, без шаблонов, без обращений.

Верни ТОЛЬКО валидный JSON:
{
  "prophecy": "...",
  "practice": "...",
  "energies": ["...", "...", "...", "..."]
}`;
  } else if (mode === 'personal') {
    userPrompt = `${contextBlock}

Напиши живое личное послание на сегодняшний день. Говори в языке возможностей, а не утверждений. Уникальное начало, без шаблонов, без обращений.

Верни ТОЛЬКО валидный JSON:
{
  "prophecy": "...",
  "practice": "...",
  "energies": ["...", "...", "...", "..."]
}`;
  } else {
    userPrompt = `${contextBlock}

Напиши живое послание на сегодняшний день. Обращайся к одному человеку на "ты". Говори в языке возможностей, а не утверждений. Уникальное начало, без шаблонов, без обращений.

Верни ТОЛЬКО валидный JSON:
{
  "prophecy": "...",
  "practice": "...",
  "energies": ["...", "...", "...", "..."]
}`;
  }
  } // закрываем if (!authoredPrediction)

  // Гибрид: DeepSeek (если включён feature flag и есть ключ) или Groq Llama
  // ENV для включения: USE_DEEPSEEK_FOR_ORACLE=1 + DEEPSEEK_API_KEY=...
  // Откат: убрать USE_DEEPSEEK_FOR_ORACLE или поставить =0
  const useDeepSeek = deepseek.isDeepSeekEnabled('oracle') && deepseek.isDeepSeekConfigured();

  try {
    console.log('Oracle generating for:', dar_code, darName, 'mode:', mode, '| provider:', useDeepSeek ? 'deepseek' : 'groq');

    let completion;
    let providerUsed = 'groq';

    const messages = [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userPrompt }
    ];

    if (useDeepSeek) {
      try {
        completion = await deepseek.chatCompletion({
          messages,
          model: 'deepseek-chat',
          temperature: 0.9,
          max_tokens: 900
        });
        providerUsed = 'deepseek';
      } catch (dsErr) {
        // Если DeepSeek упал - откатываемся на Groq автоматически
        console.warn('[oracle] DeepSeek failed, fallback to Groq:', dsErr.message);
        const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
        completion = await groq.chat.completions.create({
          messages,
          model: 'llama-3.3-70b-versatile',
          temperature: 0.9,
          max_tokens: 900
        });
        providerUsed = 'groq-fallback';
      }
    } else {
      const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
      try {
        completion = await groq.chat.completions.create({
          messages,
          model: 'llama-3.3-70b-versatile',
          temperature: 0.9,
          max_tokens: 900
        });
      } catch (modelErr) {
        console.log('70b failed, trying 8b:', modelErr.message);
        completion = await groq.chat.completions.create({
          messages,
          model: 'llama-3.1-8b-instant',
          temperature: 0.9,
          max_tokens: 900
        });
        providerUsed = 'groq-8b';
      }
    }

    console.log('[oracle] used provider:', providerUsed);
    const raw = completion.choices[0]?.message?.content || '';
    console.log('Oracle response length:', raw.length);

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON не найден в ответе AI');
    const clean = raw.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error('Oracle parse error:', parseErr.message);
      throw new Error('Ошибка разбора JSON');
    }

    // Пост-обработка: чистка символов, удаление утечек названий дара/полей
    parsed = sanitizeOracleOutput(parsed, darName, Object.values(DARS_DB));

    // Орфографическая проверка через Yandex Speller (ловит опечатки Llama)
    try {
      parsed = await spellCheckOracleOutput(parsed);
    } catch (spellErr) {
      console.warn('Spellcheck stage failed, keeping sanitized text:', spellErr.message);
    }

    // Ненавязчивая рекомендация-медитация (если для этого дара есть в meditations.json)
    const med = pickMeditationForDar(dar_code);
    if (med) {
      parsed.meditation_video = med;
    }

    // Сохраняем в серверный кэш (если юзер авторизован)
    // Чтобы при перезапуске Mini App послание не потерялось
    if (userId && mode !== 'card') {
      saveOracleCache(userId, dar_code, mode, parsed, relative_id || null, user_query || null);
    }

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Oracle API error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
