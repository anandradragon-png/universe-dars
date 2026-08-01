/**
 * HTML-ридер "Книги Даров"
 * - Читает public/book-chapters.json (структурированный контент)
 * - Картинки берёт из public/book-images/
 * - Настройки: размер шрифта, тема (тёмная / сепия / светлая)
 * - Оглавление с частями, главами, дарами
 * - Защита от копирования
 */

const BookReader = (function() {
  let bookData = null;       // { parts: [...], ... }
  let currentPartIdx = 0;
  let currentChapterIdx = 0;
  let accessLevel = 'basic';
  // Полный доступ к КНИГЕ. ВАЖНО: книга НЕ входит в 7-дневный пробный период —
  // остаётся демо (первые freeChapters глав бесплатно). Поэтому опираемся на
  // отдельный флаг book_full_access с сервера (реальный тариф / покупка книги),
  // а НЕ на access_level (который в пробный период раздут до premium).
  let bookFullAccess = false;
  let freeChapters = 10;     // сколько глав бесплатно
  let totalChapters = 0;
  let tocOpen = false;

  // -------- Библиотека (несколько книг + жанровые полки) --------
  // Манифест public/books-library.json описывает полки и книги.
  // currentBookId — какая книга сейчас открыта в ридере ('dars' по умолчанию,
  //   у неё сохраняется обратная совместимость ключей localStorage).
  // viewMode: 'library' — экран полок (витрина), 'reader' — чтение книги.
  let library = null;
  let currentBookId = 'dars';
  let currentBookAccess = 'gated'; // 'gated' — по тарифу/покупке, 'free' — открыта всем
  let viewMode = 'library';
  const BOOKS_VER = '20260801a';   // токен кэша для JSON новых книг

  // Настройки читателя (сохраняются в localStorage)
  const DEFAULTS = { fontSize: 16, theme: 'dark', lineHeight: 1.75 };
  let settings = Object.assign({}, DEFAULTS);

  const YUPSOUL_URL = 'https://t.me/Yup_Soul_bot?start=ref_YUPDAR';

  // -------- Настройки --------
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('_book_settings') || '{}');
      settings = Object.assign({}, DEFAULTS, s);
    } catch(e) { settings = Object.assign({}, DEFAULTS); }
  }
  function saveSettings() {
    try { localStorage.setItem('_book_settings', JSON.stringify(settings)); } catch(e) {}
  }

  // -------- Пространство имён ключей localStorage по книге --------
  // Для 'dars' (Книга Даров) оставляем прежние ключи без суффикса — обратная
  // совместимость с уже сохранённым прогрессом/закладками/заметками у тестеров.
  // Для новых книг добавляем суффикс «__<bookId>».
  function _ns(base) {
    return currentBookId === 'dars' ? base : base + '__' + currentBookId;
  }

  // -------- Позиция чтения --------
  function saveProgress() {
    try {
      localStorage.setItem(_ns('_book_progress'), JSON.stringify({
        partIdx: currentPartIdx, chapterIdx: currentChapterIdx
      }));
    } catch(e) {}
  }
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(_ns('_book_progress')) || '{}');
      if (typeof p.partIdx === 'number') currentPartIdx = p.partIdx;
      if (typeof p.chapterIdx === 'number') currentChapterIdx = p.chapterIdx;
    } catch(e) {}
  }

  // -------- Прочитанные главы --------
  // Храним Set ключей "partIdx:chapterIdx". Помечаем главу прочитанной,
  // когда юзер на неё переходит (renderChapter).
  function loadReadSet() {
    try {
      const arr = JSON.parse(localStorage.getItem(_ns('_book_read')) || '[]');
      return new Set(arr);
    } catch(e) { return new Set(); }
  }
  function saveReadSet(set) {
    try { localStorage.setItem(_ns('_book_read'), JSON.stringify([...set])); } catch(e) {}
  }
  function readKey(partIdx, chapterIdx) { return partIdx + ':' + chapterIdx; }
  function markChapterRead(partIdx, chapterIdx) {
    const set = loadReadSet();
    const key = readKey(partIdx, chapterIdx);
    if (!set.has(key)) {
      set.add(key);
      saveReadSet(set);
    }
  }
  function isChapterRead(partIdx, chapterIdx) {
    return loadReadSet().has(readKey(partIdx, chapterIdx));
  }
  function getReadCount() {
    return loadReadSet().size;
  }
  function getReadProgress() {
    if (!totalChapters) return { count: 0, total: 0, pct: 0 };
    const count = getReadCount();
    return {
      count,
      total: totalChapters,
      pct: Math.round((count / totalChapters) * 100)
    };
  }

  // -------- Закладки --------
  function loadBookmarks() {
    try {
      return JSON.parse(localStorage.getItem(_ns('_book_bookmarks')) || '[]');
    } catch(e) { return []; }
  }
  function saveBookmarks(list) {
    try { localStorage.setItem(_ns('_book_bookmarks'), JSON.stringify(list)); } catch(e) {}
  }
  function bookmarkKey(partIdx, chapterIdx) {
    return partIdx + ':' + chapterIdx;
  }
  function isBookmarked(partIdx, chapterIdx) {
    const list = loadBookmarks();
    const key = bookmarkKey(partIdx, chapterIdx);
    return list.some(b => bookmarkKey(b.partIdx, b.chapterIdx) === key);
  }
  function toggleBookmark() {
    if (!bookData) return;
    const part = bookData.parts[currentPartIdx];
    const ch = part && part.chapters[currentChapterIdx];
    if (!ch) return;
    const list = loadBookmarks();
    const key = bookmarkKey(currentPartIdx, currentChapterIdx);
    const existing = list.findIndex(b => bookmarkKey(b.partIdx, b.chapterIdx) === key);
    if (existing >= 0) {
      list.splice(existing, 1);
    } else {
      list.push({
        partIdx: currentPartIdx,
        chapterIdx: currentChapterIdx,
        title: ch.title,
        kind: ch.kind,
        dar_code: ch.dar_code || null,
        dar_name: ch.dar_name || null,
        partTitle: part.title,
        addedAt: Date.now()
      });
    }
    saveBookmarks(list);
    // Перерисуем только заголовок и панель закладок
    renderChapter();
    const panel = document.getElementById('book-bookmarks-panel');
    if (panel && panel.style.display === 'block') renderBookmarksPanel();
  }
  function removeBookmark(partIdx, chapterIdx) {
    const list = loadBookmarks();
    const key = bookmarkKey(partIdx, chapterIdx);
    const filtered = list.filter(b => bookmarkKey(b.partIdx, b.chapterIdx) !== key);
    saveBookmarks(filtered);
    renderBookmarksPanel();
    renderChapter();
  }

  // -------- Инициализация --------
  // Язык книги: ru → /book-chapters.json, en/es → /book-chapters.{lang}.json.
  // Оригиналы EN/ES — авторские книги Даров (а не перевод RU-файла).
  function _bookLang() {
    try {
      if (window.i18n && typeof window.i18n.getLang === 'function') {
        const l = window.i18n.getLang();
        if (l) return l;
      }
      const stored = localStorage.getItem('_yupdar_lang');
      if (stored) return stored;
    } catch(e) {}
    return 'ru';
  }
  // Локализованное поле манифеста: field_en / field_es, иначе базовое (RU).
  function _locField(obj, field) {
    if (!obj) return '';
    const lang = _bookLang();
    if ((lang === 'en' || lang === 'es') && obj[field + '_' + lang]) return obj[field + '_' + lang];
    return obj[field] || '';
  }
  function _bookUrl(langOverride) {
    const lang = langOverride || _bookLang();
    // Книга Даров ('dars') — с локализацией EN/ES (авторские оригиналы).
    if (currentBookId === 'dars') {
      const file = (lang === 'en' || lang === 'es') ? `/book-chapters.${lang}.json` : '/book-chapters.json';
      return file + '?v=20260610a';
    }
    const meta = getBookMeta(currentBookId);
    const src = (meta && meta.source) || 'book-chapters.json';
    // Книги с i18n:true имеют переводы рядом: {база}.en.json / {база}.es.json.
    // Если перевода нет — сработает откат на русский (см. _fetchBookData).
    if (meta && meta.i18n && (lang === 'en' || lang === 'es')) {
      const localized = src.replace(/\.json$/, '.' + lang + '.json');
      return '/' + localized + '?v=' + BOOKS_VER;
    }
    return '/' + src + '?v=' + BOOKS_VER;
  }
  // Грузит контент книги на текущем языке; при отсутствии/битом переводе
  // безопасно откатывается на русский оригинал.
  async function _fetchBookData() {
    const lang = _bookLang();
    const primary = _bookUrl();
    try {
      const resp = await fetch(primary);
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.parts)) return data;
      }
    } catch (e) {}
    if (lang !== 'ru') {
      const ruUrl = _bookUrl('ru');
      if (ruUrl !== primary) {
        try {
          const resp = await fetch(ruUrl);
          const data = await resp.json();
          if (data && Array.isArray(data.parts)) return data;
        } catch (e2) {}
      }
    }
    return null;
  }

  // -------- Манифест библиотеки --------
  function getBookMeta(id) {
    if (!library || !Array.isArray(library.books)) return null;
    return library.books.find(b => b.id === id) || null;
  }
  async function loadLibrary() {
    if (library) return library;
    try {
      const resp = await fetch('/books-library.json?v=' + BOOKS_VER);
      library = await resp.json();
    } catch (e) {
      console.error('[BookReader] library load error:', e);
      // Фоллбэк — только Книга Даров, чтобы ридер работал даже без манифеста.
      library = {
        shelves: [{ id: 'popular', title: 'Книги', icon: '\uD83D\uDCD6' }],
        books: [{ id: 'dars', title: 'Книга Даров', shelf: 'popular', source: 'book-chapters.json', access: 'gated', i18n: true }]
      };
    }
    return library;
  }

  // -------- Восстановление вида (какая книга / полки) --------
  function saveView() {
    try { localStorage.setItem('_book_view', JSON.stringify({ mode: viewMode, bookId: currentBookId })); } catch (e) {}
  }
  function restoreView() {
    try {
      const v = JSON.parse(localStorage.getItem('_book_view') || '{}');
      if (v.mode === 'reader' && v.bookId && getBookMeta(v.bookId)) {
        viewMode = 'reader';
        currentBookId = v.bookId;
      } else {
        viewMode = 'library';
        currentBookId = 'dars';
      }
    } catch (e) { viewMode = 'library'; currentBookId = 'dars'; }
  }

  // -------- Загрузка конкретной книги в ридер --------
  let _loadedBookLang = null;
  async function loadBook(id) {
    currentBookId = id;
    const meta = getBookMeta(id);
    currentBookAccess = meta ? (meta.access || 'gated') : 'gated';
    currentPartIdx = 0;
    currentChapterIdx = 0;
    loadProgress(); // прогресс namespaced по книге
    try {
      _loadedBookLang = _bookLang();
      bookData = await _fetchBookData();
      if (bookData) totalChapters = bookData.parts.reduce((s, p) => s + p.chapters.length, 0);
    } catch (e) {
      console.error('[BookReader] book load error:', e);
      bookData = null;
    }
    // Доступ к Книге Даров: сначала из localStorage, потом из PROFILE.
    if (id === 'dars') {
      try {
        const cached = localStorage.getItem('_book_full_access');
        if (cached === 'true') bookFullAccess = true;
      } catch (e) {}
      try {
        if (window.PROFILE && typeof window.PROFILE.book_full_access === 'boolean') {
          bookFullAccess = window.PROFILE.book_full_access;
          try { localStorage.setItem('_book_full_access', bookFullAccess ? 'true' : 'false'); } catch (e) {}
        }
      } catch (e) {}
    }
    return bookData;
  }

  async function init() {
    loadSettings();
    await loadLibrary();
    restoreView();
    await loadBook(currentBookId);
  }

  // -------- Доступ --------
  function hasFullAccess() {
    // Бесплатные книги (access:'free') открыты всем целиком.
    if (currentBookAccess === 'free') return true;
    return bookFullAccess === true;
  }
  function isChapterAccessible(globalIdx) {
    return hasFullAccess() || globalIdx < freeChapters;
  }
  function globalIndex(partIdx, chapterIdx) {
    let g = 0;
    for (let i = 0; i < partIdx; i++) g += bookData.parts[i].chapters.length;
    return g + chapterIdx;
  }

  // -------- Диспетчер: витрина полок или чтение --------
  function render() {
    const container = document.getElementById('book-content');
    if (!container) return;
    // Манифест ещё не загружен — подгружаем и перерисовываемся.
    if (!library) {
      container.innerHTML = `
        <div style="padding:24px 16px;text-align:center">
          <div style="font-size:32px;margin-bottom:10px;opacity:0.6">&#128218;</div>
          <div style="font-size:13px;color:var(--text-dim)">${((window.i18n && i18n.t && i18n.t('book.loading')) || 'Загружаем библиотеку...')}</div>
        </div>`;
      init().then(() => render());
      return;
    }
    if (viewMode === 'library') { renderLibrary(); return; }
    renderReader();
  }

  // -------- Витрина: книжные полки по жанрам --------
  function renderLibrary() {
    const container = document.getElementById('book-content');
    if (!container || !library) return;

    const shelves = Array.isArray(library.shelves) ? library.shelves : [];
    const books = Array.isArray(library.books) ? library.books : [];

    const titleTxt = (window.i18n && i18n.t && i18n.t('library.title')) || '\u0411\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0430';
    const subTxt = (window.i18n && i18n.t && i18n.t('library.subtitle')) || '\u041a\u043d\u0438\u0433\u0438 \u043f\u043e \u043f\u043e\u043b\u043a\u0430\u043c \u2014 \u0432\u044b\u0431\u0435\u0440\u0438, \u0447\u0442\u043e \u0447\u0438\u0442\u0430\u0442\u044c';
    const soonTxt = (window.i18n && i18n.t && i18n.t('library.soon')) || '\u0421\u043a\u043e\u0440\u043e';
    const freeTxt = (window.i18n && i18n.t && i18n.t('library.free')) || '\u0411\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e';
    const aboutTxt = (window.i18n && i18n.t && i18n.t('library.about')) || '\u041e \u043a\u043d\u0438\u0433\u0435';
    const authorTxt = (window.i18n && i18n.t && i18n.t('library.author')) || '\u0410\u0432\u0442\u043e\u0440';
    const paidTxt = (window.i18n && i18n.t && i18n.t('library.paid')) || '\u041f\u043b\u0430\u0442\u043d\u0430\u044f \u043a\u043d\u0438\u0433\u0430';

    function bookCard(b) {
      const cover = b.cover || {};
      const from = cover.from || '#D4AF37';
      const to = cover.to || '#8b6b2c';
      const title = (b.id === 'dars')
        ? ((window.i18n && i18n.t && i18n.t('book.title')) || b.title || '')
        : _locField(b, 'title');
      const sub = _locField(b, 'subtitle');
      const isFree = (b.access || 'gated') === 'free';
      const badge = isFree
        ? '<div style="position:absolute;top:8px;right:8px;z-index:2;background:rgba(46,204,113,0.9);color:#06210f;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;letter-spacing:0.3px">' + freeTxt + '</div>'
        : '';
      // Если у книги есть готовая обложка-картинка — показываем её на всю
      // плитку. Иначе — градиентная плашка с названием (фоллбэк).
      const coverInner = b.image
        ? '<img src="/book-images/' + b.image + '?v=' + BOOKS_VER + '" alt="" loading="eager" decoding="async" fetchpriority="high" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"/>'
        : '<div style="position:absolute;left:0;top:0;bottom:0;width:5px;background:rgba(0,0,0,0.18)"></div>' +
          '<div style="text-align:center;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,0.35)">' +
          '<div style="font-size:14px;font-weight:700;line-height:1.25;letter-spacing:0.3px">' + escapeHtml(title) + '</div></div>';

      // Короткая аннотация «о чём книга» + авторы — раскрывается по клику,
      // чтобы читатель решил, стоит ли открывать/покупать. Свёрнута по умолчанию.
      const about = _locField(b, 'about');
      const authors = b.authors || '';
      const statusChip = isFree
        ? '<span style="color:#2ecc71;font-weight:700">' + freeTxt + '</span>'
        : '<span style="color:#D4AF37;font-weight:700">' + paidTxt + '</span>';
      // Поповер «о книге»: всплывает ПОВЕРХ сетки (не удлиняет ленту).
      // Кнопка — явная, с фоном и рамкой, крупная зона под палец.
      // Десктоп — открытие по наведению; телефон — по тапу (hover там отключён,
      // чтобы не было конфликта mouseenter+click = «двойной тык»).
      const aboutBlock = about ? `
          <div id="about-wrap-${b.id}" style="position:relative" onmouseenter="BookReader.openAbout('${b.id}')" onmouseleave="BookReader.closeAbout('${b.id}')">
            <button onclick="BookReader.toggleAbout('${b.id}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#D4AF37;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.35);border-radius:9px;padding:7px 12px;margin-top:2px;font-family:Manrope,sans-serif;line-height:1;-webkit-tap-highlight-color:transparent">
              <span>${escapeHtml(aboutTxt)}</span>
              <span id="about-caret-${b.id}" style="display:inline-block;transition:transform 0.2s;font-size:9px">&#9662;</span>
            </button>
            <div id="about-panel-${b.id}" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 3px);z-index:40;padding:10px 12px;background:#141210;border:1px solid rgba(212,175,55,0.4);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,0.55)">
              <div style="font-size:12px;color:var(--text);line-height:1.45">${escapeHtml(about)}</div>
              ${authors ? '<div style="font-size:11px;color:var(--text-dim);margin-top:6px">' + escapeHtml(authorTxt) + ': ' + escapeHtml(authors) + '</div>' : ''}
              <div style="font-size:11px;margin-top:4px">${statusChip}</div>
            </div>
          </div>` : '';

      return `
        <div style="display:flex;flex-direction:column;gap:8px;text-align:left">
          <div onclick="BookReader.openBook('${b.id}')" style="cursor:pointer;display:flex;flex-direction:column;gap:8px">
            <div style="position:relative;aspect-ratio:2/3;border-radius:12px;overflow:hidden;background:linear-gradient(150deg,${from},${to});box-shadow:0 6px 18px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;padding:${b.image ? '0' : '14px'}">
              ${badge}
              ${coverInner}
            </div>
            <div style="padding:0 2px">
              <div style="font-size:13px;color:var(--text);font-weight:600;line-height:1.3">${escapeHtml(title)}</div>
              ${sub ? '<div style="font-size:11px;color:var(--text-dim);margin-top:2px;line-height:1.3">' + escapeHtml(sub) + '</div>' : ''}
            </div>
          </div>
          ${aboutBlock}
        </div>`;
    }

    let shelvesHtml = '';
    shelves.forEach(sh => {
      const shelfBooks = books.filter(b => b.shelf === sh.id);
      if (!shelfBooks.length && !sh.soon) return; // пустую полку без «скоро» не показываем
      const icon = sh.icon ? (sh.icon + ' ') : '';
      shelvesHtml += `
        <div style="margin-bottom:22px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <div style="font-size:14px;color:#D4AF37;font-weight:700;letter-spacing:0.4px">${icon}${escapeHtml(_locField(sh, 'title'))}</div>
            <div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(212,175,55,0.35),transparent)"></div>
          </div>`;
      if (shelfBooks.length) {
        shelvesHtml += `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px">${shelfBooks.map(bookCard).join('')}</div>`;
      }
      if (sh.soon) {
        shelvesHtml += `
          <div style="margin-top:${shelfBooks.length ? '12px' : '0'};border:1px dashed rgba(255,255,255,0.15);border-radius:12px;padding:18px;text-align:center;color:var(--text-dim);font-size:12px">
            ${soonTxt}
          </div>`;
      }
      shelvesHtml += `</div>`;
    });

    container.innerHTML = `
      <div style="padding:16px 16px 24px">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:28px;margin-bottom:6px">&#128218;</div>
          <div style="font-size:18px;color:var(--text);letter-spacing:1px;margin-bottom:4px">${escapeHtml(titleTxt)}</div>
          <div style="font-size:12px;color:var(--text-dim)">${escapeHtml(subTxt)}</div>
        </div>
        ${shelvesHtml}
      </div>`;
  }

  // -------- Рендер ридера (одна книга) --------
  function renderReader() {
    const container = document.getElementById('book-content');
    if (!container) return;

    // Обновляем доступ к книге на каждый рендер — профиль мог подгрузиться позже init
    try {
      if (window.PROFILE && typeof window.PROFILE.book_full_access === 'boolean') {
        bookFullAccess = window.PROFILE.book_full_access;
        try { localStorage.setItem('_book_full_access', bookFullAccess ? 'true' : 'false'); } catch(e) {}
      }
    } catch(e) {}

    if (!bookData) {
      container.innerHTML = `
        <div style="padding:24px 16px">
          <div style="text-align:center;margin-bottom:20px">
            <div style="font-size:32px;margin-bottom:10px;opacity:0.6">&#128214;</div>
            <div style="font-size:13px;color:var(--text-dim)">${((window.i18n && i18n.t && i18n.t('book.loading')) || 'Загружаем книгу...')}</div>
          </div>
          <div class="skeleton-card">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line med"></div>
          </div>
          <div class="skeleton-card">
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line short"></div>
          </div>
        </div>
      `;
      loadBook(currentBookId).then(() => renderReader());
      return;
    }

    const theme = settings.theme;
    const bg = theme === 'sepia' ? '#f4ecd8' : (theme === 'light' ? '#ffffff' : 'var(--bg-card, rgba(255,255,255,0.03))');
    const fg = theme === 'sepia' ? '#3a2f1a' : (theme === 'light' ? '#1a1a1a' : 'var(--text)');
    const accent = theme === 'sepia' ? '#8b6b2c' : (theme === 'light' ? '#D4AF37' : '#D4AF37');

    const progress = getReadProgress();
    const meta = getBookMeta(currentBookId);
    // Заголовок: у Книги Даров — из i18n, у остальных — из манифеста.
    const bookTitle = (currentBookId === 'dars')
      ? ((window.i18n && i18n.t && i18n.t('book.title')) || 'КНИГА ДАРОВ')
      : ((meta && meta.title) || (bookData.title || ''));
    const chaptersLabel = (window.i18n && i18n.t && i18n.t('book.chapters_count', { n: totalChapters })) || (totalChapters + ' глав');
    const backLabel = (window.i18n && i18n.t && i18n.t('book.back_to_shelves')) || '\u2190 \u041a \u043f\u043e\u043b\u043a\u0430\u043c';

    container.innerHTML = `
      <div style="padding:16px 16px 0">
        <div style="margin-bottom:8px">
          <button class="btn btn-ghost" style="width:auto;margin:0;font-size:12px;padding:6px 12px" onclick="BookReader.showLibrary()">${backLabel}</button>
        </div>
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-size:26px;margin-bottom:6px">&#128214;</div>
          <div style="font-size:18px;color:var(--text);letter-spacing:2px;margin-bottom:4px">${escapeHtml(bookTitle)}</div>
          <div style="font-size:12px;color:var(--text-dim)">${escapeHtml(bookData.version || '')} &bull; ${chaptersLabel}</div>
        </div>

        <!-- Прогресс чтения -->
        <div id="book-progress-block" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-dim);margin-bottom:4px">
            <span>&#128218; ${((window.i18n && i18n.t && i18n.t('book.read_chapters')) || 'Прочитано глав')}</span>
            <span id="book-progress-text"><b style="color:#D4AF37">${progress.count}</b> / ${progress.total}</span>
          </div>
          <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">
            <div id="book-progress-fill" style="height:100%;width:${progress.pct}%;background:linear-gradient(90deg,#D4AF37,#D4AF37);transition:width 0.4s ease;border-radius:3px"></div>
          </div>
        </div>

        ${currentBookAccess !== 'gated' ? '' : (!hasFullAccess() ? `
          <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:12px;margin-bottom:12px;text-align:center">
            <div style="font-size:13px;color:#D4AF37;margin-bottom:4px">&#128142; ${((window.i18n && i18n.t && i18n.t('book.preview_free', { n: freeChapters })) || ('Превью: первые ' + freeChapters + ' глав бесплатно'))}</div>
            <div style="font-size:11px;color:var(--text-dim);line-height:1.4">${((window.i18n && i18n.t && i18n.t('book.preview_hint')) || 'Для полного доступа введите промо-код или оформите подписку')}</div>
          </div>
        ` : `
          <div style="background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.25);border-radius:14px;padding:10px;margin-bottom:12px;text-align:center">
            <div style="font-size:13px;color:#2ecc71">&#10003; ${((window.i18n && i18n.t && i18n.t('book.full_access')) || 'Полный доступ')}</div>
          </div>
        `)}

        <!-- Панель кнопок -->
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <button class="btn btn-ghost" style="flex:1;margin:0;font-size:11px;padding:10px 4px" onclick="BookReader.toggleTOC()">&#128220; ${((window.i18n && i18n.t && i18n.t('book.btn_chapters')) || 'Главы')}</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;font-size:11px;padding:10px 4px" onclick="BookReader.toggleSearch()">&#128269; ${((window.i18n && i18n.t && i18n.t('book.btn_search')) || 'Поиск')}</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;font-size:11px;padding:10px 4px" onclick="BookReader.toggleBookmarks()">&#11088; ${((window.i18n && i18n.t && i18n.t('book.btn_bookmarks')) || 'Закладки')}</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;font-size:11px;padding:10px 4px" onclick="BookReader.toggleSettings()">&#9881; ${((window.i18n && i18n.t && i18n.t('book.btn_settings')) || 'Настройки')}</button>
        </div>
        <!-- Доп. панель: к странице / заметка / поделиться.
             Фикс наложения (тестер 25.05.2026): grid 4 колонки —
             [инпут №][→][✎][🔗]. Без flex-wrap, всегда в одну строку.
             На мобильном 375px помещается без переносов. -->
        <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:6px;margin-bottom:12px;align-items:center">
          <input type="number" id="book-goto-input" min="1" max="${totalChapters}" placeholder="№"
            style="width:100%;padding:8px;background:rgba(255,255,255,0.06);border:1px solid var(--border,rgba(255,255,255,0.15));border-radius:8px;color:var(--text,#fff);font-size:12px;text-align:center;outline:none;font-family:Manrope,sans-serif;min-width:0"
            onkeydown="if(event.key==='Enter'){BookReader.gotoPage(this.value);this.value=''}">
          <button class="btn btn-ghost" style="margin:0;font-size:14px;padding:8px 10px;min-width:36px"
            onclick="var v=document.getElementById('book-goto-input').value;BookReader.gotoPage(v);document.getElementById('book-goto-input').value=''" title="${((window.i18n && i18n.t && i18n.t('book.goto_chapter')) || 'Перейти к главе')}">&#8594;</button>
          <button class="btn btn-ghost" style="margin:0;font-size:14px;padding:8px 10px;min-width:36px" onclick="BookReader.toggleNote()" title="${((window.i18n && i18n.t && i18n.t('book.note_chapter')) || 'Заметка к главе')}">&#9999;&#65039;</button>
          <button class="btn btn-ghost" style="margin:0;font-size:14px;padding:8px 10px;min-width:36px" onclick="BookReader.shareChapter()" title="${((window.i18n && i18n.t && i18n.t('book.share_chapter')) || 'Поделиться главой')}">&#128279;</button>
        </div>
      </div>

      <!-- Панель оглавления -->
      <div id="book-toc-panel" style="display:none;padding:0 16px 12px"></div>

      <!-- Панель поиска -->
      <div id="book-search-panel" style="display:none;padding:0 16px 12px"></div>

      <!-- Панель закладок -->
      <div id="book-bookmarks-panel" style="display:none;padding:0 16px 12px"></div>

      <!-- Панель настроек -->
      <div id="book-settings-panel" style="display:none;padding:0 16px 12px"></div>

      <!-- Контент главы -->
      <div id="book-chapter" class="book-chapter theme-${theme}" style="
        padding:20px 18px;
        background:${bg};
        color:${fg};
        border-radius:14px;
        margin:0 16px 12px;
        font-size:${settings.fontSize}px;
        line-height:${settings.lineHeight};
        font-family:Manrope,sans-serif;
      "></div>

      <!-- Навигация. На последней главе кнопка "Вперёд" превращается в "В начало" -->
      <div id="book-nav" style="display:flex;gap:10px;padding:8px 16px 20px;align-items:center;justify-content:center">
        <button class="btn btn-ghost" style="width:auto;padding:10px 14px;margin:0" onclick="BookReader.prevChapter()">&#8592; ${((window.i18n && i18n.t && i18n.t('book.nav_back')) || 'Назад')}</button>
        <div id="book-pos" style="text-align:center;min-width:100px;font-size:12px;color:var(--text-muted)"></div>
        ${(function(){
          const currG = globalIndex(currentPartIdx, currentChapterIdx);
          const isLast = currG >= totalChapters - 1;
          return isLast
            ? '<button class="btn btn-ghost" style="width:auto;padding:10px 14px;margin:0" onclick="BookReader.goTo(0,0)">&uarr; ' + ((window.i18n && i18n.t && i18n.t('book.nav_to_start')) || 'В начало') + '</button>'
            : '<button class="btn btn-ghost" style="width:auto;padding:10px 14px;margin:0" onclick="BookReader.nextChapter()">' + ((window.i18n && i18n.t && i18n.t('book.nav_forward')) || 'Вперёд') + ' &#8594;</button>';
        })()}
      </div>

      <!-- «Автору на вдохновение» — показывается только на последней главе -->
      <div id="book-inspire"></div>

      ${!hasFullAccess() ? `
        <div style="padding:0 16px 20px">
          <div style="background:var(--card);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:16px;text-align:center">
            <div style="font-size:14px;color:var(--text);margin-bottom:6px">&#128273; ${((window.i18n && i18n.t && i18n.t('book.unlock_title')) || 'Читать дальше — Открыть полный доступ')}</div>
            <div style="font-size:12px;color:var(--text-dim);line-height:1.5;margin-bottom:12px">${((window.i18n && i18n.t && i18n.t('book.unlock_desc')) || '94 главы Книги Даров + дизайнерская PDF. Разовая покупка, навсегда.')}</div>
            <button onclick="if(typeof openTariffsPage==='function')openTariffsPage()" style="width:100%;max-width:300px;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#080808;font-size:15px;cursor:pointer;font-family:Manrope,sans-serif;font-weight:bold;box-shadow:0 0 20px rgba(212,175,55,0.25);margin-bottom:8px">&#128142; ${((window.i18n && i18n.t && i18n.t('book.open_all_tariffs')) || 'Открыть все тарифы')}</button>
            <button onclick="if(typeof buyBookAccess==='function')buyBookAccess()" style="width:100%;max-width:300px;padding:12px;border-radius:12px;border:1px solid rgba(212,175,55,0.5);background:rgba(212,175,55,0.1);color:#D4AF37;font-size:13px;cursor:pointer;font-family:Manrope,sans-serif;margin-bottom:8px">&#11088; ${((window.i18n && i18n.t && i18n.t('book.buy_book')) || 'Купить Книгу — 749 ₽ / 700 ⭐')}</button>
            <button onclick="if(typeof buyWithDarai==='function')buyWithDarai()" style="width:100%;max-width:300px;padding:12px;border-radius:12px;border:1px solid rgba(46,204,113,0.5);background:rgba(46,204,113,0.1);color:#2ecc71;font-size:13px;cursor:pointer;font-family:Manrope,sans-serif;margin-bottom:10px">&#128293; ${((window.i18n && i18n.t && i18n.t('book.pay_darai')) || 'Оплатить в DarAI (44M)')}</button>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">${((window.i18n && i18n.t && i18n.t('book.subscribe_hint')) || 'Или оформи подписку «Мастер» / «Хранитель» для полного доступа ко всем функциям')}</div>
            <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
              <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">${((window.i18n && i18n.t && i18n.t('book.have_promo')) || 'Есть промо-код?')}</div>
              <div style="display:flex;gap:6px;justify-content:center">
                <input id="book-promo-input" type="text" placeholder="${((window.i18n && i18n.t && i18n.t('book.promo_placeholder')) || 'Промо-код')}"
                  style="width:140px;padding:8px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;text-align:center;text-transform:uppercase;outline:none;font-family:Manrope,sans-serif"/>
                <button style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-dim);font-size:12px;cursor:pointer;font-family:Manrope,sans-serif" onclick="BookReader.submitPromo()">OK</button>
              </div>
            </div>
          </div>
        </div>
      ` : ''}
    `;

    renderChapter();
  }

  // -------- Рендер главы --------
  function renderChapter() {
    const wrap = document.getElementById('book-chapter');
    if (!wrap || !bookData) return;

    const part = bookData.parts[currentPartIdx];
    if (!part) return;
    const ch = part.chapters[currentChapterIdx];
    if (!ch) return;

    const gIdx = globalIndex(currentPartIdx, currentChapterIdx);

    if (!isChapterAccessible(gIdx)) {
      // Правильное склонение числительных для "глава"
      const glavPlural = (n) => {
        const mod10 = n % 10, mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'главу';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'главы';
        return 'глав';
      };
      // Пол из профиля (если есть)
      let gender = '';
      try {
        const prof = JSON.parse(localStorage.getItem('_user_profile') || '{}');
        gender = prof.gender || '';
      } catch (e) {}
      const readEnd = gender === 'male' ? '' : gender === 'female' ? 'а' : 'а';
      const remaining = totalChapters - freeChapters;
      wrap.innerHTML = `
        <div style="text-align:center;padding:30px 10px">
          <div style="font-size:42px;margin-bottom:12px">&#128274;</div>
          <div style="font-size:17px;margin-bottom:8px">${((window.i18n && i18n.t && i18n.t('book.locked_chapter_title')) || 'Эта глава доступна в полной версии')}</div>
          <div style="font-size:13px;opacity:0.7;line-height:1.6">
            ${((window.i18n && i18n.t && i18n.t('book.locked_read_free', { n: freeChapters })) || ('Ты прочитал' + readEnd + ' ' + freeChapters + ' ' + glavPlural(freeChapters) + ' бесплатно.'))}<br>
            ${((window.i18n && i18n.t && i18n.t('book.locked_unlock_more', { n: remaining })) || ('Введи промо-код, чтобы открыть ещё ' + remaining + ' ' + glavPlural(remaining) + '.'))}
          </div>
        </div>
      `;
      updatePosIndicator();
      return;
    }

    // C3: платные главы (index >= freeChapters) НЕ приходят в статическом
    // book-chapters.json — там только preview. У них ch.gated === true и нет
    // html. Для юзера с полным доступом догружаем html поштучно через
    // защищённый API (/api/content?type=book-chapter), который сам проверяет
    // pricing.canReadFullBook на сервере. Клиентская проверка выше — только UX.
    if (ch.gated === true && !ch.html) {
      wrap.innerHTML = `
        <div style="text-align:center;padding:40px 10px">
          <div style="font-size:32px;margin-bottom:12px;opacity:0.6">&#128214;</div>
          <div style="font-size:13px;opacity:0.7">${((window.i18n && i18n.t && i18n.t('book.loading')) || 'Загружаем главу...')}</div>
        </div>
      `;
      updatePosIndicator();
      fetchGatedChapter(currentPartIdx, currentChapterIdx, gIdx);
      return;
    }

    // Картинки оставляем ТОЛЬКО в главах-Дарах (kind === 'dar').
    // В обычных главах (введение, теория, главы-обзоры) — убираем все
    // декоративные глифы из .docx, чтобы текст не пестрил иконками.
    // Решено по обратной связи автора 2026-05-21.
    let html = ch.html || '';
    // Картинки рендерим в главах-Дарах (kind==='dar') Книги Даров, а также
    // во ВСЕХ главах прочих книг (у «Девяти полей» рисунки — смысловые схемы,
    // не декоративные глифы, поэтому их не вырезаем).
    if (ch.kind === 'dar' || currentBookId !== 'dars') {
      // Конвертер уже вставил в data-ref имя файла — рендерим тег полноценно
      html = html.replace(/<img\b[^>]*data-ref="([^"]+)"[^>]*>/g, function(_, filename) {
        return '<img class="book-img" src="/book-images/' + filename + '" alt="" />';
      });
    } else {
      // Не глава-Дар — удаляем все <img> и пустые контейнеры от них
      html = html.replace(/<img\b[^>]*>/g, '');
      html = html.replace(/<(p|h[1-6])(\s[^>]*)?>\s*<\/\1>/g, '');
    }

    // Кликабельность номеров банковских карт (тестеры жалуются: нельзя
    // скопировать). Ищем 16 цифр подряд (с пробелами или без) и оборачиваем
    // в интерактивный span-копировщик.
    html = html.replace(/(\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b)/g, function(match) {
      const bare = match.replace(/\s+/g, '');
      const shown = bare.replace(/(\d{4})(?=\d)/g, '$1 ');
      return '<span class="copyable-card-number" data-number="' + bare + '" ' +
        'onclick="BookReader.copyCardNumber(this)" ' +
        'style="display:inline-block;cursor:pointer;padding:2px 8px;border-radius:6px;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.35);color:#D4AF37;font-weight:600;letter-spacing:1px;user-select:all" ' +
        'title="' + ((window.i18n && i18n.t && i18n.t('book.tap_to_copy')) || 'Нажми чтобы скопировать') + '">' + shown + '</span>';
    });

    // Звёздочка закладки
    const bookmarked = isBookmarked(currentPartIdx, currentChapterIdx);
    const starIcon = bookmarked ? '&#11088;' : '&#9734;'; // ⭐ / ☆
    const starTitle = bookmarked ? ((window.i18n && i18n.t && i18n.t('book.remove_bookmark')) || 'Убрать из закладок') : ((window.i18n && i18n.t && i18n.t('book.add_bookmark')) || 'Добавить в закладки');
    const starBtn = `
      <button onclick="BookReader.toggleBookmark()" title="${starTitle}"
        style="background:none;border:none;cursor:pointer;font-size:22px;padding:4px 8px;color:${bookmarked ? '#D4AF37' : 'inherit'};opacity:${bookmarked ? '1' : '0.5'}">
        ${starIcon}
      </button>
    `;

    // Специальное оформление для дара
    let headerHtml = '';
    if (ch.kind === 'dar' && ch.dar_code && ch.dar_name) {
      // Архетип — из глобального словаря DAR_ARCHETYPES (тот же что использует
      // Сокровищница и Энциклопедия). Это источник истины по архетипам Даров.
      let archetype = '';
      try {
        if (window.DAR_ARCHETYPES && window.DAR_ARCHETYPES[ch.dar_code]) {
          archetype = window.DAR_ARCHETYPES[ch.dar_code];
        }
      } catch (e) {}
      // Фоллбэк — из ch.archetype, если он есть в JSON
      if (!archetype && ch.archetype) archetype = ch.archetype;
      // Фоллбэк — попытка вытащить из title после двоеточия
      if (!archetype && ch.title) {
        const m = ch.title.match(/:\s*(.+?)\s*$/);
        if (m && m[1]) archetype = m[1].trim();
      }
      const archetypeHtml = archetype
        ? `<div style="font-size:13px;letter-spacing:2px;color:#D4AF37;opacity:0.85;margin-top:6px;font-weight:500">${escapeHtml(archetype)}</div>`
        : '';
      headerHtml = `
        <div style="text-align:center;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid rgba(212,175,55,0.25);position:relative">
          <div style="position:absolute;top:-4px;right:-6px">${starBtn}</div>
          <div style="font-size:12px;opacity:0.6;letter-spacing:2px;margin-bottom:4px">${((window.i18n && i18n.t && i18n.t('book.dar_label')) || 'ДАР')} &bull; ${ch.dar_code}</div>
          <div style="font-size:26px;letter-spacing:3px;color:#D4AF37">${ch.dar_name}</div>
          ${archetypeHtml}
        </div>
      `;
    } else {
      headerHtml = `
        <div style="position:relative;margin:0 0 16px">
          <div style="position:absolute;top:-4px;right:-6px">${starBtn}</div>
          <h1 style="font-size:${Math.round(settings.fontSize * 1.4)}px;line-height:1.3;margin:0;padding:0 40px;text-align:center">
            ${escapeHtml(ch.title)}
          </h1>
        </div>
      `;
    }

    wrap.innerHTML = `
      <article oncontextmenu="return false" onselectstart="return false" ondragstart="return false" style="user-select:none;-webkit-user-select:none">
        ${headerHtml}
        <div class="book-body">${html}</div>
        ${renderTreasuryLinkIfDar(ch)}
        ${renderYupSoulBannerIfDarEnd(ch)}
      </article>
    `;

    // Скролл наверх
    try { wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(e) {}
    updatePosIndicator();
    updateInspireBlock();
    saveProgress();
    // Помечаем главу прочитанной (если юзер реально получил доступ - не превью-замок)
    markChapterRead(currentPartIdx, currentChapterIdx);
    updateProgressBar();
    // Swipe-навигация — подцепляется один раз
    try { attachSwipeHandlers(); } catch(e) {}
    // Картинкам — курсор zoom-in (визуальная подсказка что есть lightbox)
    try {
      wrap.querySelectorAll('.book-img').forEach(img => { img.style.cursor = 'zoom-in'; });
    } catch(e) {}
  }

  // -------- C3: догрузка платной главы через защищённый API --------
  // Заголовки авторизации как в DarAPI (подписанный initData / dev-id).
  function _authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.initData) headers['x-telegram-init-data'] = tg.initData;
      const devId = localStorage.getItem('_dev_telegram_id');
      if (devId && !(tg && tg.initData)) headers['x-telegram-id'] = devId;
      const tgUid = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
      if (!(tg && tg.initData) && !devId && tgUid) headers['x-telegram-id'] = String(tgUid);
      if (!(tg && tg.initData) && !devId && !tgUid) {
        const webId = localStorage.getItem('_web_uid');
        if (webId) headers['x-telegram-id'] = webId;
      }
    } catch (e) {}
    return headers;
  }

  const _gatedInflight = new Set();
  async function fetchGatedChapter(partIdx, chapterIdx, gIdx) {
    if (_gatedInflight.has(gIdx)) return;
    _gatedInflight.add(gIdx);
    try {
      const lang = _bookLang();
      const resp = await fetch('/api/content?type=book-chapter&n=' + gIdx + '&lang=' + encodeURIComponent(lang), {
        method: 'GET',
        headers: _authHeaders()
      });
      let data = null;
      try { data = await resp.json(); } catch (e) {}

      // Пользователь мог пролистать дальше, пока грузилось — не перетираем.
      const stillHere = (currentPartIdx === partIdx && currentChapterIdx === chapterIdx);

      if (resp.ok && data && data.chapter && typeof data.chapter.html === 'string') {
        // Кладём html в bookData, чтобы renderChapter показал главу и закэшировал.
        try {
          const ch = bookData.parts[partIdx].chapters[chapterIdx];
          ch.html = data.chapter.html;
          ch.gated = false;
        } catch (e) {}
        if (stillHere) renderChapter();
        return;
      }

      // 403 — доступа нет (или профиль отстал): показываем пейволл в самой главе.
      if (resp.status === 403) {
        if (stillHere) renderGatedPaywall((data && data.paywall) || null);
        return;
      }

      // 401 / прочее — просим переоткрыть.
      if (stillHere) {
        const wrap = document.getElementById('book-chapter');
        if (wrap) {
          wrap.innerHTML = `
            <div style="text-align:center;padding:30px 10px">
              <div style="font-size:36px;margin-bottom:10px">&#128274;</div>
              <div style="font-size:14px;margin-bottom:6px">${((window.i18n && i18n.t && i18n.t('book.load_error')) || 'Не удалось загрузить главу')}</div>
              <div style="font-size:12px;opacity:0.7">${((window.i18n && i18n.t && i18n.t('book.load_error_hint')) || 'Проверь соединение и попробуй снова.')}</div>
            </div>
          `;
        }
      }
    } catch (e) {
      console.error('[BookReader] fetchGatedChapter error:', e);
      if (currentPartIdx === partIdx && currentChapterIdx === chapterIdx) {
        const wrap = document.getElementById('book-chapter');
        if (wrap) wrap.innerHTML = `<div style="text-align:center;padding:30px 10px;font-size:13px;opacity:0.7">${((window.i18n && i18n.t && i18n.t('book.load_error')) || 'Не удалось загрузить главу')}</div>`;
      }
    } finally {
      _gatedInflight.delete(gIdx);
    }
  }

  // Пейволл прямо в области главы (когда сервер вернул 403 на платную главу).
  function renderGatedPaywall(paywall) {
    const wrap = document.getElementById('book-chapter');
    if (!wrap) return;
    wrap.innerHTML = `
      <div style="text-align:center;padding:30px 12px">
        <div style="font-size:42px;margin-bottom:12px">&#128274;</div>
        <div style="font-size:17px;margin-bottom:8px">${((window.i18n && i18n.t && i18n.t('book.locked_chapter_title')) || 'Эта глава доступна в полной версии')}</div>
        <div style="font-size:13px;opacity:0.7;line-height:1.6;margin-bottom:16px">
          ${((window.i18n && i18n.t && i18n.t('book.unlock_desc')) || '94 главы Книги Даров + дизайнерская PDF. Разовая покупка, навсегда.')}
        </div>
        <button onclick="if(typeof openTariffsPage==='function')openTariffsPage()" style="width:100%;max-width:300px;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#080808;font-size:15px;cursor:pointer;font-family:Manrope,sans-serif;font-weight:bold;box-shadow:0 0 20px rgba(212,175,55,0.25);margin-bottom:8px">&#128142; ${((window.i18n && i18n.t && i18n.t('book.open_all_tariffs')) || 'Открыть все тарифы')}</button>
        <button onclick="if(typeof buyBookAccess==='function')buyBookAccess()" style="width:100%;max-width:300px;padding:12px;border-radius:12px;border:1px solid rgba(212,175,55,0.5);background:rgba(212,175,55,0.1);color:#D4AF37;font-size:13px;cursor:pointer;font-family:Manrope,sans-serif">&#11088; ${((window.i18n && i18n.t && i18n.t('book.buy_book')) || 'Купить Книгу — 749 ₽ / 700 ⭐')}</button>
      </div>
    `;
    updatePosIndicator();
  }

  function renderYupSoulBannerIfDarEnd(ch) {
    if (ch.kind !== 'dar') return '';
    return `
      <a href="${YUPSOUL_URL}" target="_blank" rel="noopener" style="text-decoration:none;display:block;margin:24px 0 0;padding:14px;background:linear-gradient(135deg,rgba(212,175,55,0.15),rgba(212,175,55,0.15));border:1px solid rgba(212,175,55,0.35);border-radius:14px;text-align:center;color:inherit">
        <div style="font-size:15px;color:#D4AF37;margin-bottom:4px">&#127925; ${((window.i18n && i18n.t && i18n.t('book.yupsoul_title')) || 'Узнай, как звучит твоя Душа')}</div>
        <div style="font-size:12px;opacity:0.75">${((window.i18n && i18n.t && i18n.t('book.yupsoul_desc')) || 'Персональная музыка по дате рождения')} &bull; YupSoul</div>
      </a>
    `;
  }

  // Кнопка "Открыть квесты этого дара" для глав-даров - переход в Сокровищницу
  function renderTreasuryLinkIfDar(ch) {
    if (ch.kind !== 'dar' || !ch.dar_code) return '';
    return `
      <div style="margin:24px 0 0;padding:16px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.25);border-radius:14px;text-align:center">
        <div style="font-size:13px;color:#D4AF37;margin-bottom:10px;line-height:1.5">
          ${((window.i18n && i18n.t && i18n.t('book.treasury_prompt')) || 'Хочешь не только прочитать, но и пройти алхимию этого дара?')}
        </div>
        <button onclick="BookReader.openInTreasury('${ch.dar_code}')"
          style="padding:12px 18px;border-radius:12px;border:1px solid rgba(212,175,55,0.4);background:linear-gradient(135deg,rgba(212,175,55,0.25),rgba(212,175,55,0.15));color:#fff;font-size:14px;cursor:pointer;font-family:Manrope,sans-serif;display:inline-flex;align-items:center;gap:8px">
          <span style="font-size:16px">&#128302;</span>
          <span>${((window.i18n && i18n.t && i18n.t('book.treasury_open_quests')) || 'Открыть квесты в Сокровищнице')}</span>
        </button>
      </div>
    `;
  }

  // Перейти к дару в Сокровищнице (обратная связь Книга → Сокровищница)
  function openInTreasury(darCode) {
    try {
      if (typeof switchNav === 'function') switchNav('treasury');
      setTimeout(() => {
        if (typeof Treasury !== 'undefined' && typeof Treasury.openDar === 'function') {
          Treasury.openDar(darCode);
        }
      }, 250);
    } catch (e) {
      console.error('BookReader.openInTreasury error:', e);
    }
  }

  function updatePosIndicator() {
    const el = document.getElementById('book-pos');
    if (!el) return;
    const gIdx = globalIndex(currentPartIdx, currentChapterIdx) + 1;
    el.textContent = gIdx + ' / ' + totalChapters;

    // Обновляем кнопку "Вперёд" / "В начало" при листании.
    // render() рисует её один раз при входе на вкладку, но prev/nextChapter
    // вызывают только renderChapter() — без обновления нав-бара.
    // Тестеры жаловались: на 94/94 оставалась кнопка "Вперёд" вместо "В начало".
    const nav = document.getElementById('book-nav');
    if (nav) {
      const nextBtn = nav.querySelector('button[onclick*="nextChapter"], button[onclick*="goTo(0,0)"]');
      if (nextBtn) {
        const currG = globalIndex(currentPartIdx, currentChapterIdx);
        const isLast = currG >= totalChapters - 1;
        if (isLast) {
          nextBtn.setAttribute('onclick', 'BookReader.goTo(0,0)');
          nextBtn.innerHTML = '&uarr; ' + ((window.i18n && i18n.t && i18n.t('book.nav_to_start')) || 'В начало');
        } else {
          nextBtn.setAttribute('onclick', 'BookReader.nextChapter()');
          nextBtn.innerHTML = ((window.i18n && i18n.t && i18n.t('book.nav_forward')) || 'Вперёд') + ' &#8594;';
        }
      }
    }
  }

  // Блок «Автору на вдохновение» в конце книги: одно поле, сумму звёзд
  // выбирает сам читатель (без пресетов). Переиспользует готовый Stars-донат.
  function updateInspireBlock() {
    const box = document.getElementById('book-inspire');
    if (!box) return;
    const currG = globalIndex(currentPartIdx, currentChapterIdx);
    const isLast = currG >= totalChapters - 1;
    if (!isLast) { box.innerHTML = ''; return; }
    const t = (k, fb) => ((window.i18n && i18n.t && i18n.t(k)) || fb);
    box.innerHTML = `
      <div style="padding:4px 16px 24px">
        <div style="background:var(--card);border:1px solid rgba(212,175,55,0.25);border-radius:14px;padding:18px;text-align:center">
          <div style="font-size:24px;margin-bottom:6px">&#10024;</div>
          <div style="font-size:15px;color:var(--text);font-weight:600;margin-bottom:6px">${t('book.inspire_title', 'Автору на вдохновение')}</div>
          <div style="font-size:12px;color:var(--text-dim);line-height:1.55;margin-bottom:14px">${t('book.inspire_sub', 'Понравилась книга? Вдохнови автора на новые шедевры, поддержи звёздами.')}</div>
          <div style="display:flex;gap:8px;justify-content:center;max-width:300px;margin:0 auto">
            <input id="book-inspire-amount" type="number" min="1" max="100000" placeholder="${t('book.inspire_placeholder', 'Сколько звёзд \u2728')}" style="flex:1;padding:12px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;text-align:center;outline:none;font-family:Manrope,sans-serif"/>
            <button onclick="BookReader.sendInspire()" style="padding:12px 18px;border-radius:10px;border:none;background:linear-gradient(160deg,#E8C84A 0%,#D4AF37 40%,#9A7B1A 100%);color:#080808;font-size:13px;font-weight:bold;cursor:pointer;font-family:Manrope,sans-serif;white-space:nowrap">${t('book.inspire_send', 'Отправить')}</button>
          </div>
        </div>
      </div>`;
  }

  // Читает введённое число звёзд и запускает готовый Stars-донат (index.html).
  function sendInspire() {
    const el = document.getElementById('book-inspire-amount');
    const amount = el ? parseInt(el.value, 10) : 0;
    if (typeof submitDonation === 'function') { submitDonation(amount); return; }
    // Фолбэк, если глобальный обработчик недоступен
    if (!amount || amount < 1) {
      if (typeof showToast === 'function') showToast('Укажи число звёзд (минимум 1)', 'error');
      return;
    }
    if (window.DarAPI && DarAPI.createDonation) {
      DarAPI.createDonation(amount).then(r => {
        const tg = window.Telegram && window.Telegram.WebApp;
        if (r && r.invoice_url && tg && tg.openInvoice) tg.openInvoice(r.invoice_url, function(){});
        else if (r && r.invoice_url) window.open(r.invoice_url, '_blank');
      }).catch(e => { if (typeof showToast === 'function') showToast(e.message || 'Ошибка', 'error'); });
    }
  }

  function updateProgressBar() {
    const text = document.getElementById('book-progress-text');
    const fill = document.getElementById('book-progress-fill');
    if (!text || !fill) return;
    const p = getReadProgress();
    text.innerHTML = `<b style="color:#D4AF37">${p.count}</b> / ${p.total}`;
    fill.style.width = p.pct + '%';
  }

  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // -------- Навигация --------
  function nextChapter() {
    if (!bookData) return;
    const part = bookData.parts[currentPartIdx];
    if (currentChapterIdx < part.chapters.length - 1) {
      currentChapterIdx++;
    } else if (currentPartIdx < bookData.parts.length - 1) {
      currentPartIdx++;
      currentChapterIdx = 0;
    }
    renderChapter();
  }
  function prevChapter() {
    if (!bookData) return;
    if (currentChapterIdx > 0) {
      currentChapterIdx--;
    } else if (currentPartIdx > 0) {
      currentPartIdx--;
      currentChapterIdx = bookData.parts[currentPartIdx].chapters.length - 1;
    }
    renderChapter();
  }
  function goTo(partIdx, chapterIdx) {
    currentPartIdx = partIdx;
    currentChapterIdx = chapterIdx;
    tocOpen = false;
    const toc = document.getElementById('book-toc-panel');
    if (toc) toc.style.display = 'none';
    renderChapter();
  }

  // Переход к дару по коду (внешнее API — из Энциклопедии/Сокровищницы).
  // Дары есть только в Книге Даров, поэтому сначала переключаемся на неё.
  async function goToDar(darCode) {
    if (!library) { await loadLibrary(); }
    if (currentBookId !== 'dars') { await loadBook('dars'); }
    viewMode = 'reader';
    saveView();
    if (!bookData) { await loadBook('dars'); }
    renderReader();
    for (let i = 0; i < bookData.parts.length; i++) {
      const part = bookData.parts[i];
      for (let j = 0; j < part.chapters.length; j++) {
        if (part.chapters[j].dar_code === darCode) {
          goTo(i, j);
          return true;
        }
      }
    }
    return false;
  }

  // -------- Навигация между витриной и книгами --------
  async function openBook(id) {
    if (!library) { await loadLibrary(); }
    if (!getBookMeta(id)) return;
    if (id !== currentBookId || !bookData) {
      await loadBook(id);
    }
    viewMode = 'reader';
    saveView();
    renderReader();
    try {
      const c = document.getElementById('book-content');
      if (c && c.scrollIntoView) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {}
  }
  function showLibrary() {
    viewMode = 'library';
    saveView();
    // Закрываем возможную панель заметки, чтобы не висела поверх витрины.
    const np = document.getElementById('book-note-panel');
    if (np) np.remove();
    renderLibrary();
  }

  // -------- Оглавление --------
  function toggleTOC() {
    tocOpen = !tocOpen;
    const panel = document.getElementById('book-toc-panel');
    const settingsPanel = document.getElementById('book-settings-panel');
    const bookmarksPanel = document.getElementById('book-bookmarks-panel');
    const searchPanel = document.getElementById('book-search-panel');
    if (!panel) return;
    if (settingsPanel) settingsPanel.style.display = 'none';
    if (bookmarksPanel) bookmarksPanel.style.display = 'none';
    if (searchPanel) searchPanel.style.display = 'none';

    if (!tocOpen) { panel.style.display = 'none'; return; }

    let html = '<div style="background:var(--card,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:14px;padding:12px;max-height:60vh;overflow-y:auto">';

    bookData.parts.forEach((part, pIdx) => {
      html += `
        <div style="margin-bottom:10px">
          <div style="font-size:13px;letter-spacing:1px;color:#D4AF37;padding:6px 4px;border-bottom:1px solid rgba(212,175,55,0.2);margin-bottom:6px">
            ${escapeHtml(part.title)}
          </div>
      `;
      part.chapters.forEach((ch, cIdx) => {
        const g = globalIndex(pIdx, cIdx);
        const locked = !isChapterAccessible(g);
        const read = isChapterRead(pIdx, cIdx);
        const isDar = ch.kind === 'dar';
        const darLabel = isDar ? `<span style="color:#D4AF37;font-size:11px;margin-right:6px">&#10022;</span>` : '';
        const readMark = read && !locked ? '<span style="color:#2ecc71;font-size:12px;margin-left:4px" title="' + ((window.i18n && i18n.t && i18n.t('book.read_mark')) || 'Прочитано') + '">&#10003;</span>' : '';
        const titleShort = ch.title.length > 70 ? ch.title.slice(0, 70) + '...' : ch.title;
        html += `
          <div onclick="${locked ? 'BookReader.showLocked()' : `BookReader.goTo(${pIdx},${cIdx})`}"
            style="padding:8px 6px;font-size:13px;color:${locked ? 'var(--text-muted)' : 'var(--text)'};cursor:pointer;border-radius:8px;display:flex;align-items:center;gap:4px;line-height:1.4;${read && !locked ? 'opacity:0.75' : ''}">
            ${darLabel}<span style="flex:1">${escapeHtml(titleShort)}</span>
            ${readMark}
            ${locked ? '<span style="font-size:11px">&#128274;</span>' : ''}
          </div>
        `;
      });
      html += '</div>';
    });

    html += '</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  }

  function showLocked() {
    alert(((window.i18n && i18n.t && i18n.t('book.chapter_locked')) || 'Эта глава доступна в полной версии. Введи промо-код ниже, чтобы открыть всю книгу.'));
  }

  // -------- Поиск по книге --------
  // Выполняет поиск по всем главам, в которые юзер имеет доступ.
  // Ищет вхождение query (case-insensitive) в title или html главы.
  // Возвращает массив { partIdx, chapterIdx, title, snippet }
  // Нормализация строки для поиска: убираем регистр, дефисы, ё→е, пунктуацию.
  // Так "Ма-на", "МА-НА", "мана" и "мана!" считаются одним запросом.
  function normalizeForSearch(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[\s\-_.,!?:;'"\u2013\u2014()]+/g, '');
  }

  function searchBook(query) {
    if (!bookData || !query || query.trim().length < 2) return [];
    const qOriginal = query.trim().toLowerCase();
    const qNormalized = normalizeForSearch(query);
    if (!qNormalized) return [];
    const results = [];
    for (let pIdx = 0; pIdx < bookData.parts.length; pIdx++) {
      const part = bookData.parts[pIdx];
      for (let cIdx = 0; cIdx < part.chapters.length; cIdx++) {
        const ch = part.chapters[cIdx];
        const g = globalIndex(pIdx, cIdx);
        if (!isChapterAccessible(g)) continue;
        const titleLower = (ch.title || '').toLowerCase();
        const darName = (ch.dar_name || '').toLowerCase();
        const darCode = (ch.dar_code || '').toLowerCase();
        // Снимаем HTML теги для поиска по тексту
        const plainText = (ch.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const textLower = plainText.toLowerCase();

        // Сначала ищем по исходному регистру (позволяет делать сниппеты)
        const titleHit = titleLower.includes(qOriginal);
        const textIdx = textLower.indexOf(qOriginal);

        // Если не нашли — пробуем нормализованную версию (без дефисов, ё→е).
        // Это решает жалобы тестеров: "Ма-на" теперь найдёт главу дара МА-НА,
        // а имя дара и код дара тоже участвуют в поиске.
        let normalizedHit = false;
        if (!titleHit && textIdx === -1) {
          const titleN = normalizeForSearch(titleLower);
          const textN = normalizeForSearch(textLower);
          const darN = normalizeForSearch(darName) + '|' + normalizeForSearch(darCode);
          normalizedHit = titleN.includes(qNormalized) || textN.includes(qNormalized) || darN.includes(qNormalized);
          if (!normalizedHit) continue;
        }

        // Делаем сниппет: 50 символов до и 80 после совпадения
        let snippet = '';
        if (textIdx !== -1) {
          const start = Math.max(0, textIdx - 50);
          const end = Math.min(plainText.length, textIdx + qOriginal.length + 80);
          snippet = (start > 0 ? '\u2026' : '') + plainText.slice(start, end) + (end < plainText.length ? '\u2026' : '');
        } else {
          snippet = plainText.slice(0, 130) + '\u2026';
        }
        results.push({
          partIdx: pIdx,
          chapterIdx: cIdx,
          title: ch.title,
          partTitle: part.title,
          dar_code: ch.dar_code || null,
          dar_name: ch.dar_name || null,
          kind: ch.kind,
          snippet,
          titleHit: titleHit || normalizedHit
        });
        if (results.length >= 50) return results; // лимит результатов
      }
    }
    return results;
  }

  function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text || '');
    const escaped = escapeHtml(text);
    const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp(escapedQuery, 'gi'), '<mark style="background:rgba(212,175,55,0.4);color:#fff;padding:0 2px;border-radius:2px">$&</mark>');
  }

  function toggleSearch() {
    const panel = document.getElementById('book-search-panel');
    const tocPanel = document.getElementById('book-toc-panel');
    const bookmarksPanel = document.getElementById('book-bookmarks-panel');
    const settingsPanel = document.getElementById('book-settings-panel');
    if (!panel) return;
    if (tocPanel) { tocPanel.style.display = 'none'; tocOpen = false; }
    if (bookmarksPanel) bookmarksPanel.style.display = 'none';
    if (settingsPanel) settingsPanel.style.display = 'none';

    const open = panel.style.display === 'block';
    if (open) { panel.style.display = 'none'; return; }

    renderSearchPanel();
    panel.style.display = 'block';
    setTimeout(() => {
      const input = document.getElementById('book-search-input');
      if (input) input.focus();
    }, 50);
  }

  function renderSearchPanel(query) {
    const panel = document.getElementById('book-search-panel');
    if (!panel) return;
    const q = query || '';
    panel.innerHTML = `
      <div style="background:var(--card,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:14px;padding:12px">
        <div style="display:flex;gap:6px;margin-bottom:10px">
          <input id="book-search-input" type="text" placeholder="${((window.i18n && i18n.t && i18n.t('book.search_placeholder')) || 'Слово или фраза...')}" value="${escapeHtml(q)}"
            oninput="BookReader.runSearch(this.value)"
            style="flex:1;padding:10px 12px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;font-family:Manrope,sans-serif;outline:none">
        </div>
        <div id="book-search-results"></div>
      </div>
    `;
    if (q.length >= 2) runSearch(q);
  }

  let _searchDebounceTimer = null;
  function runSearch(query) {
    clearTimeout(_searchDebounceTimer);
    _searchDebounceTimer = setTimeout(() => {
      const container = document.getElementById('book-search-results');
      if (!container) return;
      const q = (query || '').trim();
      if (q.length < 2) {
        container.innerHTML = '<div style="text-align:center;padding:14px;font-size:12px;color:var(--text-dim);font-style:italic">' + ((window.i18n && i18n.t && i18n.t('book.search_min_chars')) || 'Введи хотя бы 2 символа') + '</div>';
        return;
      }
      const results = searchBook(q);
      if (results.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:14px;font-size:12px;color:var(--text-dim);font-style:italic">${((window.i18n && i18n.t && i18n.t('book.search_nothing', { q: escapeHtml(q) })) || ('Ничего не найдено по запросу «' + escapeHtml(q) + '»'))}</div>`;
        return;
      }
      const foundCount = `<b style="color:#D4AF37">${results.length}</b>`;
      let html = `<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;text-align:center">${((window.i18n && i18n.t && i18n.t('book.search_found', { n: foundCount })) || ('Найдено: ' + foundCount))}${results.length === 50 ? ((window.i18n && i18n.t && i18n.t('book.search_first50')) || ' (показаны первые 50)') : ''}</div>`;
      html += '<div style="max-height:50vh;overflow-y:auto">';
      for (const r of results) {
        const isDar = r.kind === 'dar';
        const titleDisplay = highlightMatch(r.title.length > 75 ? r.title.slice(0, 75) + '...' : r.title, q);
        const snippetDisplay = highlightMatch(r.snippet, q);
        html += `
          <div onclick="BookReader.goTo(${r.partIdx},${r.chapterIdx})"
            style="padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;border-radius:6px">
            <div style="font-size:12px;color:var(--text);font-weight:600;line-height:1.4;margin-bottom:3px">
              ${isDar ? '<span style="color:#D4AF37">&#10022;</span> ' : ''}${titleDisplay}
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">${escapeHtml(r.partTitle)}</div>
            ${r.snippet ? `<div style="font-size:11px;color:var(--text-dim);line-height:1.5;font-style:italic">${snippetDisplay}</div>` : ''}
          </div>
        `;
      }
      html += '</div>';
      container.innerHTML = html;
    }, 200);
  }

  // -------- Закладки (UI) --------
  function toggleBookmarks() {
    const panel = document.getElementById('book-bookmarks-panel');
    const tocPanel = document.getElementById('book-toc-panel');
    const settingsPanel = document.getElementById('book-settings-panel');
    const searchPanel = document.getElementById('book-search-panel');
    if (!panel) return;
    if (tocPanel) { tocPanel.style.display = 'none'; tocOpen = false; }
    if (settingsPanel) settingsPanel.style.display = 'none';
    if (searchPanel) searchPanel.style.display = 'none';

    const open = panel.style.display === 'block';
    if (open) { panel.style.display = 'none'; return; }

    renderBookmarksPanel();
    panel.style.display = 'block';
  }

  function renderBookmarksPanel() {
    const panel = document.getElementById('book-bookmarks-panel');
    if (!panel) return;
    const list = loadBookmarks();
    // Сортируем по дате добавления (свежие сверху)
    list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    if (list.length === 0) {
      panel.innerHTML = `
        <div style="background:var(--card,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:14px;padding:24px 16px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px;opacity:0.5">&#11088;</div>
          <div style="font-size:14px;color:var(--text);margin-bottom:6px">${((window.i18n && i18n.t && i18n.t('book.bookmarks_empty')) || 'Пока нет закладок')}</div>
          <div style="font-size:12px;color:var(--text-dim);line-height:1.5">
            ${((window.i18n && i18n.t && i18n.t('book.bookmarks_empty_hint')) || 'Нажми на звёздочку возле заголовка главы, чтобы сохранить её сюда')}
          </div>
        </div>
      `;
      return;
    }

    let html = `
      <div style="background:var(--card,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:14px;padding:12px;max-height:60vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px 10px;border-bottom:1px solid rgba(212,175,55,0.2);margin-bottom:8px">
          <div style="font-size:13px;letter-spacing:1px;color:#D4AF37">&#11088; ${((window.i18n && i18n.t && i18n.t('book.bookmarks_my', { n: list.length })) || ('МОИ ЗАКЛАДКИ (' + list.length + ')'))}</div>
          <button onclick="BookReader.clearBookmarks()" style="background:none;border:none;font-size:11px;color:var(--text-dim);cursor:pointer">${((window.i18n && i18n.t && i18n.t('book.bookmarks_clear_all')) || 'Очистить все')}</button>
        </div>
    `;

    list.forEach(b => {
      const titleShort = b.title.length > 70 ? b.title.slice(0, 70) + '...' : b.title;
      const subtitle = b.dar_name ? `${((window.i18n && i18n.t && i18n.t('book.dar_word')) || 'Дар')} ${b.dar_name} &bull; ${b.dar_code}` : (b.partTitle || '');
      html += `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 6px;border-radius:8px;border-bottom:1px solid rgba(255,255,255,0.04)">
          <div style="flex:1;cursor:pointer" onclick="BookReader.goTo(${b.partIdx},${b.chapterIdx})">
            <div style="font-size:13px;color:var(--text);line-height:1.35;margin-bottom:3px">${escapeHtml(titleShort)}</div>
            <div style="font-size:11px;color:var(--text-dim)">${subtitle}</div>
          </div>
          <button onclick="event.stopPropagation();BookReader.removeBookmark(${b.partIdx},${b.chapterIdx})"
            title="${((window.i18n && i18n.t && i18n.t('book.remove')) || 'Убрать')}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px 8px">&#10005;</button>
        </div>
      `;
    });

    html += '</div>';
    panel.innerHTML = html;
  }

  function clearBookmarks() {
    if (!confirm(((window.i18n && i18n.t && i18n.t('book.confirm_clear_bookmarks')) || 'Убрать все закладки? Это действие нельзя отменить.'))) return;
    saveBookmarks([]);
    renderBookmarksPanel();
    renderChapter();
  }

  // -------- Настройки --------
  function toggleSettings() {
    const panel = document.getElementById('book-settings-panel');
    const tocPanel = document.getElementById('book-toc-panel');
    const bookmarksPanel = document.getElementById('book-bookmarks-panel');
    const searchPanel = document.getElementById('book-search-panel');
    if (!panel) return;
    if (tocPanel) { tocPanel.style.display = 'none'; tocOpen = false; }
    if (bookmarksPanel) bookmarksPanel.style.display = 'none';
    if (searchPanel) searchPanel.style.display = 'none';

    const open = panel.style.display === 'block';
    if (open) { panel.style.display = 'none'; return; }

    panel.innerHTML = `
      <div style="background:var(--card,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:14px;padding:14px">
        <div style="font-size:12px;letter-spacing:2px;color:var(--text-dim);margin-bottom:10px">${((window.i18n && i18n.t && i18n.t('book.font_size')) || 'РАЗМЕР ШРИФТА')}</div>
        <div style="display:flex;gap:6px;margin-bottom:16px">
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:8px;font-size:12px" onclick="BookReader.setFontSize(14)">A-</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:8px;font-size:14px" onclick="BookReader.setFontSize(16)">A</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:8px;font-size:16px" onclick="BookReader.setFontSize(18)">A+</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:8px;font-size:18px" onclick="BookReader.setFontSize(20)">A++</button>
        </div>
        <div style="font-size:12px;letter-spacing:2px;color:var(--text-dim);margin-bottom:10px">${((window.i18n && i18n.t && i18n.t('book.theme')) || 'ТЕМА')}</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:10px;font-size:12px" onclick="BookReader.setTheme('dark')">&#127769; ${((window.i18n && i18n.t && i18n.t('book.theme_dark')) || 'Тёмная')}</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:10px;font-size:12px;background:#f4ecd8;color:#3a2f1a" onclick="BookReader.setTheme('sepia')">&#128196; ${((window.i18n && i18n.t && i18n.t('book.theme_sepia')) || 'Сепия')}</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:10px;font-size:12px;background:#fff;color:#1a1a1a" onclick="BookReader.setTheme('light')">&#9728; ${((window.i18n && i18n.t && i18n.t('book.theme_light')) || 'Светлая')}</button>
        </div>
      </div>
    `;
    panel.style.display = 'block';
  }

  function setFontSize(n) {
    settings.fontSize = n;
    saveSettings();
    renderReader();
    // Оставляем панель настроек открытой
    setTimeout(() => { const p = document.getElementById('book-settings-panel'); if (p) { toggleSettings(); toggleSettings(); } }, 10);
  }
  function setTheme(t) {
    settings.theme = t;
    saveSettings();
    renderReader();
    setTimeout(() => { const p = document.getElementById('book-settings-panel'); if (p) { toggleSettings(); toggleSettings(); } }, 10);
  }

  // -------- Промо --------
  async function submitPromo() {
    const input = document.getElementById('book-promo-input');
    if (!input) return;
    const code = input.value.trim();
    if (!code) {
      const m = ((window.i18n && i18n.t && i18n.t('book.enter_promo')) || 'Введи промо-код');
      if (typeof showToast === 'function') showToast(m, 'error');
      else alert(m);
      return;
    }
    try {
      const result = await DarAPI.submitPromo(code);
      if (result.success) {
        accessLevel = result.access_level || 'full';
        if (window.PROFILE) window.PROFILE.access_level = accessLevel;
        try { localStorage.setItem('_access_level', accessLevel); } catch(e) {}
        // Промо-код открывает и полный доступ к книге.
        bookFullAccess = true;
        if (window.PROFILE) window.PROFILE.book_full_access = true;
        try { localStorage.setItem('_book_full_access', 'true'); } catch(e) {}
        const okMsg = ((window.i18n && i18n.t && i18n.t('book.full_access_unlocked')) || 'Полный доступ к книге открыт!');
        if (typeof showToast === 'function') showToast('\u2728 ' + okMsg, 'success');
        else alert(okMsg);
        renderReader();
      } else {
        const errMsg = result.message || (((window.i18n && i18n.t && i18n.t('book.invalid_promo')) || 'Неверный промо-код'));
        if (typeof showToast === 'function') showToast(errMsg, 'error');
        else alert(errMsg);
      }
    } catch(e) {
      const failMsg = e.message || (((window.i18n && i18n.t && i18n.t('book.promo_activation_failed')) || 'Не удалось активировать промо-код'));
      if (typeof showToast === 'function') showToast(failMsg, 'error');
      else alert(e.message || ((window.i18n && i18n.t && i18n.t('book.promo_activation_failed')) || 'Не удалось активировать промо-код'));
    }
  }

  // Скопировать номер карты при клике (с фоллбэком на Telegram-API если оно есть).
  function copyCardNumber(el) {
    const number = el.getAttribute('data-number') || '';
    const tg = window.Telegram?.WebApp;
    const onCopied = () => {
      const prev = el.innerHTML;
      el.innerHTML = '\u2713 ' + ((window.i18n && i18n.t && i18n.t('book.copied')) || 'Скопировано');
      el.style.background = 'rgba(46,204,113,0.15)';
      setTimeout(() => {
        el.innerHTML = prev;
        el.style.background = 'rgba(212,175,55,0.12)';
      }, 1500);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(number).then(onCopied).catch(() => {
          // Fallback: выделяем текст
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          try { document.execCommand('copy'); onCopied(); } catch (e) {}
        });
      } else if (tg && tg.showAlert) {
        tg.showAlert((((window.i18n && i18n.t && i18n.t('book.copy_card_manually')) || 'Скопируй номер карты вручную:')) + ' ' + number);
      }
    } catch (e) {
      try { if (tg?.showAlert) tg.showAlert(number); } catch (e2) {}
    }
  }

  // ═════════════════════════════════════════════════════
  // НОВЫЕ ФИЧИ (перенесены из прототипа + расширения)
  // 1) Lightbox для картинок
  // 2) Поиск «к странице N»
  // 3) Шеринг текущей главы (Telegram)
  // 4) Заметки на полях (приватные, по главе)
  // 5) Swipe-навигация и клавиатурные шорткаты
  // КОПИРОВАНИЕ ТЕКСТА ОСТАЁТСЯ ЗАПРЕЩЁННЫМ.
  // ═════════════════════════════════════════════════════

  // ---- Lightbox: клик по картинке открывает её на весь экран ----
  function openLightbox(src) {
    let lb = document.getElementById('book-lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'book-lightbox';
      lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;opacity:0;transition:opacity 0.2s';
      lb.addEventListener('click', closeLightbox);
      document.body.appendChild(lb);
    }
    lb.innerHTML = '<img src="' + src + '" alt="" style="max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 0 40px rgba(212,175,55,0.3);border-radius:8px;-webkit-user-select:none;user-select:none;-webkit-user-drag:none" ondragstart="return false" oncontextmenu="return false">' +
      '<button onclick="event.stopPropagation();BookReader.closeLightbox()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);color:#fff;width:40px;height:40px;border-radius:50%;font-size:18px;cursor:pointer">&#10005;</button>';
    requestAnimationFrame(() => { lb.style.opacity = '1'; });
  }
  function closeLightbox() {
    const lb = document.getElementById('book-lightbox');
    if (!lb) return;
    lb.style.opacity = '0';
    setTimeout(() => lb.remove(), 200);
  }

  // ---- Поиск «к странице N» ----
  function gotoPage(n) {
    // Если книга ещё не догрузилась — мягкое сообщение вместо «Страница вне
    // диапазона. Доступно: 1-0» (тестер 25.05.2026: «не работает» — было
    // именно это сообщение из-за гонки fetch /book-chapters.json).
    if (!bookData || !totalChapters) {
      const msg = ((window.i18n && i18n.t && i18n.t('book.still_loading')) || 'Подожди секунду — книга ещё загружается...');
      if (typeof showToast === 'function') showToast(msg, 'info');
      else alert(msg);
      return;
    }
    const num = parseInt(n, 10);
    if (isNaN(num) || num < 1 || num > totalChapters) {
      const msg = ((window.i18n && i18n.t && i18n.t('book.page_out_of_range')) || ('Страница вне диапазона. Доступно: 1\u2013' + totalChapters));
      if (typeof showToast === 'function') showToast(msg, 'error');
      else alert(msg);
      return;
    }
    let g = num - 1;
    for (let i = 0; i < bookData.parts.length; i++) {
      const len = bookData.parts[i].chapters.length;
      if (g < len) { goTo(i, g); return; }
      g -= len;
    }
  }

  // ---- Шеринг текущей главы ----
  function shareChapter() {
    if (!bookData) return;
    const part = bookData.parts[currentPartIdx];
    const ch = part && part.chapters[currentChapterIdx];
    if (!ch) return;
    const gIdx = globalIndex(currentPartIdx, currentChapterIdx) + 1;
    const title = ch.dar_name ? (((window.i18n && i18n.t && i18n.t('book.dar_word')) || '\u0414\u0430\u0440') + ' ' + ch.dar_name) : ch.title;
    const text = '\ud83d\udcd6 ' + ((window.i18n && i18n.t && i18n.t('book.share_text', { title: title, n: gIdx, total: totalChapters })) || ('\u0427\u0438\u0442\u0430\u044e \u00ab\u041a\u043d\u0438\u0433\u0443 \u0414\u0430\u0440\u043e\u0432\u00bb \u2014 ' + title + ' (\u0433\u043b\u0430\u0432\u0430 ' + gIdx + '/' + totalChapters + ')'));
    const url = 'https://t.me/YupDarBot?start=book_' + gIdx;
    const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text);
    const tg = window.Telegram && window.Telegram.WebApp;
    if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank');
  }

  // ---- Заметки на полях (приватные, по главе) ----
  function noteKey(partIdx, chapterIdx) { return partIdx + ':' + chapterIdx; }
  function loadNotes() {
    try { return JSON.parse(localStorage.getItem(_ns('_book_notes')) || '{}'); }
    catch (e) { return {}; }
  }
  function saveNotesMap(map) {
    try { localStorage.setItem(_ns('_book_notes'), JSON.stringify(map)); } catch (e) {}
  }
  function getNote(partIdx, chapterIdx) {
    return loadNotes()[noteKey(partIdx, chapterIdx)] || '';
  }
  function setNote(partIdx, chapterIdx, text) {
    const map = loadNotes();
    if (text && text.trim()) map[noteKey(partIdx, chapterIdx)] = text.trim();
    else delete map[noteKey(partIdx, chapterIdx)];
    saveNotesMap(map);
  }
  function toggleNote() {
    let panel = document.getElementById('book-note-panel');
    if (panel) { panel.remove(); return; }
    panel = document.createElement('div');
    panel.id = 'book-note-panel';
    panel.style.cssText = 'margin:14px 16px;padding:14px;background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.25);border-radius:12px';
    const existing = getNote(currentPartIdx, currentChapterIdx);
    const label = ((window.i18n && i18n.t && i18n.t('book.note_label')) || '\u270f\ufe0f \u041c\u043e\u044f \u0437\u0430\u043c\u0435\u0442\u043a\u0430 \u043a \u044d\u0442\u043e\u0439 \u0433\u043b\u0430\u0432\u0435 (\u0442\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u0442\u0435\u0431\u044f)');
    const placeholder = ((window.i18n && i18n.t && i18n.t('book.note_placeholder')) || '\u0427\u0442\u043e \u0437\u0430\u0446\u0435\u043f\u0438\u043b\u043e, \u0447\u0442\u043e \u0445\u043e\u0447\u0435\u0448\u044c \u0437\u0430\u043f\u043e\u043c\u043d\u0438\u0442\u044c...');
    const saveLabel = ((window.i18n && i18n.t && i18n.t('book.note_save')) || '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c');
    panel.innerHTML = '<div style="font-size:12px;color:#D4AF37;margin-bottom:8px;letter-spacing:0.5px">' + label + '</div>' +
      '<textarea id="book-note-ta" rows="4" placeholder="' + placeholder + '" style="width:100%;background:rgba(8,20,36,0.5);border:1px solid rgba(212,175,55,0.2);border-radius:8px;color:#fff;padding:10px;font-family:Manrope,sans-serif;font-size:14px;line-height:1.5;resize:vertical;outline:none;box-sizing:border-box">' + existing.replace(/</g,'&lt;') + '</textarea>' +
      '<button onclick="BookReader.saveNote()" style="margin-top:8px;padding:8px 18px;background:linear-gradient(135deg,#D4AF37,#b8860b);color:#0a1929;border:none;border-radius:8px;font-family:Manrope,sans-serif;font-weight:700;font-size:13px;cursor:pointer">' + saveLabel + '</button>';
    const chap = document.getElementById('book-chapter');
    if (chap && chap.parentNode) chap.parentNode.insertBefore(panel, chap.nextSibling);
    const ta = document.getElementById('book-note-ta');
    if (ta) ta.focus();
  }
  function saveCurrentNote() {
    const ta = document.getElementById('book-note-ta');
    if (!ta) return;
    setNote(currentPartIdx, currentChapterIdx, ta.value);
    const okMsg = ((window.i18n && i18n.t && i18n.t('book.note_saved')) || '\u2713 \u0417\u0430\u043c\u0435\u0442\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0430');
    if (typeof showToast === 'function') showToast(okMsg, 'success');
    setTimeout(() => {
      const p = document.getElementById('book-note-panel');
      if (p) p.remove();
    }, 800);
  }

  // ---- Swipe-навигация на мобильном ----
  function attachSwipeHandlers() {
    const chap = document.getElementById('book-chapter');
    if (!chap || chap._swipeAttached) return;
    chap._swipeAttached = true;
    let startX = 0, startY = 0, startT = 0;
    chap.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    }, { passive: true });
    chap.addEventListener('touchend', (e) => {
      if (!startX) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;
      startX = 0;
      if (Math.abs(dx) < 60 || Math.abs(dy) > 60 || dt > 600) return;
      if (dx < 0) nextChapter();
      else prevChapter();
    }, { passive: true });
  }

  // ---- Клавиатурные шорткаты ----
  let _kbAttached = false;
  function attachKeyboardShortcuts() {
    if (_kbAttached) return;
    _kbAttached = true;
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      if (!document.getElementById('book-chapter')) return;
      switch (e.key) {
        case 'ArrowRight': case 'PageDown':
          e.preventDefault(); nextChapter(); break;
        case 'ArrowLeft': case 'PageUp':
          e.preventDefault(); prevChapter(); break;
        case 'Home':
          e.preventDefault(); goTo(0, 0); break;
        case 'End':
          e.preventDefault(); {
            const last = bookData.parts.length - 1;
            goTo(last, bookData.parts[last].chapters.length - 1);
          } break;
        case 'b': case 'B':
          if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleBookmark(); }
          break;
        case 'Escape':
          if (document.getElementById('book-lightbox')) { e.preventDefault(); closeLightbox(); }
          break;
      }
    });
  }

  // ---- Делегированный клик по картинкам — lightbox ----
  let _imgClickAttached = false;
  function attachImageClickHandler() {
    if (_imgClickAttached) return;
    _imgClickAttached = true;
    document.addEventListener('click', (e) => {
      const img = e.target.closest && e.target.closest('#book-chapter .book-img');
      if (!img) return;
      const src = img.getAttribute('src');
      if (!src) return;
      img.style.cursor = 'zoom-in';
      openLightbox(src);
    });
  }
  if (typeof document !== 'undefined') {
    attachImageClickHandler();
    attachKeyboardShortcuts();
    // Смена языка → перезагрузка книги на нужном языке и перерисовка.
    // Локализуются Книга Даров ('dars') и любые книги с i18n:true в манифесте;
    // остальным достаточно перерисовать подписи интерфейса.
    const _onLangChange = async () => {
      if (!bookData) { render(); return; } // ещё не инициализировались
      const meta = getBookMeta(currentBookId);
      const localizable = (currentBookId === 'dars') || (meta && meta.i18n);
      if (!localizable) { render(); return; }
      if (_loadedBookLang === _bookLang()) return;  // язык не изменился
      try {
        _loadedBookLang = _bookLang();
        const data = await _fetchBookData();
        if (data) {
          bookData = data;
          totalChapters = bookData.parts.reduce((s, p) => s + p.chapters.length, 0);
          currentPartIdx = 0;
          currentChapterIdx = 0;
        }
        render();
      } catch(e) { console.error('[BookReader] reload error:', e); }
    };
    window.addEventListener('i18n:changed', _onLangChange);
  }

  // Поповер «о книге» под карточкой: всплывает поверх сетки, не удлиняя ленту.
  // Десктоп — по наведению, телефон — по тапу. Открыт всегда один.
  let _aboutTimers = {};
  let _aboutOpenId = null;
  let _aboutDocBound = false;
  // Реальное наведение есть только у мыши. На тачскрине hover эмулируется первым
  // тапом и конфликтует с click → «двойной тык». Поэтому hover-ветку включаем
  // только для устройств с настоящим ховером; на телефоне работает чистый тап.
  function _hasHover() {
    try { return window.matchMedia && window.matchMedia('(hover: hover)').matches; }
    catch (e) { return false; }
  }

  function _showAbout(id, show) {
    const panel = document.getElementById('about-panel-' + id);
    const caret = document.getElementById('about-caret-' + id);
    if (!panel) return;
    panel.style.display = show ? 'block' : 'none';
    if (caret) caret.style.transform = show ? 'rotate(180deg)' : 'rotate(0deg)';
  }

  // Тап вне открытого поповера — закрыть (для тачскрина).
  function _bindAboutDoc() {
    if (_aboutDocBound) return;
    _aboutDocBound = true;
    document.addEventListener('click', function (e) {
      if (!_aboutOpenId) return;
      const wrap = document.getElementById('about-wrap-' + _aboutOpenId);
      if (wrap && !wrap.contains(e.target)) { _showAbout(_aboutOpenId, false); _aboutOpenId = null; }
    });
  }

  // Вызывается из onmouseenter — работает только на устройствах с мышью.
  function openAbout(id) {
    if (!_hasHover()) return;
    _bindAboutDoc();
    if (_aboutTimers[id]) { clearTimeout(_aboutTimers[id]); _aboutTimers[id] = null; }
    if (_aboutOpenId && _aboutOpenId !== id) _showAbout(_aboutOpenId, false);
    _aboutOpenId = id;
    _showAbout(id, true);
  }

  // Задержка на закрытие: пересечение зазора курсором до панели её не захлопнет.
  function closeAbout(id) {
    if (!_hasHover()) return;
    if (_aboutTimers[id]) clearTimeout(_aboutTimers[id]);
    _aboutTimers[id] = setTimeout(function () {
      _showAbout(id, false);
      if (_aboutOpenId === id) _aboutOpenId = null;
    }, 160);
  }

  // Клик/тап по кнопке — работает всегда (и на телефоне, и на десктопе).
  function toggleAbout(id) {
    _bindAboutDoc();
    const panel = document.getElementById('about-panel-' + id);
    if (!panel) return;
    const open = panel.style.display !== 'none';
    if (open) { _showAbout(id, false); if (_aboutOpenId === id) _aboutOpenId = null; }
    else {
      if (_aboutTimers[id]) { clearTimeout(_aboutTimers[id]); _aboutTimers[id] = null; }
      if (_aboutOpenId && _aboutOpenId !== id) _showAbout(_aboutOpenId, false);
      _aboutOpenId = id;
      _showAbout(id, true);
    }
  }

  return {
    init, render, renderChapter,
    showLibrary, openBook, toggleAbout, openAbout, closeAbout,
    nextChapter, prevChapter, goTo, goToDar, openInTreasury, sendInspire,
    toggleTOC, toggleSettings, toggleBookmarks, toggleSearch, runSearch,
    toggleBookmark, removeBookmark, clearBookmarks,
    setFontSize, setTheme,
    submitPromo, showLocked,
    copyCardNumber,
    // Новые фичи
    openLightbox, closeLightbox,
    gotoPage, shareChapter,
    toggleNote, saveNote: saveCurrentNote,
    attachSwipeHandlers
  };
})();

// Экспорт в window (тестер 25.05.2026: на отдельных Android-устройствах
// inline-onclick «BookReader.toggleSearch()» не находил BookReader, потому что
// `const` на top-level не становится свойством window в строгом режиме).
window.BookReader = BookReader;
