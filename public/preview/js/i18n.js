/**
 * Простой i18n для прототипа YupDar.
 * Работает и в Telegram WebApp, и в обычном браузере.
 */
(function (global) {
  'use strict';

  const SUPPORTED = ['ru', 'en', 'es'];
  const FALLBACK = 'ru';
  const STORAGE_KEY = '_yupdar_preview_lang';

  const state = {
    lang: null,
    dict: {},
    loaded: false
  };

  function detectLang() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.includes(stored)) return stored;
    } catch (e) {}
    try {
      const tgLang = global.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
      if (tgLang) {
        const s = tgLang.toLowerCase().slice(0, 2);
        if (SUPPORTED.includes(s)) return s;
      }
    } catch (e) {}
    try {
      const navLang = (navigator.language || '').toLowerCase().slice(0, 2);
      if (SUPPORTED.includes(navLang)) return navLang;
    } catch (e) {}
    return FALLBACK;
  }

  async function loadDict(lang) {
    try {
      const resp = await fetch(`/preview/i18n/${lang}.json?v=2`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      state.dict = await resp.json();
      state.lang = lang;
      state.loaded = true;
      return state.dict;
    } catch (e) {
      console.warn('[preview-i18n] load failed', lang, e.message);
      if (lang !== FALLBACK) return loadDict(FALLBACK);
      state.dict = {};
      state.lang = FALLBACK;
      state.loaded = true;
      return {};
    }
  }

  function getNested(obj, path) {
    return path.split('.').reduce(
      (acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined),
      obj
    );
  }

  function t(key) {
    if (!state.loaded) return '';
    const v = getNested(state.dict, key);
    return v === undefined ? '' : v;
  }

  function applyToDOM(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const attr = el.getAttribute('data-i18n-attr');
      const tr = t(key);
      if (!tr) return;
      if (attr) el.setAttribute(attr, tr);
      else el.textContent = tr;
    });
    if (state.lang) document.documentElement.setAttribute('lang', state.lang);
  }

  async function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return false;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    await loadDict(lang);
    applyToDOM();
    try {
      document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang } }));
    } catch (e) {}
    return true;
  }

  async function init() {
    await loadDict(detectLang());
    applyToDOM();
    try {
      document.dispatchEvent(new CustomEvent('i18n:ready', { detail: { lang: state.lang } }));
    } catch (e) {}
    return state.lang;
  }

  function getLang() {
    return state.lang || detectLang();
  }

  global.previewI18n = { init, t, setLang, applyToDOM, getLang, SUPPORTED };
})(window);
