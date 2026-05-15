/**
 * Прототип архитектуры YupDar — навигация между 4 разделами.
 */
(function () {
  'use strict';

  const tg = window.Telegram?.WebApp;
  if (tg) {
    try { tg.expand(); tg.ready(); } catch (e) {}
  }

  // Переключение вкладок
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById('tab-' + name);
    const nav = document.getElementById('nav-' + name);
    if (tab) tab.classList.add('active');
    if (nav) nav.classList.add('active');
    window.scrollTo(0, 0);
    // При входе в Сокровищницу рендерим сетку 64 даров (если она активна)
    if (name === 'treasury') {
      try { renderCollection(); } catch (e) {}
    }
  }
  window.switchTab = switchTab;

  // Переключение подвкладок внутри секций (Сокровищница, Арка)
  function attachSubtabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      const buttons = tab.querySelectorAll('.subtab[data-subtab]');
      const contents = tab.querySelectorAll('.subtab-content[data-subtab-content]');
      if (!buttons.length || !contents.length) return;
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-subtab');
          buttons.forEach(b => b.classList.toggle('active', b === btn));
          contents.forEach(c => c.classList.toggle('active', c.getAttribute('data-subtab-content') === target));
          // При открытии «Моя коллекция» — отрендерить сетку
          if (target === 'collection') renderCollection();
          // При открытии «Энциклопедия» — отрендерить список 9 полей
          if (target === 'search') renderEncyclopedia();
        });
      });
    });
  }

  // Рендер сетки 64 даров (Сокровищница → Коллекция).
  // Как в проде: 3 колонки, заголовок поля + счётчик «N/7»,
  // закрытые показываются как 🔒 + ??? (без имени).
  function renderCollection() {
    const grid = document.getElementById('collection-grid');
    if (!grid || !window.DarsLib) return;
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    const profile = loadProfile();
    const myCode = profile && profile.date
      ? DarsLib.calcOda(profile.date).code
      : null;
    // Открытые дары: свой Дар + дары близких (заглушка: пока только свой)
    const unlocked = new Set();
    if (myCode) unlocked.add(myCode);

    // Группируем по полю (КУН)
    const byField = {};
    Object.keys(DarsLib.DARS).forEach(code => {
      const f = DarsLib.getFieldId(code);
      if (!byField[f]) byField[f] = [];
      byField[f].push(code);
    });

    let unlockedCount = 0;
    const html = [];
    for (let f = 1; f <= 9; f++) {
      const codes = byField[f];
      if (!codes || !codes.length) continue;
      const fieldData = DarsLib.FIELDS[f];
      const fieldName = (fieldData && fieldData['name_' + lang]) || fieldData?.name_ru || ('Поле ' + f);
      const fieldUnlocked = codes.filter(c => unlocked.has(c)).length;
      html.push(`<div class="collection-field" style="--field-color:${fieldData?.color || '#fff'}">
        <div class="collection-field-header">
          <span class="collection-field-glyph">${fieldData?.glyph || '◇'}</span>
          <span class="collection-field-name">${fieldName}</span>
          <span class="collection-field-counter">${fieldUnlocked}/${codes.length}</span>
        </div>
        <div class="collection-grid-inner">`);
      codes.forEach(code => {
        const isMine = code === myCode;
        const isUnlocked = unlocked.has(code);
        if (isUnlocked) unlockedCount++;
        if (isUnlocked) {
          const name = DarsLib.getDarName(code, lang);
          const svgPath = DarsLib.getDarSvgPath(code);
          const cls = isMine ? 'mine unlocked' : 'unlocked';
          html.push(`<div class="collection-cell ${cls}" data-code="${code}" onclick="openDarDetail('${code}')">
            <div class="collection-cell-img"><img src="${svgPath}" alt="" onerror="this.style.display='none'"></div>
            <div class="collection-cell-name">${escapeHtml(name)}</div>
          </div>`);
        } else {
          // Закрытые: только замок и «???» как в проде
          html.push(`<div class="collection-cell locked">
            <div class="collection-cell-lock-icon">🔒</div>
            <div class="collection-cell-name">???</div>
          </div>`);
        }
      });
      html.push(`</div></div>`);
    }
    grid.innerHTML = html.join('');

    // Прогрессбар вверху сетки
    const cnt = document.getElementById('collection-unlocked-count');
    if (cnt) cnt.textContent = unlockedCount;
    const bar = document.getElementById('collection-progress-bar');
    if (bar) bar.style.width = ((unlockedCount / 64) * 100) + '%';
  }
  window.renderCollection = renderCollection;

  // Переключение языка
  function setLang(lang) {
    if (!window.previewI18n) return;
    previewI18n.setLang(lang).then(() => {
      updateLangButtonLabel();
      hideLangPicker();
    });
  }
  window.setLang = setLang;

  function toggleLangPicker(ev) {
    if (ev) ev.stopPropagation();
    const picker = document.getElementById('lang-picker');
    if (!picker) return;
    picker.classList.toggle('open');
  }
  window.toggleLangPicker = toggleLangPicker;

  function hideLangPicker() {
    const picker = document.getElementById('lang-picker');
    if (picker) picker.classList.remove('open');
  }

  function updateLangButtonLabel() {
    const btn = document.getElementById('lang-btn-label');
    if (!btn || !window.previewI18n) return;
    btn.textContent = previewI18n.getLang().toUpperCase();
  }

  // Заглушка: открыть опрос для учёных
  function openScienceSurvey() {
    const url = 'https://nauka-yupdar.vercel.app';
    if (tg && tg.openLink) tg.openLink(url);
    else window.open(url, '_blank');
  }
  window.openScienceSurvey = openScienceSurvey;

  // ЛК (личный кабинет)
  function openProfile() {
    document.getElementById('lk-backdrop')?.classList.add('open');
    document.getElementById('lk-panel')?.classList.add('open');
  }
  function closeLK() {
    document.getElementById('lk-backdrop')?.classList.remove('open');
    document.getElementById('lk-panel')?.classList.remove('open');
  }
  window.openProfile = openProfile;
  window.closeLK = closeLK;

  // === ВКЛАДКА «Я»: расчёт Дара по 4 уровням ===

  const PROFILE_KEY = '_yupdar_preview_profile';

  function loadProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function saveProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
  }

  // Маска даты: автоматическая вставка точек
  function attachDateMask(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 8);
      let out = digits;
      if (digits.length >= 5) out = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
      else if (digits.length >= 3) out = digits.slice(0, 2) + '.' + digits.slice(2);
      input.value = out;
      const err = document.getElementById('me-date-error');
      if (err) err.textContent = '';
    });
  }

  // Маска времени HH:MM
  function attachTimeMask(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 4);
      let out = digits;
      if (digits.length >= 3) out = digits.slice(0, 2) + ':' + digits.slice(2);
      input.value = out;
      const err = document.getElementById('depth-time-error');
      if (err) err.textContent = '';
    });
  }

  function parseDate(str) {
    const m = String(str || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const now = new Date().getFullYear();
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > now) return null;
    return { day, month, year };
  }

  function parseTime(str) {
    const m = String(str || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }

  function calculateMyDar() {
    const input = document.getElementById('me-date');
    const errEl = document.getElementById('me-date-error');
    const date = parseDate(input.value);
    if (!date) {
      errEl.textContent = 'Дата в формате ДД.ММ.ГГГГ';
      return;
    }
    const profile = { date, time: null, coords: null, person: null };
    saveProfile(profile);
    renderMeState();
  }
  window.calculateMyDar = calculateMyDar;

  // ЗАКОН: личные данные изменить нельзя (law_personal_data_immutable.md).
  // Функция resetMyDar намеренно удалена. Сброс — только через
  // «Полный сброс» в ЛК (тест) или через поддержку (админка).

  function renderMeState() {
    const p = loadProfile();
    const input = document.getElementById('me-input-state');
    const res = document.getElementById('me-result-state');
    if (!input || !res) return;
    if (p && p.date) {
      input.style.display = 'none';
      res.style.display = 'block';
      renderMeResult();
    } else {
      input.style.display = 'block';
      res.style.display = 'none';
    }
  }

  function renderMeResult() {
    const p = loadProfile();
    if (!p || !p.date || !window.DarsLib) return;
    const profile = DarsLib.calcProfile(p);
    if (!profile) return;
    const syn = profile.synthesis;

    document.getElementById('me-dar-name').textContent = syn.name;
    document.getElementById('me-dar-code').textContent = syn.code;
    document.getElementById('me-dar-archetype').textContent = syn.archetype || '';

    // Картинка Дара: золотая SVG из основного приложения
    // /images/dars/{имя-в-нижнем-без-дефиса}.svg, при ошибке — ✨
    const img = document.getElementById('me-dar-image');
    const emoji = document.getElementById('me-dar-emoji');
    if (img && emoji) {
      img.onerror = () => {
        img.style.display = 'none';
        emoji.style.display = '';
      };
      img.onload = () => {
        img.style.display = '';
        emoji.style.display = 'none';
      };
      img.src = DarsLib.getDarSvgPath(syn.code);
    }

    // Подсветка пройденных шагов с расчётом каждого уровня
    setDepthStep('depth-time', p.time
      ? String(p.time.hour).padStart(2,'0') + ':' + String(p.time.minute).padStart(2,'0')
      : null,
      profile.tuna ? `ТУНА: ${profile.tuna.code} · ${profile.tuna.name}` : null
    );
    setDepthStep('depth-place', p.coords && p.coords.label ? p.coords.label : null,
      profile.tria ? `ТРИА: ${profile.tria.code} · ${profile.tria.name}` : null
    );
    setDepthStep('depth-name', p.person
      ? [p.person.firstName, p.person.lastName].filter(Boolean).join(' ')
      : null,
      profile.chia ? `ЧИА: ${profile.chia.code} · ${profile.chia.name}` : null
    );

    // Если все 3 уровня заполнены — показываем синтез, скрываем поля ввода
    const allFilled = !!(profile.tuna && profile.tria && profile.chia);
    const stepsBlock = document.getElementById('depth-steps-block');
    const synBlock = document.getElementById('synthesis-block');
    if (allFilled && stepsBlock && synBlock) {
      stepsBlock.hidden = true;
      synBlock.hidden = false;
      renderSynthesis(profile);
    } else if (stepsBlock && synBlock) {
      stepsBlock.hidden = false;
      synBlock.hidden = true;
    }
  }

  function renderSynthesis(profile) {
    const wrap = document.getElementById('synthesis-levels');
    if (!wrap) return;
    const t = (k, fb) => ((window.previewI18n && previewI18n.t(k)) || fb);
    const levels = [
      { key: 'oda',  label: 'ОДА',  sub: t('me.depth_date_title',  'Дата рождения'),  data: profile.oda  },
      { key: 'tuna', label: 'ТУНА', sub: t('me.depth_time_title',  'Время рождения'), data: profile.tuna },
      { key: 'tria', label: 'ТРИА', sub: t('me.depth_place_title', 'Место рождения'), data: profile.tria },
      { key: 'chia', label: 'ЧИА',  sub: t('me.depth_name_title',  'Имя и фамилия'),  data: profile.chia }
    ];
    wrap.innerHTML = levels.map(lvl => {
      if (!lvl.data) return '';
      const svgPath = DarsLib.getDarSvgPath(lvl.data.code);
      return `<div class="synthesis-level">
        <div class="synthesis-level-icon"><img src="${svgPath}" alt="" onerror="this.style.display='none'"></div>
        <div class="synthesis-level-text">
          <div class="synthesis-level-name">${lvl.data.name} <span style="color:var(--text-muted);font-weight:400">· ${lvl.data.code}</span></div>
          <div class="synthesis-level-meta">${lvl.label} — ${lvl.sub}${lvl.data.archetype ? ' · ' + lvl.data.archetype : ''}</div>
        </div>
        <div class="synthesis-level-influence">${lvl.data.influence}%</div>
      </div>`;
    }).join('');
  }

  function editDepthAgain() {
    // Раскрываем поля для редактирования
    const stepsBlock = document.getElementById('depth-steps-block');
    const synBlock = document.getElementById('synthesis-block');
    if (stepsBlock) stepsBlock.hidden = false;
    if (synBlock) synBlock.hidden = true;
  }
  window.editDepthAgain = editDepthAgain;

  function setDepthStep(id, value, levelInfo) {
    const block = document.getElementById(id);
    if (!block) return;
    const val = block.querySelector('.depth-step-value');
    const btn = block.querySelector('.depth-step-btn');
    if (value) {
      block.classList.add('filled');
      if (val) {
        // Показываем введённое значение + рядом результат расчёта уровня
        if (levelInfo) {
          val.innerHTML = `${escapeHtml(value)} <span class="depth-level-result">${escapeHtml(levelInfo)}</span>`;
        } else {
          val.textContent = value;
        }
      }
      if (btn) {
        btn.textContent = previewI18n?.t('common.change') || 'Изменить';
      }
    } else {
      block.classList.remove('filled');
      if (val) val.textContent = '—';
      if (btn) btn.textContent = previewI18n?.t('common.add') || 'Добавить';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' })[c]);
  }

  // === Энциклопедия Даров ===

  // Энциклопедия — список 9 полей по образцу прода:
  // [глиф] [Название]  [Стихия]                 [N даров >]
  function renderEncyclopedia() {
    const list = document.getElementById('encyc-list');
    if (!list || !window.DarsLib) return;
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    const byField = {};
    Object.keys(DarsLib.DARS).forEach(code => {
      const f = DarsLib.getFieldId(code);
      if (!byField[f]) byField[f] = [];
      byField[f].push(code);
    });
    const html = [];
    for (let f = 1; f <= 9; f++) {
      const codes = byField[f];
      if (!codes) continue;
      const fd = DarsLib.FIELDS[f] || {};
      const fieldName = fd['name_' + lang] || fd.name_ru || ('Поле ' + f);
      const element = fd['element_' + lang] || fd.element_ru || '';
      const tLabel = (window.previewI18n && previewI18n.t('encyc.dars_count_label')) || 'даров';
      html.push(`<div class="encyc-field-prod-row" style="--field-color:${fd.color || '#fff'}" onclick="openFieldList(${f})">
        <div class="encyc-field-prod-glyph">${fd.glyph || '◇'}</div>
        <div class="encyc-field-prod-text">
          <div class="encyc-field-prod-name">${escapeHtml(fieldName)}</div>
          <div class="encyc-field-prod-element">${escapeHtml(element)}</div>
        </div>
        <div class="encyc-field-prod-count">${codes.length} ${tLabel} <span style="opacity:0.6">›</span></div>
      </div>`);
    }
    list.innerHTML = html.join('');
  }
  window.renderEncyclopedia = renderEncyclopedia;

  // Открыть список Даров одного поля (после клика на карточку поля)
  function openFieldList(fieldId) {
    const list = document.getElementById('encyc-list');
    if (!list || !window.DarsLib) return;
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    const fd = DarsLib.FIELDS[fieldId] || {};
    const fieldName = fd['name_' + lang] || fd.name_ru;
    const element = fd['element_' + lang] || fd.element_ru || '';
    const codes = Object.keys(DarsLib.DARS).filter(c => DarsLib.getFieldId(c) === fieldId);
    const tBack = (window.previewI18n && previewI18n.t('encyc.back_to_fields')) || '← Все поля';
    let html = `<div class="encyc-back-btn" onclick="renderEncyclopedia()">${tBack}</div>
      <div class="encyc-field-prod-row" style="--field-color:${fd.color};margin-bottom:14px;cursor:default">
        <div class="encyc-field-prod-glyph">${fd.glyph || '◇'}</div>
        <div class="encyc-field-prod-text">
          <div class="encyc-field-prod-name">${escapeHtml(fieldName)}</div>
          <div class="encyc-field-prod-element">${escapeHtml(element)}</div>
        </div>
      </div>`;
    codes.forEach(code => {
      const name = DarsLib.getDarName(code, lang);
      const svgPath = DarsLib.getDarSvgPath(code);
      html += `<div class="encyc-dar-row" onclick="openDarDetail('${code}')">
        <div class="encyc-dar-img"><img src="${svgPath}" alt="" onerror="this.style.display='none'"></div>
        <div class="encyc-dar-name">${escapeHtml(name)}</div>
        <div class="encyc-dar-code">${code}</div>
      </div>`;
    });
    list.innerHTML = html;
  }
  window.openFieldList = openFieldList;

  // === Детальная карточка Дара (по образцу прода: 9 секций из dar-content.json) ===

  let darContentCache = null;

  async function loadDarContent() {
    if (darContentCache) return darContentCache;
    try {
      const resp = await fetch('/dar-content.json?v=1');
      if (resp.ok) darContentCache = await resp.json();
      else darContentCache = {};
    } catch (e) {
      darContentCache = {};
    }
    return darContentCache;
  }

  // Простой markdown → HTML для содержимого dar-content
  function mdToHtml(text) {
    if (!text) return '';
    let s = String(text);
    // Экранируем HTML
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // **bold**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // *italic*
    s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    // Списки (строки начинаются с - или •)
    const lines = s.split(/\r?\n/);
    let html = '';
    let inList = false;
    for (const line of lines) {
      const m = line.match(/^\s*[-•]\s+(.+)$/);
      if (m) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + m[1] + '</li>';
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        const trimmed = line.trim();
        if (trimmed) html += '<p>' + trimmed + '</p>';
      }
    }
    if (inList) html += '</ul>';
    return html;
  }

  const DAR_SECTIONS_RU = [
    { key: 'essence',         title: 'Суть' },
    { key: 'energy_pattern',  title: 'Энергетический рисунок' },
    { key: 'light_power',     title: 'Светлая сила' },
    { key: 'shadow',          title: 'Тень' },
    { key: 'activation',      title: 'Активация' },
    { key: 'meditation',      title: 'Медитация' },
    { key: 'application',     title: 'Применение' },
    { key: 'safety',          title: 'Безопасность' },
    { key: 'attributes',      title: 'Атрибуты' }
  ];

  async function openDarDetail(code) {
    const screen = document.getElementById('dar-detail-screen');
    if (!screen) return;
    screen.classList.add('open');
    const content = document.getElementById('dar-detail-content');
    const headerName = document.getElementById('dar-detail-header-name');
    if (!content) return;
    content.innerHTML = '<div class="placeholder">Загружаю…</div>';

    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    const name = DarsLib.getDarName(code, lang);
    const archetype = DarsLib.getDarArchetype(code, lang);
    const svgPath = DarsLib.getDarSvgPath(code);
    if (headerName) headerName.textContent = name;

    // Hero-шапка
    let html = `<div class="dar-detail-hero">
      <img src="${svgPath}" alt="" onerror="this.style.display='none'">
      <div class="dar-detail-hero-name">${escapeHtml(name)}</div>
      <div class="dar-detail-hero-code">${code}</div>
      ${archetype ? `<div class="dar-detail-hero-archetype">${escapeHtml(archetype)}</div>` : ''}
    </div>`;

    // 9 секций из dar-content.json
    const data = await loadDarContent();
    const dar = data[code];
    if (!dar) {
      html += '<div class="placeholder">Контент этого Дара пока не загружен. Скоро добавим.</div>';
    } else {
      for (const sec of DAR_SECTIONS_RU) {
        const raw = dar[sec.key];
        if (!raw) continue;
        // attributes — это объект, обрабатываем отдельно
        let bodyHtml;
        if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
          bodyHtml = '<ul>' + Object.entries(raw).map(([k, v]) =>
            `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</li>`
          ).join('') + '</ul>';
        } else {
          bodyHtml = mdToHtml(raw);
        }
        html += `<div class="dar-detail-section">
          <h3>${sec.title}</h3>
          <div class="dar-detail-section-body">${bodyHtml}</div>
        </div>`;
      }
    }

    content.innerHTML = html;
    screen.scrollTop = 0;
  }
  window.openDarDetail = openDarDetail;

  function closeDarDetail() {
    document.getElementById('dar-detail-screen')?.classList.remove('open');
  }
  window.closeDarDetail = closeDarDetail;

  // Мини-табы Энциклопедии Дары/Поля
  function switchEncycTab(name) {
    document.querySelectorAll('.encyc-mini-tab').forEach(b =>
      b.classList.toggle('active', b.getAttribute('data-encyc') === name)
    );
    document.querySelectorAll('.encyc-tab-content').forEach(c =>
      c.classList.toggle('active', c.getAttribute('data-encyc-content') === name)
    );
    if (name === 'fields') renderEncycFields();
  }
  window.switchEncycTab = switchEncycTab;

  function renderEncycFields() {
    const list = document.getElementById('encyc-fields-list');
    if (!list || !window.DarsLib) return;
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    // Считаем сколько даров в каждом поле
    const byField = {};
    Object.keys(DarsLib.DARS).forEach(code => {
      const f = DarsLib.getFieldId(code);
      byField[f] = (byField[f] || 0) + 1;
    });
    const html = [];
    for (let f = 1; f <= 9; f++) {
      const data = DarsLib.FIELDS[f];
      if (!data) continue;
      const fieldName = data['name_' + lang] || data.name_ru;
      const count = byField[f] || 0;
      html.push(`<div class="encyc-field-card" style="--field-color:${data.color}" onclick="openFieldDetail(${f})">
        <div class="encyc-field-card-dot"></div>
        <div class="encyc-field-card-text">
          <div class="encyc-field-card-name">${escapeHtml(fieldName)}</div>
          <div class="encyc-field-card-meta">Поле ${f}</div>
        </div>
        <div class="encyc-field-card-count">${count} даров</div>
      </div>`);
    }
    list.innerHTML = html.join('');
  }

  function openFieldDetail(fieldId) {
    // Переключаемся обратно на «Дары» и фильтруем по полю
    switchEncycTab('dars');
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    const fieldData = DarsLib.FIELDS[fieldId];
    const fieldName = fieldData['name_' + lang] || fieldData.name_ru;
    const input = document.getElementById('encyc-search-input');
    if (input) {
      input.value = fieldName;
      encycSearch(fieldName);
    }
  }
  window.openFieldDetail = openFieldDetail;

  function encycSearch(query) {
    const results = document.getElementById('encyc-results');
    const list = document.getElementById('encyc-list');
    if (!results || !list) return;
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      results.hidden = true;
      list.hidden = false;
      return;
    }
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    const matches = [];
    Object.keys(DarsLib.DARS).forEach(code => {
      const name = DarsLib.getDarName(code, lang).toLowerCase();
      const fieldData = DarsLib.FIELDS[DarsLib.getFieldId(code)];
      const fieldName = (fieldData?.['name_' + lang] || fieldData?.name_ru || '').toLowerCase();
      if (code.includes(q) || name.includes(q) || fieldName.includes(q)) {
        matches.push({ code, name: DarsLib.getDarName(code, lang) });
      }
    });
    if (matches.length === 0) {
      results.innerHTML = '<div class="placeholder">Ничего не найдено</div>';
    } else {
      results.innerHTML = matches.map(m => `<div class="encyc-dar-row" onclick="openDarDetail('${m.code}')">
        <div class="encyc-dar-img"><img src="${DarsLib.getDarSvgPath(m.code)}" alt="" onerror="this.style.display='none'"></div>
        <div class="encyc-dar-name">${escapeHtml(m.name)}</div>
        <div class="encyc-dar-code">${m.code}</div>
      </div>`).join('');
    }
    results.hidden = false;
    list.hidden = true;
  }
  window.encycSearch = encycSearch;

  // === Читалка Книги Даров ===

  const bookState = {
    data: null,            // загруженный JSON book-chapters
    flatChapters: [],      // плоский массив глав для навигации
    currentIndex: 0,       // индекс текущей главы
    lang: null
  };

  async function loadBookForLang(lang) {
    // Если язык изменился — сбрасываем кэш и грузим заново
    if (bookState.data && bookState.lang === lang) return bookState.data;
    bookState.data = null;
    bookState.flatChapters = [];
    bookState.lang = null;
    try {
      const resp = await fetch(`/preview/book-chapters.${lang}.json?v=1`);
      if (resp.ok) {
        bookState.data = await resp.json();
        bookState.lang = lang;
      } else if (lang !== 'ru') {
        // Фоллбэк: если книги на этом языке нет — пробуем RU
        // (для RU читаем основной файл из прода)
        return loadBookForLang('ru');
      } else {
        // RU читаем из основного файла прода
        const ru = await fetch('/book-chapters.json?v=1');
        if (ru.ok) {
          bookState.data = await ru.json();
          bookState.lang = 'ru';
        } else {
          throw new Error('book file not found');
        }
      }
    } catch (e) {
      console.warn('[book] load failed', e.message);
      // Последняя попытка — прод-RU
      try {
        const ru = await fetch('/book-chapters.json?v=1');
        bookState.data = await ru.json();
        bookState.lang = 'ru';
      } catch (e2) {
        bookState.data = null;
      }
    }
    // Сплющим главы в один массив для навигации
    bookState.flatChapters = [];
    if (bookState.data?.parts) {
      bookState.data.parts.forEach(part => {
        (part.chapters || []).forEach(ch => {
          bookState.flatChapters.push({ ...ch, partTitle: part.title });
        });
      });
    }
    return bookState.data;
  }

  async function openBookOfDars() {
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    document.getElementById('book-backdrop')?.classList.add('open');
    document.getElementById('book-reader')?.classList.add('open');
    document.getElementById('book-reader-content').innerHTML =
      '<div class="placeholder">Загружаю книгу…</div>';
    await loadBookForLang(lang);
    if (!bookState.data || !bookState.flatChapters.length) {
      document.getElementById('book-reader-content').innerHTML =
        '<div class="placeholder">Книга на этом языке пока недоступна.</div>';
      return;
    }
    bookState.currentIndex = 0;
    renderBookChapter();
    renderBookToc();
    // Метка языка
    const langLabel = document.getElementById('book-reader-lang');
    if (langLabel) langLabel.textContent = bookState.lang.toUpperCase();
  }
  window.openBookOfDars = openBookOfDars;

  function openBookForParents() {
    alert('👶 Книга для Родителей — открывается на карточке ребёнка во вкладке «Семья».');
  }
  window.openBookForParents = openBookForParents;

  function closeBook() {
    document.getElementById('book-backdrop')?.classList.remove('open');
    document.getElementById('book-reader')?.classList.remove('open');
    document.getElementById('book-toc')?.setAttribute('hidden', '');
  }
  window.closeBook = closeBook;

  function renderBookChapter() {
    if (!bookState.flatChapters.length) return;
    const ch = bookState.flatChapters[bookState.currentIndex];
    const total = bookState.flatChapters.length;
    document.getElementById('book-reader-chapter').textContent = ch.title || '—';
    document.getElementById('book-nav-info').textContent = (bookState.currentIndex + 1) + ' / ' + total;
    const content = document.getElementById('book-reader-content');
    // Подставляем реальные ссылки на картинки книги.
    // Исходный тег: <img src="" data-ref="img-001.jpg" alt="" />
    // 1) Извлекаем data-ref → подставляем в src
    // 2) Убираем пустой src=""
    let html = (ch.html || '<p>—</p>')
      .replace(/<img\b([^>]*?)\sdata-ref="([^"]+)"([^>]*?)>/g,
        (m, before, ref, after) => {
          // Удаляем пустой src="" из before/after
          const cleanBefore = before.replace(/\ssrc="[^"]*"/, '');
          const cleanAfter = after.replace(/\ssrc="[^"]*"/, '');
          return `<img${cleanBefore} src="/book-images/${ref}" loading="lazy"${cleanAfter}>`;
        }
      );
    content.innerHTML = `<h2>${ch.title || ''}</h2>` + html;
    content.scrollTop = 0;
    document.getElementById('book-reader').scrollTop = 0;
  }

  function renderBookToc() {
    const list = document.getElementById('book-toc-list');
    if (!list || !bookState.data) return;
    let html = '';
    let flatIndex = 0;
    (bookState.data.parts || []).forEach(part => {
      html += `<div class="book-toc-part">${part.title}</div>`;
      (part.chapters || []).forEach(ch => {
        const idx = flatIndex;
        html += `<button class="book-toc-item" onclick="goToChapter(${idx})">${ch.title}</button>`;
        flatIndex++;
      });
    });
    list.innerHTML = html;
  }

  function nextChapter() {
    if (bookState.currentIndex < bookState.flatChapters.length - 1) {
      bookState.currentIndex++;
      renderBookChapter();
    }
  }
  function prevChapter() {
    if (bookState.currentIndex > 0) {
      bookState.currentIndex--;
      renderBookChapter();
    }
  }
  function goToChapter(idx) {
    if (idx >= 0 && idx < bookState.flatChapters.length) {
      bookState.currentIndex = idx;
      renderBookChapter();
      document.getElementById('book-toc')?.setAttribute('hidden', '');
    }
  }
  function toggleBookToc() {
    const toc = document.getElementById('book-toc');
    if (!toc) return;
    if (toc.hasAttribute('hidden')) toc.removeAttribute('hidden');
    else toc.setAttribute('hidden', '');
  }
  window.nextChapter = nextChapter;
  window.prevChapter = prevChapter;
  window.goToChapter = goToChapter;
  window.toggleBookToc = toggleBookToc;

  // При смене языка сбрасываем кэш книги, чтобы загрузилась нужная локаль
  document.addEventListener('i18n:changed', () => {
    bookState.data = null;
    bookState.lang = null;
    // Перерендерим карточку Дара (имя и архетип на новом языке)
    try { renderMeResult(); } catch (e) {}
    // Перерендерим сетку коллекции (имена даров на новом языке)
    try { renderCollection(); } catch (e) {}
    // Перерендерим энциклопедию
    try { renderEncyclopedia(); } catch (e) {}
  });

  // === Кнопки-действия на вкладке «Я» ===

  // === Оракул Дня ===
  // Логика: Общий Дар Дня = код от текущей даты (как ОДА от даты дня).
  // Личный Дар Дня = сумма моего ОДА + Общего Дара Дня (покомпонентно, с reduce).

  function calcGeneralDayDar(date) {
    const d = date || new Date();
    return DarsLib.calcOda({ day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() });
  }

  function calcPersonalDayDar(myCode, generalCode) {
    const [uMa, uJi, uKun] = myCode.split('-').map(Number);
    const [gMa, gJi, gKun] = generalCode.split('-').map(Number);
    const ma = DarsLib.reduce(uMa + gMa);
    const ji = DarsLib.reduce(uJi + gJi);
    const kun = DarsLib.reduce(uKun + gKun);
    return { ma, ji, kun, code: `${ma}-${ji}-${kun}` };
  }

  async function openMyOracle() {
    const screen = document.getElementById('oracle-screen');
    if (!screen) return;
    screen.classList.add('open');
    screen.scrollTop = 0;

    // Дата сегодня
    const today = new Date();
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    const opts = { day: 'numeric', month: 'long', year: 'numeric' };
    document.getElementById('oracle-date').textContent = today.toLocaleDateString(
      lang === 'ru' ? 'ru-RU' : (lang === 'es' ? 'es-ES' : 'en-US'), opts
    );

    // Общий Дар Дня
    const general = calcGeneralDayDar(today);
    const genName = DarsLib.getDarName(general.code, lang);
    const genArch = DarsLib.getDarArchetype(general.code, lang);
    document.getElementById('oracle-general-name').textContent = genName;
    document.getElementById('oracle-general-code').textContent = general.code;
    document.getElementById('oracle-general-archetype').textContent = genArch || '';
    document.getElementById('oracle-general-img').src = DarsLib.getDarSvgPath(general.code);

    // Личный Дар Дня — если есть свой Дар
    const profile = loadProfile();
    const personalCard = document.getElementById('oracle-personal-card');
    const emptyBlock = document.getElementById('oracle-empty');
    if (profile && profile.date) {
      const my = DarsLib.calcOda(profile.date);
      const personal = calcPersonalDayDar(my.code, general.code);
      const persName = DarsLib.getDarName(personal.code, lang);
      const persArch = DarsLib.getDarArchetype(personal.code, lang);
      document.getElementById('oracle-personal-name').textContent = persName;
      document.getElementById('oracle-personal-code').textContent = personal.code;
      document.getElementById('oracle-personal-archetype').textContent = persArch || '';
      document.getElementById('oracle-personal-img').src = DarsLib.getDarSvgPath(personal.code);

      // Краткое послание: первая фраза из 'essence' этого Дара
      const msgEl = document.getElementById('oracle-personal-message');
      msgEl.innerHTML = '<div class="placeholder">Загружаю послание…</div>';
      try {
        const data = await loadDarContent();
        const ess = data[personal.code]?.essence || data[personal.code]?.energy_pattern || '';
        if (ess) {
          // Берём первые 2 параграфа
          const short = String(ess).split(/\n\n/).slice(0, 2).join('\n\n');
          msgEl.innerHTML = mdToHtml(short);
        } else {
          msgEl.innerHTML = '<p style="color:var(--text-muted);font-style:italic">Послание от AI скоро будет доступно — на основе твоего личного Дара дня.</p>';
        }
      } catch (e) {
        msgEl.textContent = '';
      }
      personalCard.style.display = '';
      if (emptyBlock) emptyBlock.hidden = true;
    } else {
      personalCard.style.display = 'none';
      if (emptyBlock) emptyBlock.hidden = false;
    }
  }
  window.openMyOracle = openMyOracle;

  function closeOracle() {
    document.getElementById('oracle-screen')?.classList.remove('open');
  }
  window.closeOracle = closeOracle;

  function openMyShare() {
    // Поделиться карточкой Дара (share-card + A4 — обе опции в одной модалке).
    alert('🖼 Поделиться — модалка выбора (карточка для соцсетей / A4 для печати).');
  }
  window.openMyShare = openMyShare;

  // Сворачивающийся блок «Узнать о себе больше»
  function toggleMeMore() {
    const toggle = document.getElementById('me-more-toggle');
    const content = document.getElementById('me-more-content');
    if (!toggle || !content) return;
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      toggle.setAttribute('aria-expanded', 'false');
      content.hidden = true;
    } else {
      toggle.setAttribute('aria-expanded', 'true');
      content.hidden = false;
    }
  }
  window.toggleMeMore = toggleMeMore;

  // === Модалки углубления ===

  function closeDepthModals() {
    ['time', 'place', 'name'].forEach(k => {
      document.getElementById('depth-' + k + '-modal')?.classList.remove('open');
      document.getElementById('depth-' + k + '-backdrop')?.classList.remove('open');
    });
  }
  window.closeDepthModals = closeDepthModals;

  function openDepthTime() {
    closeDepthModals();
    document.getElementById('depth-time-modal')?.classList.add('open');
    document.getElementById('depth-time-backdrop')?.classList.add('open');
    const p = loadProfile();
    const input = document.getElementById('depth-time-input');
    if (input) input.value = p?.time
      ? String(p.time.hour).padStart(2,'0') + ':' + String(p.time.minute).padStart(2,'0')
      : '';
  }
  function openDepthPlace() {
    closeDepthModals();
    document.getElementById('depth-place-modal')?.classList.add('open');
    document.getElementById('depth-place-backdrop')?.classList.add('open');
    const p = loadProfile();
    const input = document.getElementById('depth-place-input');
    if (input) input.value = p?.coords?.label || '';
  }
  function openDepthName() {
    closeDepthModals();
    document.getElementById('depth-name-modal')?.classList.add('open');
    document.getElementById('depth-name-backdrop')?.classList.add('open');
    const p = loadProfile();
    document.getElementById('depth-firstname-input').value = p?.person?.firstName || '';
    document.getElementById('depth-lastname-input').value = p?.person?.lastName || '';
  }
  window.openDepthTime = openDepthTime;
  window.openDepthPlace = openDepthPlace;
  window.openDepthName = openDepthName;

  function saveDepthTime() {
    const val = document.getElementById('depth-time-input').value;
    const time = parseTime(val);
    if (!time) {
      document.getElementById('depth-time-error').textContent = 'Формат ЧЧ:ММ (например 12:20)';
      return;
    }
    const p = loadProfile() || {};
    p.time = time;
    saveProfile(p);
    closeDepthModals();
    renderMeResult();
  }
  window.saveDepthTime = saveDepthTime;

  function saveDepthPlace() {
    const label = document.getElementById('depth-place-input').value.trim();
    if (!label) {
      document.getElementById('depth-place-error').textContent = 'Укажи город';
      return;
    }
    // Заглушка координат: пока берём фиктивные (52.5, 27.5) — это Беларусь.
    // Когда подключим геокодер — заменим на реальные.
    const p = loadProfile() || {};
    p.coords = { label, lat: 52.5, lon: 27.5, _stub: true };
    saveProfile(p);
    closeDepthModals();
    renderMeResult();
  }
  window.saveDepthPlace = saveDepthPlace;

  function saveDepthName() {
    const firstName = document.getElementById('depth-firstname-input').value.trim();
    const lastName = document.getElementById('depth-lastname-input').value.trim();
    if (!firstName || !lastName) {
      document.getElementById('depth-name-error').textContent = 'Укажи имя и фамилию';
      return;
    }
    const p = loadProfile() || {};
    p.person = { firstName, lastName };
    saveProfile(p);
    closeDepthModals();
    renderMeResult();
  }
  window.saveDepthName = saveDepthName;

  // Старт
  document.addEventListener('DOMContentLoaded', async () => {
    if (window.previewI18n) {
      await previewI18n.init();
      updateLangButtonLabel();
    }
    // Маски ввода
    attachDateMask(document.getElementById('me-date'));
    attachTimeMask(document.getElementById('depth-time-input'));
    // Подвкладки внутри Сокровищницы и Арки
    attachSubtabs();
    // Рендер вкладки Я в зависимости от того, был ли расчёт
    renderMeState();
    // Закрывать выпадашку языка по клику вне
    document.addEventListener('click', (e) => {
      const picker = document.getElementById('lang-picker');
      const btn = document.getElementById('btn-lang');
      if (picker && !picker.contains(e.target) && btn && !btn.contains(e.target)) {
        hideLangPicker();
      }
    });
  });
})();
