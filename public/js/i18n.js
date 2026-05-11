/**
 * YupDar i18n — простая система локализации.
 *
 * Принципы:
 *  1. Язык определяется автоматически по Telegram language_code, потом по localStorage,
 *     потом фоллбэк 'ru'.
 *  2. Переводы лежат в /i18n/{lang}.json (lazy-loaded при первом обращении).
 *  3. Использование:
 *       i18n.t('common.cancel')                     → 'Отмена'
 *       i18n.t('greeting', { name: 'Света' })        → 'Привет, Света!'
 *  4. Перевод HTML по атрибуту: <span data-i18n="profile.title"></span>
 *     i18n.applyToDOM() заменит textContent на перевод ключа.
 *  5. Поддерживается замена плейсхолдеров: "Hello, {name}!"
 *
 * Подключение во всех страницах:
 *     <script src="/js/i18n.js"></script>
 *     <script>i18n.init().then(() => i18n.applyToDOM())</script>
 */

(function (global) {
  'use strict';

  const SUPPORTED = ['ru', 'en', 'es'];
  const FALLBACK = 'ru';
  const STORAGE_KEY = '_yupdar_lang';

  const state = {
    lang: null,
    dict: {},
    loaded: false
  };

  /**
   * Определить язык: localStorage → Telegram → fallback.
   */
  function detectLang() {
    // 1. Пользователь явно выбрал язык в ЛК
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.includes(stored)) return stored;
    } catch (e) {}

    // 2. Из Telegram WebApp
    try {
      const tgLang = global.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
      if (tgLang) {
        const short = tgLang.toLowerCase().slice(0, 2);
        if (SUPPORTED.includes(short)) return short;
      }
    } catch (e) {}

    // 3. Из navigator (для web вне Telegram)
    try {
      const navLang = (navigator.language || navigator.userLanguage || '').toLowerCase().slice(0, 2);
      if (SUPPORTED.includes(navLang)) return navLang;
    } catch (e) {}

    return FALLBACK;
  }

  /**
   * Загрузить словарь языка с сервера. Кешируется в state.dict.
   */
  async function loadDict(lang) {
    try {
      const resp = await fetch(`/i18n/${lang}.json?v=1`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const dict = await resp.json();
      state.dict = dict;
      state.lang = lang;
      state.loaded = true;
      return dict;
    } catch (e) {
      console.warn('[i18n] Failed to load', lang, e.message);
      if (lang !== FALLBACK) {
        // Пробуем фоллбэк
        return loadDict(FALLBACK);
      }
      // Совсем сломалось — пустой словарь
      state.dict = {};
      state.lang = FALLBACK;
      state.loaded = true;
      return {};
    }
  }

  /**
   * Достать значение по ключу 'a.b.c' из вложенного объекта.
   */
  function getNested(obj, path) {
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : undefined, obj);
  }

  /**
   * Подставить плейсхолдеры {name} в строку.
   */
  function interpolate(str, vars) {
    if (!vars || typeof str !== 'string') return str;
    return str.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : '{' + key + '}'));
  }

  /**
   * Главная функция перевода.
   * @param {string} key — например 'profile.title' или 'common.cancel'
   * @param {object} [vars] — переменные для {placeholder}
   * @returns {string} — перевод или сам ключ если не найден
   */
  function t(key, vars) {
    if (!state.loaded) {
      // Возвращаем ключ — лучше чем undefined
      return interpolate(key, vars);
    }
    const value = getNested(state.dict, key);
    if (value === undefined) {
      // В режиме разработки — заметно отметим отсутствующий ключ
      if (location.hostname === 'localhost' || location.search.includes('debug')) {
        console.warn('[i18n] missing key:', key, '(lang:', state.lang + ')');
      }
      return interpolate(key, vars);
    }
    return interpolate(value, vars);
  }

  /**
   * Применить переводы к DOM по атрибутам data-i18n / data-i18n-attr.
   *
   *   <span data-i18n="profile.title">Личный кабинет</span>
   *   <input data-i18n="search.placeholder" data-i18n-attr="placeholder">
   *   <img data-i18n="img.alt" data-i18n-attr="alt">
   */
  function applyToDOM(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      if (!key) return;
      const translation = t(key);
      if (attr) {
        el.setAttribute(attr, translation);
      } else {
        el.textContent = translation;
      }
    });
    // HTML-режим: data-i18n-html (опасно, использовать только для доверенных переводов)
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (!key) return;
      el.innerHTML = t(key);
    });
    // Установить html lang
    if (state.lang) document.documentElement.setAttribute('lang', state.lang);
  }

  /**
   * Сменить язык (пользователь выбрал в ЛК).
   */
  async function setLang(lang) {
    if (!SUPPORTED.includes(lang)) {
      console.warn('[i18n] unsupported lang:', lang);
      return false;
    }
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    await loadDict(lang);
    applyToDOM();
    // События для подписчиков (компонентов которые рендерят сами)
    try {
      document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang } }));
    } catch (e) {}
    return true;
  }

  /**
   * Инициализация. Вызывать один раз при загрузке страницы.
   */
  async function init() {
    const lang = detectLang();
    await loadDict(lang);
    return state.lang;
  }

  /**
   * Текущий язык.
   */
  function getLang() {
    return state.lang || detectLang();
  }

  /**
   * Список поддерживаемых языков (для UI выбора).
   */
  function getSupported() {
    return SUPPORTED.slice();
  }

  // === ЭКСПОРТ ===
  global.i18n = {
    init,
    t,
    setLang,
    getLang,
    getSupported,
    applyToDOM,
    SUPPORTED
  };
})(window);
