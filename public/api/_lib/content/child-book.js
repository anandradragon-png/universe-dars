/**
 * API для генерации персональной "Книги Даров для Родителей"
 */

const { requireUser } = require('../auth');
const { getSupabase, getOrCreateUser } = require('../db');
const deepseek = require('../deepseek');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

let darContent = {};
try {
  darContent = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'dar-content.json'), 'utf8'));
} catch (e) { console.warn('[child-book] dar-content.json not loaded:', e.message); }

const fieldsData = require('../../../fields.json');
const FIELDS_BY_ID = {};
(fieldsData.fields || []).forEach(f => { FIELDS_BY_ID[f.id] = f; });
const DARS_DB = {};
fieldsData.dars.forEach(d => { DARS_DB[d.code] = d.name; });

const DAR_ARCHETYPES = {"8-6-5":"Первородное солнце","8-4-3":"Купол любви","1-3-4":"Портал между мирами","2-3-5":"Усилитель реальности","4-3-7":"Архитектор реальности","6-2-8":"Танец красоты","1-7-8":"Путеводная звезда","1-1-2":"Абсолютное внимание","2-5-7":"Дыхание жизни","2-1-3":"Внутренняя вера","6-7-4":"Крылья ангела","3-8-2":"Вершина власти","3-4-7":"Архитектор единства","4-7-2":"Нить времени","4-6-1":"Внутренний вулкан","7-7-5":"Квинтэссенция жизни","1-4-5":"Алхимическая лаборатория","2-2-4":"Белый огонь","5-3-8":"Золотая спираль","1-6-7":"Змей времени","3-6-9":"Река жизни","3-7-1":"Родник силы","3-5-8":"Программист реальности","1-5-6":"Рог изобилия","2-8-1":"Гармонизатор границ","3-1-4":"Огненный щит","8-2-1":"Голос природы","4-4-8":"Театральная маска","1-2-3":"Ось мира","5-1-6":"Магнит событий","7-6-4":"Цунами вдохновения","6-1-7":"Манна небесная","7-5-3":"Хирург реальности","5-7-3":"Инкубатор реальностей","8-3-2":"Вершина мира","7-1-8":"Туннель реальности","5-4-9":"Древо миров","5-2-7":"Картограф сновидений","6-6-3":"Портал любви","8-8-7":"Выдох вселенной","7-3-1":"Место силы","1-8-9":"Осознанный выбор","3-2-5":"Ядерная радость","4-1-5":"Целительный удар","7-4-2":"Живая нить рода","8-1-9":"Живой алгоритм","5-8-4":"Духовное рождение","6-4-1":"Внутреннее солнце","8-5-4":"Семя","4-8-3":"Атланты","2-6-8":"Расширенное сознание","5-6-2":"Шут","8-7-6":"Сфера покоя","7-8-6":"Конструктор аватара","5-5-1":"Храм души","7-2-9":"Ветер перемен","6-3-9":"Фрактальное зеркало","2-4-6":"Первооткрыватель","6-8-5":"Трон воли","3-3-6":"Колесо сансары","6-5-2":"Дракон порядка","2-7-9":"Священный момент","4-5-9":"Танец жизни","4-2-6":"Фантазия"};

const SECTIONS = [
  { id: 'essence',       icon: '🌟', title: 'Кто этот ребёнок',             desc: 'Суть дара глазами родителя' },
  { id: 'patterns',      icon: '👀', title: 'Как вы узнаете его дар',        desc: 'Паттерны поведения по возрасту' },
  { id: 'capricious',    icon: '🎭', title: 'Что принимают за капризы',      desc: 'Почему это проявление дара' },
  { id: 'light_shadow',  icon: '🔥', title: 'Свет и тень дара',             desc: 'Когда дар раскрывается и когда закрывается' },
  { id: 'help',          icon: '💝', title: 'Как помочь раскрыться',         desc: 'Что говорить, чего не говорить, игры' },
  { id: 'education',     icon: '🎓', title: 'Образование и развитие',       desc: 'Какие занятия подходят' },
  { id: 'attention',     icon: '⚠️', title: 'Особое внимание',              desc: 'Критические периоды' },
  { id: 'genius',        icon: '🌱', title: 'Путь к гениальности',          desc: 'Главный путь раскрытия' },
];

function getAgePeriod(ageYears) {
  if (ageYears < 1)  return { period: '0-1 год',     label: 'младенчество', desc: 'Первый год жизни. Дар проявляется в темпераменте, реакциях на мир, ритме сна и бодрствования. Родители уже сейчас могут заметить первые признаки.' };
  if (ageYears < 3)  return { period: '1-3 года',     label: 'ранний возраст', desc: 'Первые осознанные проявления дара. Игры "говорят" про этот дар. Истерики и упрямство как проявление силы. Критически важно не задавить дар.' };
  if (ageYears < 6)  return { period: '3-6 лет',      label: 'дошкольный возраст', desc: 'Формирование характера через дар. Социализация: как ребёнок взаимодействует с другими детьми. Подготовка к школе с учётом дара.' };
  if (ageYears < 10) return { period: '6-10 лет',     label: 'младший школьный', desc: 'Дар в учёбе: какие предметы откликаются. Конфликты в школе как проявление дара. Первые увлечения, которые могут стать пожизненными.' };
  if (ageYears < 14) return { period: '10-14 лет',    label: 'предподростковый', desc: 'Кризис и трансформация дара. Поиск себя. Тени начинают проявляться ярче. Поддержка без давления.' };
  if (ageYears < 18) return { period: '14-18 лет',    label: 'подростковый', desc: 'Зрелое проявление дара. Профориентация. Отношения с противоположным полом через призму дара. Сепарация от родителей.' };
  return                     { period: '18+ лет',      label: 'молодой взрослый', desc: 'Дар ведёт к профессии и партнёрству. Когда родителю "отпустить" свою роль.' };
}

function calcAge(birthDateStr) {
  try {
    let d, m, y;
    const s = String(birthDateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      [y, m, d] = s.split('-').map(Number);
    } else {
      const parts = s.replace(/[\/\-\\]/g, '.').split('.');
      [d, m, y] = parts.map(Number);
    }
    const birth = new Date(y, m - 1, d);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
    return Math.max(0, age);
  } catch (e) { return 5; }
}

function getFieldForDar(darCode) {
  const kun = parseInt(darCode.split('-')[2], 10);
  return FIELDS_BY_ID[kun] || FIELDS_BY_ID[1];
}

function buildPrompt(child, section, darData, field, agePeriod) {
  const darName = DARS_DB[child.dar_code] || child.dar_code;
  const archetype = DAR_ARCHETYPES[child.dar_code] || '';
  const genderWord = child.gender === 'male' ? 'мальчик' : child.gender === 'female' ? 'девочка' : 'ребёнок';
  const genderPron = child.gender === 'male' ? 'он' : child.gender === 'female' ? 'она' : 'ребёнок';

  const truncate = (s, n) => {
    if (!s) return '';
    return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '...';
  };

  const sectionPrompts = {
    essence: `Напиши тёплый текст 4-6 абзацев о том, КТО этот ребёнок с точки зрения его дара.
Опиши суть его внутренней природы так, чтобы родитель прочитал и сказал "да, это точно мой ребёнок!".
Покажи уникальность этого дара через конкретные, узнаваемые черты характера и поведения ${genderWord} в ${agePeriod.period}.`,

    patterns: `Напиши конкретный, практичный текст 5-7 абзацев о том, КАК РОДИТЕЛЬ УЗНАЕТ дар этого ребёнка.
Опиши конкретные паттерны поведения ${child.name} в ${agePeriod.period} (${agePeriod.label}):
- Что ${genderPron} делает, когда никто не смотрит?
- Какие игры и занятия выбирает сам(а)?
- Как реагирует на новое, на стресс, на скуку?
- Что говорит/делает такого, что удивляет взрослых?
Давай бытовые примеры: "Вы замечаете, что ${child.name}..."`,

    capricious: `Напиши ОЧЕНЬ важный текст 5-7 абзацев о том, ЧТО РОДИТЕЛИ ЧАСТО ПРИНИМАЮТ ЗА КАПРИЗЫ,
но на самом деле это проявление дара ${child.name}.
Конкретные ситуации в ${agePeriod.period}:
- Какие "проблемные" поведения на самом деле дар в действии?
- Почему ${genderPron} не слушается / упрямится / плачет — с точки зрения дара?
- Что стоит ЗА поведением, которое раздражает?
Тон: "Вы не плохие родители, и ${child.name} не капризничает. Просто ${genderPron} так проявляет свою силу".`,

    light_shadow: `Напиши текст 5-7 абзацев о СВЕТЛЫХ И ТЁМНЫХ проявлениях дара ${child.name} в ${agePeriod.period}.
СВЕТЛЫЕ — когда дар раскрывается:
- Как выглядит ${child.name} "в потоке"? Что ${genderPron} делает блестяще?
- Какие моменты дают понять "вот оно, ${genderPron} в своей стихии"?
ТЁМНЫЕ — когда дар подавляется или непонят:
- Что происходит когда дар закрывается? Какие симптомы?
- Как ${child.name} "ломается" когда его/её природу не видят?
Без обвинений. Нейтрально и с любовью.`,

    help: `Напиши КОНКРЕТНЫЙ, ПРАКТИЧНЫЙ текст 6-8 абзацев о том, КАК ПОМОЧЬ ${child.name} РАСКРЫТЬСЯ в ${agePeriod.period}.
Структура:
- Что ГОВОРИТЬ (конкретные фразы, слова поддержки)
- Чего НЕ говорить (фразы которые закрывают дар)
- Какие ИГРЫ и АКТИВНОСТИ помогают раскрыть дар
- Какая ОБСТАНОВКА дома нужна (тишина? хаос? свобода? структура?)
- Маленькая ПРАКТИКА для родителя на эту неделю
Каждый совет — конкретный, не абстрактный. Не "будьте внимательны", а "попробуйте сказать: ..."`,

    education: `Напиши текст 4-6 абзацев об ОБРАЗОВАНИИ И РАЗВИТИИ ${child.name} в ${agePeriod.period} через призму дара.
- Какие предметы / кружки / секции РАСКРОЮТ дар?
- Какие подходы к обучению подходят (визуальный? кинестетический? через игру?)
- Какие занятия ПРОТИВОПОКАЗАНЫ (могут подавить дар)?
- Как выбрать школу / садик / секцию с учётом дара?
- На что обращать внимание при выборе учителя/тренера?`,

    attention: `Напиши текст 4-6 абзацев о том, на что ОБРАТИТЬ ОСОБОЕ ВНИМАНИЕ родителям ${child.name} в ${agePeriod.period}.
- Критические периоды для этого дара в этом возрасте
- Сигналы SOS: когда нужно действовать (не паниковать, но внимательно слушать)
- Ошибки родителей, которые чаще всего совершают с этим даром
- Как "не перегнуть палку" (не давить, не игнорировать)
Тон: бережный, без запугивания. "Обратите внимание на..." а не "опасность!"`,

    genius: `Напиши вдохновляющий текст 4-6 абзацев о ПУТИ К ГЕНИАЛЬНОСТИ ${child.name}.
- Через что этот ребёнок становится гением (не IQ, а раскрытие своей уникальной силы)?
- Какие взрослые люди выросли из детей с этим даром? (образы, не имена)
- Что будет если дар полностью раскроется к 18-25 годам?
- Какую роль играет родитель на этом пути?
- Финальное послание родителю: "Ваш ребёнок — это..."
Тон: тёплый, вдохновляющий, дающий силы. Это последняя глава — она должна оставить свет.`
  };

  const sectionTask = sectionPrompts[section.id] || sectionPrompts.essence;

  return {
    system: `Ты пишешь главу из персональной "Книги Даров для Родителей" — уникальной книги, которая создаётся специально для конкретного ребёнка.

ДАННЫЕ РЕБЁНКА:
- Имя: ${child.name}
- Возраст: ${child.age} лет (${agePeriod.label}: ${agePeriod.period})
- Пол: ${genderWord}
- Дар: ${darName} (${child.dar_code})${archetype ? ' - "' + archetype + '"' : ''}

ВОЗРАСТНОЙ КОНТЕКСТ:
${agePeriod.desc}

ПОЛЕ ДАРА (${field.name}):
${truncate(field.essence, 300)}
Ключ гармонии: ${field.harmony_key || ''}

ОПИСАНИЕ ДАРА:
${truncate(darData.essence || '', 400)}
Светлая сила: ${truncate(darData.light_power || '', 300)}
Теневые аспекты: ${truncate(darData.shadow || '', 300)}

РАЗДЕЛ КНИГИ: ${section.icon} ${section.title}

ПРАВИЛА НАПИСАНИЯ:
1. Пиши как тёплая мудрая подруга, НЕ как учебник психологии.
2. ОБРАЩАЙСЯ ЛИЧНО на "ты": "твоя ${child.name}", "ты заметишь", "тебе важно". НИКОГДА: "дорогие родители", "вы заметите", "ваша". Только "ты/тебе/твой".
3. НЕ обвиняй ("ты делаешь не так" — ЗАПРЕЩЕНО).
4. Используй имя ${child.name} естественно (3-5 раз за текст).
5. Привязывай ВСЁ к возрасту ${agePeriod.period}.
6. Давай КОНКРЕТНЫЕ бытовые примеры (не абстрактные советы).
7. Гендерные формы по полу ребёнка: ${genderWord}, ${genderPron}.
8. Пиши на БЕЗУПРЕЧНОМ русском языке. Не используй длинное тире. Склоняй имена правильно (про Ангелину, для Михаила).
9. НЕ упоминай код дара, поля, формулы, МА/ЖИ/КУН.
10. НЕ используй слова "дар" в духовном смысле. Говори "природа", "сила", "суперспособность".
11. Каждый абзац должен нести ЦЕННОСТЬ. НЕ используй вводные фразы без смысла ("Вы заметите, что...", "Стоит отметить...", "Важно понимать, что..."). Начинай сразу с сути.
12. НЕ начинай с приветствий ("Дорогие родители", "Дорогой читатель"). Начинай СРАЗУ с содержания.`,

    user: sectionTask
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

    const user = await getOrCreateUser(tgUser);
    const db = getSupabase();
    const { action, relative_id, section_id } = req.body || {};

    if (action === 'get_toc') {
      if (!relative_id) return res.status(400).json({ error: 'relative_id required' });

      const { data: child } = await db
        .from('user_relatives')
        .select('*')
        .eq('id', relative_id)
        .eq('user_id', user.id)
        .single();

      if (!child) return res.status(404).json({ error: 'Ребёнок не найден' });

      let generated = [];
      try {
        const { data } = await db
          .from('child_book_sections')
          .select('section_id, generated_at')
          .eq('relative_id', relative_id);
        generated = (data || []).map(s => s.section_id);
      } catch (e) {}

      const age = calcAge(child.birth_date);
      const agePeriod = getAgePeriod(age);
      const darName = DARS_DB[child.dar_code] || child.dar_code;
      const archetype = DAR_ARCHETYPES[child.dar_code] || '';

      return res.json({
        child: {
          name: child.name,
          age,
          gender: child.gender,
          dar_code: child.dar_code,
          dar_name: darName,
          archetype,
          age_period: agePeriod
        },
        sections: SECTIONS.map(s => ({
          ...s,
          generated: generated.includes(s.id)
        }))
      });
    }

    if (action === 'get_section' || action === 'regenerate') {
      if (!relative_id || !section_id) {
        return res.status(400).json({ error: 'relative_id и section_id обязательны' });
      }

      const section = SECTIONS.find(s => s.id === section_id);
      if (!section) return res.status(400).json({ error: 'Неизвестный раздел: ' + section_id });

      const { data: child } = await db
        .from('user_relatives')
        .select('*')
        .eq('id', relative_id)
        .eq('user_id', user.id)
        .single();

      if (!child) return res.status(404).json({ error: 'Ребёнок не найден' });

      const age = calcAge(child.birth_date);
      child.age = age;

      if (action !== 'regenerate') {
        try {
          const { data: cached } = await db
            .from('child_book_sections')
            .select('content, generated_at, child_age_years')
            .eq('relative_id', relative_id)
            .eq('section_id', section_id)
            .single();

          if (cached && cached.content) {
            console.log('[child-book] cache HIT:', child.name, section_id);
            return res.json({
              section_id,
              content: cached.content,
              cached: true,
              generated_at: cached.generated_at
            });
          }
        } catch (e) {}
      }

      const darData = darContent[child.dar_code] || {};
      const field = getFieldForDar(child.dar_code);
      const agePeriod = getAgePeriod(age);
      const prompt = buildPrompt(child, section, darData, field, agePeriod);

      console.log('[child-book] generating:', child.name, section_id, 'age:', age, 'dar:', child.dar_code);

      const useDeepSeek = deepseek.isDeepSeekEnabled('coach') && deepseek.isDeepSeekConfigured();
      let completion;

      try {
        if (useDeepSeek) {
          completion = await deepseek.chatCompletion({
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user }
            ],
            model: 'deepseek-chat',
            temperature: 0.8,
            max_tokens: 1500
          });
        } else {
          const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
          completion = await groq.chat.completions.create({
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.8,
            max_tokens: 1500
          });
        }
      } catch (aiErr) {
        console.error('[child-book] AI generation failed:', aiErr.message);
        return res.status(500).json({ error: 'Не удалось создать главу. Попробуй позже.' });
      }

      let content = completion.choices[0]?.message?.content || '';
      content = content
        .replace(/\u2014/g, '-')
        .replace(/\u2013/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u00A0/g, ' ')
        .trim();

      const htmlContent = content
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(Boolean)
        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('\n');

      try {
        await db.from('child_book_sections').upsert({
          relative_id,
          section_id,
          content: htmlContent,
          dar_code: child.dar_code,
          child_age_years: age
        }, {
          onConflict: 'relative_id,section_id'
        });
        console.log('[child-book] cached:', child.name, section_id);
      } catch (cacheErr) {
        console.warn('[child-book] cache save failed:', cacheErr.message);
      }

      return res.json({
        section_id,
        content: htmlContent,
        cached: false,
        generated_at: new Date().toISOString()
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[child-book] Error:', e.message);
    return res.status(500).json({ error: 'Не удалось создать главу. Попробуй позже.' });
  }
};
