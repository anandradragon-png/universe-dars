/**
 * DEV-ONLY заглушка Telegram WebApp для локального запуска в браузере.
 *
 * Зачем: YupDar — Telegram Mini App, и без Telegram в обычном браузере
 * нет window.Telegram.WebApp (нет пользователя, не работают openLink/showAlert,
 * редирект уводит на лендинг). Этот шим эмулирует Telegram, чтобы приложение
 * можно было полноценно гонять локально.
 *
 * БЕЗОПАСНОСТЬ: активен ТОЛЬКО на localhost / 127.0.0.1. В проде (yupdar.com,
 * yupdar.yupland.io и т.п.) сразу выходит и НИЧЕГО не делает — поведение прода
 * не меняется. Файл можно удалить в любой момент без последствий для прода.
 *
 * Логинит как dev-пользователь из localStorage._dev_telegram_id
 * (по умолчанию 637640467 — это id из ADMIN_IDS, чтобы открылись и админ-фичи).
 */
(function () {
  var host = location.hostname;
  var isLocal = (host === 'localhost' || host === '127.0.0.1' || host === '' || host === '0.0.0.0');
  if (!isLocal) return; // ПРОД: ничего не делаем

  var DEFAULT_DEV_ID = '637640467'; // Михаил (@miplix_1) — есть в ADMIN_IDS
  var devId = localStorage.getItem('_dev_telegram_id');
  if (!devId) { devId = DEFAULT_DEV_ID; localStorage.setItem('_dev_telegram_id', devId); }

  window.Telegram = window.Telegram || {};
  var tg = window.Telegram.WebApp || {};
  var noop = function () {};

  // Полный набор заглушек методов/полей Telegram.WebApp.
  var stubs = {
    ready: noop, expand: noop, close: noop,
    enableClosingConfirmation: noop, disableClosingConfirmation: noop,
    enableVerticalSwipes: noop, disableVerticalSwipes: noop,
    setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop,
    onEvent: noop, offEvent: noop, sendData: noop, switchInlineQuery: noop,
    requestWriteAccess: function (cb) { cb && cb(true); },
    requestContact: function (cb) { cb && cb(false); },
    BackButton: { isVisible: false, show: noop, hide: noop, onClick: noop, offClick: noop },
    MainButton: {
      text: '', isVisible: false, isActive: true, isProgressVisible: false,
      show: noop, hide: noop, enable: noop, disable: noop, setText: noop,
      onClick: noop, offClick: noop, showProgress: noop, hideProgress: noop, setParams: noop
    },
    SettingsButton: { isVisible: false, show: noop, hide: noop, onClick: noop, offClick: noop },
    HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop },
    CloudStorage: {
      getItem: function (k, cb) { cb && cb(null, localStorage.getItem('_tgcloud_' + k)); },
      setItem: function (k, v, cb) { localStorage.setItem('_tgcloud_' + k, v); cb && cb(null, true); },
      removeItem: function (k, cb) { localStorage.removeItem('_tgcloud_' + k); cb && cb(null, true); },
      getKeys: function (cb) { cb && cb(null, []); }
    },
    colorScheme: 'dark', themeParams: {}, isExpanded: true,
    viewportHeight: window.innerHeight, viewportStableHeight: window.innerHeight,
    headerColor: '#080808', backgroundColor: '#080808',
    platform: 'web-dev', version: '7.10', isClosingConfirmationEnabled: false
  };

  // Доливаем недостающее, не затирая то, что уже есть.
  for (var k in stubs) {
    if (tg[k] === undefined) tg[k] = stubs[k];
  }

  // Навигацию/диалоги ВСЕГДА переопределяем на браузер-дружественные —
  // чтобы не уходить в t.me (превью блокирует) и не падать вне Telegram.
  tg.showAlert = function (msg, cb) { window.alert(msg); cb && cb(); };
  tg.showConfirm = function (msg, cb) { cb && cb(window.confirm(msg)); };
  tg.showPopup = function (params, cb) {
    var m = (params && (params.message || params.title)) || '';
    window.alert(m);
    var id = params && params.buttons && params.buttons[0] && params.buttons[0].id;
    cb && cb(id);
  };
  tg.openLink = function (url) { window.open(url, '_blank'); };
  tg.openTelegramLink = function (url) { console.log('[dev-tg] openTelegramLink:', url); window.open(url, '_blank'); };
  tg.openInvoice = function (url, cb) {
    console.log('[dev-tg] openInvoice:', url);
    window.alert('DEV: оплата Telegram Stars недоступна локально (' + url + ')');
    cb && cb('cancelled');
  };

  // Пользователь. initData оставляем пустым специально: тогда api-client.js
  // шлёт заголовок x-telegram-id из _dev_telegram_id (чистый dev-путь,
  // совместим со строгой проверкой админки), а не поддельную подпись.
  try {
    var unsafe = tg.initDataUnsafe || {};
    if (!unsafe.user) {
      unsafe.user = {
        id: Number(devId), first_name: 'Mihail', last_name: '',
        username: 'mihail_local', language_code: 'ru', is_premium: true
      };
      if (unsafe.start_param === undefined) unsafe.start_param = '';
      tg.initDataUnsafe = unsafe;
    }
  } catch (e) { /* поле может быть read-only — не критично, auth идёт через x-telegram-id */ }

  window.Telegram.WebApp = tg;
  console.log('[dev-tg] Telegram-шим активен. Логин как dev id =', devId,
    '(сменить: localStorage._dev_telegram_id)');
})();
