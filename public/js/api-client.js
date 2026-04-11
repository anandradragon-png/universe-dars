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

  // --- Кольцевой буфер последних API-ошибок для диагностики ---
  function logApiError(kind, path, info) {
    try {
      const list = JSON.parse(localStorage.getItem('_dar_api_errors') || '[]');
      list.push({
        ts: new Date().toISOString(),
        kind,
        path,
        info: typeof info === 'string' ? info.slice(0, 300) : info
      });
      // Храним только 20 последних
      while (list.length > 20) list.shift();
      localStorage.setItem('_dar_api_errors', JSON.stringify(list));
    } catch (e) {}
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
      throw new Error('Нет связи с сервером (' + netErr.message + ')');
    }
    let data;
    try {
      data = await resp.json();
    } catch (parseErr) {
      const text = await resp.text().catch(() => '');
      console.error('[DarAPI] non-JSON response', path, 'status', resp.status, 'body:', text.slice(0, 200));
      logApiError('non-json', path, { status: resp.status, body: text.slice(0, 300) });
      throw new Error('Сервер вернул не-JSON (' + resp.status + ')');
    }
    if (!resp.ok) {
      console.warn('[DarAPI] http error', path, 'status', resp.status, 'body:', data);
      logApiError('http', path, { status: resp.status, body: data });
      throw new Error(data.error || ('HTTP ' + resp.status));
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

    // ---- AI-описание (существующий) ----
    getMessage: (giftCode) =>
      request('/api/message', 'POST', { giftCode }),

    // ---- Админ ----
    adminGetFeedback: () => request('/api/admin-feedback'),
  };
})();
