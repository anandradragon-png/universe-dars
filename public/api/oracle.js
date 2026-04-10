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

// ===== Загрузка энциклопедии =====

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

  // Контекст из энциклопедии (внутреннее знание, НЕ цитировать)
  const context = [
    darData.essence ? `СУТЬ:\n${darData.essence}` : '',
    darData.light_power ? `СВЕТЛЫЕ КАЧЕСТВА:\n${darData.light_power}` : '',
    darData.shadow ? `ТЕНЕВЫЕ АСПЕКТЫ:\n${darData.shadow}` : '',
    darData.activation ? `ПРАКТИКА АКТИВАЦИИ:\n${darData.activation}` : '',
    darData.meditation ? `МЕДИТАЦИЯ:\n${darData.meditation}` : '',
    darData.application ? `ПРИМЕНЕНИЕ:\n${darData.application}` : '',
    darData.safety ? `БЕЗОПАСНОСТЬ:\n${darData.safety}` : ''
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

КОНТЕКСТ ДАРА (это твоё внутреннее знание, НИКОГДА не цитируй дословно, не пересказывай, превращай в живое послание своими словами):
${context}

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

  if (mode === 'card' && user_query) {
    userPrompt = `У человека есть вопрос, который его волнует: "${user_query}"

Напиши живое личное послание на сегодняшний день, которое поможет приблизиться к ответу на этот вопрос. Используй энергии дня (из system context) как внутренний компас. Говори в языке возможностей, а не утверждений. Уникальное начало, без шаблонов, без обращений.

Верни JSON:
{
  "prophecy": "...",
  "practice": "...",
  "energies": ["...", "...", "...", "..."]
}`;
  } else if (mode === 'personal') {
    userPrompt = `Напиши живое личное послание на сегодняшний день. Используй энергии дня (из system context) как внутренний компас. Говори в языке возможностей, а не утверждений. Уникальное начало, без шаблонов, без обращений.

Верни JSON:
{
  "prophecy": "...",
  "practice": "...",
  "energies": ["...", "...", "...", "..."]
}`;
  } else {
    userPrompt = `Напиши живое послание на сегодняшний день. Обращайся к одному человеку на "ты". Используй энергии дня (из system context) как внутренний компас. Говори в языке возможностей, а не утверждений. Уникальное начало, без шаблонов, без обращений.

Верни JSON:
{
  "prophecy": "...",
  "practice": "...",
  "energies": ["...", "...", "...", "..."]
}`;
  }

  try {
    console.log('Oracle generating for:', dar_code, darName, 'mode:', mode);

    // Вызов Anthropic Claude API (Sonnet 4.5) - высокое качество русского языка,
    // тонкое следование инструкциям. Fallback на Groq/Llama если Claude недоступен.
    const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    let raw = '';

    if (anthropicKey) {
      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 1400,
            temperature: 0.9,
            system: systemMsg,
            messages: [
              { role: 'user', content: userPrompt }
            ]
          })
        });

        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error('Claude API ' + resp.status + ': ' + errText.slice(0, 300));
        }
        const data = await resp.json();
        raw = data?.content?.[0]?.text || '';
        console.log('Claude response length:', raw.length);
      } catch (claudeErr) {
        console.warn('Claude failed, falling back to Groq:', claudeErr.message);
        raw = '';
      }
    }

    // Fallback: Groq/Llama если Claude не настроен или упал
    if (!raw) {
      const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
      let completion;
      try {
        completion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userPrompt }
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.9,
          max_tokens: 1400
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
          max_tokens: 1400
        });
      }
      raw = completion.choices[0]?.message?.content || '';
      console.log('Groq fallback response length:', raw.length);
    }

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

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Oracle API error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
