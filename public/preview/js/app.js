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
          // При открытии «Энциклопедия» — рендер активной подвкладки
          if (target === 'search') {
            if (encycCurrentSubtab === 'fields') renderFieldCards();
            else renderFieldFolders();
          }
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

  // === Энциклопедия — 1:1 как в прод-приложении (index.html:2675-3139) ===
  //
  // Структура:
  //   Вкладка «Дары»  → Ур.1: список 9 полей → Ур.2: сетка даров → Ур.3: детали
  //   Вкладка «Поля»  → Ур.1: сетка 9 карточек → Ур.2: детали поля с 4 табами
  //
  // Поиск работает поверх всего (показывает результаты в encyc-results)

  // FIELDS_FULL — inline-объект, точная копия из прода (fields-full.js).
  // Содержит ВСЕ поля (color, location, layers_ma/zhi/kun, energy_flow,
  // shadow_ma_image, shadow_zhi_image), которых нет в fields.json.
  // Если выбран EN/ES — возвращаем переведённую версию (если файл загружен).
  async function loadFieldsFull() {
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    if (lang === 'en' && window.FIELDS_FULL_EN) return window.FIELDS_FULL_EN;
    if (lang === 'es' && window.FIELDS_FULL_ES) return window.FIELDS_FULL_ES;
    return window.FIELDS_FULL || {};
  }

  // SVG-иконки рисунков энергии для каждого поля (1:1 из прода)
  const FIELD_PATTERN_SVG = {
    1: '<svg viewBox="0 0 40 40" width="36" height="36"><polygon points="20,6 34,34 6,34" fill="none" stroke="#D4AF37" stroke-width="1.5"/></svg>',
    2: '<svg viewBox="0 0 40 40" width="36" height="36"><circle cx="20" cy="20" r="2" fill="#66bbff"/><line x1="20" y1="20" x2="20" y2="4" stroke="#66bbff" stroke-width="1" opacity="0.7"/><line x1="20" y1="20" x2="34" y2="12" stroke="#66bbff" stroke-width="1" opacity="0.7"/><line x1="20" y1="20" x2="34" y2="28" stroke="#66bbff" stroke-width="1" opacity="0.7"/><line x1="20" y1="20" x2="20" y2="36" stroke="#66bbff" stroke-width="1" opacity="0.7"/><line x1="20" y1="20" x2="6" y2="28" stroke="#66bbff" stroke-width="1" opacity="0.7"/><line x1="20" y1="20" x2="6" y2="12" stroke="#66bbff" stroke-width="1" opacity="0.7"/></svg>',
    3: '<svg viewBox="0 0 40 40" width="36" height="36"><path d="M28,20 C28,14 24,10 20,10 C14,10 12,16 16,19 C19,21 22,18 20,16" fill="none" stroke="#50c878" stroke-width="1.5" stroke-linecap="round"/><circle cx="20" cy="16" r="1.5" fill="#50c878"/></svg>',
    4: '<svg viewBox="0 0 40 40" width="36" height="36"><path d="M12,20 C12,26 16,30 20,30 C26,30 28,24 24,21 C21,19 18,22 20,24" fill="none" stroke="#D4AF37" stroke-width="1.5" stroke-linecap="round"/><circle cx="20" cy="24" r="1.5" fill="#D4AF37"/></svg>',
    5: '<svg viewBox="0 0 40 40" width="36" height="36"><circle cx="20" cy="20" r="4" fill="#eee"/><circle cx="20" cy="20" r="8" fill="none" stroke="#eee" stroke-width="0.5" opacity="0.4"/><circle cx="20" cy="20" r="13" fill="none" stroke="#eee" stroke-width="0.3" opacity="0.25"/></svg>',
    6: '<svg viewBox="0 0 40 40" width="36" height="36"><path d="M4,20 Q10,10 16,20 Q22,30 28,20 Q34,10 40,20" fill="none" stroke="#5577cc" stroke-width="1.5"/><circle cx="10" cy="20" r="1.5" fill="#5577cc"/><circle cx="22" cy="20" r="1.5" fill="#5577cc"/><circle cx="34" cy="20" r="1.5" fill="#5577cc"/></svg>',
    7: '<svg viewBox="0 0 40 40" width="36" height="36"><line x1="8" y1="20" x2="32" y2="20" stroke="#9966cc" stroke-width="1.5"/><circle cx="8" cy="20" r="3" fill="#9966cc"/><circle cx="32" cy="20" r="3" fill="#9966cc"/></svg>',
    8: '<svg viewBox="0 0 40 40" width="36" height="36"><circle cx="20" cy="20" r="13" fill="none" stroke="#88bbdd" stroke-width="1.5"/></svg>',
    9: '<svg viewBox="0 0 40 40" width="36" height="36"><polygon points="20,5 35,20 20,35 5,20" fill="none" stroke="#D4AF37" stroke-width="1.5"/></svg>'
  };

  // Текущее состояние навигации внутри Энциклопедии
  let encycCurrentSubtab = 'dars';   // 'dars' | 'fields'
  let encycCurrentFieldKun = null;   // для возврата из деталей в Ур.2 Даров

  // Переключение мини-табов Дары / Поля
  function switchBaseSubTab(name) {
    encycCurrentSubtab = name;
    document.querySelectorAll('.base-sub-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('base-btn-' + name)?.classList.add('active');
    document.getElementById('base-subtab-dars').hidden = name !== 'dars';
    document.getElementById('base-subtab-fields').hidden = name !== 'fields';
    encycSearchClear();
    if (name === 'dars') renderFieldFolders();
    else renderFieldCards();
  }
  window.switchBaseSubTab = switchBaseSubTab;

  // === Вкладка «Дары» — Уровень 1: список 9 полей (полоски) ===
  async function renderFieldFolders() {
    const container = document.getElementById('dars-list-view');
    const fieldView = document.getElementById('dars-field-view');
    const detailView = document.getElementById('dars-detail-view');
    if (!container) return;
    if (fieldView) fieldView.hidden = true;
    if (detailView) detailView.hidden = true;
    container.hidden = false;

    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    const ff = await loadFieldsFull();
    const byField = {};
    Object.keys(DarsLib.DARS).forEach(c => {
      const f = DarsLib.getFieldId(c);
      if (!byField[f]) byField[f] = [];
      byField[f].push(c);
    });
    const tLabel = (window.previewI18n && previewI18n.t('encyc.dars_count_label')) || 'даров';
    let html = '';
    for (let i = 1; i <= 9; i++) {
      const f = ff[i] || {};
      const fdLib = DarsLib.FIELDS[i] || {};
      const name = f.name || fdLib['name_' + lang] || fdLib.name_ru || ('Поле ' + i);
      const element = f.element || fdLib['element_' + lang] || fdLib.element_ru || '';
      const count = (byField[i] || []).length;
      html += `<div class="encyc-field-prod-row" style="--field-color:${fdLib.color || '#fff'}" onclick="openFieldFolder(${i})">
        <div class="encyc-field-prod-glyph">${FIELD_PATTERN_SVG[i] || ''}</div>
        <div class="encyc-field-prod-text">
          <div class="encyc-field-prod-name">${escapeHtml(name)}</div>
          <div class="encyc-field-prod-element">${escapeHtml(element)}</div>
        </div>
        <div class="encyc-field-prod-count">${count} ${tLabel} <span style="opacity:0.6">›</span></div>
      </div>`;
    }
    container.innerHTML = html;
  }
  window.renderFieldFolders = renderFieldFolders;
  // Старое имя для совместимости
  function renderEncyclopedia() { renderFieldFolders(); }
  window.renderEncyclopedia = renderEncyclopedia;

  // === Вкладка «Дары» — Уровень 2: сетка карточек даров поля ===
  async function openFieldFolder(kunId) {
    encycCurrentFieldKun = kunId;
    const ff = await loadFieldsFull();
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    const f = ff[kunId] || DarsLib.FIELDS[kunId] || {};
    const fieldName = f.name || f['name_' + lang] || f.name_ru || ('Поле ' + kunId);
    const element = f.element || f['element_' + lang] || f.element_ru || '';
    const codes = Object.keys(DarsLib.DARS).filter(c => DarsLib.getFieldId(c) === kunId);

    const view = document.getElementById('dars-field-view');
    let cards = '';
    codes.forEach(code => {
      const name = DarsLib.getDarName(code, lang);
      const arch = DarsLib.getDarArchetype(code, lang);
      const svgPath = DarsLib.getDarSvgPath(code);
      cards += `<div class="dar-card" onclick="openDarDetail('${code}')">
        <div class="dar-card-img"><img src="${svgPath}" alt="" onerror="this.style.display='none'"></div>
        <div class="dar-card-name">${escapeHtml(name)}</div>
        ${arch ? `<div class="dar-card-arch">${escapeHtml(arch)}</div>` : ''}
      </div>`;
    });
    const backLabel = (window.previewI18n && previewI18n.t('encyc.back_to_fields')) || '← Все поля';
    view.innerHTML = `<button class="btn-back" onclick="backToFieldFolders()">${escapeHtml(backLabel)}</button>
      <div style="text-align:center;margin-bottom:14px">
        <div style="font-size:16px;color:var(--text);letter-spacing:2px;font-weight:800">${escapeHtml(fieldName)}</div>
        <div style="font-size:12px;color:var(--text-dim);font-style:italic">${escapeHtml(element)}</div>
      </div>
      <div class="dar-grid">${cards}</div>`;
    document.getElementById('dars-list-view').hidden = true;
    document.getElementById('dars-detail-view').hidden = true;
    view.hidden = false;
  }
  window.openFieldFolder = openFieldFolder;

  function backToFieldFolders() {
    document.getElementById('dars-field-view').hidden = true;
    document.getElementById('dars-list-view').hidden = false;
    encycCurrentFieldKun = null;
  }
  window.backToFieldFolders = backToFieldFolders;

  // === Вкладка «Поля» — Уровень 1: сетка карточек ===
  async function renderFieldCards() {
    const container = document.getElementById('fields-list-view');
    if (!container) return;
    const ff = await loadFieldsFull();
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    let html = '<div class="field-grid">';
    for (let i = 1; i <= 9; i++) {
      const f = ff[i] || DarsLib.FIELDS[i] || {};
      const name = f.name || f['name_' + lang] || f.name_ru || ('Поле ' + i);
      const element = f.element || f['element_' + lang] || f.element_ru || '';
      html += `<div class="field-folder" onclick="openFieldDetail(${i})">
        <div style="margin-bottom:6px">${FIELD_PATTERN_SVG[i] || ''}</div>
        <div class="field-folder-name">${escapeHtml(name)}</div>
        <div class="field-folder-arch">${escapeHtml(element)}</div>
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }
  window.renderFieldCards = renderFieldCards;

  // === Вкладка «Поля» — Уровень 2: детальная страница поля с 4 табами ===
  // Заголовки табов берутся из i18n (encyc.field_tab_*).
  const FIELD_INNER_TABS = [
    { id: 'essence', i18nKey: 'encyc.field_tab_essence' },
    { id: 'energy',  i18nKey: 'encyc.field_tab_energy' },
    { id: 'body',    i18nKey: 'encyc.field_tab_body' },
    { id: 'shadows', i18nKey: 'encyc.field_tab_shadows' }
  ];
  function tt(key, fallback) {
    return (window.previewI18n && previewI18n.t(key)) || fallback || key;
  }

  async function openFieldDetail(fieldId) {
    const ff = await loadFieldsFull();
    const f = ff[fieldId] || {};
    const container = document.getElementById('fields-list-view');
    const tabsHtml = FIELD_INNER_TABS.map((t, i) =>
      `<button class="dar-inner-tab${i === 0 ? ' active' : ''}" onclick="switchFieldInnerTab('${t.id}',this,${fieldId})">${escapeHtml(tt(t.i18nKey))}</button>`
    ).join('');
    const backLabel = tt('encyc.back_to_fields', '← Все поля');
    container.innerHTML = `<button class="btn-back" style="display:block" onclick="backToFieldsList()">${escapeHtml(backLabel)}</button>
      <div style="text-align:center;margin-bottom:14px">
        <div style="font-size:28px;letter-spacing:3px;color:var(--text)">${escapeHtml(f.name || '')}</div>
        <div style="font-size:13px;color:var(--text-dim);margin-top:4px">${escapeHtml(f.element || '')} | ${escapeHtml(f.pattern || '')} | ${escapeHtml(f.color || '')}</div>
      </div>
      <div class="dar-inner-tabs">${tabsHtml}</div>
      <div id="field-inner-content-area"></div>`;
    renderFieldInnerTab('essence', fieldId);
  }
  window.openFieldDetail = openFieldDetail;

  function switchFieldInnerTab(tabId, btn, fieldId) {
    document.querySelectorAll('#fields-list-view .dar-inner-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFieldInnerTab(tabId, fieldId);
  }
  window.switchFieldInnerTab = switchFieldInnerTab;

  // Лейблы метаданных переводятся через i18n.
  async function renderFieldInnerTab(tabId, fieldId) {
    const ff = await loadFieldsFull();
    const f = ff[fieldId] || {};
    const area = document.getElementById('field-inner-content-area');
    if (!area) return;
    const row = (labelKey, value) => `<div class="dar-meta-row"><div class="dar-meta-label">${escapeHtml(tt(labelKey))}</div><div class="dar-meta-value">${escapeHtml(value || '')}</div></div>`;
    const rowImg = (labelKey, value) => `<div class="dar-meta-row"><div class="dar-meta-label">${escapeHtml(tt(labelKey))}</div><div class="dar-meta-value" style="color:#D4AF37;font-style:italic">${escapeHtml(value)}</div></div>`;
    let html = '<div class="dar-inner-content">';
    if (tabId === 'essence') {
      html += row('encyc.label_essence', f.essence);
    } else if (tabId === 'energy') {
      html += row('encyc.label_pattern', f.pattern);
      html += row('encyc.label_energy_flow', f.energy_flow);
    } else if (tabId === 'body') {
      html += row('encyc.label_location', f.location);
      html += row('encyc.label_color', f.color);
      html += row('encyc.label_layers_ma', f.layers_ma);
      html += row('encyc.label_layers_zhi', f.layers_zhi);
      html += row('encyc.label_layers_kun', f.layers_kun);
    } else if (tabId === 'shadows') {
      html += row('encyc.label_shadow_ma', f.shadow_ma);
      if (f.shadow_ma_image) html += rowImg('encyc.label_shadow_ma_image', f.shadow_ma_image);
      html += row('encyc.label_shadow_zhi', f.shadow_zhi);
      if (f.shadow_zhi_image) html += rowImg('encyc.label_shadow_zhi_image', f.shadow_zhi_image);
      html += row('encyc.label_shadow_kun', f.shadow_kun);
    }
    html += '</div>';
    area.innerHTML = html;
  }

  function backToFieldsList() {
    renderFieldCards();
  }
  window.backToFieldsList = backToFieldsList;

  function encycSearchClear() {
    const input = document.getElementById('encyc-search-input');
    if (input) input.value = '';
    const results = document.getElementById('encyc-results');
    if (results) { results.hidden = true; results.innerHTML = ''; }
  }
  window.encycSearchClear = encycSearchClear;

  // === Детальная карточка Дара (по образцу прода: 9 секций из dar-content.json) ===

  // Кэш контента Даров по языку (ru/en/es)
  const darContentCacheByLang = {};

  async function loadDarContent() {
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    if (darContentCacheByLang[lang]) return darContentCacheByLang[lang];
    // RU = основной файл прода, EN/ES = переводы в /preview/
    const url = lang === 'ru'
      ? '/dar-content.json?v=1'
      : `/preview/dar-content-${lang}.json?v=1`;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        darContentCacheByLang[lang] = await resp.json();
      } else {
        // Фоллбэк на RU если перевода ещё нет
        if (lang !== 'ru') {
          console.warn('[dar-content] ' + lang + ' not available, falling back to RU');
          return loadDarContent.callRu();
        }
        darContentCacheByLang[lang] = {};
      }
    } catch (e) {
      if (lang !== 'ru') return loadDarContent.callRu();
      darContentCacheByLang[lang] = {};
    }
    return darContentCacheByLang[lang];
  }
  loadDarContent.callRu = async () => {
    if (darContentCacheByLang.ru) return darContentCacheByLang.ru;
    try {
      const resp = await fetch('/dar-content.json?v=1');
      darContentCacheByLang.ru = resp.ok ? await resp.json() : {};
    } catch (e) {
      darContentCacheByLang.ru = {};
    }
    return darContentCacheByLang.ru;
  };

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

  // 9 секций Дара (точно как в проде, заголовки переводятся через i18n).
  // Источник: public/index.html DAR_SECTIONS на строке 2863
  const DAR_SECTIONS = [
    { key: 'essence',         icon: '🔮',   i18nKey: 'encyc.section_essence' },
    { key: 'energy_pattern',  icon: '⚙️',   i18nKey: 'encyc.section_energy_pattern' },
    { key: 'light_power',     icon: '☀️',   i18nKey: 'encyc.section_light_power' },
    { key: 'shadow',          icon: '🌑',   i18nKey: 'encyc.section_shadow' },
    { key: 'activation',      icon: '🛠',   i18nKey: 'encyc.section_activation' },
    { key: 'meditation',      icon: '🧘',   i18nKey: 'encyc.section_meditation' },
    { key: 'application',     icon: '💡',   i18nKey: 'encyc.section_application' },
    { key: 'safety',          icon: '⚠️',   i18nKey: 'encyc.section_safety' },
    { key: 'attributes',      icon: '✨',   i18nKey: 'encyc.section_attributes' }
  ];
  function darSectionTitle(sec) {
    return (window.previewI18n && previewI18n.t(sec.i18nKey)) || sec.key;
  }

  // Расширенные данные даров (fields.json → dars_extended) — fallback
  // когда в dar-content.json пусто. Содержит essence_short, energy_flow,
  // metaphor, warning.
  let darsExtendedCache = null;
  async function loadDarsExtended() {
    if (darsExtendedCache !== null) return darsExtendedCache;
    try {
      const resp = await fetch('/fields.json?v=1');
      if (resp.ok) {
        const j = await resp.json();
        darsExtendedCache = j.dars_extended || {};
      } else {
        darsExtendedCache = {};
      }
    } catch (e) {
      darsExtendedCache = {};
    }
    return darsExtendedCache;
  }

  // Получить контент секции (приоритет: dar-content.json → dars_extended)
  function getDarSectionContent(sectionKey, code, content, extended) {
    const c = content && content[code];
    if (c && c[sectionKey]) return c[sectionKey];
    const ext = extended && extended[code];
    if (ext) {
      if (sectionKey === 'essence') return ext.essence_short || ext.metaphor || null;
      if (sectionKey === 'energy_pattern') return ext.energy_flow || null;
      if (sectionKey === 'safety') return ext.warning || null;
    }
    return null;
  }

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

    // Hero-шапка + 2 кнопки (Книга / Путешествие Героя) — как в проде
    let html = `<div class="dar-detail-hero">
      <img src="${svgPath}" alt="" onerror="this.style.display='none'">
      <div class="dar-detail-hero-name">${escapeHtml(name)}</div>
      <div class="dar-detail-hero-code">Код: ${code}</div>
      ${archetype ? `<div class="dar-detail-hero-archetype">${escapeHtml(archetype)}</div>` : ''}
      <div class="dar-detail-actions">
        <button class="dar-detail-btn dar-detail-btn-book" onclick="openBookOfDars()">
          <span>📖</span> <span>${escapeHtml((window.previewI18n && previewI18n.t('encyc.open_book')) || 'Книга Даров')}</span>
        </button>
        <button class="dar-detail-btn dar-detail-btn-hero">
          <span>🌅</span> <span>${escapeHtml((window.previewI18n && previewI18n.t('encyc.open_hero')) || 'Путешествие Героя')}</span>
        </button>
      </div>
    </div>`;

    // 9 секций — аккордеон. Первая с контентом раскрыта.
    const data = await loadDarContent();
    const extended = await loadDarsExtended();
    let firstOpened = false;
    let sectionsHtml = '<div class="dar-accordion">';
    for (const sec of DAR_SECTIONS) {
      const raw = getDarSectionContent(sec.key, code, data, extended);
      const hasContent = !!raw;
      const isOpen = hasContent && !firstOpened;
      if (isOpen) firstOpened = true;
      let bodyHtml;
      if (!hasContent) {
        bodyHtml = '<p style="color:var(--text-muted);text-align:center;padding:12px;font-style:italic">' + escapeHtml((window.previewI18n && previewI18n.t('encyc.section_filling')) || 'Раздел заполняется') + '</p>';
      } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        bodyHtml = '<ul>' + Object.entries(raw).map(([k, v]) =>
          `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</li>`
        ).join('') + '</ul>';
      } else {
        bodyHtml = mdToHtml(raw);
      }
      sectionsHtml += `<div class="accordion-item">
        <button class="accordion-header${isOpen ? ' open' : ''}" onclick="toggleAccordion(this)">
          <span class="accordion-icon">${sec.icon}</span>
          <span class="accordion-title">${escapeHtml(darSectionTitle(sec))}</span>
          <span class="accordion-arrow">▼</span>
        </button>
        <div class="accordion-body${isOpen ? ' open' : ''}">${bodyHtml}</div>
      </div>`;
    }
    sectionsHtml += '</div>';
    html += sectionsHtml;

    content.innerHTML = html;
    screen.scrollTop = 0;
  }
  window.openDarDetail = openDarDetail;

  // Тогглим аккордеон. Закрываем все остальные в этом аккордеоне.
  function toggleAccordion(btn) {
    const body = btn.nextElementSibling;
    const isOpen = body.classList.contains('open');
    const parent = btn.closest('.dar-accordion');
    if (parent) {
      parent.querySelectorAll('.accordion-header.open').forEach(h => {
        h.classList.remove('open');
        h.nextElementSibling?.classList.remove('open');
      });
    }
    if (!isOpen) {
      btn.classList.add('open');
      body.classList.add('open');
      setTimeout(() => {
        try { btn.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      }, 120);
    }
  }
  window.toggleAccordion = toggleAccordion;

  function closeDarDetail() {
    document.getElementById('dar-detail-screen')?.classList.remove('open');
  }
  window.closeDarDetail = closeDarDetail;

  // Мини-табы Энциклопедии Дары/Поля
  // Нормализация для поиска (ё→е, убираем дефисы/пробелы, регистр) — 1:1 как в проде
  function baseSearchNorm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[\s\-_.,!?:;'"()]+/g, '');
  }

  // Поиск по дарам в Энциклопедии (точно как в проде).
  // Показывает результаты в encyc-results, скрывая обе вкладки.
  function encycSearch(query) {
    const results = document.getElementById('encyc-results');
    const darsTab = document.getElementById('base-subtab-dars');
    const fieldsTab = document.getElementById('base-subtab-fields');
    if (!results) return;
    const q = (query || '').trim();
    if (q.length < 2) {
      results.hidden = true;
      results.innerHTML = '';
      darsTab.hidden = encycCurrentSubtab !== 'dars';
      fieldsTab.hidden = encycCurrentSubtab !== 'fields';
      return;
    }
    const qn = baseSearchNorm(q);
    const lang = (window.previewI18n && previewI18n.getLang()) || 'ru';
    const matches = [];
    Object.entries(DarsLib.DARS).forEach(([code, name]) => {
      const arch = DarsLib.getDarArchetype(code, lang) || '';
      const fd = DarsLib.FIELDS[DarsLib.getFieldId(code)] || {};
      const fieldName = fd['name_' + lang] || fd.name_ru || '';
      const localName = DarsLib.getDarName(code, lang);
      const searchable = baseSearchNorm(code + name + localName + arch + fieldName);
      if (searchable.includes(qn)) {
        matches.push({ code, name: localName, arch, fieldName });
      }
    });
    Object.entries(DarsLib.INTEGRATORS).forEach(([code, name]) => {
      if (baseSearchNorm(code + name).includes(qn)) {
        matches.push({ code, name, arch: 'Интегратор', fieldName: '' });
      }
    });
    if (matches.length === 0) {
      results.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:13px">Ничего не найдено по запросу «${escapeHtml(q)}»</div>`;
    } else {
      results.innerHTML = `<div style="padding:6px 0 4px;color:var(--text-dim);font-size:11px">Найдено: ${matches.length}</div>` +
        matches.slice(0, 30).map(m =>
          `<div onclick="encycSearchClear();switchBaseSubTab('dars');openDarDetail('${m.code}')" style="padding:12px 14px;margin:6px 0;background:var(--card);border:1px solid var(--border);border-radius:10px;cursor:pointer">
            <div style="font-size:16px;color:#D4AF37;letter-spacing:2px">${escapeHtml(m.name)}</div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:3px">${m.code}${m.fieldName ? ' · ' + escapeHtml(m.fieldName) : ''}${m.arch ? ' · ' + escapeHtml(m.arch) : ''}</div>
          </div>`
        ).join('');
    }
    darsTab.hidden = true;
    fieldsTab.hidden = true;
    results.hidden = false;
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
    // Перерендерим Энциклопедию (текущую активную подвкладку)
    try {
      if (encycCurrentSubtab === 'fields') renderFieldCards();
      else renderFieldFolders();
    } catch (e) {}
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
