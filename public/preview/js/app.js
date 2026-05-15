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
          // При открытии «Энциклопедия» — отрендерить список даров
          if (target === 'search') renderEncyclopedia();
        });
      });
    });
  }

  // Рендер сетки 64 даров (Сокровищница → Моя коллекция).
  // Группировка по полям (КУН), имена на текущем языке, имя видно
  // даже у закрытых (как в проде).
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
      const fieldName = (fieldData && fieldData['name_' + lang]) || (fieldData && fieldData.name_ru) || ('Поле ' + f);
      html.push(`<div class="collection-field" style="--field-color:${fieldData?.color || '#fff'}">
        <div class="collection-field-header">
          <span class="collection-field-dot"></span>
          <span class="collection-field-name">${fieldName}</span>
          <span class="collection-field-id">${f}</span>
        </div>
        <div class="collection-grid-inner">`);
      codes.forEach(code => {
        const name = DarsLib.getDarName(code, lang);
        const isMine = code === myCode;
        const isUnlocked = unlocked.has(code);
        if (isUnlocked) unlockedCount++;
        const cls = isMine ? 'mine' : (isUnlocked ? 'unlocked' : 'locked');
        const svgPath = DarsLib.getDarSvgPath(code);
        html.push(`<div class="collection-cell ${cls}" data-code="${code}" onclick="openDarDetail('${code}')">
          <div class="collection-cell-img"><img src="${svgPath}" alt="" onerror="this.style.display='none'"></div>
          <div class="collection-cell-name">${escapeHtml(name)}</div>
          <div class="collection-cell-code">${code}</div>
          ${!isUnlocked ? '<div class="collection-cell-overlay">🔒</div>' : ''}
        </div>`);
      });
      html.push(`</div></div>`);
    }
    grid.innerHTML = html.join('');
    const cnt = document.getElementById('collection-unlocked-count');
    if (cnt) cnt.textContent = unlockedCount;
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
      const fieldData = DarsLib.FIELDS[f];
      const fieldName = (fieldData && fieldData['name_' + lang]) || fieldData?.name_ru || ('Поле ' + f);
      html.push(`<div class="encyc-field-block" style="--field-color:${fieldData?.color || '#fff'}">
        <div class="encyc-field-header">
          <span class="encyc-field-dot"></span>
          <span class="encyc-field-name">${escapeHtml(fieldName)}</span>
          <span class="encyc-field-id">${f}</span>
        </div>`);
      codes.forEach(code => {
        const name = DarsLib.getDarName(code, lang);
        const svgPath = DarsLib.getDarSvgPath(code);
        html.push(`<div class="encyc-dar-row" onclick="openDarDetail('${code}')">
          <div class="encyc-dar-img"><img src="${svgPath}" alt="" onerror="this.style.display='none'"></div>
          <div class="encyc-dar-name">${escapeHtml(name)}</div>
          <div class="encyc-dar-code">${code}</div>
        </div>`);
      });
      html.push(`</div>`);
    }
    list.innerHTML = html.join('');
  }
  window.renderEncyclopedia = renderEncyclopedia;

  function openDarDetail(code) {
    // Заглушка — полная карточка Дара с деталями подключим к dar-content.json позже.
    alert('Дар ' + code + ' — подробная карточка появится после подключения dar-content.json.');
  }
  window.openDarDetail = openDarDetail;

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
    content.innerHTML = `<h2>${ch.title || ''}</h2>` + (ch.html || '<p>—</p>');
    content.scrollTop = 0;
    // Скроллим хедер в начало
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

  function openMyOracle() {
    // Оракул дня живёт во вкладке «Я» (а не в Арке).
    // В прототипе пока заглушка — модалка с Дар Дня + посланием.
    alert('🔮 Оракул дня — следующий этап реализации.');
  }
  window.openMyOracle = openMyOracle;

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
