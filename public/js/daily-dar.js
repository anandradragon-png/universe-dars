// === Дар Дня — модуль ежедневной активности (Оракул) ===
// Три формата: Карта-подсказка, Общий Дар Дня, Индивидуальный Дар Дня
// ИИ-Оракул генерирует уникальные предсказания на основе данных энциклопедии

const DailyDar = (function() {
  const FIELDS = {1:'ЛОГОС',2:'НИМА',3:'АНДРА',4:'ЗИНГРА',5:'ЛУБА',6:'ТУМА',7:'АСТРА',8:'БИТРА',9:'ОМА'};
  const API_URL = 'https://public-yup-land1.vercel.app';

  let _darContent = null;
  let _currentTab = 'card';
  let _cardRevealed = false;
  let _pulledCard = null;
  let _userQuery = '';

  // --- Загрузка контента даров (fallback) ---
  function loadDarContent() {
    if (_darContent) return Promise.resolve(_darContent);
    return fetch('dar-content.json')
      .then(r => r.json())
      .then(data => { _darContent = data; return data; })
      .catch(() => { _darContent = {}; return {}; });
  }

  // --- Редукция числа к одной цифре (1-9) ---
  function reduce(n) {
    while (n > 9) n = n.toString().split('').reduce((s,d) => s + parseInt(d), 0);
    return n;
  }

  // --- Расчёт общего Дара Дня по дате ---
  function calcGeneralDar(date) {
    const d = date || new Date();
    const day = d.getDate();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const dayDigits = day.toString().split('').reduce((s,c) => s + parseInt(c), 0);
    const monthDigits = month.toString().split('').reduce((s,c) => s + parseInt(c), 0);
    const ma = reduce(dayDigits + monthDigits);
    const yearDigits = year.toString().split('').reduce((s,c) => s + parseInt(c), 0);
    const zhi = reduce(yearDigits);
    const kun = reduce(ma + zhi);
    return { ma, zhi, kun, code: `${ma}-${zhi}-${kun}` };
  }

  // --- Расчёт индивидуального Дара Дня ---
  function calcPersonalDar(userCode, dailyCode) {
    const [uMa, uZhi, uKun] = userCode.split('-').map(Number);
    const [dMa, dZhi, dKun] = dailyCode.split('-').map(Number);
    const ma = reduce(uMa + dMa);
    const zhi = reduce(uZhi + dZhi);
    const kun = reduce(uKun + dKun);
    return { ma, zhi, kun, code: `${ma}-${zhi}-${kun}` };
  }

  function getDarName(code) { return window.DARS[code] || window.INTEGRATORS?.[code] || code; }
  function getDarArchetype(code) { return window.DAR_ARCHETYPES?.[code] || ''; }
  function getFieldName(num) { return FIELDS[num] || num; }

  function formatDate(d) {
    return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + d.getFullYear();
  }

  // --- Рендер изображения дара ---
  function renderDarImage(code, size) {
    size = size || 120;
    const rawName = window.DARS[code] || '';
    if (!rawName) return `<div style="width:${size}px;height:${size}px;border-radius:50%;border:2px solid var(--border);background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text-dim);margin:0 auto">${code}</div>`;
    const base = rawName.toLowerCase().normalize('NFC').replace(/[^а-яёa-z]/g,'');
    return `<img src="images/dars/${base}.svg" style="width:${size}px;height:${size}px;object-fit:contain;filter:invert(85%) sepia(25%) saturate(600%) hue-rotate(10deg) brightness(110%) drop-shadow(0 0 10px #D4AF37);display:block;margin:0 auto" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div style=\\'width:${size}px;height:${size}px;border-radius:50%;border:2px solid var(--border);background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text-dim);margin:0 auto\\'>${code}</div>')"/>`;
  }

  // --- Рубашка карты ---
  function renderCardBack() {
    return `
      <div id="daily-card-container" style="perspective:800px;width:200px;height:300px;margin:20px auto;cursor:pointer" onclick="DailyDar.pullCard()">
        <div id="daily-card-inner" style="position:relative;width:100%;height:100%;transition:transform 0.8s cubic-bezier(0.4,0,0.2,1);transform-style:preserve-3d">
          <div style="position:absolute;width:100%;height:100%;backface-visibility:hidden;border-radius:16px;background:linear-gradient(135deg,#1a0533 0%,#0d0221 50%,#1a0533 100%);border:2px solid rgba(212,175,55,0.4);display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(212,175,55,0.15)">
            <div style="font-size:10px;color:rgba(212,175,55,0.4);letter-spacing:6px;margin-bottom:12px">&#10022; &#10022; &#10022;</div>
            <div style="width:70px;height:70px;border:2px solid rgba(212,175,55,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center">
              <div style="font-size:32px;color:rgba(212,175,55,0.6)">&#9764;</div>
            </div>
            <div style="font-size:11px;color:rgba(212,175,55,0.4);letter-spacing:4px;margin-top:12px">CARTA</div>
            <div style="font-size:9px;color:rgba(212,175,55,0.3);letter-spacing:3px;margin-top:4px">SVETA</div>
          </div>
          <div id="daily-card-face" style="position:absolute;width:100%;height:100%;backface-visibility:hidden;transform:rotateY(180deg);border-radius:16px;background:var(--card);border:2px solid rgba(212,175,55,0.5);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-shadow:0 4px 20px rgba(212,175,55,0.2)">
          </div>
        </div>
      </div>`;
  }

  // === ИИ-Оракул: вызов API ===
  function fetchOracle(darCode, mode, userQuery) {
    // Достаём пол из локального профиля для гендерных форм
    let gender = '';
    try {
      const prof = JSON.parse(localStorage.getItem('_darProfile') || '{}');
      if (prof.gender === 'male' || prof.gender === 'female') gender = prof.gender;
    } catch (e) {}

    return fetch(`${API_URL}/api/oracle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dar_code: darCode, mode, user_query: userQuery || '', gender })
    })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(data => {
      if (data.error) throw new Error(data.error);
      return data;
    });
  }

  // --- Рендер индикатора загрузки ---
  function renderLoading() {
    return `<div style="text-align:center;padding:30px 16px">
      <div style="font-size:32px;margin-bottom:12px;animation:pulse 1.5s ease-in-out infinite">&#128302;</div>
      <div style="font-size:14px;color:#D4AF37;letter-spacing:1px;margin-bottom:6px">Оракул формирует послание...</div>
      <div style="font-size:12px;color:var(--text-muted)">Подожди несколько секунд</div>
    </div>
    <style>@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(1.1)}}</style>`;
  }

  // --- Рендер пророчества Оракула ---
  function renderOracleBlock(data) {
    let html = '';

    // Пророчество
    if (data.prophecy) {
      html += `<div style="background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.2);border-radius:14px;padding:16px;margin-bottom:16px;text-align:left">
        <div style="font-size:13px;color:#D4AF37;letter-spacing:1px;margin-bottom:10px">&#128302; Послание Оракула:</div>
        <div style="font-size:14px;color:#e0e0e0;line-height:1.8;font-style:italic">${data.prophecy}</div>
      </div>`;
    }

    // Энергии
    if (data.energies && data.energies.length > 0) {
      html += `<div style="margin-bottom:16px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;letter-spacing:1px">ЭНЕРГИИ ДНЯ:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">`;
      data.energies.forEach(e => {
        html += `<span style="font-size:12px;padding:4px 10px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);border-radius:8px;color:#D4AF37">${e}</span>`;
      });
      html += `</div></div>`;
    }

    // Практика дня
    if (data.practice) {
      html += `<div style="background:rgba(107,33,168,0.1);border:1px solid rgba(180,120,255,0.25);border-radius:14px;padding:16px;margin-bottom:16px;text-align:left">
        <div style="font-size:13px;color:#c4a0f0;letter-spacing:1px;margin-bottom:10px">&#127793; Практика дня:</div>
        <div style="font-size:13px;color:#e0e0e0;line-height:1.7">${data.practice}</div>
      </div>`;
    }

    return html;
  }

  // --- Fallback: рендер из энциклопедии ---
  function renderFallbackBlock(code, content, contextTitle) {
    if (!content || !content[code]) return '<div style="color:var(--text-muted);text-align:center;padding:16px">Описание недоступно</div>';
    const dar = content[code];
    let html = '';

    // Essence как пророчество
    if (dar.essence) {
      const sentences = dar.essence.replace(/\*\*/g,'').split(/\.\s+/);
      const text = sentences.slice(0, 3).join('. ') + '.';
      html += `<div style="background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.2);border-radius:14px;padding:16px;margin-bottom:16px;text-align:left">
        <div style="font-size:13px;color:#D4AF37;letter-spacing:1px;margin-bottom:10px">${contextTitle || '&#10024; Энергии дня:'}</div>
        <div style="font-size:13px;color:#e0e0e0;line-height:1.7">${text}</div>
      </div>`;
    }

    // Качества
    if (dar.light_power) {
      const qualities = [];
      const matches = dar.light_power.match(/\*\*([^*]+)\*\*/g);
      if (matches) matches.slice(0, 5).forEach(m => qualities.push(m.replace(/\*\*/g,'').replace(/^[-—\s]+/,'')));
      if (qualities.length > 0) {
        html += `<div style="margin-bottom:16px">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;letter-spacing:1px">ЭНЕРГИИ ДНЯ:</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">`;
        qualities.forEach(q => {
          html += `<span style="font-size:12px;padding:4px 10px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.25);border-radius:8px;color:#D4AF37">${q}</span>`;
        });
        html += `</div></div>`;
      }
    }

    // Практика из activation/meditation
    if (dar.meditation || dar.activation) {
      const practiceText = dar.meditation || dar.activation;
      const firstParagraph = practiceText.replace(/\*\*/g,'').split('\n\n')[0];
      html += `<div style="background:rgba(107,33,168,0.1);border:1px solid rgba(180,120,255,0.25);border-radius:14px;padding:16px;margin-bottom:16px;text-align:left">
        <div style="font-size:13px;color:#c4a0f0;letter-spacing:1px;margin-bottom:10px">&#127793; Практика дня:</div>
        <div style="font-size:13px;color:#e0e0e0;line-height:1.7">${firstParagraph}</div>
      </div>`;
    }

    return html;
  }

  // --- Загрузить пророчество (с проверкой лимита и кэша) ---
  function loadProphecy(targetId, darCode, mode, userQuery) {
    const el = document.getElementById(targetId);
    if (!el) return;

    // 1. Проверяем кэш на сегодня для этого дара
    const cached = getCachedOracle(mode, darCode);
    if (cached) {
      el.innerHTML = renderOracleBlock(cached);
      return;
    }

    // 2. Если не в кэше - проверяем лимит
    if (isLimitReached(mode)) {
      // Лимит исчерпан, но кэша под этот код нет (дар дня сменился или пользователь удалил данные)
      el.innerHTML = renderLimitReachedBlock(mode);
      return;
    }

    // 3. Загружаем пророчество
    el.innerHTML = renderLoading();
    fetchOracle(darCode, mode, userQuery)
      .then(data => {
        // Увеличиваем счётчик и сохраняем в кэш
        incrementLimit(mode);
        saveCachedOracle(mode, darCode, data);
        if (el) el.innerHTML = renderOracleBlock(data);
      })
      .catch(err => {
        console.log('Oracle fallback:', err.message);
        // Fallback на данные энциклопедии (не считаем за использование лимита)
        loadDarContent().then(content => {
          if (el) {
            const title = mode === 'card' ? '&#10024; Энергии, которые помогут тебе сегодня:'
              : mode === 'personal' ? '&#128302; Твои персональные энергии сегодня:'
              : '&#127775; Энергии этого дня для всех:';
            el.innerHTML = renderFallbackBlock(darCode, content, title);
          }
        });
      });
  }

  // --- Блок "Лимит на сегодня исчерпан" ---
  function renderLimitReachedBlock(mode) {
    // Определяем пол для правильного окончания
    let gender = '';
    try {
      const prof = JSON.parse(localStorage.getItem('_darProfile') || '{}');
      if (prof.gender === 'male' || prof.gender === 'female') gender = prof.gender;
    } catch (e) {}
    const gotWord = gender === 'female' ? 'получила' : gender === 'male' ? 'получил' : 'получил(а)';

    const title = mode === 'card' ? `Ты уже ${gotWord} своё послание сегодня`
      : mode === 'personal' ? `Ты уже ${gotWord} своё личное послание сегодня`
      : `Ты уже ${gotWord} Дар дня сегодня`;
    return `<div style="text-align:center;padding:32px 20px;background:linear-gradient(135deg,rgba(212,175,55,0.08),rgba(107,33,168,0.06));border:1px solid rgba(212,175,55,0.25);border-radius:18px">
      <div style="font-size:42px;margin-bottom:14px">&#128170;</div>
      <div style="font-size:16px;color:#D4AF37;margin-bottom:12px;line-height:1.4;letter-spacing:0.5px">${title}</div>
      <div style="font-size:13px;color:var(--text-dim);line-height:1.7;margin-bottom:16px">Дай посланию раскрыться в твоей жизни. Новое будет доступно через <b style="color:#D4AF37">${timeUntilReset()}</b>.</div>
      <div style="font-size:11px;color:var(--text-muted);font-style:italic">Мудрость раскрывается медленно - возвращайся завтра</div>
    </div>`;
  }

  // --- Рендер карточки дара ---
  function renderDarCard(code, title, subtitle, showFormula) {
    const name = getDarName(code);
    const arch = getDarArchetype(code);
    return `
      <div style="text-align:center;background:var(--card);border:1px solid rgba(212,175,55,0.3);border-radius:20px;padding:24px 16px;margin-bottom:16px">
        ${title ? `<div style="font-size:12px;color:var(--text-muted);letter-spacing:2px;margin-bottom:12px">${title}</div>` : ''}
        ${renderDarImage(code, 100)}
        <div style="font-size:28px;letter-spacing:4px;color:var(--text);margin-top:14px;text-shadow:0 0 20px rgba(180,120,255,0.4)">${name}</div>
        ${arch ? `<div style="font-size:13px;color:#c4a0f0;font-style:italic;margin-top:6px">${arch}</div>` : ''}
        ${subtitle ? `<div style="font-size:12px;color:var(--text-dim);margin-top:8px">${subtitle}</div>` : ''}
      </div>`;
  }

  // === ЛИМИТЫ И КЭШ ПРОРОЧЕСТВ (сбрасываются в 00:00) ===
  const DAILY_LIMITS = {
    general: 1,  // Дар дня - 1 раз в сутки
    personal: 1, // Личный дар - 1 раз в сутки
    card: 3      // Оракул (карта-подсказка) - 3 раза в сутки
  };

  function todayKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getLimitState(mode) {
    const key = '_oracleLimit_' + mode;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { date: todayKey(), count: 0 };
      const data = JSON.parse(raw);
      if (data.date !== todayKey()) return { date: todayKey(), count: 0 };
      return data;
    } catch (e) {
      return { date: todayKey(), count: 0 };
    }
  }

  function incrementLimit(mode) {
    const state = getLimitState(mode);
    state.count += 1;
    state.date = todayKey();
    localStorage.setItem('_oracleLimit_' + mode, JSON.stringify(state));
    return state;
  }

  function getRemainingLimit(mode) {
    const max = DAILY_LIMITS[mode] || 1;
    const state = getLimitState(mode);
    return Math.max(0, max - state.count);
  }

  function isLimitReached(mode) {
    return getRemainingLimit(mode) === 0;
  }

  // Кэш пророчеств: сохраняем последний ответ Оракула на сутки
  function saveCachedOracle(mode, darCode, data) {
    const key = '_oracleCache_' + mode;
    try {
      localStorage.setItem(key, JSON.stringify({
        date: todayKey(),
        darCode,
        data
      }));
    } catch (e) {}
  }

  function getCachedOracle(mode, darCode) {
    const key = '_oracleCache_' + mode;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj.date !== todayKey()) return null;
      if (obj.darCode !== darCode) return null;
      return obj.data;
    } catch (e) {
      return null;
    }
  }

  // Время до обнуления в формате "ЧЧ:ММ"
  function timeUntilReset() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const diff = tomorrow - now;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours} ч ${minutes} мин`;
    return `${minutes} мин`;
  }

  // === РЕНДЕР ОСНОВНОГО ЭКРАНА ===
  function render() {
    const container = document.getElementById('daily-dar-content');
    if (!container) return;

    const tabs = [
      { id: 'card', icon: '&#127183;', label: 'Оракул' },
      { id: 'general', icon: '&#127775;', label: 'Дар дня' },
      { id: 'personal', icon: '&#128302;', label: 'Личное послание' }
    ];

    let html = `<div style="display:flex;gap:6px;margin-bottom:16px;justify-content:center">`;
    tabs.forEach(t => {
      const isActive = t.id === _currentTab;
      html += `<button onclick="DailyDar.switchTab('${t.id}')" style="flex:1;max-width:130px;min-width:0;padding:10px 6px;border-radius:12px;border:1px solid ${isActive ? 'rgba(212,175,55,0.6)' : 'var(--border)'};background:${isActive ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)'};cursor:pointer;text-align:center;font-family:Georgia,serif;transition:all .2s">
        <div style="font-size:18px;margin-bottom:2px">${t.icon}</div>
        <div style="font-size:10px;color:${isActive ? '#D4AF37' : 'var(--text-dim)'};letter-spacing:0.5px;line-height:1.3;word-wrap:break-word">${t.label}</div>
      </button>`;
    });
    html += `</div><div id="daily-dar-tab-content"></div>`;
    container.innerHTML = html;
    renderTab();
  }

  function renderTab() {
    const container = document.getElementById('daily-dar-tab-content');
    if (!container) return;
    switch (_currentTab) {
      case 'card': renderCardTab(container); break;
      case 'general': renderGeneralTab(container); break;
      case 'personal': renderPersonalTab(container); break;
    }
  }

  // === ВКЛАДКА 1: Оракул (карта-подсказка) ===
  function renderCardTab(container) {
    const remaining = getRemainingLimit('card');
    const limitInfo = `<div style="text-align:center;margin-bottom:10px;font-size:11px;color:var(--text-muted)">Осталось обращений сегодня: <span style="color:#D4AF37;font-weight:bold">${remaining}</span> из ${DAILY_LIMITS.card}</div>`;

    if (!_cardRevealed) {
      if (remaining === 0) {
        container.innerHTML = `${limitInfo}${renderLimitReachedBlock('card')}`;
        return;
      }
      container.innerHTML = `
        ${limitInfo}
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:14px;color:var(--text);margin-bottom:8px">Сформулируй свой запрос</div>
          <div style="font-size:12px;color:var(--text-dim);margin-bottom:14px;line-height:1.5">Какой вопрос тебя волнует? Какие энергии помогут приблизиться к решению?</div>
          <textarea id="daily-card-query" placeholder="Например: Как мне найти баланс между работой и отдыхом?..." style="width:100%;min-height:70px;padding:12px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:14px;font-family:Georgia,serif;resize:vertical;outline:none;line-height:1.5"></textarea>
        </div>
        ${renderCardBack()}
        <div style="text-align:center;font-size:12px;color:var(--text-muted);margin-top:8px">Нажми на карту, чтобы вытянуть подсказку</div>`;
    } else {
      // Показать результат
      let html = limitInfo;
      html += renderDarCard(_pulledCard, 'ТВОЯ КАРТА-ПОДСКАЗКА', null, false);
      html += `<div id="oracle-card-result"></div>`;
      // Кнопка "Вытянуть ещё раз" - только если после этого раза ещё остались попытки
      if (remaining > 0) {
        html += `<div style="text-align:center;margin-top:12px">
          <button onclick="DailyDar.resetCard()" style="padding:10px 20px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-dim);font-size:13px;cursor:pointer;font-family:Georgia,serif">&#128260; Вытянуть ещё раз</button>
        </div>`;
      }
      container.innerHTML = html;
      // Запросить пророчество от Оракула
      loadProphecy('oracle-card-result', _pulledCard, 'card', _userQuery);
    }
  }

  function pullCard() {
    if (_cardRevealed) return;
    // Сохранить запрос пользователя
    const queryEl = document.getElementById('daily-card-query');
    _userQuery = queryEl ? queryEl.value.trim() : '';

    const allCodes = Object.keys(window.DARS);
    _pulledCard = allCodes[Math.floor(Math.random() * allCodes.length)];

    const inner = document.getElementById('daily-card-inner');
    if (inner) {
      const face = document.getElementById('daily-card-face');
      if (face) {
        const name = getDarName(_pulledCard);
        const arch = getDarArchetype(_pulledCard);
        face.innerHTML = `
          ${renderDarImage(_pulledCard, 80)}
          <div style="font-size:22px;letter-spacing:3px;color:var(--text);margin-top:10px;text-shadow:0 0 15px rgba(180,120,255,0.4)">${name}</div>
          <div style="font-size:11px;color:var(--text-dim);letter-spacing:2px;margin-top:4px">${_pulledCard}</div>
          ${arch ? `<div style="font-size:11px;color:#c4a0f0;font-style:italic;margin-top:4px">${arch}</div>` : ''}`;
      }
      inner.style.transform = 'rotateY(180deg)';
      setTimeout(() => { _cardRevealed = true; renderTab(); }, 1000);
    }
  }

  function resetCard() {
    _cardRevealed = false;
    _pulledCard = null;
    _userQuery = '';
    renderTab();
  }

  // === ВКЛАДКА 2: Общий Дар Дня ===
  function renderGeneralTab(container) {
    const today = new Date();
    const dar = calcGeneralDar(today);
    const dateStr = formatDate(today);

    let html = `<div style="text-align:center;font-size:12px;color:var(--text-muted);letter-spacing:2px;margin-bottom:14px">${dateStr}</div>`;
    html += renderDarCard(dar.code, 'ОБЩИЙ ДАР ДНЯ', null, true);
    html += `<div id="oracle-general-result"></div>`;
    container.innerHTML = html;
    loadProphecy('oracle-general-result', dar.code, 'general');
  }

  // === ВКЛАДКА 3: Индивидуальный Дар Дня ===
  function renderPersonalTab(container) {
    const saved = localStorage.getItem(window.STORAGE_KEY || '_darCalculator');
    if (!saved) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px 16px">
          <div style="font-size:40px;margin-bottom:16px">&#128302;</div>
          <div style="font-size:16px;color:var(--text);margin-bottom:10px">Сначала рассчитай свой Дар</div>
          <div style="font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:20px">Чтобы узнать индивидуальный Дар Дня, нужно знать твой личный дар по дате рождения</div>
          <button onclick="DailyDar.close();switchNav('calc')" style="padding:12px 24px;border-radius:14px;border:none;background:linear-gradient(135deg,#6b21a8,#3b0764);color:var(--text);font-size:14px;cursor:pointer;font-family:Georgia,serif;letter-spacing:1px">Рассчитать мой дар</button>
        </div>`;
      return;
    }

    let userGift;
    try { userGift = JSON.parse(saved).gift; } catch(e) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px">Ошибка данных</div>';
      return;
    }

    const today = new Date();
    const generalDar = calcGeneralDar(today);
    const personalDar = calcPersonalDar(userGift.code, generalDar.code);
    const dateStr = formatDate(today);

    let html = `<div style="text-align:center;font-size:12px;color:var(--text-muted);letter-spacing:2px;margin-bottom:14px">${dateStr}</div>`;
    html += renderDarCard(personalDar.code, 'ТВОЙ ДАР ДНЯ', null, true);
    html += `<div id="oracle-personal-result"></div>`;

    container.innerHTML = html;
    loadProphecy('oracle-personal-result', personalDar.code, 'personal');
  }

  // === Навигация ===
  function switchTab(tab) { _currentTab = tab; render(); }

  function open() {
    document.getElementById('screen-result').style.display = 'none';
    document.getElementById('daily-activities').style.display = 'none';
    document.getElementById('screen-input').style.display = 'none';
    document.getElementById('daily-dar-screen').style.display = 'block';
    render();
  }

  function close() {
    document.getElementById('daily-dar-screen').style.display = 'none';
    const saved = localStorage.getItem(window.STORAGE_KEY || '_darCalculator');
    if (saved) {
      document.getElementById('screen-result').style.display = 'block';
      document.getElementById('daily-activities').style.display = 'block';
    } else {
      document.getElementById('screen-input').style.display = 'block';
    }
  }

  function loadPreview() {
    const today = new Date();
    const dar = calcGeneralDar(today);
    const name = getDarName(dar.code);
    const arch = getDarArchetype(dar.code);
    const el = document.getElementById('daily-dar-name');
    if (el) el.textContent = name + (arch ? ' — ' + arch : '');
    window._dailyDarCode = dar.code;
  }

  return { render, switchTab, open, close, pullCard, resetCard, loadPreview, calcGeneralDar, calcPersonalDar };
})();
