const Groq = require('groq-sdk');
const { getUser } = require('./lib/auth');

// AI-гуру проверяет глубину рефлексии пользователя над гранью дара или медитацией дара.
// Если ответ поверхностный - возвращает коучинговые вопросы, чтобы помочь осознаться.
// Если ответ глубокий и искренний - одобряет и разрешает переход к следующему квесту.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Не требуем строгой авторизации - любой пользователь может получить коучинг
  const tgUser = getUser(req);

  const {
    quest_type,        // 'shadow' | 'meditation'
    dar_name,          // для контекста
    shadow_title,      // название тени
    shadow_description,// описание тени
    shadow_correction, // коррекция (путь света)
    user_answer,       // рефлексия пользователя
    gender             // для правильных форм
  } = req.body || {};

  if (!user_answer || typeof user_answer !== 'string') {
    return res.status(400).json({ error: 'user_answer required' });
  }

  const trimmed = user_answer.trim();
  if (trimmed.length < 20) {
    return res.status(200).json({
      accepted: false,
      message: 'Твоя рефлексия очень короткая. Поделись чуть больше - опиши своими словами, что ты заметила в себе, что откликнулось в этой тени.',
      coaching_questions: [
        'Что конкретно из описания этой тени отозвалось в твоей жизни?',
        'Когда последний раз ты замечала этот паттерн в себе?',
        'Что ты чувствуешь, когда читаешь об этой тени?'
      ]
    });
  }

  const genderForms = gender === 'female'
    ? 'Пользователь женского пола. Используй женские формы: заметила, почувствовала, прошла.'
    : gender === 'male'
    ? 'Пользователь мужского пола. Используй мужские формы: заметил, почувствовал, прошёл.'
    : 'Пол пользователя не указан. Используй нейтральные формы.';

  const systemMsg = `Ты мудрый духовный наставник и коуч. Твоя задача - помочь человеку по-настоящему осознать одну из граней дара, а не просто формально выполнить задание.

Ты оцениваешь рефлексию пользователя над гранью дара и решаешь:
- Достаточно ли глубоко человек вошёл в эту грань?
- Увидел ли он её в своей жизни конкретно, а не абстрактно?
- Искренен ли ответ или формален?

Критерии принятия ответа:
1. ЛИЧНОЕ ВКЛЮЧЕНИЕ - человек говорит о СЕБЕ, приводит конкретные примеры из своей жизни, а не общие рассуждения.
2. УЗНАВАНИЕ ГРАНИ - ответ связан с описанной гранью, а не отходит в сторону.
3. ИСКРЕННОСТЬ - чувствуется живое размышление, а не формальная отписка.
4. ОСМЫСЛЕННОСТЬ - есть признак движения, осознания, понимания чего-то нового.

Если ответ СЛАБЫЙ - задай 2-3 коучинговых вопроса, которые помогут человеку глубже войти в эту грань. Вопросы должны быть мягкими, поддерживающими, открытыми (не "да/нет"), направленными на конкретный опыт.

Если ответ ДОСТАТОЧНО ГЛУБОКИЙ - одобри его тёплым искренним сообщением. Отрази то, что человек заметил в себе, и поддержи движение к свету.

ВАЖНО ПО ЛЕКСИКЕ:
- Говори "грань дара", "зона внимания", "путь света" вместо слова "тень".
- Ты ведёшь человека к свету, трансформации, раскрытию - не акцентируй на проблемах.
- Слово "тень" в сообщениях пользователю НЕ используй.

${genderForms}

СТРОГИЕ ПРАВИЛА ЯЗЫКА:
- Только грамматически безупречный русский язык
- Без иностранных слов
- Без длинного тире (используй дефис, запятую или точку)
- Тёплый, поддерживающий, не назидательный тон
- Без "мне кажется", "я думаю" - говори уверенно и мягко
- Без обращений "дорогой странник", "милый друг"

ФОРМАТ ОТВЕТА - строго валидный JSON без markdown:
{
  "accepted": true,
  "message": "тёплое сообщение одобрения или мягкое разъяснение что можно углубить"
}

Или если нужны коучинговые вопросы:
{
  "accepted": false,
  "message": "мягкое разъяснение, что можно углубить",
  "coaching_questions": ["вопрос 1", "вопрос 2", "вопрос 3"]
}`;

  const userPrompt = quest_type === 'meditation'
    ? `Пользователь выполнил медитацию активации дара и написал рефлексию:

"${trimmed}"

Оцени глубину. Если слабо - задай коучинговые вопросы. Если глубоко - одобри.`
    : `Грань дара: "${shadow_title || ''}"
Описание грани: ${shadow_description || ''}
Путь света: ${shadow_correction || ''}

Рефлексия пользователя:
"${trimmed}"

Оцени, достаточно ли глубоко человек осознал эту грань в своей жизни. Если слабо - задай 2-3 коучинговых вопроса. Если глубоко и искренне - одобри тёплым сообщением.`;

  try {
    const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
    let completion;
    try {
      completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userPrompt }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 600
      });
    } catch (modelErr) {
      completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userPrompt }
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.7,
        max_tokens: 600
      });
    }

    const raw = completion.choices[0]?.message?.content || '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON не найден');
    const clean = raw.slice(start, end + 1);

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      // Fallback - считаем принятым если не можем распарсить
      return res.status(200).json({
        accepted: true,
        message: 'Твоя рефлексия принята. Двигайся дальше.'
      });
    }

    // Валидация структуры
    const result = {
      accepted: !!parsed.accepted,
      message: String(parsed.message || '').slice(0, 1000)
    };
    if (!result.accepted && Array.isArray(parsed.coaching_questions)) {
      result.coaching_questions = parsed.coaching_questions
        .map(q => String(q).slice(0, 300))
        .filter(Boolean)
        .slice(0, 4);
    }

    return res.status(200).json(result);
  } catch (e) {
    console.error('shadow-review error:', e.message);
    // Fallback: принимаем ответ, чтобы не блокировать пользователя из-за технической ошибки
    return res.status(200).json({
      accepted: true,
      message: 'Твоя рефлексия принята. Двигайся дальше - путь разворачивается.'
    });
  }
};
