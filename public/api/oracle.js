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

  const systemMsg = `Ты — Оракул YupDar. Мудрый проводник, который помогает человеку настроиться на сегодняшний день.

ТВОЯ ГЛАВНАЯ ЗАДАЧА:
Ты НЕ описываешь дар и НЕ объясняешь его значение. Ты даёшь человеку КОНКРЕТНОЕ РУКОВОДСТВО на сегодня — на что обратить внимание, какие события возможны, чего избегать и как удержать себя в ресурсе.

ОБРАЩЕНИЕ — ТОЛЬКО НА "ТЫ":
— Говори напрямую с человеком, как близкий друг-наставник
— Каждое предложение — про НЕГО лично: "ты сегодня…", "обрати внимание…", "тебе стоит…"
— Никаких обезличенных формулировок, никакого "человек", "он", "люди"
— Это пророчество для конкретного человека, а не лекция

СТРУКТУРА ПОСЛАНИЯ (строго следуй):
1. На что обратить внимание сегодня (1-2 предложения)
2. Какие события или встречи могут произойти (1-2 предложения)
3. Чего лучше избегать сегодня (1 предложение)
4. Как удержать себя в ресурсе, что станет твоей опорой (1-2 предложения)
5. Короткое благословение-напутствие (1 предложение)

АБСОЛЮТНЫЕ ЗАПРЕТЫ:
— НЕ описывай сам дар и его значение — энциклопедия для этого есть отдельно
— НЕ используй фразы: "твой дар", "энергии дара", "через дар", "согласно архетипу", "этот дар означает"
— НЕ упоминай названия полей, коды, цифры, формулы, МА/ЖИ/КУН
— НЕ цитируй энциклопедию — используй её только как контекст для понимания сегодняшних энергий
— НЕ пиши иностранные слова
— НЕ пиши абстрактные пространные описания — только конкретные ориентиры для дня

ТОН:
— Тёплый, живой, личный
— Конкретный, а не абстрактный
— Без канцеляризмов и сухости
— Мягко направляющий, не поучительный

ФОРМАТ ОТВЕТА: Верни ТОЛЬКО валидный JSON без markdown-обёртки.`;

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
