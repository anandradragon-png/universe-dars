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
    return `LANGUAGE: Respond in clear, beautiful English. Use the voice and rhythm of SvetLana's Book of DARs — contemplative, warm, precise, no machine-translation flavor.

CRITICAL TERMINOLOGY (do NOT translate, keep as-is in English text):
  - DAR / DARs (the system name — never "gift", "gifts")
  - MA, ZHI, KUN (three creative states)
  - Field names: LOGOS, NIMA, ANDRA, ZINGRA, LUBA, TUMA, ASTRA, BITRA, OMA
  - Individual DAR names: ZHAR, LA-DA, ZLA-TO, A-MA, RAY, BI-MA etc — these are sound-codes
  - YupDar (the app name)

DO translate archetype names into natural English (e.g. "Внутренний вулкан" → "Inner Volcano", "Огненный Кузнец" → "Fire Forger").

STYLE:
  - Speak in second person ("you"), warm and personal, never "the user"
  - Smart quotes “ ” ' '
  - Avoid em-dash overuse
  - No bureaucratic or therapy-speak — voice of a wise companion`;
  }
  if (lang === 'es') {
    return `IDIOMA: Responde en español claro y hermoso, con un tono contemplativo, cálido y preciso.

TERMINOLOGÍA CRÍTICA (NO traducir, mantener como está):
  - DAR / DARs (nombre del sistema — nunca "don", "dones")
  - MA, ZHI, KUN (tres estados creativos)
  - Nombres de los Campos: LOGOS, NIMA, ANDRA, ZINGRA, LUBA, TUMA, ASTRA, BITRA, OMA
  - Nombres individuales: ZHAR, LA-DA, ZLA-TO, A-MA, RAY, BI-MA, etc — son códigos sonoros
  - YupDar (nombre de la app)

SÍ traducir los nombres de arquetipos al español natural.

ESTILO:
  - Habla en segunda persona ("tú"), cálido y personal, nunca "el usuario"
  - Comillas tipográficas « » o " "
  - Evita el guión largo excesivo
  - Voz de compañero sabio, sin lenguaje burocrático ni de terapia`;
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
