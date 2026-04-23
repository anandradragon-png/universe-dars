const Groq = require('groq-sdk');
const fieldsData = require('../../../fields.json');

const FIELDS_DB = {};
fieldsData.fields.forEach(f => { FIELDS_DB[f.id] = f; });
const DARS_DB = {};
fieldsData.dars.forEach(d => { DARS_DB[d.code] = d.name; });

const INTEGRATORS = {
  "1-9-1":"Архитектор Реальности","2-9-2":"Хранитель Бесконечного Пространства",
  "3-9-3":"Сердце Вселенной","4-9-4":"Феникс Вечного Обновления",
  "5-9-5":"Император Света","6-9-6":"Повелитель Времени",
  "7-9-7":"Проводник Мирового Разума","8-9-8":"Творец Совершенной Формы",
  "9-1-1":"Архитектор Вечного Порядка","9-2-2":"Творец Пространства Возможностей",
  "9-3-3":"Сердце Мирового Единства","9-4-4":"Феникс Глобальной Эволюции",
  "9-5-5":"Император Внутреннего Солнца","9-6-6":"Повелитель Судьбоносного Потока",
  "9-7-7":"Голос Космического Разума","9-8-8":"Создатель Живых Границ",
  "9-9-9":"Живое Зеркало Вселенной"
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { giftCode } = req.body;
  if (!giftCode) { res.status(400).json({ error: 'giftCode required' }); return; }

  const parts = giftCode.split('-').map(Number);
  const [codeMA, codeZHI, codeKUN] = parts;
  const maF = FIELDS_DB[codeMA];
  const zhiF = FIELDS_DB[codeZHI];
  const kunF = FIELDS_DB[codeKUN];
  if (!maF || !zhiF || !kunF) { res.status(400).json({ error: 'Invalid code' }); return; }

  const isIntegrator = !!INTEGRATORS[giftCode];
  const darName = isIntegrator ? INTEGRATORS[giftCode] : (DARS_DB[giftCode] || 'Дар');

  const rawName  = DARS_DB[giftCode] || '';
  const fileName = rawName.toLowerCase().normalize('NFC').replace(/[^а-яёa-z]/g, '');
  const imageUrl = fileName ? `/images/dars/${fileName}.svg` : '';
  const darExt  = fieldsData.dars_extended?.[giftCode];
  const darMeta = darExt?.metaphor || darName;
  const darEss  = darExt?.essence_short || '';
  const darFlow = darExt?.energy_flow || '';

  let intPhrase = '';
  if (isIntegrator) {
    if (giftCode === '9-9-9') intPhrase = 'Твоё существование становится актом целостного творения.';
    else if (codeZHI === 9)   intPhrase = 'Твоё действие становится актом целостного творения.';
    else                      intPhrase = 'Твоё состояние становится актом целостного творения.';
  }

  const maData  = { name: maF.name,  essence: maF.essence,  pattern: maF.pattern||'', flow: maF.flow||'', body: maF.body||'', shadow: maF.shadow_ma,  harmony: maF.harmony_key, risks: (maF.risk_zones||[]).join(', ') };
  const zhiData = { name: zhiF.name, essence: zhiF.essence, pattern: zhiF.pattern||'', flow: zhiF.flow||'', body: zhiF.body||'', shadow: zhiF.shadow_zhi, harmony: zhiF.harmony_key, risks: (zhiF.risk_zones||[]).join(', ') };
  const kunData = { name: kunF.name, essence: kunF.essence, pattern: kunF.pattern||'', flow: kunF.flow||'', body: kunF.body||'', shadow: kunF.shadow_kun, harmony: kunF.harmony_key, risks: (kunF.risk_zones||[]).join(', ') };

  const systemMsg = `Ты — Мудрый Психолог, Духовный Наставник и Коуч душ. Твоя задача — создать живой, тёплый психологический портрет человека на основе его дара.

АБСОЛЮТНЫЕ ЗАПРЕТЫ:
— НИКОГДА не упоминай названия полей (Логос, Нима, Андра, Зингра, Луба, Тума, Астра, Битра, Ома) и названия даров внутри текста.
— НИКОГДА не пиши технические фразы: "энергия течёт волной", "рисунок — треугольник", "поток сверху вниз", "поле МА/ЖИ/КУН".
— НИКОГДА не используй иностранные слова и транслитерацию.
— НИКОГДА не пиши канцеляризмы ("является обладателем", "данный человек").

ГЛАВНОЕ ПРАВИЛО — ПЕРЕВОД МЕХАНИКИ В ХАРАКТЕР:
Используй данные о механике энергии ТОЛЬКО как основу для метафор о личности.

КАЖДЫЙ РАЗДЕЛ ДОЛЖЕН ОТВЕЧАТЬ НА ВОПРОСЫ:
— Какая СИЛА заложена в этом человеке?
— Как эта сила ПРОЯВЛЯЕТСЯ в поступках и словах?
— Каким его ВИДЯТ окружающие?
— Какие особые ПАТТЕРНЫ поведения ему свойственны?

СТИЛЬ: Тепло, глубоко, лично. Обращение: "Вы", "Ваш дар", "Люди вашего типа". Богатый литературный русский язык. 4-6 предложений в каждом разделе.

ЭТИЧЕСКИЕ ПРАВИЛА (ОБЯЗАТЕЛЬНЫ):
- НИКОГДА не используй слова: манипулировать, манипуляция, контролировать, подчинять, управлять людьми, власть над, подавлять, заставлять, принуждать, использовать людей
- Вместо "управлять" пиши "со-творять", "гармонизировать", "настраивать"
- Вместо "контролировать" пиши "осознавать", "наблюдать", "быть в ладу с"
- Тон: бережный, вдохновляющий. Дары — инструменты со-творения, не контроля.

ФОРМАТ: Верни ТОЛЬКО валидный JSON без markdown.`;

  const prompt = `Создай живой психологический портрет для человека с даром "${darName}" (код ${giftCode}).

ДАННЫЕ ДЛЯ ХУДОЖЕСТВЕННОЙ ИНТЕРПРЕТАЦИИ (не цитируй их напрямую — переводи в качества характера):

Внутренняя природа человека:
  Суть: ${maData.essence}
  Характер потока: ${maData.flow} → переведи в: стиль мышления, внутренняя опора, ощущение себя
  Телесное ощущение: ${maData.body} → переведи в: как человек "заземляется", откуда черпает силу
  Когда теряет себя: ${maData.shadow}
  Как возвращается: ${maData.harmony}

Как проявляется в мире:
  Суть: ${zhiData.essence}
  Характер потока: ${zhiData.flow} → переведи в: стиль действий, поведение, темп жизни
  Телесное ощущение: ${zhiData.body} → переведи в: как человек "чувствует" правильный момент
  Когда теряет ритм: ${zhiData.shadow}
  Зоны риска: ${zhiData.risks}

Что приносит миру:
  Суть: ${kunData.essence}
  Характер потока: ${kunData.flow} → переведи в: дар для окружающих, итог присутствия
  Когда связь рвётся: ${kunData.shadow}
  Ключ к гармонии: ${kunData.harmony}

${darMeta !== darName ? `Образ дара: ${darMeta}` : ''}
${darEss ? `Глубинная суть: ${darEss}` : ''}
${darFlow ? `Особенность энергии: ${darFlow}` : ''}
${intPhrase ? `Особое послание: "${intPhrase}"` : ''}

Верни JSON:
{
  "sacred_energy": "5-6 предложений. Суть этого человека — кто он есть. Одна яркая метафора-образ (не технический термин). Что делает его уникальным среди людей.",
  "light_part": {
    "ma_resource": "4-5 предложений. Какая сила живёт внутри. Как человек ощущает себя в гармонии. Откуда черпает уверенность и энергию.",
    "zhi_action": "4-5 предложений. Как эта сила проявляется в действиях. Стиль поведения. Как его видят окружающие.${intPhrase ? ` Органично вплети: "${intPhrase}"` : ''}",
    "kun_effect": "4-5 предложений. Что получают люди рядом. Какой след оставляет в жизнях других. Его уникальный вклад в мир."
  },
  "growth_points": {
    "ma_shadow": "5-6 предложений. Бережно — когда внутренняя сила затихает. Какой страх за этим стоит. Как это проявляется в поведении. Это не слабость — это сигнал.",
    "zhi_shadow": "5-6 предложений. Бережно — когда действия теряют ритм. В какие ловушки попадает. Что провоцирует этот паттерн.",
    "kun_shadow": "5-6 предложений. Бережно — когда связь с миром ослабевает. Что чувствует внутри. Ощущение бессмысленности усилий."
  },
  "transition_keys": "6-7 предложений. Три мягких практических совета: как восстановить внутренний ресурс, как вернуть ритм действий, как восстановить связь с миром. Пиши как мудрый наставник.",
  "ecology": {
    "bloom_zones": ["5-6 конкретных профессий или сфер, где этот человек расцветает"],
    "risk_zones": ["3-4 среды или ситуации, где его сила угасает"]
  },
  "mission": "4-5 предложений. Вдохновляющее послание. Зачем эта душа пришла в мир. Закончи фразой, наполняющей силой и благословением."
}`;

  try {
    const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
    console.log('Generating for:', giftCode, darName);

    let completion;
    try {
      completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.75,
        max_tokens: 2000
      });
    } catch (modelErr) {
      completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.75,
        max_tokens: 2000
      });
    }

    const raw = completion.choices[0]?.message?.content || '';
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON не найден в ответе AI');
    const clean = raw.slice(start, end + 1);

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch (parseErr) { throw new Error('Ошибка разбора JSON'); }

    const totalLen = JSON.stringify(parsed).length;
    if (totalLen < 800) throw new Error('Ответ слишком короткий (' + totalLen + ' символов)');

    res.status(200).json({ data: parsed, imageUrl });
  } catch (e) {
    console.error('API error:', e.message);
    res.status(200).json({ error: 'Ошибка генерации, попробуйте ещё раз. ' + e.message });
  }
};
