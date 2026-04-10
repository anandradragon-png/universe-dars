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

function sanitizeOracleOutput(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  if (parsed.prophecy) {
    if (hasLatin(parsed.prophecy)) {
      console.warn('Oracle: latin characters in prophecy, stripping');
      parsed.prophecy = parsed.prophecy.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, ' ');
    }
    parsed.prophecy = cleanText(parsed.prophecy);
  }
  if (parsed.practice) {
    if (hasLatin(parsed.practice)) {
      console.warn('Oracle: latin characters in practice, stripping');
      parsed.practice = parsed.practice.replace(/[a-zA-Z]+/g, '').replace(/\s+/g, ' ');
    }
    parsed.practice = cleanText(parsed.practice);
  }
  if (Array.isArray(parsed.energies)) {
    parsed.energies = parsed.energies.map(e => {
      if (typeof e !== 'string') return e;
      const cleaned = hasLatin(e) ? e.replace(/[a-zA-Z]+/g, '').trim() : e;
      return cleanText(cleaned);
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

// Загрузка базы медитаций (дополнение к meditation в dar-content.json)
let meditationsDB = { meditations: [] };
try {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'meditations.json'), 'utf8');
  meditationsDB = JSON.parse(raw);
} catch (e) {
  console.error('Failed to load meditations.json:', e.message);
}

// Подобрать медитацию по коду дара (возвращает первую подходящую или null)
function pickMeditationForDar(darCode) {
  if (!Array.isArray(meditationsDB.meditations)) return null;
  const matches = meditationsDB.meditations.filter(m => Array.isArray(m.dars) && m.dars.includes(darCode));
  if (matches.length === 0) return null;
  // Если несколько — берём одну (пока первую; потом можно ротировать по дате)
  const m = matches[0];
  return {
    title: m.title,
    description: m.description,
    url: m.url
  };
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

  const { dar_code, mode, user_query } = req.body;
  if (!dar_code) { res.status(400).json({ error: 'dar_code required' }); return; }

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

  const systemMsg = `Ты Оракул YupDar. Мудрый проводник, который помогает человеку настроиться на сегодняшний день.

ГЛАВНАЯ ЗАДАЧА:
Ты НЕ описываешь дар и НЕ объясняешь его значение. Ты даёшь человеку простое и ясное руководство на сегодня: на что обратить внимание, какие события возможны, чего избегать и как удержать себя в ресурсе.

ЯЗЫК (КРИТИЧНО):
1. ТОЛЬКО русский язык. Ни одного иностранного слова, ни одной латинской буквы. Запрещено: situations, feedback, check-in и любые английские слова. Если сомневаешься — пиши русское.
2. Простая разговорная речь. Пиши так, как говорят живые люди, а не как в книгах по психологии. Короткие фразы, обычные слова.
3. НЕ используй длинное тире (—). Вместо него ставь обычный дефис (-) или двоеточие, или начни новое предложение.
4. НЕ используй многоточие как символ (…). Пиши три точки подряд (...).
5. Избегай канцеляризмов и деепричастных оборотов. Примеры того, как НЕ надо:
   - "обращая внимание на каждую деталь" - плохо (деепричастие)
   - "возьми время, чтобы практиковать" - плохо (калька с английского)
   - "чтобы лучше понять свою внутреннюю динамику" - плохо (сложно и абстрактно)
   Лучше: "замечай мелочи вокруг", "уделми немного времени", "прислушайся к себе".
6. Короткие предложения. Длинные разбивай на два.

ОБРАЩЕНИЕ ТОЛЬКО НА "ТЫ":
- Говори напрямую с человеком, как близкий друг.
- Каждое предложение про НЕГО лично: "ты сегодня...", "обрати внимание...", "тебе стоит...".
- Никаких "человек", "он", "люди".

СТРУКТУРА ПОСЛАНИЯ (5 коротких частей):
1. На что обратить внимание сегодня (1 предложение).
2. Какие события или встречи возможны (1-2 предложения).
3. Чего лучше избегать (1 предложение).
4. Что станет твоей опорой, как остаться в ресурсе (1-2 предложения).
5. Короткое напутствие (1 предложение).

ЗАПРЕТЫ:
- НЕ описывай дар, не говори "твой дар", "энергии дара", "согласно архетипу".
- НЕ упоминай коды, цифры, поля, формулы, МА, ЖИ, КУН.
- НЕ цитируй энциклопедию.
- НЕ пиши иностранных слов.
- НЕ ставь длинное тире.

ТОН: тёплый, живой, простой. Как будто тебе пишет добрый друг.

ФОРМАТ: верни ТОЛЬКО валидный JSON без markdown.`;

  let userPrompt;

  if (mode === 'card' && user_query) {
    // Карта-подсказка с запросом пользователя
    userPrompt = `Человек задал вопрос: "${user_query}"

Сегодняшние энергии для этого вопроса несут такие качества (используй ТОЛЬКО как внутренний контекст, НИКОГДА не упоминай название, код или описание дара в ответе):
${context}

Дай человеку ЛИЧНОЕ руководство — как ему действовать СЕГОДНЯ, чтобы приблизиться к ответу на свой вопрос. Обращайся напрямую на "ты". Не описывай сам дар — говори про ЕГО день и ЕГО ситуацию.

Верни JSON:
{
  "prophecy": "Личное пророчество на 5-7 предложений. Строго следуй структуре: (1) на что обратить внимание сегодня в контексте его вопроса, (2) какие события или встречи могут подсказать ответ, (3) чего избегать, (4) что станет опорой и ресурсом, (5) короткое напутствие. ТОЛЬКО на 'ты', ТОЛЬКО конкретика, БЕЗ описания дара.",
  "practice": "Простое и конкретное упражнение на сегодня — 2-3 предложения. Что именно тебе сделать прямо сегодня, чтобы удержать себя в ресурсе. Начни со слов 'Сегодня...'",
  "energies": ["4-5 коротких качеств-ориентиров дня — по 2-3 слова каждое, БЕЗ упоминания дара"]
}`;
  } else if (mode === 'personal') {
    // Индивидуальный дар дня
    userPrompt = `Сегодняшние персональные энергии для этого человека несут такие качества (используй ТОЛЬКО как внутренний контекст, НИКОГДА не упоминай название, код или описание дара в ответе):
${context}

Дай человеку ЛИЧНОЕ руководство на сегодняшний день. Обращайся на "ты" напрямую. Не описывай дар — говори про ЕГО день: на что обратить внимание, какие события возможны, чего избегать, как остаться в ресурсе.

Верни JSON:
{
  "prophecy": "Личное пророчество на 5-7 предложений. Строго следуй структуре: (1) на что обратить внимание сегодня, (2) какие события или встречи могут произойти, (3) чего избегать, (4) что станет твоей опорой и ресурсом, (5) короткое благословение. ТОЛЬКО на 'ты', ТОЛЬКО конкретика, БЕЗ описания дара.",
  "practice": "Простое и конкретное упражнение на сегодня — 2-3 предложения. Что именно тебе сделать прямо сегодня, чтобы удержать себя в ресурсе. Начни со слов 'Сегодня...'",
  "energies": ["4-5 коротких качеств-ориентиров дня — по 2-3 слова каждое, БЕЗ упоминания дара"]
}`;
  } else {
    // Общий дар дня
    userPrompt = `Сегодняшние общие энергии дня несут такие качества (используй ТОЛЬКО как внутренний контекст, НИКОГДА не упоминай название, код или описание дара в ответе):
${context}

Дай руководство на сегодняшний день. Обращайся на "ты" — представь, что говоришь с одним человеком. Не описывай дар — говори про ЕГО день: на что обратить внимание, какие события возможны, чего избегать, как остаться в ресурсе.

Верни JSON:
{
  "prophecy": "Пророчество на 5-7 предложений. Строго следуй структуре: (1) на что обратить внимание сегодня, (2) какие события или встречи возможны, (3) чего лучше избегать, (4) что станет твоей опорой и ресурсом, (5) короткое напутствие. ТОЛЬКО на 'ты', ТОЛЬКО конкретика, БЕЗ описания дара.",
  "practice": "Простое и конкретное упражнение на сегодня — 2-3 предложения. Что именно тебе сделать прямо сегодня, чтобы удержать себя в ресурсе. Начни со слов 'Сегодня...'",
  "energies": ["4-5 коротких качеств-ориентиров дня — по 2-3 слова каждое, БЕЗ упоминания дара"]
}`;
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
        temperature: 0.85,
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
        temperature: 0.85,
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

    // Пост-обработка: чистка символов по закону "только русский"
    parsed = sanitizeOracleOutput(parsed);

    // Добавляем ненавязчивую рекомендацию-медитацию (если есть для этого дара)
    const med = pickMeditationForDar(dar_code);
    if (med) {
      parsed.meditation_video = med;
    }

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Oracle API error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
