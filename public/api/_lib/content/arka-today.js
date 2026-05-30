/**
 * type=arka-today — персональный «Сегодня» для АРКА.
 *
 * Возвращает JSON с двумя секциями под конкретный Дар:
 *   - power_windows: индивидуальные часы силы
 *   - main_message: главное послание дня
 *
 * Этап 1 адаптации АРКА (30.05.2026): убираем хардкод «З-МАН» и делаем
 * персональный контент для каждого юзера через AI.
 *
 * Использует общую инфраструктуру из message.js:
 *   - buildContext (факты по Дару из матрицы)
 *   - fillTemplate (подстановка плейсхолдеров)
 *   - runMessageGeneration (вызов DeepSeek/Groq + парсинг)
 */

const messageLib = require('./message');

// ===== СИСТЕМНЫЙ ПРОМПТ «АРКА — Сегодня» =====

const ARKA_TODAY_SYSTEM = `Ты — мудрый проводник системы «Дары». Пишешь персональный «Сегодня»
для носителя конкретного Дара. Тёплый тон, спокойный, без пафоса.
Никаких длинных тире (—) — только короткие или точки. На «ты».

ПАСПОРТ ДАРА:
МА (внутреннее): {{ma_essence}} | поток: {{ma_flow}} | тело: {{ma_body}} | тень: {{ma_shadow}}
ЖИ (внешнее): {{zhi_essence}} | поток: {{zhi_flow}} | тело: {{zhi_body}} | тень: {{zhi_shadow}}
КУН (итог): {{kun_essence}} | поток: {{kun_flow}} | тело: {{kun_body}} | тень: {{kun_shadow}}

ЗАПРЕТЫ:
- Не используй термины «МА», «ЖИ», «КУН», «поле», «энергия», «вибрация».
- Не пиши «Ты та, кто...», «Ты — тот самый человек, который...». Прямо: «Ты делаешь».
- Не упоминай З-МАН, ТУМА и другие конкретные названия — только характер этого Дара.
- Без эзотерики, без воды, конкретно и применимо.

{{GENDER_BLOCK}}

# ЗАДАЧА

Сгенерируй JSON с двумя секциями:
1. «Окна силы» — описание оптимальных временных слотов для этого Дара
2. «Ритуалы» — 3 коротких ритуала (утренний / дневной / вечерний) под характер этого Дара

«Послание дня» НЕ делай (есть в Оракуле, не дублируй).

{
  "power_windows": {
    "morning": "Текст про утреннее окно силы под этот Дар. 2-3 коротких предложения. С чем работать утром — что приходит легко, что важно успеть в начале дня. Конкретно, без 'почувствуй' и 'настройся'.",
    "midday": "Текст про дневной якорь под этот Дар. 2-3 предложения. Какие задачи делать в середине дня — рутина, перенос, организация.",
    "evening": "Текст про вечернее окно силы под этот Дар. 2-3 предложения. Что делать вечером — глубокая работа, итоги, ритуалы или отпускание.",
    "warning": "Одна короткая фраза-предостережение про распределение нагрузки именно для этого Дара. Пример формата: 'Не сваливай теневое в утро' или 'Не дроби фокус в первой половине дня'."
  },
  "rituals": {
    "dawn": {
      "title": "Название утреннего ритуала. 2-4 слова, точно под суть этого Дара. Пример: 'Утро архитектора' / 'Заземление потока' / 'Тишина перед движением'.",
      "time": "Время. Формат '5:30 — 7:30' или '6:00 — 8:00'. Под этот Дар выбери оптимальный диапазон.",
      "steps": [
        "Шаг 1. Конкретное действие 5-10 секунд. Не 'почувствуй', а 'встань босиком на пол'.",
        "Шаг 2. Конкретное действие. Связано с характером этого Дара.",
        "Шаг 3. Конкретное действие. Завершает утренний контур.",
        "Шаг 4. Опционально — финальный якорь."
      ]
    },
    "midday": {
      "title": "Название дневного якоря. 2-4 слова. Пример: 'Якорь систематизатора' / 'Возврат в поток'.",
      "time": "Время. Формат '12:00 — 14:00'.",
      "steps": [
        "Шаг 1.",
        "Шаг 2.",
        "Шаг 3."
      ]
    },
    "evening": {
      "title": "Название вечернего ритуала. 2-4 слова. Пример: 'Закрытие контуров' / 'Тихая инвентаризация'.",
      "time": "Время. Формат '21:00 — 22:30'.",
      "steps": [
        "Шаг 1.",
        "Шаг 2.",
        "Шаг 3.",
        "Шаг 4."
      ]
    }
  }
}

Только JSON, без markdown, без обёрток. Все шаги — простые бытовые действия, без эзотерики и масел (масла подбираются отдельно).`;

const ARKA_TODAY_USER = `Сгенерируй персональный «Сегодня» для носителя Дара {{darName}} ({{darCode}}).

Опирайся на паспорт Дара. Не упоминай З-МАН, ТУМА и другие конкретные имена. Пиши через характер.`;

// ===== ПОСТ-ПРОЦЕССОР (минимальный) =====

function _clean(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/Ты\s+та,\s*кто\s+/gi, 'Ты ')
    .replace(/Ты\s+тот,\s*кто\s+/gi, 'Ты ')
    .replace(/Ты\s*[—-]\s*тот\s+самый\s+человек,\s*который\s+/gi, 'Ты ')
    .replace(/Ты\s*[—-]\s*та\s+самая,?\s*которая\s+/gi, 'Ты ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function _deepClean(obj) {
  if (obj == null) return obj;
  if (typeof obj === 'string') return _clean(obj);
  if (Array.isArray(obj)) return obj.map(_deepClean);
  if (typeof obj === 'object') {
    const r = {};
    for (const k of Object.keys(obj)) r[k] = _deepClean(obj[k]);
    return r;
  }
  return obj;
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

    const ctx = messageLib.buildContext(giftCode, gender);
    if (!ctx) {
      return res.status(400).json({ error: 'Unknown gift code' });
    }

    const systemMsg = messageLib.fillTemplate(ARKA_TODAY_SYSTEM, ctx);
    const userPrompt = messageLib.fillTemplate(ARKA_TODAY_USER, ctx);
    const isFemale = gender === 'female';

    let lang = 'ru';
    try {
      lang = (req.headers['x-yupdar-lang'] || 'ru').toString().toLowerCase().slice(0, 5);
    } catch (e) {}

    const rawData = await messageLib.runMessageGeneration({
      systemMsg,
      userPrompt,
      isFemale,
      lang
    });

    const data = _deepClean(rawData);

    return res.status(200).json({
      data,
      darName: ctx.darName,
      darCode: giftCode,
      style: 'arka-today'
    });
  } catch (e) {
    console.error('[arka-today] error:', e.message);
    return res.status(200).json({ error: e.message || 'Generation failed' });
  }
};
