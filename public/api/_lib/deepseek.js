/**
 * DeepSeek API helper
 *
 * DeepSeek API совместим с OpenAI API - можно использовать обычный fetch
 * без установки SDK. Используем base URL https://api.deepseek.com/v1
 *
 * Доступные модели:
 *   - deepseek-chat       (DeepSeek-V3, основная модель, ~1-2 сек)
 *   - deepseek-reasoner   (DeepSeek-R1 с reasoning, ~3-5 сек)
 *
 * ENV:
 *   DEEPSEEK_API_KEY - API-ключ (получить в платформе DeepSeek)
 *   USE_DEEPSEEK_FOR_COACH - "1" чтобы включить DeepSeek для shadow-review
 *
 * Для отката на Groq: убрать USE_DEEPSEEK_FOR_COACH или поставить "0"
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * Создать chat completion через DeepSeek API
 *
 * Совместимо с OpenAI Chat Completions API:
 *   - messages: [{ role: 'system'|'user'|'assistant', content: '...' }]
 *   - model: 'deepseek-chat' или 'deepseek-reasoner'
 *   - temperature, max_tokens, top_p, stream и т.д.
 *
 * Возвращает обёртку, совместимую с groq SDK responses, чтобы код,
 * который раньше работал с Groq, работал без изменений:
 *   { choices: [{ message: { content: '...' } }] }
 */
async function chatCompletion({ messages, model = 'deepseek-chat', temperature = 0.75, max_tokens = 500, response_format = null, signal = null }) {
  const apiKey = (process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not configured');
  }

  const body = {
    model,
    messages,
    temperature,
    max_tokens
  };

  // DeepSeek поддерживает structured json output как в OpenAI
  if (response_format) body.response_format = response_format;

  const resp = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify(body),
    signal
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error('DeepSeek HTTP ' + resp.status + ': ' + text.slice(0, 200));
  }

  const data = await resp.json();
  // Возвращаем как Groq SDK для совместимости вызовов
  return data;
}

/**
 * Проверка - включён ли DeepSeek для конкретной фичи (через env feature flag)
 */
function isDeepSeekEnabled(feature) {
  const key = 'USE_DEEPSEEK_FOR_' + String(feature || '').toUpperCase();
  const val = (process.env[key] || '').trim().toLowerCase();
  return val === '1' || val === 'true' || val === 'yes';
}

/**
 * Глобальный feature flag - включён ли DeepSeek вообще
 */
function isDeepSeekConfigured() {
  return !!(process.env.DEEPSEEK_API_KEY && String(process.env.DEEPSEEK_API_KEY).trim());
}

module.exports = {
  chatCompletion,
  isDeepSeekEnabled,
  isDeepSeekConfigured
};
