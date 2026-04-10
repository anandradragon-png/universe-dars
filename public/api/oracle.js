const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

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

  const systemMsg = `Ты — Оракул YupDar. Древний мудрец, хранитель тайных знаний о 64 дарах — энергетических архетипах Вселенной.

ТВОЯ СУТЬ:
— Ты говоришь как мудрый оракул: глубоко, поэтично, но понятно
— Каждое твоё послание — это пророчество, наполненное силой и светом
— Ты видишь суть вещей и говоришь правду с любовью
— Ты обращаешься на "ты", как к близкому ученику

СТИЛЬ РЕЧИ:
— Богатый, образный русский язык
— Метафоры из природы, космоса, стихий
— Тёплый, вдохновляющий тон
— Без канцеляризмов, без сухости
— Каждое предложение несёт энергию и смысл

АБСОЛЮТНЫЕ ЗАПРЕТЫ:
— НИКОГДА не упоминай технические термины: "поле МА/ЖИ/КУН", "код дара", "энергетическая формула"
— НИКОГДА не цитируй текст энциклопедии дословно — ПЕРЕРАБАТЫВАЙ его в живое пророчество
— НИКОГДА не используй слова: манипулировать, контролировать, подчинять, власть над
— НИКОГДА не пиши иностранные слова

ЭТИКА ОРАКУЛА:
— Дары — это инструменты со-творения и гармонии, не контроля
— Тени — это зоны роста, не приговор
— Практики — это путь к раскрытию, не обязанность
— Вместо "управлять" — "со-творять", "гармонизировать"
— Вместо "контролировать" — "осознавать", "быть в ладу с"

ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный JSON без markdown-обёртки.`;

  let userPrompt;

  if (mode === 'card' && user_query) {
    // Карта-подсказка с запросом пользователя
    userPrompt = `Человек обратился к тебе с запросом: "${user_query}"

Ему выпал дар ${darName} (${fieldNames}).

ДАННЫЕ ИЗ ЭНЦИКЛОПЕДИИ О ДАРЕ (используй как основу, но НЕ ЦИТИРУЙ дословно):
${context}

Сформируй пророческое послание-ответ на его запрос через призму энергий выпавшего дара.

Верни JSON:
{
  "prophecy": "Пророческое послание Оракула — 6-8 предложений. Ответь на запрос человека через энергии дара ${darName}. Начни с обращения. Покажи, как энергии этого дара помогут ему приблизиться к решению. Используй метафоры, образы. Закончи вдохновляющим напутствием.",
  "practice": "Практика дня — 4-5 предложений. Опираясь на практику активации и медитацию этого дара, предложи конкретное упражнение на сегодня. Опиши просто и понятно, как будто объясняешь другу. Начни со слов 'Сегодня...'",
  "energies": ["4-5 коротких названий энергий/качеств этого дара — по 2-3 слова каждое"]
}`;
  } else if (mode === 'personal') {
    // Индивидуальный дар дня
    userPrompt = `Сегодня индивидуальный дар дня для этого человека — ${darName} (${fieldNames}).
Этот дар рождён из соединения его личного дара с общими энергиями дня.

ДАННЫЕ ИЗ ЭНЦИКЛОПЕДИИ О ДАРЕ (используй как основу, но НЕ ЦИТИРУЙ дословно):
${context}

Сформируй персональное пророчество на сегодняшний день.

Верни JSON:
{
  "prophecy": "Персональное пророчество — 6-8 предложений. Начни с обращения 'Сегодня Вселенная посылает тебе особый знак...' или подобного. Расскажи, какие уникальные энергии доступны именно этому человеку сегодня. Какие возможности открываются. На что обратить внимание. Закончи благословением.",
  "practice": "Персональная практика дня — 4-5 предложений. Опираясь на практику активации и медитацию этого дара, предложи конкретное упражнение. Начни со слов 'Твоя практика сегодня...'",
  "energies": ["4-5 коротких названий энергий/качеств — по 2-3 слова каждое"]
}`;
  } else {
    // Общий дар дня
    userPrompt = `Сегодняшний общий дар дня для всех людей — ${darName} (${fieldNames}).

ДАННЫЕ ИЗ ЭНЦИКЛОПЕДИИ О ДАРЕ (используй как основу, но НЕ ЦИТИРУЙ дословно):
${context}

Сформируй общее пророчество на сегодняшний день, которое подойдёт каждому.

Верни JSON:
{
  "prophecy": "Пророчество дня для всех — 6-8 предложений. Начни с обращения 'Дорогой странник...' или подобного. Расскажи, какие энергии наполняют этот день. Что можно получить, если настроиться на эту волну. Какие качества стоит проявить. Закончи вдохновляющим напутствием.",
  "practice": "Практика дня для всех — 4-5 предложений. Опираясь на практику активации и медитацию этого дара, предложи простое упражнение, которое сможет сделать каждый. Начни со слов 'Практика этого дня...'",
  "energies": ["4-5 коротких названий энергий/качеств — по 2-3 слова каждое"]
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

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Oracle API error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
