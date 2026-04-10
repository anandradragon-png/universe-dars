const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

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

// Имена даров
const fieldsData = require('../fields.json');
const DARS_DB = {};
fieldsData.dars.forEach(d => { DARS_DB[d.code] = d.name; });

// ===== Обработчик API =====

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { dar_code, mode, user_query, gender } = req.body;
  if (!dar_code) { res.status(400).json({ error: 'dar_code required' }); return; }

  const darName = DARS_DB[dar_code] || dar_code;
  const darData = darContent[dar_code];
  if (!darData) { res.status(400).json({ error: 'Dar not found: ' + dar_code }); return; }

  // Гендерный блок
  const genderBlock = gender === 'male'
    ? 'ПОЛ ПОЛЬЗОВАТЕЛЯ: мужской. Используй мужские формы глаголов и прилагательных: "ты откладывал", "готов", "решался", "уверен".'
    : gender === 'female'
    ? 'ПОЛ ПОЛЬЗОВАТЕЛЯ: женский. Используй женские формы: "ты откладывала", "готова", "решалась", "уверена".'
    : 'ПОЛ ПОЛЬЗОВАТЕЛЯ: не указан. Используй нейтральные формы без родовых окончаний.';

  // ===== НОВАЯ ЛОГИКА: используем авторские предсказания если есть =====
  const authoredPrediction = oraclePredictions[dar_code];
  let systemMsg;
  let userPrompt;

  if (authoredPrediction && authoredPrediction.prophecy) {
    // Короткий промт: AI только перефразирует авторский текст на "ты" и генерирует практику
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
Ты говоришь не о том, что ГАРАНТИРОВАННО происходит с человеком, а о ВОЗМОЖНОСТЯХ и ПОТЕНЦИАЛЕ, которые этот день открывает. У каждого своя чувствительность: один увидит и проживёт, другой не заметит, третий может принять трансформацию за сложность. Ты указываешь на открывающиеся возможности, а человек сам решает, открываться им или нет. Ответственность за использование потенциала - на самом человеке.

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

  try {
    const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
    console.log('Oracle generating for:', dar_code, darName, 'mode:', mode);

    let completion;
    try {
      completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userPrompt }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.9,
        max_tokens: 900
      });
    } catch (modelErr) {
      console.log('70b failed, trying 8b:', modelErr.message);
      completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userPrompt }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.9,
        max_tokens: 900
      });
    }

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

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Oracle API error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
