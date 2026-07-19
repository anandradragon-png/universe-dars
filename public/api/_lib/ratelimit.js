/**
 * Простой in-memory rate-limiter.
 *
 * Сервер YupDar — единый Node-процесс за Caddy (docker), поэтому счётчики в
 * памяти процесса достаточны и не требуют Redis. Скользящее окно по ключу.
 *
 * Назначение (каркас качества, дыра из аудита 19.07.2026): защитить дорогие
 * AI-эндпоинты (Оракул, послания, разборы) и платёжные вызовы от флуда —
 * чтобы один клиент не мог сжечь квоту LLM или завалить платёжный шлюз.
 *
 * Лимиты подобраны с запасом: живой человек их не достигает, режется только
 * автоматический флуд (ЗАКОН 2 — без регрессий для настоящих юзеров).
 */

// key -> массив таймстампов запросов (мс)
const buckets = new Map();

/**
 * Проверить и учесть один запрос по ключу.
 * @returns {{ ok: true, remaining: number } | { ok: false, retryAfter: number }}
 */
function hit(key, limit, windowMs) {
  const now = Date.now();
  let arr = buckets.get(key);
  if (!arr) { arr = []; buckets.set(key, arr); }
  // выкинуть отметки старше окна
  const cutoff = now - windowMs;
  while (arr.length && arr[0] <= cutoff) arr.shift();

  if (arr.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((arr[0] + windowMs - now) / 1000));
    return { ok: false, retryAfter };
  }
  arr.push(now);
  return { ok: true, remaining: limit - arr.length };
}

/**
 * Ключ клиента для лимитера. Идентити важнее IP (за Caddy IP один на всех),
 * поэтому берём telegram-id/подпись, а IP — только как фолбэк.
 */
function clientKey(req) {
  const tgId = req.headers['x-telegram-id'];
  if (tgId) return 'tg:' + String(tgId).slice(0, 32);
  const initData = req.headers['x-telegram-init-data'];
  if (initData) {
    // не парсим — берём короткий стабильный отпечаток подписи
    return 'id:' + require('crypto').createHash('sha256').update(String(initData)).digest('hex').slice(0, 16);
  }
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
           || req.socket?.remoteAddress || 'unknown';
  return 'ip:' + ip;
}

/**
 * Применить лимит к запросу. Если превышен — сам отправляет 429 и возвращает false.
 * Иначе возвращает true (обработчик продолжает работу).
 *
 * @param {string} bucket  логическая группа ('ai', 'payment', ...) — часть ключа
 * @param {number} limit   макс. запросов в окне
 * @param {number} windowMs размер окна, мс
 */
function enforce(req, res, { bucket, limit, windowMs }) {
  const key = bucket + '|' + clientKey(req);
  const r = hit(key, limit, windowMs);
  if (!r.ok) {
    res.setHeader('Retry-After', String(r.retryAfter));
    res.status(429).json({
      error: 'Слишком много запросов подряд. Подожди немного и попробуй снова.',
      retry_after: r.retryAfter
    });
    return false;
  }
  return true;
}

// Периодическая уборка пустых бакетов, чтобы Map не рос бесконечно.
const cleanup = setInterval(() => {
  const cutoff = Date.now() - 3600000; // час
  for (const [k, arr] of buckets) {
    while (arr.length && arr[0] <= cutoff) arr.shift();
    if (arr.length === 0) buckets.delete(k);
  }
}, 600000);
if (cleanup.unref) cleanup.unref();

module.exports = { enforce, hit, clientKey };
