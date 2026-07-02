// ============================================================================
// Курсовой модуль — живые курсы + расчёт цены тарифа в разных валютах.
//
// Зачем: цены больше не вбиваются руками по валютам. Базовая цена задаётся в ₽,
// а Stars/DarAI считаются от неё по ЖИВОМУ курсу. DarAI волатилен, поэтому его
// цена ОБЯЗАНА идти от курса (старый вшитый пег 40M=990₽ уже разошёлся с рынком).
//
// Лестница цен (решение владельца 02.07.2026):
//   ₽    = базовая ₽-цена КАК ЕСТЬ (это уровень −5% от полной базы)
//   Stars= дороже: полная база + наценка (офсет комиссии Telegram)
//   DarAI= −10% от полной базы, по живому курсу Ref Finance
//   → полная база B = rub / (1 - RUB_DISCOUNT)
//
// Фиды:
//   DarAI/USD — Ref Finance (list-token-price, darai.tkn.near)
//   USD/RUB   — ЦБ РФ (cbr-xml-daily)
// Оба кэшируются; при недоступности — используется последнее известное / фолбэк,
// чтобы оплата НИКОГДА не падала из-за внешнего API.
// ============================================================================

'use strict';

// --- Настройки лестницы (тюнятся тут) ---
const RUB_DISCOUNT  = 0.05;  // ₽ на 5% ниже полной базы (₽-цена задаётся как есть)
const DARAI_DISCOUNT = 0.10; // DarAI на 10% ниже полной базы (нам ценнее — стимулируем)
const STARS_MARKUP  = 0.10;  // Stars дороже базы на 10% (офсет комиссии Telegram)
const STAR_RUB      = 2.0;   // ориентир ₽ за 1 звезду (Stars менее волатильны, ведём константой)

const DARAI_TOKEN = 'darai.tkn.near';
const REF_URL = 'https://api.ref.finance/list-token-price';
const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
const CACHE_MS = 10 * 60 * 1000; // 10 минут
const FETCH_TIMEOUT_MS = 8000;

// Фолбэк-курсы (если фиды недоступны на холодном старте). Обновляются при успехе.
// Держим их в одном месте, чтобы фолбэк не расходился с сидом кэша.
const FALLBACK_DARAI_USD = 2.54e-7; // ~последнее известное
const FALLBACK_USD_RUB   = 90;      // консервативный фолбэк

// Полоса разумности для USD/RUB — грубый предохранитель от битой строки фида
// (напр. usdRub=0.01 или 500). Всё за пределами — отвергаем, оставляем прошлое.
const USD_RUB_MIN = 50;
const USD_RUB_MAX = 200;
// Максимальное отклонение свежего значения от последнего известного (антискачок).
// Одиночный «тик» фида, отличающийся более чем в N раз, отвергается.
const MAX_RATE_DEVIATION = 4;

let _cache = {
  daraiUsd: FALLBACK_DARAI_USD,
  usdRub: FALLBACK_USD_RUB,
  fetchedAt: 0,
  ok: false,
};

// Свежий курс считается «разумным», если он положителен, конечен и не отклоняется
// от последнего известного больше чем в MAX_RATE_DEVIATION раз. Это ловит битые
// тики фида (напр. 0.01 или ×100 пампы), которые проходят простую проверку > 0.
function _isSaneRate(v, last) {
  if (!(v > 0) || !isFinite(v)) return false;
  if (last > 0 && isFinite(last)) {
    if (v > last * MAX_RATE_DEVIATION) return false;
    if (v < last / MAX_RATE_DEVIATION) return false;
  }
  return true;
}

async function _fetchJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// Возвращает { daraiUsd, usdRub, rubPerDarai, starRub, fetchedAt, ok }.
// Кэш 10 мин. На ошибке фида — отдаёт последнее известное значение (не падает).
async function getRates() {
  const now = Date.now();
  if (_cache.ok && (now - _cache.fetchedAt) < CACHE_MS) {
    return _withDerived(_cache);
  }
  const next = { ...(_cache) };
  // DarAI/USD (Ref) — не рушим всё, если один фид лёг
  try {
    const ref = await _fetchJson(REF_URL);
    const p = ref && ref[DARAI_TOKEN] && parseFloat(ref[DARAI_TOKEN].price);
    if (_isSaneRate(p, _cache.daraiUsd)) next.daraiUsd = p;
    else if (p) console.warn('[rates] Ref DarAI price out of band, keeping last:', p);
  } catch (e) { console.warn('[rates] Ref DarAI price failed:', e.message); }
  // USD/RUB (ЦБ)
  try {
    const cbr = await _fetchJson(CBR_URL);
    const v = cbr && cbr.Valute && cbr.Valute.USD && cbr.Valute.USD.Value;
    if (_isSaneRate(v, _cache.usdRub) && v >= USD_RUB_MIN && v <= USD_RUB_MAX) next.usdRub = v;
    else if (v) console.warn('[rates] CBR USD/RUB out of band, keeping last:', v);
  } catch (e) { console.warn('[rates] CBR USD/RUB failed:', e.message); }

  next.fetchedAt = now;
  next.ok = true;
  _cache = next;
  return _withDerived(_cache);
}

function _withDerived(c) {
  return {
    daraiUsd: c.daraiUsd,
    usdRub: c.usdRub,
    rubPerDarai: c.daraiUsd * c.usdRub, // ₽ за 1 DarAI
    starRub: STAR_RUB,
    fetchedAt: c.fetchedAt,
    ok: c.ok,
  };
}

// Округление DarAI до «красивых» единиц (0.1M шаг) чтобы цена читалась.
function _roundDarai(n) {
  const step = 100000; // 0.1M
  return Math.max(step, Math.round(n / step) * step);
}

// Синхронный расчёт по УЖЕ полученному снимку курсов (из getRates()).
// Позволяет один раз за запрос взять снимок и посчитать цены для всех
// тарифов/аддонов/книги согласованно (displayed == charged в одном окне).
// Защищено от битых курсов: если rubPerDarai/usdRub не положительны — фолбэк.
function priceAllCurrenciesWith(baseRub, rates) {
  const base = Number(baseRub) || 0;
  const B = base / (1 - RUB_DISCOUNT);              // полная база (Stars-уровень)
  const FALLBACK_RUB_PER_DARAI = FALLBACK_DARAI_USD * FALLBACK_USD_RUB;
  const starRub = (rates && rates.starRub > 0) ? rates.starRub : STAR_RUB;
  // usdRub держим в полосе разумности даже если снимок как-то её обошёл.
  let usdRub = (rates && rates.usdRub > 0 && isFinite(rates.usdRub)) ? rates.usdRub : FALLBACK_USD_RUB;
  usdRub = Math.min(USD_RUB_MAX, Math.max(USD_RUB_MIN, usdRub));
  // rubPerDarai: если снимок битый/absurd — фолбэк; затем зажимаем в разумную
  // полосу вокруг фолбэка, чтобы одиночный глитч фида не сделал цену near-free/×100.
  let rubPerDarai = (rates && rates.rubPerDarai > 0 && isFinite(rates.rubPerDarai))
    ? rates.rubPerDarai
    : FALLBACK_RUB_PER_DARAI;
  const DARAI_BAND = 8; // ×/÷8 вокруг фолбэка — шире дневной волатильности, но ловит глитчи
  rubPerDarai = Math.min(FALLBACK_RUB_PER_DARAI * DARAI_BAND,
                Math.max(FALLBACK_RUB_PER_DARAI / DARAI_BAND, rubPerDarai));
  const stars = Math.max(1, Math.round(B * (1 + STARS_MARKUP) / starRub));
  const darai = _roundDarai(B * (1 - DARAI_DISCOUNT) / rubPerDarai);
  const usd   = Math.max(0.01, Math.round((B / usdRub) * 100) / 100);
  return {
    rub: base,           // как есть
    stars,               // дороже + наценка
    darai,               // −10%, по курсу
    usd,
    _base: Math.round(B * 100) / 100,
    _rates: rates,
  };
}

// Главная функция: из базовой ₽-цены → цены во всех валютах по живому курсу.
// baseRub — то, что задано в PLANS[x].rub (остаётся уровнем −5%).
async function priceAllCurrencies(baseRub) {
  const rates = await getRates();
  return priceAllCurrenciesWith(baseRub, rates);
}

// Конвертация суммы одной валюты → другую (для выплат рефки), по живому курсу.
// Со стороны выплаты берётся комиссия за обмен CONVERT_FEE (ресурсы на конверт).
const CONVERT_FEE = 0.10; // −10% при конвертации между валютами
async function convert(amount, fromCur, toCur) {
  if (fromCur === toCur) return amount;
  const r = await getRates();
  // приводим к ₽ как общему знаменателю
  const toRub = (amt, cur) =>
    cur === 'rub' ? amt :
    cur === 'stars' ? amt * r.starRub :
    cur === 'darai' ? amt * r.rubPerDarai :
    cur === 'usd' ? amt * r.usdRub : null;
  const fromRub = (rub, cur) =>
    cur === 'rub' ? rub :
    cur === 'stars' ? rub / r.starRub :
    cur === 'darai' ? rub / r.rubPerDarai :
    cur === 'usd' ? rub / r.usdRub : null;
  const rub = toRub(amount, fromCur);
  if (rub == null) throw new Error('convert: unknown fromCur ' + fromCur);
  const out = fromRub(rub, toCur);
  if (out == null) throw new Error('convert: unknown toCur ' + toCur);
  return out * (1 - CONVERT_FEE); // минус комиссия за обмен
}

module.exports = {
  getRates,
  priceAllCurrencies,
  priceAllCurrenciesWith,
  convert,
  _config: { RUB_DISCOUNT, DARAI_DISCOUNT, STARS_MARKUP, STAR_RUB, CONVERT_FEE },
};
