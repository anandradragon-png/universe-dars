/**
 * Определение языка пользователя для AI-генерации.
 *
 * Источники в порядке приоритета:
 *  1. Header 'x-yupdar-lang' (явно передан фронтом, выбран в ЛК)
 *  2. Telegram language_code из initData
 *  3. Accept-Language header
 *  4. fallback 'ru'
 *
 * Возвращает короткий код 'ru' | 'en' | 'es'.
 */

const SUPPORTED = ['ru', 'en', 'es'];
const FALLBACK = 'ru';

function detectLang(req) {
  if (!req) return FALLBACK;

  // 1. Явный заголовок от фронта (выбор юзера в ЛК)
  const explicit = req.headers && req.headers['x-yupdar-lang'];
  if (explicit) {
    const short = String(explicit).toLowerCase().slice(0, 2);
    if (SUPPORTED.includes(short)) return short;
  }

  // 2. Telegram language_code из initData
  try {
    const initData = req.headers && req.headers['x-telegram-init-data'];
    if (initData) {
      const params = new URLSearchParams(initData);
      const userJson = params.get('user');
      if (userJson) {
        const u = JSON.parse(userJson);
        if (u.language_code) {
          const short = String(u.language_code).toLowerCase().slice(0, 2);
          if (SUPPORTED.includes(short)) return short;
        }
      }
    }
  } catch (e) {}

  // 3. Accept-Language
  try {
    const al = req.headers && req.headers['accept-language'];
    if (al) {
      const short = String(al).split(',')[0].toLowerCase().slice(0, 2);
      if (SUPPORTED.includes(short)) return short;
    }
  } catch (e) {}

  return FALLBACK;
}

/**
 * Получить инструкцию языка для системного промпта AI.
 * Возвращает текст, который надо добавить В НАЧАЛО system message.
 */
function getLanguageInstruction(lang) {
  if (lang === 'en') {
    return `LANGUAGE: Respond in clear, beautiful English. Use the voice and rhythm of SvetLana's Book of DARs — contemplative, warm, precise, no machine-translation flavor. Preserve all DAR system terms (DAR/DARs, MA, ZHI, KUN, Fields names like LOGOS/NIMA/etc, individual DAR names like ZHAR/LA-DA/etc) as-is — they are sound-codes, not translatable. Translate archetype names into natural English (e.g. "Внутренний вулкан" → "Inner Volcano"). Use "you" (singular, personal), not "the user". Smart quotes “ ” ' '. No em-dash overuse.`;
  }
  if (lang === 'es') {
    return `IDIOMA: Responde en español claro y hermoso, con un tono contemplativo, cálido y preciso. Mantén los términos del sistema DAR (DAR/DARes, MA, ZHI, KUN, nombres de Campos como LOGOS/NIMA/etc, nombres individuales como ZHAR/LA-DA/etc) tal como están — son códigos de sonido, no se traducen. Traduce los nombres de arquetipos al español natural. Habla en segunda persona ("tú"), no "el usuario". Usa comillas tipográficas « » " ".`;
  }
  // ru — без инструкции, дефолтный язык всех промптов
  return null;
}

/**
 * Применить инструкцию языка к системному промпту.
 * Если язык не русский — префиксирует промпт инструкцией.
 */
function applyLanguage(systemPrompt, lang) {
  const instruction = getLanguageInstruction(lang);
  if (!instruction) return systemPrompt;
  return `${instruction}\n\n---\n\n${systemPrompt}`;
}

module.exports = {
  SUPPORTED,
  FALLBACK,
  detectLang,
  getLanguageInstruction,
  applyLanguage
};
