/**
 * API для расчёта совместимости двух людей по их дарам
 *
 * POST /api/compatibility
 *   body: { dar_code_1, dar_code_2, name_1?, name_2?, relationship? }
 *
 * Генерирует через DeepSeek персональный анализ совместимости:
 * - Общий % совместимости
 * - Гармония (где дары усиливают друг друга)
 * - Точки напряжения
 * - Советы по взаимодействию
 * - Секрет пары (уникальная суперсила вместе)
 *
 * Кэширует результат в localStorage на клиенте (пара дар1+дар2).
 */

const deepseek = require('./lib/deepseek');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

let darContent = {};
try {
  darContent = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dar-content.json'), 'utf8'));
} catch (e) {}

const fieldsData = require('../fields.json');
const FIELDS_BY_ID = {};
(fieldsData.fields || []).forEach(f => { FIELDS_BY_ID[f.id] = f; });
const DARS_DB = {};
fieldsData.dars.forEach(d => { DARS_DB[d.code] = d.name; });

const DAR_ARCHETYPES = {"8-6-5":"Первородное солнце","8-4-3":"Купол любви","1-3-4":"Портал между мирами","2-3-5":"Усилитель реальности","4-3-7":"Архитектор реальности","6-2-8":"Танец красоты","1-7-8":"Путеводная звезда","1-1-2":"Абсолютное внимание","2-5-7":"Дыхание жизни","2-1-3":"Внутренняя вера","6-7-4":"Крылья ангела","3-8-2":"Вершина власти","3-4-7":"Архитектор единства","4-7-2":"Нить времени","4-6-1":"Внутренний вулкан","7-7-5":"Квинтэссенция жизни","1-4-5":"Алхимическая лаборатория","2-2-4":"Белый огонь","5-3-8":"Золотая спираль","1-6-7":"Змей времени","3-6-9":"Река жизни","3-7-1":"Родник силы","3-5-8":"Программист реальности","1-5-6":"Рог изобилия","2-8-1":"Гармонизатор границ","3-1-4":"Огненный щит","8-2-1":"Голос природы","4-4-8":"Театральная маска","1-2-3":"Ось мира","5-1-6":"Магнит событий","7-6-4":"Цунами вдохновения","6-1-7":"Манна небесная","7-5-3":"Хирург реальности","5-7-3":"Инкубатор реальностей","8-3-2":"Вершина мира","7-1-8":"Туннель реальности","5-4-9":"Древо миров","5-2-7":"Картограф сновидений","6-6-3":"Портал любви","8-8-7":"Выдох вселенной","7-3-1":"Место силы","1-8-9":"Осознанный выбор","3-2-5":"Ядерная радость","4-1-5":"Целительный удар","7-4-2":"Живая нить рода","8-1-9":"Живой алгоритм","5-8-4":"Духовное рождение","6-4-1":"Внутреннее солнце","8-5-4":"Семя","4-8-3":"Атланты","2-6-8":"Расширенное сознание","5-6-2":"Шут","8-7-6":"Сфера покоя","7-8-6":"Конструктор аватара","5-5-1":"Храм души","7-2-9":"Ветер перемен","6-3-9":"Фрактальное зеркало","2-4-6":"Первооткрыватель","6-8-5":"Трон воли","3-3-6":"Колесо сансары","6-5-2":"Дракон порядка","2-7-9":"Священный момент","4-5-9":"Танец жизни","4-2-6":"Фантазия"};

function getFieldForDar(code) {
  const kun = parseInt(code.split('-')[2], 10);
  return FIELDS_BY_ID[kun] || FIELDS_BY_ID[1];
}

function truncate(s, n) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '...';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { dar_code_1, dar_code_2, name_1, name_2, relationship } = req.body || {};

    if (!dar_code_1 || !dar_code_2) {
      return res.status(400).json({ error: 'dar_code_1 и dar_code_2 обязательны' });
    }

    const dar1 = darContent[dar_code_1] || {};
    const dar2 = darContent[dar_code_2] || {};
    const name1 = DARS_DB[dar_code_1] || dar_code_1;
    const name2 = DARS_DB[dar_code_2] || dar_code_2;
    const arch1 = DAR_ARCHETYPES[dar_code_1] || '';
    const arch2 = DAR_ARCHETYPES[dar_code_2] || '';
    const field1 = getFieldForDar(dar_code_1);
    const field2 = getFieldForDar(dar_code_2);

    const relLabel = relationship || 'партнёры';
    const personName1 = name_1 || 'Первый человек';
    const personName2 = name_2 || 'Второй человек';

    const systemPrompt = `Ты эксперт по совместимости людей через систему 64 Даров.
Тебе даны два дара двух людей. Проанализируй их совместимость.

ЧЕЛОВЕК 1: ${personName1}
Дар: ${name1} (${dar_code_1})${arch1 ? ' - "' + arch1 + '"' : ''}
Поле: ${field1.name} (${field1.element})
Суть: ${truncate(dar1.essence || field1.essence, 300)}
Светлая сила: ${truncate(dar1.light_power || '', 200)}
Тень: ${truncate(dar1.shadow || '', 200)}

ЧЕЛОВЕК 2: ${personName2}
Дар: ${name2} (${dar_code_2})${arch2 ? ' - "' + arch2 + '"' : ''}
Поле: ${field2.name} (${field2.element})
Суть: ${truncate(dar2.essence || field2.essence, 300)}
Светлая сила: ${truncate(dar2.light_power || '', 200)}
Тень: ${truncate(dar2.shadow || '', 200)}

Отношения: ${relLabel}

ПРАВИЛА:
1. Пиши на безупречном русском языке.
2. Не используй длинное тире, только обычный дефис.
3. Не упоминай коды даров, поля, МА/ЖИ/КУН.
4. Говори тепло и конструктивно. Даже о напряжениях — с любовью.
5. Используй имена ${personName1} и ${personName2} естественно.
6. Не используй слово "дар" в духовном смысле, говори "природа", "сила", "суть".

ФОРМАТ ОТВЕТА — строго JSON:
{
  "score": число от 60 до 98 (общая совместимость в %),
  "harmony": "3-4 предложения о том ГДЕ эти два человека усиливают друг друга",
  "tension": "2-3 предложения о возможных точках напряжения (без драмы, конструктивно)",
  "advice": "3-4 конкретных совета как этой паре быть вместе счастливее",
  "secret": "1-2 предложения — уникальная суперсила этой пары, чего они могут достичь ВМЕСТЕ"
}`;

    const userPrompt = `Проанализируй совместимость ${personName1} (${name1}) и ${personName2} (${name2}). Они ${relLabel}. Верни ТОЛЬКО валидный JSON.`;

    const useDeepSeek = deepseek.isDeepSeekEnabled('coach') && deepseek.isDeepSeekConfigured();
    let completion;

    try {
      if (useDeepSeek) {
        completion = await deepseek.chatCompletion({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          model: 'deepseek-chat',
          temperature: 0.8,
          max_tokens: 800
        });
      } else {
        const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
        completion = await groq.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.8,
          max_tokens: 800
        });
      }
    } catch (aiErr) {
      console.error('[compatibility] AI error:', aiErr.message);
      return res.status(500).json({ error: 'Не удалось создать анализ. Попробуй позже.' });
    }

    const raw = completion.choices[0]?.message?.content || '';
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');

    let parsed;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch (e) {
      console.error('[compatibility] JSON parse error:', e.message);
      parsed = {
        score: 75,
        harmony: 'Эти два человека дополняют друг друга своими уникальными силами.',
        tension: 'Как и в любых отношениях, могут возникать моменты непонимания.',
        advice: 'Открыто общайтесь, уважайте различия, находите общие цели.',
        secret: 'Вместе вы способны на то, что невозможно поодиночке.'
      };
    }

    // Чистка
    const clean = (s) => String(s || '').replace(/\u2014/g, '-').replace(/\u2013/g, '-').replace(/\u2026/g, '...').trim();

    return res.status(200).json({
      dar_code_1,
      dar_code_2,
      dar_name_1: name1,
      dar_name_2: name2,
      archetype_1: arch1,
      archetype_2: arch2,
      score: Math.min(98, Math.max(60, parseInt(parsed.score) || 75)),
      harmony: clean(parsed.harmony),
      tension: clean(parsed.tension),
      advice: clean(parsed.advice),
      secret: clean(parsed.secret)
    });
  } catch (e) {
    console.error('[compatibility] Error:', e.message);
    return res.status(500).json({ error: 'Ошибка. Попробуй позже.' });
  }
};
