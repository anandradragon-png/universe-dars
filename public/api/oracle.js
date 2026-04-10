const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

// Чистка вывода Оракула согласно закону "только русский язык"
function cleanText(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/\u2014/g, '-')   // em dash → дефис
    .replace(/\u2013/g, '-')   // en dash → дефис
    .replace(/\u2026/g, '...') // многоточие → три точки
    .replace(/\u00A0/g, ' ')   // неразрывный пробел → обычный
    .replace(/\s+-\s+/g, ', ') // висящий дефис между словами → запятая
    .replace(/\s{2,}/g, ' ')   // двойные пробелы
    .trim();
}

function hasLatin(s) {
  return typeof s === 'string' && /[a-zA-Z]/.test(s);
}

// Имена 9 полей, которые AI не должен упоминать
const FIELD_NAMES = ['ЛОГОС', 'НИМА', 'АНДРА', 'ЗИНГРА', 'ЛУБА', 'ТУМА', 'АСТРА', 'БИТРА', 'ОМА'];

// Удалить упоминания полей, кодов и названий даров из текста.
// Используем символы-разделители (не буквы кириллицы) как границы слов,
// потому что \b в JS regex не работает с кириллицей.
const WORD_BOUND_BEFORE = '(^|[^А-Яа-яЁё])';
const WORD_BOUND_AFTER  = '(?=[^А-Яа-яЁё]|$)';

function stripLeakedTerms(s, darName, darNamesAll) {
  if (!s || typeof s !== 'string') return s;
  let out = s;
  // Поля + их склонения (ТУМА -> ТУМЫ, ТУМЕ, ТУМУ, ТУМОЙ)
  for (const f of FIELD_NAMES) {
    // Точное совпадение
    const re1 = new RegExp(WORD_BOUND_BEFORE + '[«"\u201C\u201D\']?' + f + '[»"\u201C\u201D\']?' + WORD_BOUND_AFTER, 'g');
    out = out.replace(re1, '$1');
    // Склонения: ТУМ + [А|Ы|Е|У|ОЙ|ОЮ] и т.д.
    const stem = f.slice(0, -1); // ТУМА -> ТУМ
    const reForm = new RegExp(WORD_BOUND_BEFORE + '[«"\u201C\u201D\']?' + stem + '[АЫЕОУИЯЮЁ]{1,2}[»"\u201C\u201D\']?' + WORD_BOUND_AFTER, 'g');
    out = out.replace(reForm, '$1');
  }
  // Название текущего дара + все остальные
  const names = [darName, ...(darNamesAll || [])].filter(Boolean);
  for (const n of names) {
    if (!n || n.length < 2) continue;
    const escaped = n.replace(/[-]/g, '[\\-\\s]?');
    const re = new RegExp(WORD_BOUND_BEFORE + '[«"\u201C\u201D\']?' + escaped + '[»"\u201C\u201D\']?' + WORD_BOUND_AFTER, 'g');
    out = out.replace(re, '$1');
  }
  // Коды вида 6-7-4, 1-2-3
  out = out.replace(/(^|\D)\d[-]\d[-]\d(\D|$)/g, '$1$2');
  // МА=6, ЖИ=7, КУН=4 (работает с кириллицей через символы-разделители)
  out = out.replace(/(^|[^А-Яа-яЁё])(МА|ЖИ|КУН)\s*[=:]\s*\d+/g, '$1');
  // Связки с МА/ЖИ/КУН без цифр
  out = out.replace(/\+\s*(МА|ЖИ|КУН)\s*=?\s*\d*/g, '');
  // Лишние фразы
  out = out.replace(/согласно архетипу/gi, '');
  out = out.replace(/этот дар/gi, '');
  out = out.replace(/твой дар/gi, '');
  out = out.replace(/твоя ось/gi, 'ты');
  out = out.replace(/твой центр/gi, 'ты');
  // Чистка лишних знаков после вырезания
  out = out.replace(/«\s*»/g, '');
  out = out.replace(/"\s*"/g, '');
  out = out.replace(/\(\s*\)/g, '');
  // Болтающиеся "+" между удалёнными терминами
  out = out.replace(/(\s*\+\s*)+/g, ' ');
  // "и" с обеих сторон от удалённых слов
  out = out.replace(/\bи\s+и\b/gi, 'и');
  out = out.replace(/\s+([,.!?:;])/g, '$1');
  out = out.replace(/,\s*,/g, ',');
  out = out.replace(/\s{2,}/g, ' ');
  out = out.replace(/^\s*[,.:;]/, '');
  // Если предложение начинается с лишнего знака
  out = out.replace(/^\s*[+\-,.:;]\s*/, '');
  return out.trim();
}

function sanitizeOracleOutput(parsed, darName, darNamesAll) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  if (parsed.prophecy) {
    if (hasLatin(parsed.prophecy)) {
      console.warn('Oracle: latin characters in prophecy, stripping');
      parsed.prophecy = parsed.prophecy.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, ' ');
    }
    parsed.prophecy = stripLeakedTerms(parsed.prophecy, darName, darNamesAll);
    parsed.prophecy = cleanText(parsed.prophecy);
  }
  if (parsed.practice) {
    if (hasLatin(parsed.practice)) {
      console.warn('Oracle: latin characters in practice, stripping');
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

// Загрузка данных энциклопедии
let darContent = {};
try {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'dar-content.json'), 'utf8');
  darContent = JSON.parse(raw);
} catch (e) {
  console.error('Failed to load dar-content.json:', e.message);
}

// Имена даров
const fieldsData = require('../fields.json');
const DARS_DB = {};
fieldsData.dars.forEach(d => { DARS_DB[d.code] = d.name; });
const FIELDS = {1:'ЛОГОС',2:'НИМА',3:'АНДРА',4:'ЗИНГРА',5:'ЛУБА',6:'ТУМА',7:'АСТРА',8:'БИТРА',9:'ОМА'};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { dar_code, mode, user_query, gender } = req.body;
  if (!dar_code) { res.status(400).json({ error: 'dar_code required' }); return; }

  // Гендерные указания для модели
  const genderBlock = gender === 'male'
    ? 'ПОЛ ПОЛЬЗОВАТЕЛЯ: мужской. Используй мужские формы: будь осторожен, будь внимателен, ты откладывал, ты решался, готов, расслаблен, уверен.'
    : gender === 'female'
    ? 'ПОЛ ПОЛЬЗОВАТЕЛЯ: женский. Используй женские формы: будь осторожна, будь внимательна, ты откладывала, ты решалась, готова, расслаблена, уверена.'
    : 'ПОЛ ПОЛЬЗОВАТЕЛЯ: не указан. Используй нейтральные формулировки, избегай глаголов и прилагательных с родовыми окончаниями. Говори: обрати внимание, будь осторожнее, избегай, доверься, позволь себе, не пропусти, прислушайся.';

  const darName = DARS_DB[dar_code] || dar_code;
  const darData = darContent[dar_code];
  if (!darData) { res.status(400).json({ error: 'Dar not found: ' + dar_code }); return; }

  const [ma, zhi, kun] = dar_code.split('-').map(Number);
  const fieldNames = `МА=${ma} (${FIELDS[ma]}), ЖИ=${zhi} (${FIELDS[zhi]}), КУН=${kun} (${FIELDS[kun]})`;

  // Собираем контекст из энциклопедии
  const context = [
    darData.essence ? `СУТЬ ДАРА:\n${darData.essence}` : '',
    darData.light_power ? `СВЕТОВЫЕ КАЧЕСТВА:\n${darData.light_power}` : '',
    darData.shadow ? `ТЕНЕВЫЕ АСПЕКТЫ:\n${darData.shadow}` : '',
    darData.activation ? `ПРАКТИКА АКТИВАЦИИ:\n${darData.activation}` : '',
    darData.meditation ? `МЕДИТАЦИЯ:\n${darData.meditation}` : '',
    darData.application ? `ПРИМЕНЕНИЕ:\n${darData.application}` : '',
    darData.safety ? `БЕЗОПАСНОСТЬ:\n${darData.safety}` : ''
  ].filter(Boolean).join('\n\n');

  const systemMsg = `Ты Оракул YupDar. В тебе сочетаются три голоса: древний мудрец, современный коуч и тонкий психолог. Ты не играешь в мистику и не декламируешь пафосных фраз. Ты как близкий наставник: живой, точный, психологически чуткий.

ТВОЯ ЗАДАЧА:
Написать живое личное послание конкретному человеку на сегодняшний день. Не лекция, не мантра, не абстрактные пожелания. Разговор один на один, где ты помогаешь человеку настроиться на день, увидеть возможности и избежать подводных камней.

КОНТЕКСТ ДНЯ (это твоё внутреннее знание, НИКОГДА не цитируй и не пересказывай дословно):
${context}

Из этого контекста ты должен(на) вычленить НЕ слова, а СУТЬ: какое настроение разлито в этом дне, какие психологические паттерны могут проявиться, где возможен рост, где риск, какие действия сегодня поддержаны, какие нет. И вплести эту суть в ЛИЧНОЕ обращение.

${genderBlock}

КАК ТЫ ГОВОРИШЬ:
- Живым, точным русским языком. Не как блогер-эзотерик. Не как тренер личностного роста. Как умный, любящий человек.
- Психологически тонко: понимаешь мотивы, страхи, сопротивление, внутренние конфликты.
- Даёшь конкретные наблюдения, а не банальности.
- Никаких штампов: "прислушайся к себе", "доверься Вселенной", "обрати внимание на знаки", "открой сердце", "найди баланс".
- Никакой дешёвой мистики: "я вижу", "знаки небес", "ткань реальности", "вибрации", "настройся на волну".
- Никаких псевдо-духовных советов из йога-журналов: "найди момент", "уделми минутку", "сделай паузу".
- Коротко, ёмко, содержательно. Каждое предложение несёт смысл.

ЧТО ДОЛЖНО БЫТЬ В ПОСЛАНИИ:
Не рецепт, а живое руководство. Обычно это 4-6 коротких содержательных предложений, в которых ты:
- говоришь, что происходит сегодня внутри человека или в его окружении
- указываешь на ОДНУ ключевую возможность или риск этого дня
- даёшь конкретное психологическое наблюдение (без клише)
- подсказываешь, что станет опорой

Это НЕ список разделов. Это связный живой текст, где всё вплетено естественно.

СТРОГИЕ ЗАПРЕТЫ:
- НЕ разбивай день на утро/середину дня/вечер. Это шаблон. Не используй временные маркеры вообще, если они не возникают естественно.
- НЕ начинай все послания одинаково. "Сегодня особенный день", "Твоя ось", "Твой центр", "Сегодня день..." - ВСЁ это запрещено как стартовые фразы.
- НЕ используй название дара, коды, поля, цифры, формулы. Никаких упоминаний "ЛОГОС, НИМА, АНДРА, ЗИНГРА, ЛУБА, ТУМА, АСТРА, БИТРА, ОМА" или "МА/ЖИ/КУН".
- НЕ цитируй и не пересказывай контекст дара. Говори своими словами про день человека.
- НЕ повторяй одну и ту же структуру. Каждое послание живое и непохожее на другие.
- НЕ используй длинное тире. Только обычный дефис, запятая, точка.
- НЕ пиши ни одного иностранного слова, ни одной латинской буквы.

ПРАКТИКА ДНЯ:
Это конкретное действие, которое человеку стоит сделать сегодня. 2-3 живых предложения.

ГЛАВНЫЙ ПРИНЦИП: не начинай практику с шаблонной фразы. Любая из таких фраз - ЗАПРЕЩЕНА:
- "Сегодня благоприятно..."
- "Для опоры сегодня..."
- "Попробуй сегодня..."
- "Сегодня стоит..."
- "Найди момент..."
- "Уделми время..."
- любое другое повторяющееся начало

Вместо этого: начинай с ЦЕЛИ практики, с того, ЗАЧЕМ она нужна именно сегодня. Например (это не шаблоны, а примеры логики):
- "Чтобы сохранить равновесие сегодня, ..."
- "Для внутренней устойчивости ..."
- "Чтобы не потерять себя в шуме ..."
- "Для ясности перед важным решением ..."
- "Если чувствуешь тревогу, ..."
- "Когда поймёшь, что теряешь центр, ..."
- и т.д.

Цель практики должна вытекать ИЗ энергий дня. Формулировка цели должна быть живая, разная в каждом послании, психологически точная.

Сама практика - простое телесное, медитативное, рефлексивное или разговорное действие.

ЭНЕРГИИ ДНЯ (4-5 коротких слов/словосочетаний):
Короткие маркеры настроения дня, 2-3 слова каждый. Без упоминания дара.

ФОРМАТ ОТВЕТА: только валидный JSON без markdown:
{
  "prophecy": "живое послание",
  "practice": "конкретное действие",
  "energies": ["маркер1", "маркер2", "маркер3", "маркер4"]
}`;

  let userPrompt;

  if (mode === "card" && user_query) {
    userPrompt = `У человека есть вопрос, который его волнует: "${user_query}"

Напиши живое личное послание на сегодняшний день, которое поможет ему(ей) приблизиться к ответу на этот вопрос. Используй энергии дня (из system context) как внутренний компас. Говори как мудрый психолог и коуч. Уникальное начало. Конкретика, без клише и мистики.`;
  } else if (mode === "personal") {
    userPrompt = `Напиши живое личное послание на сегодняшний день для этого человека. Используй энергии дня (из system context) как внутренний компас. Говори как мудрый психолог и коуч. Уникальное начало, конкретные психологические наблюдения, без клише, без мистики, без разбивки на утро/день/вечер.`;
  } else {
    userPrompt = `Напиши живое послание на сегодняшний день. Обращайся к одному человеку на "ты". Используй энергии дня (из system context) как внутренний компас. Говори как мудрый психолог и коуч. Уникальное начало, конкретика, без клише и мистики, без разбивки по времени суток.`;
  }

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
        temperature: 1.0,
        max_tokens: 1200
      });
    } catch (modelErr) {
      console.log('70b failed, trying 8b:', modelErr.message);
      completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userPrompt }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 1.0,
        max_tokens: 1200
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

    // Пост-обработка: чистка символов + удаление утечек названий дара/полей
    parsed = sanitizeOracleOutput(parsed, darName, Object.values(DARS_DB));

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Oracle API error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
