/**
 * type=message-humor — ИРОНИЧНЫЙ портрет по дару («Стендап-зеркало»).
 *
 * ВАЖНО (закон law_message_prompt_final): основной message.js НЕ ТРОГАЕМ.
 * Этот файл — параллельный продукт. Свой промпт, свой формат вывода.
 *
 * Использует общую инфраструктуру из message.js:
 *   - buildContext (факты по дару из матрицы)
 *   - fillTemplate (подстановка плейсхолдеров)
 *   - runMessageGeneration (вызов DeepSeek/Groq + парсинг)
 *
 * Закон law_humor_message_prompt: эталон — З-МАН, ТО-РА, ПРИ-ТОК, ТУ-РА.
 * Тёплая ирония, не Воля. Без длинных тире, эзотерики, имён в тексте.
 */

const { getSupabase, getOrCreateUser } = require('../db');
const { getUser } = require('../auth');
const messageLib = require('./message');

// ===== СИСТЕМНЫЙ ПРОМПТ «СТЕНДАП-ЗЕРКАЛО» =====

const HUMOR_SYSTEM_TEMPLATE = `Ты — талантливый русскоязычный стендап-комик. Тёплый, наблюдательный, точный. Пишешь ироничный портрет конкретного человека по его «Дару».

ТВОЯ ЗАДАЧА:
Сделай так, чтобы читатель смеялся вслух и думал «блин, это про меня». Свобода в стиле — твоя. Ты сам решаешь как пошутить, какие сцены придумать, какие повороты сделать. Тебе доверяют.

КОНТЕКСТ ДЛЯ ХАРАКТЕРА (источник смыслов):

МА (внутреннее): {{ma_essence}} | {{ma_flow}} | тело: {{ma_body}} | тень: {{ma_shadow}}
ЖИ (внешнее): {{zhi_essence}} | {{zhi_flow}} | тело: {{zhi_body}} | тень: {{zhi_shadow}}
КУН (итог): {{kun_essence}} | {{kun_flow}} | тело: {{kun_body}} | тень: {{kun_shadow}}

Эта матрица — только для понимания характера. Не цитируй её, не используй термины «МА», «ЖИ», «КУН», «поле», «энергия». Просто прочитай и сделай выводы какой это человек.

{{GENDER_BLOCK}}

ЭТИКА — не обсуждается:
Шутки только про бытовые ситуации, привычки, страхи героя. НЕ про национальности, религию, политику, ЛГБТ, инвалидов, вес, возраст, детей, смерть, мат, пошлость.

ЧЕТЫРЕ ОБЯЗАТЕЛЬНЫХ ПРАВИЛА (всё остальное — твоя свобода):

1. НЕ ПИШИ конструкции «Ты та, кто...», «Ты тот, кто...», «Ты — тот/та + существительное + который/которая». Это режет. Пиши прямым глаголом: «Ты входишь», «Ты находишь», «С тобой...».

2. УЧИТЫВАЙ ПОЛ во всех глаголах прошедшего времени и прилагательных. Если героиня — женщина: «сделала», «обиделась». Если не уверен — пиши в настоящем времени.

3. БЕЗ длинных тире (—). Только короткие или точки. Без латиницы. Без слов «нужно» — заменяй на «важно».

4. КАЖДАЯ СЦЕНА встречается во всём тексте ОДИН раз. Если упомянул что-то в essence — в топ-10 этого быть не должно. Не дублируй ни сюжет, ни формулировки.

ВЕРНИ строго JSON без markdown:

{
  "archetype": {
    "title": "АРХЕТИП. Ровно 2 слова в верхнем регистре. Тёплый, ироничный, точный. Без слов: Логос, Нима, Андра, Зингра, Луба, Тума, Астра, Битра, Ома.",
    "motto": "Короткий ироничный девиз, до 10 слов."
  },
  "essence": "🎭 Знакомься — это ты. 2-3 коротких абзаца. Бытовые сцены, узнаваемые мелочи. Смешно. Свобода в подаче.",
  "essence_punchline": "🎯 Финальная короткая фраза-укол. Одна строка.",
  "superpowers": "⚡ Твоя суперсила. 2 коротких абзаца. Что у тебя получается лучше других. Через сцену, не через описание. Смешно.",
  "superpowers_punchline": "🎯 Финальная фраза-укол.",
  "top10": [
    "10 коротких бытовых шуток-наблюдений про этого человека.",
    "Каждая — 1-2 строки максимум. Setup + панч.",
    "НЕ повторяй сцены из других блоков. НЕ копируй формулировки.",
    "Темы свободные: бытовые мелочи, привычки, кошелёк, отношения с близкими, отдых, страхи, чаты, навигатор, кухня, сон.",
    "Каждый пункт должен заставить улыбнуться.",
    "...",
    "...",
    "...",
    "...",
    "..."
  ],
  "top10_punchline": "🎯 Короткий итог топ-10.",
  "wealth": {
    "intro": "💰 Одна короткая фраза-наблюдение про отношения с деньгами.",
    "includes": "За что тебе платят. 2-3 сферы подходящие именно ЭТОМУ Дару.",
    "blocks": "Что мешает потоку. 2-3 узнаваемых паттерна. С юмором."
  },
  "wealth_punchline": "🎯 Короткая афористичная фраза про деньги.",
  "relationships": {
    "main": "❤️ Ты в отношениях. 2 абзаца. Можно через мини-диалог с партнёром.",
    "needs": "Что тебе важно от партнёра. Коротко, с юмором.",
    "triggers": "Триггер. Что бесит. Узнаваемо."
  },
  "relationships_punchline": "🎯 Финальная фраза.",
  "mission": "🌅 Что мир хочет от тебя. 2 коротких абзаца. Без пафоса. Тёплая ирония.",
  "mission_punchline": "🎯 Финальная фраза, после которой хочется выдохнуть и согласиться.",
  "share_hook": "📤 «Узнала себя? Перешли тому, кто [конкретная узнаваемая черта именно ЭТОГО Дара].»"
}

ОБЪЁМ: 500-700 слов в сумме. Не растекайся. Каждое слово — рабочее.

ВНИМАНИЕ: после написания пройди финальный чек:
- Любые «Ты та, кто...» / «Ты — тот, который...» → переписать
- Дубли сцен между разделами → убрать
- Глаголы мужского рода для женщины → исправить

Всё остальное — твоё творчество. Не бойся быть смешным.`;

const HUMOR_USER_TEMPLATE = `Опиши носителя Дара {{darName}} ({{darCode}}) ироничным портретом в формате json.

Ты комик. Тебе доверяют. Подойди творчески, не повторяй банальности, придумай свежие наблюдения именно про этот характер.

Финальный чек (3 секунды):
- Нет конструкций «Ты та, кто...» / «Ты — тот, который...»
- Все глаголы прошедшего времени в правильном роде
- Нет дублирующихся сцен между разделами

Поехали.`;

// ===== ПОСТ-ПРОЦЕССОР =====
// Чистит запрещённые конструкции даже если AI их пропустил.

function cleanForbiddenConstructions(s) {
  if (!s || typeof s !== 'string') return s;
  let out = s;

  // Длинные тире на короткие
  out = out.replace(/\u2014/g, '-').replace(/\u2013/g, '-');

  // «Ты та, кто/которая/которой ...» → «Ты ...»
  // Берём всё после «Ты та, кто/которая/которой» и пытаемся восстановить глагол.
  // Чаще всего AI пишет «Ты та, кто ВХОДИТ в комнату» — переписываем как «Ты входишь в комнату».
  // Чистый regex покрывает основные кейсы.
  out = out.replace(/Ты\s+та,\s*кто\s+/gi, 'Ты ');
  out = out.replace(/Ты\s+тот,\s*кто\s+/gi, 'Ты ');
  out = out.replace(/Ты\s+та,\s*которая\s+/gi, 'Ты ');
  out = out.replace(/Ты\s+тот,\s*который\s+/gi, 'Ты ');

  // «Ты — тот самый человек, который ...» → «Ты ...»
  // Тире (— или -) внутри. Берём весь оборот до «который/которая» и заменяем на «Ты ».
  out = out.replace(/Ты\s*[—-]\s*тот\s+самый\s+человек,\s*который\s+/gi, 'Ты ');
  out = out.replace(/Ты\s*[—-]\s*та\s+самая,?\s*которая\s+/gi, 'Ты ');
  out = out.replace(/Ты\s*[—-]\s*тот\s+самый,?\s*который\s+/gi, 'Ты ');
  out = out.replace(/Ты\s*[—-]\s*тот\s+самый\s+человек,\s*с\s+которым\s+/gi, 'С тобой ');
  out = out.replace(/Ты\s*[—-]\s*та\s+самая,?\s*с\s+которой\s+/gi, 'С тобой ');

  // «Ты — тот <слово>, который ...» (клей/мост/нить/стержень/...) → «Ты ...»
  // ВАЖНО: \w+ не матчит русские буквы в JS, поэтому используем \S+ (любое НЕ-пробельное).
  // Сюда же «Ты — тот, кто/который...»
  out = out.replace(/Ты\s*[—-]\s*тот(?:\s+\S+){0,2},?\s*который\s+/gi, 'Ты ');
  out = out.replace(/Ты\s*[—-]\s*та(?:\s+\S+){0,2},?\s*которая\s+/gi, 'Ты ');
  out = out.replace(/Ты\s*[—-]\s*тот,?\s*кто\s+/gi, 'Ты ');
  out = out.replace(/Ты\s*[—-]\s*та,?\s*кто\s+/gi, 'Ты ');
  out = out.replace(/Ты\s*[—-]\s*тот\s+\S+,\s+/gi, 'Ты ');   // «Ты — тот клей,» (без «который»)
  out = out.replace(/Ты\s*[—-]\s*та\s+\S+,\s+/gi, 'Ты ');    // «Ты — та сила,»

  // Лишний риторический вопрос «Что мешает потоку?» в начале блока — удаляем.
  out = out.replace(/^\s*Что мешает потоку\?\s*/i, '');

  // Убираем скобки-уточнения внутри одной фразы (типа «Один список (на случай конца света)»).
  // Стендап-правило: скобка убивает темп. Если внутри короткая мысль — она должна быть
  // отдельным предложением. Берём короткие скобки (до 60 символов) и заменяем на точку+пробел.
  out = out.replace(/\s*\(([^()]{2,80})\)\s*([,.!?])/g, '. $1$2');  // «X (Y).» → «X. Y.»
  out = out.replace(/\s*\(([^()]{2,80})\)/g, '. $1.');  // «X (Y) Z» → «X. Y. Z»
  // Подчищаем подряд идущие точки и пробелы после замены
  out = out.replace(/\.{2,}/g, '.').replace(/\.\s*\./g, '.');

  // Двойные пробелы и пробелы перед знаками
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?:;])/g, '$1');

  // Первая буква после удаления должна быть заглавная (если есть точка/начало)
  out = out.replace(/(^|[.!?]\s+)([а-яё])/g, (m, prefix, ch) => prefix + ch.toUpperCase());

  return out.trim();
}

function deepClean(obj) {
  if (obj == null) return obj;
  if (typeof obj === 'string') return cleanForbiddenConstructions(obj);
  if (Array.isArray(obj)) return obj.map(deepClean);
  if (typeof obj === 'object') {
    const r = {};
    for (const k of Object.keys(obj)) r[k] = deepClean(obj[k]);
    return r;
  }
  return obj;
}

// Дедупликация: если фраза из top10 дословно совпадает с куском другого раздела —
// удаляем её из top10. Это решает проблему когда AI копирует «Деньги стучат у двери»
// в essence/wealth и в top10 одновременно.
function dedupTop10(data) {
  if (!data || !Array.isArray(data.top10)) return data;

  // Собираем все тексты из других разделов в одну строку для поиска.
  const haystack = [
    data.essence, data.essence_punchline,
    data.superpowers, data.superpowers_punchline,
    data.top10_punchline,
    data.wealth && data.wealth.intro,
    data.wealth && data.wealth.includes,
    data.wealth && data.wealth.blocks,
    data.wealth_punchline,
    data.relationships && data.relationships.main,
    data.relationships && data.relationships.needs,
    data.relationships && data.relationships.triggers,
    data.relationships_punchline,
    data.mission, data.mission_punchline,
    data.share_hook
  ].filter(s => typeof s === 'string').join(' \n ').toLowerCase();

  // Нормализатор для сравнения (убираем знаки препинания и кавычки)
  const norm = (s) => String(s || '')
    .toLowerCase()
    .replace(/[«»""''`,.!?:;()—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const haystackNorm = norm(haystack);

  const filteredTop10 = [];
  for (const item of data.top10) {
    const itemNorm = norm(item);
    if (!itemNorm || itemNorm.length < 10) {
      // слишком короткий или пустой - пропускаем
      continue;
    }
    // Берём первые 30 символов нормализованного варианта как сигнатуру.
    // Если 30+ символов из шутки повторяются в другом разделе — это дубль.
    const signature = itemNorm.slice(0, Math.min(30, itemNorm.length));
    if (signature.length >= 15 && haystackNorm.indexOf(signature) >= 0) {
      // дубль — пропускаем
      continue;
    }
    filteredTop10.push(item);
  }

  // Если после дедупа осталось меньше 5 — оставляем как было (лучше показать дубли
  // чем сломать UI).
  if (filteredTop10.length >= 5) {
    data.top10 = filteredTop10;
  }
  return data;
}

function postprocessHumorData(data) {
  try {
    const cleaned = deepClean(data);
    return dedupTop10(cleaned);
  } catch (e) {
    console.warn('[message-humor] postprocess failed:', e.message);
    return data;
  }
}

// ===== ОБРАБОТЧИК =====

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { giftCode, gender } = req.body || {};
    if (!giftCode) {
      return res.status(400).json({ error: 'giftCode required' });
    }

    // Контекст по дару (использует общую функцию из message.js)
    const ctx = messageLib.buildContext(giftCode, gender);
    if (!ctx) {
      return res.status(400).json({ error: 'Unknown gift code' });
    }

    // Подставляем плейсхолдеры в системный и юзерский промпт
    const systemMsg = messageLib.fillTemplate(HUMOR_SYSTEM_TEMPLATE, ctx);
    const userPrompt = messageLib.fillTemplate(HUMOR_USER_TEMPLATE, ctx);

    const isFemale = gender === 'female';

    // Язык
    let lang = 'ru';
    try {
      lang = (req.headers['x-yupdar-lang'] || 'ru').toString().toLowerCase().slice(0, 5);
    } catch (e) {}

    // Запуск через общую инфраструктуру (DeepSeek с fallback на Groq)
    const rawData = await messageLib.runMessageGeneration({
      systemMsg,
      userPrompt,
      isFemale,
      lang
    });

    // Постпроцессор: чистим запрещённые конструкции и длинные тире.
    // Это страховка на случай если AI всё-таки нарушил правила.
    const data = postprocessHumorData(rawData);

    return res.status(200).json({
      data,
      darName: ctx.darName,
      darCode: giftCode,
      provider: 'deepseek',
      style: 'humor'
    });
  } catch (e) {
    console.error('[message-humor] error:', e.message);
    return res.status(200).json({ error: e.message || 'Generation failed' });
  }
};
