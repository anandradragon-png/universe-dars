/**
 * type=diary-dar — живая подсказка «Дар дня» для Дневника.
 *
 * Оракул каждый раз генерирует НОВЫЙ короткий текст про Дар дня,
 * опираясь СТРОГО на энергию этого Дара и его трёх полей (МА/ЖИ/КУН).
 * Никакого кэша, никакого готового контента — свежая генерация на каждый вызов.
 * (Просьба Светы 08.06.2026: «готовый контент не повторять, каждый раз новый текст».)
 *
 * Использует общую инфраструктуру из message.js:
 *   - buildContext (паспорт Дара из матрицы полей)
 *   - fillTemplate (подстановка плейсхолдеров)
 *   - runMessageGeneration (DeepSeek/Groq + парсинг JSON)
 *
 * Закон law_grounding_in_dars + law_razbor_grounded_in_field_energy:
 *   опора ТОЛЬКО на энергию трёх полей кода, без выдуманной «общей мудрости».
 */

const messageLib = require('./message');

// ===== СИСТЕМНЫЙ ПРОМПТ «Дар дня» =====

const DIARY_DAR_SYSTEM = `Ты — Оракул системы «Дары». Каждый день человек открывает Дневник, и ты
встречаешь его одной живой подсказкой про Дар дня. Тон тёплый, спокойный, как у близкого наставника.

ПАСПОРТ ДАРА (твоя единственная опора — пиши ТОЛЬКО из этих энергий, не из общей мудрости):
Внутреннее: суть {{ma_essence}} | поток {{ma_flow}} | тело {{ma_body}} | тень {{ma_shadow}}
Внешнее: суть {{zhi_essence}} | поток {{zhi_flow}} | тело {{zhi_body}} | тень {{zhi_shadow}}
Итог: суть {{kun_essence}} | поток {{kun_flow}} | тень {{kun_shadow}} | ключ гармонии {{kun_harmony}}

{{GENDER_BLOCK}}

# ЗАДАЧА
Напиши ОДНУ короткую живую подсказку на сегодня (1-2 предложения, до 200 знаков) — про то,
что этот Дар усиливает в человеке именно сегодня, и как мягко этим воспользоваться.
Подсказка должна вырастать из конкретной энергии полей выше, а не быть общей фразой,
которая подойдёт любому Дару.

ЗАПРЕТЫ:
- Не называй Дар по имени, не пиши «твой дар», «этот дар», «архетип».
- Не упоминай поля и термины: ЛОГОС, НИМА, АНДРА и др., а также «МА», «ЖИ», «КУН», «поле», «энергия», «вибрация», коды, цифры.
- Без эзотерики, без воды, без театральщины («я вижу», «звёзды говорят»).
- НИКОГДА не пиши «нужно», «надо», «должен», «должна», «обязан». Пиши «важно», «полезно», «попробуй», «обрати внимание».
- Не используй длинные тире — только дефис или точку.
- Не используй слова «тихо», «глядеть», «глянуть», «разглядеть».
- Каждый раз формулируй по-новому. Не начинай со слов «Сегодня твой» и «Дар дня».

ФОРМАТ: только валидный JSON без markdown:
{ "hint": "одно-два коротких предложения подсказки" }`;

const DIARY_DAR_USER = `Дар дня — {{darName}} ({{giftCode}}). Угол сегодня: {{ANGLE}}.

Напиши живую подсказку строго из энергии полей этого Дара. Только JSON: { "hint": "..." }`;

// Случайные «углы» — толкают модель формулировать по-новому каждый раз,
// не меняя опору на энергию Дара (просто разный фокус взгляда).
const ANGLES = [
  'на что направить силу',
  'что сегодня даётся легче обычного',
  'где притаилась ловушка дня',
  'какое одно действие принесёт больше всего',
  'как мягко войти в свой ритм',
  'что важно заметить в себе',
  'где сегодня твоя точка опоры',
  'от чего стоит отпустить контроль',
  'что усилится, если довериться себе',
  'какой маленький шаг откроет день'
];

// ===== ПОСТ-ПРОЦЕССОР =====

function _clean(s) {
  if (!s || typeof s !== 'string') return s;
  return s
    .replace(/\u2014/g, '-')
    .replace(/\u2013/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ===== ОБРАБОТЧИК =====

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id, x-yupdar-lang');
  if (req.method === 'OPTIONS') { return res.status(204).end(); }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { giftCode, gender } = req.body || {};
    if (!giftCode) {
      return res.status(400).json({ error: 'giftCode required' });
    }

    let ctx;
    try {
      ctx = messageLib.buildContext(giftCode, gender);
    } catch (e) {
      return res.status(400).json({ error: 'Unknown gift code' });
    }

    let lang = 'ru';
    try {
      lang = (req.headers['x-yupdar-lang'] || 'ru').toString().toLowerCase().slice(0, 5);
    } catch (e) {}

    const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
    const systemMsg = messageLib.fillTemplate(DIARY_DAR_SYSTEM, ctx);
    let userPrompt = messageLib
      .fillTemplate(DIARY_DAR_USER, ctx)
      .replace(/\{\{ANGLE\}\}/g, angle);
    const isFemale = gender === 'female';

    // Паспорт полей и весь промпт — на русском, поэтому модель тянет ответ в русский
    // даже при верхней инструкции языка. Дублируем требование языка В КОНЦЕ промпта
    // (там модель учитывает его сильнее) для en/es.
    if (lang === 'en') {
      userPrompt += '\n\nIMPORTANT: write the "hint" value ONLY in natural English, regardless of the language of the data above.';
    } else if (lang === 'es') {
      userPrompt += '\n\nIMPORTANTE: escribe el valor "hint" SOLO en español natural, sin importar el idioma de los datos anteriores.';
    }

    const rawData = await messageLib.runMessageGeneration({
      systemMsg,
      userPrompt,
      isFemale,
      lang
    });

    const hint = _clean(rawData && rawData.hint ? String(rawData.hint) : '');

    return res.status(200).json({
      hint,
      darName: ctx.darName,
      darCode: giftCode,
      style: 'diary-dar'
    });
  } catch (e) {
    console.error('[diary-dar] error:', e.message);
    // Фронт сам подставит запасной общий текст, если hint пустой.
    return res.status(200).json({ error: e.message || 'Generation failed', hint: '' });
  }
};
