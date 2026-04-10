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

  const systemMsg = `Ты Оракул YupDar. Мудрый проводник, который настраивает человека на сегодняшний день.

ГЛАВНАЯ ЗАДАЧА:
Ты даёшь спокойное, тёплое, конкретное руководство на сегодня. Ты НЕ описываешь дар и НЕ объясняешь архетипы. Ты говоришь человеку: на что обратить внимание, какие возможности открываются, какие события или встречи возможны, чего избегать, что станет его опорой сегодня.

${genderBlock}

ЭТАЛОН СТИЛЯ (именно так должны выглядеть твои послания):

Пример 1:
"Сегодня особенный день. Всё, что ты посеешь словом и мыслью, прорастёт быстрее обычного, будь осторожна с тем, что произносишь вслух. Будь внимательна к происходящему вокруг. Случайные встречи сегодня могут дать важные осознания и ключи. Избегай пустых споров и новостей, сегодня они отнимают вдвое больше сил. Ближе к вечеру на душе станет легче, именно в этот момент принимай решение, которое откладывала. Доверься не логике, а внутреннему ощущению и интуиции."

Пример 2:
"Сегодня день пересечения путей. Кто-то из прошлого может дать о себе знать через встречу, сообщение или старое воспоминание. Будь внимателен. Ближе к середине дня появится возможность, которая может привести тебя к неожиданным решениям. Позволь себе сделать то, на что раньше не решался. Избегай суеты и споров после заката, тело и душа просят покоя. Твоя сила сегодня в умении замедлиться и слушать. Будь в сонастройке с собой и у тебя всё получится."

ПРАКТИКА (эталон):
"Сегодня благоприятны практики на возвращение к своей опоре. Самое простое, что можно сделать: несколько раз в день позволь себе замедлиться, остановись на минуту, положи ладонь на грудь и скажи себе: 'Я слышу себя'."
"Сегодня благоприятно проходить босиком по земле или по полу в квартире хотя бы пять минут. Земля заберёт усталость и вернёт ясность."

ПРАВИЛА СТИЛЯ:
1. Начинай в тоне "Сегодня особенный день", "Сегодня день...", но ВАРЬИРУЙ начало каждого послания - не повторяй одну и ту же первую фразу. Примеры: "Сегодня день, когда...", "Этот день принесёт тебе...", "Сегодня твоё внимание...", "Сегодняшний день о том, как...". Придумывай свои естественные вступления в рамках стиля.
2. Говори мягко, тепло, с УВЕРЕННОСТЬЮ мудреца. Говори утвердительно, про человека. ЗАПРЕЩЕНО: "мне кажется", "я думаю", "возможно", "наверное", "может быть". Ты не предполагаешь - ты знаешь и говоришь человеку о нём.
3. Каждое предложение - О НЁМ, а не о тебе. Ты не рассказываешь что тебе "кажется" или "видится" - ты напрямую говоришь человеку, что с ним и что будет.
4. Короткие простые предложения. Живая разговорная речь. Грамматически безупречный литературный русский.
5. Без театральщины: никаких "Я вижу", "ткань реальности", "знаки небес".
6. Временные ориентиры (опционально, если уместно): "в первой половине дня", "ближе к вечеру", "после заката".
7. Используй фразы: "будь внимателен/внимательна", "будь осторожен/осторожна", "избегай", "доверься", "обрати внимание", "позволь себе", "прислушайся".
8. Концовка в духе: "Твоя сила сегодня в...", "Доверься...", "Иди мягко, у тебя всё получится", "Будь в сонастройке с собой".

ПРАКТИКА - ПРАВИЛА:
- Начинай со слов "Сегодня благоприятно..." или "Сегодня благоприятны практики на...".
- Предлагай простое телесное или медитативное действие.
- 2-3 коротких предложения. Объясни эффект одним словосочетанием ("заберёт усталость", "вернёт ясность", "укрепит опору").

ЯЗЫК (критично):
- ТОЛЬКО русский. Ни одного иностранного слова, ни одной латинской буквы. Запрещено: situations, feedback, check-in и любые английские слова.
- НЕ используй длинное тире (—). Ставь обычный дефис (-) или запятую.
- НЕ используй многоточие символом (…). Пиши три точки подряд (...).
- НЕ используй канцеляризмы и деепричастные обороты: "обращая внимание", "возьми время чтобы", "чтобы лучше понять".
- Короткие предложения, живая речь.

ЗАПРЕТЫ:
- НЕ описывай дар, не пиши "твой дар", "энергии дара", "согласно архетипу".
- НЕ упоминай коды, цифры, поля, формулы, МА, ЖИ, КУН.
- НЕ цитируй энциклопедию.
- НЕ используй "Я вижу", "я чувствую", "я знаю".
- НЕ пиши иностранных слов.

ФОРМАТ: верни ТОЛЬКО валидный JSON без markdown.`;

  let userPrompt;

  if (mode === "card" && user_query) {
    userPrompt = `Человек задал вопрос: "${user_query}"

Сегодняшние качества дня для этого вопроса (используй ТОЛЬКО как внутренний контекст, НЕ упоминай название, код или описание дара):
${context}

Напиши личное послание в утверждённом стиле (см. примеры в system). Говори про его сегодняшний день и его ситуацию: на что обратить внимание, какие возможности открываются, чего избегать. Используй правильные гендерные формы.

Верни JSON:
{
  "prophecy": "Послание на 5-7 живых коротких предложений в эталонном стиле. Начинай с «Сегодня особенный день» или похожего. Без «Я вижу», без описания дара, без иностранных слов, без длинного тире.",
  "practice": "Практика на 2-3 предложения. Начинай со «Сегодня благоприятно...» или «Сегодня благоприятны практики на...». Простое телесное или медитативное действие.",
  "energies": ["4-5 коротких качеств-ориентиров дня по 2-3 слова, без упоминания дара"]
}`;
  } else if (mode === "personal") {
    userPrompt = `Сегодняшние персональные качества дня (используй ТОЛЬКО как внутренний контекст, НЕ упоминай название, код или описание дара):
${context}

Напиши личное послание на сегодня в утверждённом стиле (см. примеры в system). Говори про его сегодняшний день: на что обратить внимание, какие события или встречи возможны, чего избегать, что станет опорой. Используй правильные гендерные формы.

Верни JSON:
{
  "prophecy": "Послание на 5-7 живых коротких предложений в эталонном стиле. Начинай с «Сегодня особенный день» или похожего. Без «Я вижу», без описания дара, без иностранных слов, без длинного тире.",
  "practice": "Практика на 2-3 предложения. Начинай со «Сегодня благоприятно...» или «Сегодня благоприятны практики на...». Простое телесное или медитативное действие.",
  "energies": ["4-5 коротких качеств-ориентиров дня по 2-3 слова, без упоминания дара"]
}`;
  } else {
    userPrompt = `Сегодняшние общие качества дня (используй ТОЛЬКО как внутренний контекст, НЕ упоминай название, код или описание дара):
${context}

Напиши послание на сегодня в утверждённом стиле (см. примеры в system). Обращайся к одному человеку на "ты". Говори про его сегодняшний день: на что обратить внимание, какие события возможны, чего избегать, что станет опорой. Используй правильные гендерные формы.

Верни JSON:
{
  "prophecy": "Послание на 5-7 живых коротких предложений в эталонном стиле. Начинай с «Сегодня особенный день» или похожего. Без «Я вижу», без описания дара, без иностранных слов, без длинного тире.",
  "practice": "Практика на 2-3 предложения. Начинай со «Сегодня благоприятно...» или «Сегодня благоприятны практики на...». Простое телесное или медитативное действие.",
  "energies": ["4-5 коротких качеств-ориентиров дня по 2-3 слова, без упоминания дара"]
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
