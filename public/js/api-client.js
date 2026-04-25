/**
 * API-клиент для YupDar
 * Обёртка над fetch с автоматической авторизацией через Telegram
 */

const DarAPI = (function() {
  const tg = window.Telegram?.WebApp;
  const BASE_URL = ''; // Относительные пути для Vercel

  function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (tg?.initData) {
      headers['x-telegram-init-data'] = tg.initData;
    }
    // Dev fallback
    const devId = localStorage.getItem('_dev_telegram_id');
    if (devId && !tg?.initData) {
      headers['x-telegram-id'] = devId;
    }
    return headers;
  }

  // Кольцевой буфер последних API-ошибок для диагностики
  function logApiError(kind, path, info) {
    try {
      const list = JSON.parse(localStorage.getItem('_dar_api_errors') || '[]');
      list.push({
        ts: new Date().toISOString(),
        kind,
        path,
        info: typeof info === 'string' ? info.slice(0, 300) : info
      });
      while (list.length > 20) list.shift();
      localStorage.setItem('_dar_api_errors', JSON.stringify(list));
    } catch (e) {}
  }

  // Дружелюбные сообщения для пользователя по техническим ошибкам
  function friendlyError(kind, info) {
    if (kind === 'network') {
      return 'Нет связи с интернетом. Проверь соединение и попробуй ещё раз.';
    }
    if (kind === 'non-json') {
      const status = info && info.status;
      if (status === 502 || status === 503 || status === 504) {
        return 'Сервер сейчас перегружен. Подожди минуту и попробуй ещё раз.';
      }
      return 'Сервер ненадолго недоступен. Попробуй позже.';
    }
    if (kind === 'http') {
      const status = info && info.status;
      if (status === 401) return 'Нужно перезайти в приложение.';
      if (status === 403) return 'Эта функция доступна только в полной версии.';
      if (status === 404) return 'Запрошенные данные не найдены.';
      if (status === 429) return 'Слишком много запросов. Подожди немного.';
      if (status >= 500) return 'На сервере что-то пошло не так. Мы уже знаем и чиним.';
      // Если сервер вернул свой error - используем его, если он на русском
      if (info && info.body && info.body.error) {
        const msg = String(info.body.error);
        // Простая проверка: если есть кириллица - это уже дружелюбное сообщение
        if (/[а-яё]/i.test(msg)) return msg;
      }
      return 'Что-то пошло не так. Попробуй ещё раз.';
    }
    return 'Не удалось выполнить запрос. Попробуй ещё раз.';
  }

  async function request(path, method = 'GET', body = null) {
    const opts = { method, headers: getHeaders() };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    let resp;
    try {
      resp = await fetch(BASE_URL + path, opts);
    } catch (netErr) {
      console.error('[DarAPI] network error', path, netErr.message);
      logApiError('network', path, netErr.message);
      const err = new Error(friendlyError('network'));
      err.kind = 'network';
      throw err;
    }
    let data;
    try {
      data = await resp.json();
    } catch (parseErr) {
      const text = await resp.text().catch(() => '');
      console.error('[DarAPI] non-JSON response', path, 'status', resp.status, 'body:', text.slice(0, 200));
      logApiError('non-json', path, { status: resp.status, body: text.slice(0, 300) });
      const err = new Error(friendlyError('non-json', { status: resp.status }));
      err.kind = 'non-json';
      err.status = resp.status;
      throw err;
    }
    if (!resp.ok) {
      console.warn('[DarAPI] http error', path, 'status', resp.status, 'body:', data);
      logApiError('http', path, { status: resp.status, body: data });
      const err = new Error(friendlyError('http', { status: resp.status, body: data }));
      err.kind = 'http';
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  return {
    // ---- Пользователь ----
    getProfile: () => request('/api/user'),
    saveDar: (dar_code, dar_name, birth_date) =>
      request('/api/user', 'POST', { action: 'save_dar', dar_code, dar_name, birth_date }),
    saveProfile: (profile) =>
      request('/api/user', 'POST', Object.assign({ action: 'save_profile' }, profile)),
    saveAvatar: (avatar) =>
      request('/api/user', 'POST', { action: 'save_avatar', avatar }),
    saveLeaderboardName: (name_type, custom_name) =>
      request('/api/user', 'POST', { action: 'save_leaderboard_name', name_type, custom_name: custom_name || '' }),
    dailyLogin: () =>
      request('/api/user', 'POST', { action: 'daily_login' }),

    // ---- Сокровищница ----
    getTreasury: () => request('/api/treasury'),
    unlockSection: (dar_code, section_index) =>
      request('/api/treasury', 'POST', { action: 'unlock_section', dar_code, section_index }),
    unlockRandomDar: () =>
      request('/api/treasury', 'POST', { action: 'unlock_random' }),

    // ---- Рефералы ----
    getReferralInfo: () => request('/api/referral'),
    submitReferral: (referrer_telegram_id, new_user_dar_code) =>
      request('/api/referral', 'POST', { referrer_telegram_id, new_user_dar_code }),

    // ---- Промо-коды ----
    submitPromo: (code) => request('/api/promo', 'POST', { code }),

    // ---- Дар дня ----
    getDailyDar: () => request('/api/daily'),

    // ---- Секции дара (AI-генерация) ----
    getSection: (dar_code, section_index, dar_name, dar_archetype) =>
      request('/api/section', 'POST', { dar_code, section_index, dar_name, dar_archetype }),

    // ---- Задания ----
    getQuests: (dar_code) => request(`/api/quest?dar_code=${dar_code}`),
    submitQuest: (dar_code, section_index, quest_type, answer_text) =>
      request('/api/quest', 'POST', { dar_code, section_index, quest_type, answer_text }),

    // ---- AI-наставник: коучинг-диалог по квестам сокровищницы ----
    // payload: { quest_type, dar_name, shadow_title, shadow_description, shadow_correction,
    //            user_answer, gender, dialogue, round_number, user_action }
    reviewShadow: (payload) => request('/api/shadow-review', 'POST', payload),

    // ---- Рейтинг тренажёра интуиции ----
    getLeaderboard: (period, difficulty) => {
      const url = '/api/leaderboard?period=' + encodeURIComponent(period || 'daily')
        + (difficulty && difficulty !== 'all' ? '&difficulty=' + encodeURIComponent(difficulty) : '');
      return request(url);
    },
    submitIntuitionScore: (payload) => request('/api/leaderboard', 'POST', payload),

    // ---- Зал Славы (титулы победителей рейтинга) ----
    getHallOfFame: () => request('/api/hall-of-fame'),

    // ---- Семья и близкие ----
    // Возвращает: { relatives: [...], slot_limit, slot_used, access_level }
    getRelatives: () => request('/api/relatives'),
    // payload: { name, birth_date (DD.MM.YYYY), relationship, gender? }
    addRelative: (payload) => request('/api/relatives', 'POST', payload),
    deleteRelative: (id) => request('/api/relatives?id=' + encodeURIComponent(id), 'DELETE'),

    // ---- Оракул для близкого ----
    getOracleForRelative: (relative) => {
      const headers = { 'Content-Type': 'application/json' };
      try {
        if (window.Telegram?.WebApp?.initData) {
          headers['x-telegram-init-data'] = window.Telegram.WebApp.initData;
        }
      } catch (e) {}
      return fetch('/api/oracle', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dar_code: relative.dar_code,
          mode: 'relative',
          relative_name: relative.name,
          relative_relationship: relative.relationship,
          relative_id: relative.id,
          gender: relative.gender || ''
        })
      }).then(r => r.json());
    },

    // ---- Платежи (Telegram Stars) ----
    createBookInvoice: () =>
      request('/api/payment', 'POST', { action: 'create_book_invoice' }),
    createDonation: (amount) =>
      request('/api/payment', 'POST', { action: 'create_donation', amount }),
    // DarAI (NEAR) через YupPay
    createDaraiBookInvoice: () =>
      request('/api/payment', 'POST', { action: 'create_darai_book_invoice' }),
    createDaraiDonation: (amount_raw) =>
      request('/api/payment', 'POST', { action: 'create_darai_donation', amount_raw }),
    // ЮKassa (карта/СБП/SberPay)
    createYookassaBook: (test_mode = false) =>
      request('/api/payment', 'POST', { action: 'create_yookassa_book', test_mode }),
    createYookassaDonation: (amount) =>
      request('/api/payment', 'POST', { action: 'create_yookassa_donation', amount }),

    // ---- Дневник Дара ----
    saveDiaryMood: (mood, note) =>
      request('/api/diary', 'POST', { action: 'save_mood', mood, note }),
    getDiaryWeek: () =>
      request('/api/diary', 'POST', { action: 'get_week' }),
    getDiaryInsight: () =>
      request('/api/diary', 'POST', { action: 'get_insight' }),

    // ---- Совместимость пары ----
    checkCompatibility: (dar_code_1, dar_code_2, name_1, name_2, relationship) =>
      request('/api/compatibility', 'POST', { dar_code_1, dar_code_2, name_1, name_2, relationship }),

    // ---- Книга для Родителей (AI-генерация по ребёнку) ----
    getChildBookTOC: (relative_id) =>
      request('/api/child-book', 'POST', { action: 'get_toc', relative_id }),
    getChildBookSection: (relative_id, section_id) =>
      request('/api/child-book', 'POST', { action: 'get_section', relative_id, section_id }),
    regenerateChildBookSection: (relative_id, section_id) =>
      request('/api/child-book', 'POST', { action: 'regenerate', relative_id, section_id }),

    // ---- Путешествие Героя ----
    startJourney: (dar_code) =>
      request('/api/hero-journey', 'POST', { action: 'start', dar_code }),
    journeyAction: (dar_code, payload) =>
      request('/api/hero-journey', 'POST', { action: 'step_action', dar_code, ...payload }),
    getJourneyStatus: (dar_code) =>
      request('/api/hero-journey', 'POST', { action: 'get_status', dar_code }),
    getJourneyAnalysis: (dar_code) =>
      request('/api/hero-journey', 'POST', { action: 'get_analysis', dar_code }),
    getAllJourneys: () =>
      request('/api/hero-journey', 'POST', { action: 'get_all' }),

    // ---- AI-описание (существующий) ----
    getMessage: (giftCode) =>
      request('/api/message', 'POST', { giftCode }),

    // ---- Админ ----
    adminGetFeedback: () => request('/api/admin-feedback'),
  };
})();
