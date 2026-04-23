const Groq = require('groq-sdk');

let groq;
try {
  groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
} catch(e) {
  console.error('Groq init error:', e);
}

const SECTION_NAMES = [
  'Суть Дара',
  'Энергетический Рисунок',
  'Световая Сила',
  'Тень Дара',
  'Активация Дара',
  'Медитация',
  'Сфера Применения',
  'Техника Безопасности',
  'Атрибуты и Якоря'
];

const SECTION_PROMPTS = {
  1: 'Опиши суть и ядро этого дара. Что это за дар, его глубинная природа и предназначение.',
  2: 'Опиши энергетический рисунок: как течет энергия в теле, где ощущается, какие телесные ощущения.',
  3: 'Опиши световую силу — позитивную мощь дара, когда он активирован и сбалансирован.',
  4: 'Опиши тень дара — искажения, когда дар выходит из баланса. Три уровня тени: потенциала, проявления, результата.',
  5: 'Дай практическое упражнение для активации дара. 2-3 конкретных шага.',
  6: 'Дай инструкцию для медитации с этим даром. 3-4 шага: подготовка, вход, основная практика, выход.',
  7: 'Опиши сферы применения дара в реальной жизни: работа, отношения, здоровье, творчество.',
  8: 'Опиши технику безопасности: зоны риска, предупреждения, что НЕ делать с этим даром.',
  9: 'Опиши атрибуты и якоря дара: цвета, камни, символы, стихии, предметы-талисманы.'
};

const FIELD_DATA = {
  1: { name: 'ЛОГОС', element: 'Земля внутренняя', body: 'ноги, стопы, копчик', pattern: 'треугольник', essence: 'Структура, иерархия, фундамент реальности' },
  2: { name: 'НИМА', element: 'Воздух внутренний', body: 'таз, нижний живот', pattern: 'расходящиеся лучи', essence: 'Пространство, бесконечность, все векторы судьбы' },
  3: { name: 'АНДРА', element: 'Вода внутренняя', body: 'живот, поясница', pattern: 'спираль внутрь', essence: 'Любовь как действие, объединение, обновление связей' },
  4: { name: 'ЗИНГРА', element: 'Огонь внутренний', body: 'между пупком и солнечным сплетением', pattern: 'спираль наружу', essence: 'Эволюция, духовный рост, трансформация' },
  5: { name: 'ЛУБА', element: 'Огонь внешний', body: 'солнечное сплетение, сердце', pattern: 'точка', essence: 'Центр, единство, божественное "я есть"' },
  6: { name: 'ТУМА', element: 'Вода внешняя', body: 'сердце, грудь', pattern: 'волна', essence: 'Время, судьба, поток событий' },
  7: { name: 'АСТРА', element: 'Воздух внешний', body: 'горло', pattern: 'вдох-выдох', essence: 'Связь, коммуникация, каналы между мирами' },
  8: { name: 'БИТРА', element: 'Земля внешняя', body: 'голова', pattern: 'круг', essence: 'Форма, границы, оболочка сознания' },
  9: { name: 'ОМА', element: 'Эфир', body: 'весь позвоночник', pattern: 'ромб', essence: 'Всеединство, целостность, познание Бога' }
};

const MA_MEANINGS = {
  1: 'структура', 2: 'пространство', 3: 'любовь', 4: 'огонь роста',
  5: 'центр', 6: 'время', 7: 'связь-разум', 8: 'форма'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { dar_code, section_index, dar_name, dar_archetype } = req.body;

    if (!dar_code || !section_index) {
      return res.status(400).json({ error: 'dar_code and section_index required' });
    }

    const idx = parseInt(section_index);
    if (idx < 1 || idx > 9) return res.status(400).json({ error: 'section_index must be 1-9' });

    try {
      const { getSupabase } = require('../db');
      const db = getSupabase();
      const { data: cached } = await db
        .from('dar_sections_cache')
        .select('content')
        .eq('dar_code', dar_code)
        .eq('section_index', idx)
        .single();

      if (cached) {
        return res.json({
          title: SECTION_NAMES[idx - 1],
          content: cached.content,
          quest: cached.quest_question ? {
            question: cached.quest_question,
            hint: cached.quest_hint || '',
            type: (['','reflection','body_practice','reflection','shadow_work','practice','meditation','life_application','awareness','integration'])[idx] || 'reflection',
            min_length: [0,30,30,50,80,30,50,50,50,100][idx] || 30,
            crystals: [0,3,5,5,7,5,7,5,5,10][idx] || 3
          } : null,
          cached: true
        });
      }
    } catch (e) {}

    const parts = dar_code.split('-');
    const ma = parseInt(parts[0]);
    const zhi = parseInt(parts[1]);
    const kun = parseInt(parts[2]);
    const field = FIELD_DATA[kun] || {};

    const QUEST_TYPES = {
      1: { type: 'reflection', min_length: 30, crystals: 3 },
      2: { type: 'body_practice', min_length: 30, crystals: 5 },
      3: { type: 'reflection', min_length: 50, crystals: 5 },
      4: { type: 'shadow_work', min_length: 80, crystals: 7 },
      5: { type: 'practice', min_length: 30, crystals: 5 },
      6: { type: 'meditation', min_length: 50, crystals: 7 },
      7: { type: 'life_application', min_length: 50, crystals: 5 },
      8: { type: 'awareness', min_length: 50, crystals: 5 },
      9: { type: 'integration', min_length: 100, crystals: 10 }
    };

    const questMeta = QUEST_TYPES[idx];

    const prompt = `Ты — мастер духовной мудрости, автор системы Даров. Сгенерируй контент для раздела "${SECTION_NAMES[idx - 1]}" дара ${dar_name || dar_code} (архетип: ${dar_archetype || 'не указан'}).

Контекст дара:
- Код: ${dar_code} (МА=${ma}, ЖИ=${zhi}, КУН=${kun})
- МА (потенциал, задняя поверхность тела): ${MA_MEANINGS[ma] || ma}
- ЖИ (проявление, передняя поверхность): ${MA_MEANINGS[zhi] || zhi}
- Поле КУН: ${field.name} — ${field.essence}
- Стихия поля: ${field.element}
- Область тела: ${field.body}
- Паттерн энергии: ${field.pattern}

Ответь СТРОГО в формате JSON (без markdown, без \`\`\`):
{
  "content": "Текст раздела. ${SECTION_PROMPTS[idx]} (3-5 предложений, глубоко, мудро, практично)",
  "quest_question": "Персональный вопрос-задание для этого конкретного дара и раздела. Вопрос должен быть глубоким, побуждающим к самопознанию, связанным с темой раздела и природой дара.",
  "quest_hint": "Краткая подсказка, на что обратить внимание при ответе (1 предложение)"
}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Ты мудрый духовный наставник. Отвечай ТОЛЬКО валидным JSON без markdown-обёрток. Пиши на русском.\n\nЭТИЧЕСКИЕ ПРАВИЛА (ОБЯЗАТЕЛЬНЫ):\n- НИКОГДА не используй слова: манипулировать, манипуляция, контролировать, подчинять, управлять людьми, власть над, подавлять, заставлять, принуждать, использовать людей\n- Вместо "управлять реальностью" пиши "со-творять реальность", "гармонизировать", "настраивать"\n- Вместо "манипулировать" пиши "взаимодействовать", "направлять", "гармонизировать", "настраивать поток"\n- Вместо "контролировать" пиши "осознавать", "наблюдать", "быть в ладу с"\n- Тон: уважительный, бережный, вдохновляющий. Дары — это инструменты со-творения, а не контроля.\n- Все практики должны быть безопасными, экологичными, уважающими свободную волю каждого.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.75,
      max_tokens: 800
    });

    let rawText = completion.choices[0]?.message?.content?.trim() || '';
    rawText = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();

    const russifyText = (s) => {
      if (!s || typeof s !== 'string') return s;
      return s
        .replace(/\bseemingly\b/gi, 'словно')
        .replace(/\bseems?\b/gi, 'кажется')
        .replace(/\btruly\b/gi, 'поистине')
        .replace(/\breally\b/gi, 'действительно')
        .replace(/\bindeed\b/gi, 'действительно')
        .replace(/\bactually\b/gi, 'на самом деле')
        .replace(/\bperhaps\b/gi, 'возможно')
        .replace(/\u2014/g, '-')
        .replace(/\u2013/g, '-')
        .replace(/\u00A0/g, ' ')
        .replace(/\s{2,}/g, ' ');
    };

    let content, questQuestion, questHint;
    try {
      const parsed = JSON.parse(rawText);
      content = russifyText(parsed.content || 'Контент генерируется...');
      questQuestion = russifyText(parsed.quest_question || 'Поделитесь своими мыслями об этом разделе.');
      questHint = russifyText(parsed.quest_hint || '');
    } catch (e) {
      content = russifyText(rawText || 'Контент генерируется...');
      questQuestion = 'Какие мысли и чувства вызвал у вас этот раздел? Поделитесь своим опытом.';
      questHint = 'Будьте честны с собой.';
    }

    try {
      const { getSupabase } = require('../db');
      const db = getSupabase();
      await db.from('dar_sections_cache').upsert({
        dar_code,
        section_index: idx,
        content,
        quest_question: questQuestion,
        quest_hint: questHint,
        created_at: new Date().toISOString()
      }, { onConflict: 'dar_code,section_index' });
    } catch (e) {}

    return res.json({
      title: SECTION_NAMES[idx - 1],
      content,
      quest: {
        question: questQuestion,
        hint: questHint,
        type: questMeta.type,
        min_length: questMeta.min_length,
        crystals: questMeta.crystals
      },
      cached: false
    });
  } catch (e) {
    console.error('section error:', e);
    return res.status(500).json({ error: e.message });
  }
};
