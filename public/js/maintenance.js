/**
 * Тех.шторка «Обновление реальности».
 *
 * Как включить: открыть этот файл, поменять MAINTENANCE_ON на true, задеплоить.
 * Как выключить: поменять MAINTENANCE_ON обратно на false, задеплоить.
 *
 * Админам (Telegram ID в ADMIN_IDS) шторка не показывается, чтобы Светлана
 * могла тестировать и обновлять прод во время «работ».
 */
(function () {
  var MAINTENANCE_ON = false; // ← переключатель

  var ADMIN_IDS = [269932434]; // Светлана

  // Тексты на трёх языках. EN/ES — образные, в стилистике авторских формулировок.
  var TEXTS = {
    ru: {
      title: 'Идёт обновление реальности.',
      sub: 'Следи за знаками.'
    },
    en: {
      title: 'Reality is being rewoven.',
      sub: 'Watch for the signs.'
    },
    es: {
      title: 'La realidad se está renovando.',
      sub: 'Atenta a las señales.'
    }
  };

  function isAdmin() {
    try {
      var tgId = window.Telegram && window.Telegram.WebApp &&
                 window.Telegram.WebApp.initDataUnsafe &&
                 window.Telegram.WebApp.initDataUnsafe.user &&
                 window.Telegram.WebApp.initDataUnsafe.user.id;
      if (tgId && ADMIN_IDS.indexOf(Number(tgId)) !== -1) return true;
      var devId = localStorage.getItem('_dev_telegram_id');
      if (devId && ADMIN_IDS.indexOf(Number(devId)) !== -1) return true;
    } catch (e) {}
    return false;
  }

  function pickLang() {
    try {
      var stored = localStorage.getItem('lang') || localStorage.getItem('_lang');
      if (stored && TEXTS[stored]) return stored;
      var tgLang = window.Telegram && window.Telegram.WebApp &&
                   window.Telegram.WebApp.initDataUnsafe &&
                   window.Telegram.WebApp.initDataUnsafe.user &&
                   window.Telegram.WebApp.initDataUnsafe.user.language_code;
      if (tgLang) {
        if (tgLang.indexOf('es') === 0) return 'es';
        if (tgLang.indexOf('en') === 0) return 'en';
      }
    } catch (e) {}
    return 'ru';
  }

  function show() {
    if (document.getElementById('__maintenance_overlay')) return;
    var lang = pickLang();
    var t = TEXTS[lang] || TEXTS.ru;

    var css =
      '#__maintenance_overlay{position:fixed;inset:0;z-index:2147483647;' +
      'background:radial-gradient(ellipse at center,#1a1530 0%,#0a0815 70%,#000 100%);' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'padding:24px;text-align:center;font-family:Manrope,-apple-system,system-ui,sans-serif;' +
      'color:#f5e6c8;animation:__mfade 0.6s ease-out;}' +
      '@keyframes __mfade{from{opacity:0}to{opacity:1}}' +
      '@keyframes __mpulse{0%,100%{transform:scale(1);opacity:0.85}50%{transform:scale(1.06);opacity:1}}' +
      '#__maintenance_overlay .__msigil{font-size:72px;line-height:1;margin-bottom:32px;' +
      'animation:__mpulse 3.2s ease-in-out infinite;filter:drop-shadow(0 0 24px rgba(212,175,55,0.55));}' +
      '#__maintenance_overlay .__mtitle{font-size:22px;font-weight:700;letter-spacing:0.2px;' +
      'max-width:520px;margin:0 0 12px 0;color:#f5e6c8;}' +
      '#__maintenance_overlay .__msub{font-size:16px;font-weight:400;opacity:0.78;' +
      'max-width:480px;margin:0;color:#d4af37;}' +
      '#__maintenance_overlay .__mhint{margin-top:40px;font-size:12px;opacity:0.4;' +
      'letter-spacing:0.5px;text-transform:uppercase;}';

    var style = document.createElement('style');
    style.id = '__maintenance_overlay_css';
    style.textContent = css;
    document.head.appendChild(style);

    var div = document.createElement('div');
    div.id = '__maintenance_overlay';
    div.innerHTML =
      '<div class="__msigil">✦</div>' +
      '<h1 class="__mtitle">' + t.title + '</h1>' +
      '<p class="__msub">' + t.sub + '</p>' +
      '<div class="__mhint">Вселенная ДАРов</div>';
    (document.body || document.documentElement).appendChild(div);

    // Блокируем скролл фона
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}
  }

  function init() {
    if (!MAINTENANCE_ON) return;
    if (isAdmin()) {
      // Маленький индикатор для админа, что шторка включена (но прод не блокирована).
      console.warn('[maintenance] ON — admin bypass active');
      return;
    }
    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show);
  }

  init();

  // Экспорт для ручного включения из консоли при отладке:
  // window.__maintenance.force()
  window.__maintenance = {
    on: function () { MAINTENANCE_ON = true; show(); },
    off: function () {
      var el = document.getElementById('__maintenance_overlay');
      if (el) el.remove();
      var css = document.getElementById('__maintenance_overlay_css');
      if (css) css.remove();
      try { document.documentElement.style.overflow = ''; } catch (e) {}
    },
    force: function () { show(); }
  };
})();
