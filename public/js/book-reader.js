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
  let freeChapters = 10;     // сколько глав бесплатно
  let totalChapters = 0;
  let tocOpen = false;

  // Настройки читателя (сохраняются в localStorage)
  const DEFAULTS = { fontSize: 16, theme: 'dark', lineHeight: 1.75 };
  let settings = Object.assign({}, DEFAULTS);

  const YUPSOUL_URL = 'https://www.yupsoul.ru/partners.html?ref=S3IHU4&utm_source=partners&utm_medium=partner_referral&utm_campaign=partner';

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

  // -------- Позиция чтения --------
  function saveProgress() {
    try {
      localStorage.setItem('_book_progress', JSON.stringify({
        partIdx: currentPartIdx, chapterIdx: currentChapterIdx
      }));
    } catch(e) {}
  }
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem('_book_progress') || '{}');
      if (typeof p.partIdx === 'number') currentPartIdx = p.partIdx;
      if (typeof p.chapterIdx === 'number') currentChapterIdx = p.chapterIdx;
    } catch(e) {}
  }

  // -------- Прочитанные главы --------
  // Храним Set ключей "partIdx:chapterIdx". Помечаем главу прочитанной,
  // когда юзер на неё переходит (renderChapter).
  function loadReadSet() {
    try {
      const arr = JSON.parse(localStorage.getItem('_book_read') || '[]');
      return new Set(arr);
    } catch(e) { return new Set(); }
  }
  function saveReadSet(set) {
    try { localStorage.setItem('_book_read', JSON.stringify([...set])); } catch(e) {}
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
      return JSON.parse(localStorage.getItem('_book_bookmarks') || '[]');
    } catch(e) { return []; }
  }
  function saveBookmarks(list) {
    try { localStorage.setItem('_book_bookmarks', JSON.stringify(list)); } catch(e) {}
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
  async function init() {
    loadSettings();
    loadProgress();
    try {
      const resp = await fetch('/book-chapters.json?v=1');
      bookData = await resp.json();
      totalChapters = bookData.parts.reduce((s, p) => s + p.chapters.length, 0);
    } catch(e) {
      console.error('[BookReader] load error:', e);
    }
    // Уровень доступа: сначала из localStorage (мгновенно), потом обновится из PROFILE
    try {
      const cachedLevel = localStorage.getItem('_access_level');
      if (cachedLevel && cachedLevel !== 'basic') {
        accessLevel = cachedLevel;
      }
    } catch(e) {}
    try {
      if (window.PROFILE && window.PROFILE.access_level) {
        accessLevel = window.PROFILE.access_level;
        try { localStorage.setItem('_access_level', accessLevel); } catch(e) {}
      }
    } catch(e) {}
  }

  // -------- Доступ --------
  function hasFullAccess() {
    return accessLevel && accessLevel !== 'basic';
  }
  function isChapterAccessible(globalIdx) {
    return hasFullAccess() || globalIdx < freeChapters;
  }
  function globalIndex(partIdx, chapterIdx) {
    let g = 0;
    for (let i = 0; i < partIdx; i++) g += bookData.parts[i].chapters.length;
    return g + chapterIdx;
  }

  // -------- Главный рендер --------
  function render() {
    const container = document.getElementById('book-content');
    if (!container) return;

    // Обновляем уровень доступа на каждый рендер — профиль мог подгрузиться позже init
    try {
      if (window.PROFILE && window.PROFILE.access_level) {
        accessLevel = window.PROFILE.access_level;
        try { localStorage.setItem('_access_level', accessLevel); } catch(e) {}
      }
    } catch(e) {}

    if (!bookData) {
      container.innerHTML = `
        <div style="padding:24px 16px">
          <div style="text-align:center;margin-bottom:20px">
            <div style="font-size:32px;margin-bottom:10px;opacity:0.6">&#128214;</div>
            <div style="font-size:13px;color:var(--text-dim)">Загружаем Книгу Даров...</div>
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
      init().then(() => render());
      return;
    }

    const theme = settings.theme;
    const bg = theme === 'sepia' ? '#f4ecd8' : (theme === 'light' ? '#ffffff' : 'var(--bg-card, rgba(255,255,255,0.03))');
    const fg = theme === 'sepia' ? '#3a2f1a' : (theme === 'light' ? '#1a1a1a' : 'var(--text)');
    const accent = theme === 'sepia' ? '#8b6b2c' : (theme === 'light' ? '#D4AF37' : '#D4AF37');

    const progress = getReadProgress();

    container.innerHTML = `
      <div style="padding:16px 16px 0">
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-size:26px;margin-bottom:6px">&#128214;</div>
          <div style="font-size:18px;color:var(--text);letter-spacing:2px;margin-bottom:4px">КНИГА ДАРОВ</div>
          <div style="font-size:12px;color:var(--text-dim)">${bookData.version || ''} &bull; ${totalChapters} глав</div>
        </div>

        <!-- Прогресс чтения -->
        <div id="book-progress-block" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-dim);margin-bottom:4px">
            <span>&#128218; Прочитано глав</span>
            <span id="book-progress-text"><b style="color:#D4AF37">${progress.count}</b> / ${progress.total}</span>
          </div>
          <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">
            <div id="book-progress-fill" style="height:100%;width:${progress.pct}%;background:linear-gradient(90deg,#D4AF37,#D4AF37);transition:width 0.4s ease;border-radius:3px"></div>
          </div>
        </div>

        ${!hasFullAccess() ? `
          <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:12px;margin-bottom:12px;text-align:center">
            <div style="font-size:13px;color:#D4AF37;margin-bottom:4px">&#128142; Превью: первые ${freeChapters} глав бесплатно</div>
            <div style="font-size:11px;color:var(--text-dim);line-height:1.4">Для полного доступа введите промо-код или оформите подписку</div>
          </div>
        ` : `
          <div style="background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.25);border-radius:14px;padding:10px;margin-bottom:12px;text-align:center">
            <div style="font-size:13px;color:#2ecc71">&#10003; Полный доступ</div>
          </div>
        `}

        <!-- Панель кнопок -->
        <div style="display:flex;gap:6px;margin-bottom:12px">
          <button class="btn btn-ghost" style="flex:1;margin:0;font-size:11px;padding:10px 4px" onclick="BookReader.toggleTOC()">&#128220; Главы</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;font-size:11px;padding:10px 4px" onclick="BookReader.toggleSearch()">&#128269; Поиск</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;font-size:11px;padding:10px 4px" onclick="BookReader.toggleBookmarks()">&#11088; Закладки</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;font-size:11px;padding:10px 4px" onclick="BookReader.toggleSettings()">&#9881; Настройки</button>
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
        <button class="btn btn-ghost" style="width:auto;padding:10px 14px;margin:0" onclick="BookReader.prevChapter()">&#8592; Назад</button>
        <div id="book-pos" style="text-align:center;min-width:100px;font-size:12px;color:var(--text-muted)"></div>
        ${(function(){
          const currG = globalIndex(currentPartIdx, currentChapterIdx);
          const isLast = currG >= totalChapters - 1;
          return isLast
            ? '<button class="btn btn-ghost" style="width:auto;padding:10px 14px;margin:0" onclick="BookReader.goTo(0,0)">&uarr; В начало</button>'
            : '<button class="btn btn-ghost" style="width:auto;padding:10px 14px;margin:0" onclick="BookReader.nextChapter()">Вперёд &#8594;</button>';
        })()}
      </div>

      ${!hasFullAccess() ? `
        <div style="padding:0 16px 20px">
          <div style="background:var(--card);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:16px;text-align:center">
            <div style="font-size:14px;color:var(--text);margin-bottom:6px">&#128273; Полный доступ к Книге Даров</div>
            <div style="font-size:12px;color:var(--text-dim);line-height:1.5;margin-bottom:12px">94 главы + уровень Хранитель + 50 кристаллов + дизайнерская PDF</div>
            <button onclick="if(typeof buyBookAccess==='function')buyBookAccess()" style="width:100%;max-width:300px;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#D4AF37,#D4AF37);color:#fff;font-size:15px;cursor:pointer;font-family:Manrope,sans-serif;font-weight:bold;box-shadow:0 0 20px rgba(212,175,55,0.25);margin-bottom:8px">&#11088; Купить за 500 ⭐ (~$10)</button>
            <button onclick="if(typeof buyWithDarai==='function')buyWithDarai()" style="width:100%;max-width:300px;padding:12px;border-radius:12px;border:1px solid rgba(46,204,113,0.5);background:rgba(46,204,113,0.1);color:#2ecc71;font-size:13px;cursor:pointer;font-family:Manrope,sans-serif;margin-bottom:10px">&#128293; Оплатить в DarAI (40M)</button>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Навсегда, без подписки</div>
            <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
              <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">Есть промо-код?</div>
              <div style="display:flex;gap:6px;justify-content:center">
                <input id="book-promo-input" type="text" placeholder="Промо-код"
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
          <div style="font-size:17px;margin-bottom:8px">Эта глава доступна в полной версии</div>
          <div style="font-size:13px;opacity:0.7;line-height:1.6">
            Ты прочитал${readEnd} ${freeChapters} ${glavPlural(freeChapters)} бесплатно.<br>
            Введи промо-код, чтобы открыть ещё ${remaining} ${glavPlural(remaining)}.
          </div>
        </div>
      `;
      updatePosIndicator();
      return;
    }

    // Конвертер уже вставил в data-ref полное имя файла (img-NNN.ext)
    // Мы полностью заменяем тег <img>, а не только его часть, чтобы убрать
    // пустой src="" и alt="" от mammoth.
    let html = ch.html || '';
    html = html.replace(/<img\b[^>]*data-ref="([^"]+)"[^>]*>/g, function(_, filename) {
      return `<img class="book-img" src="/book-images/${filename}" alt="" />`;
    });

    // Кликабельность номеров банковских карт (тестеры жалуются: нельзя
    // скопировать). Ищем 16 цифр подряд (с пробелами или без) и оборачиваем
    // в интерактивный span-копировщик.
    html = html.replace(/(\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b)/g, function(match) {
      const bare = match.replace(/\s+/g, '');
      const shown = bare.replace(/(\d{4})(?=\d)/g, '$1 ');
      return '<span class="copyable-card-number" data-number="' + bare + '" ' +
        'onclick="BookReader.copyCardNumber(this)" ' +
        'style="display:inline-block;cursor:pointer;padding:2px 8px;border-radius:6px;background:rgba(212,175,55,0.12);border:1px solid rgba(212,175,55,0.35);color:#D4AF37;font-weight:600;letter-spacing:1px;user-select:all" ' +
        'title="Нажми чтобы скопировать">' + shown + '</span>';
    });

    // Звёздочка закладки
    const bookmarked = isBookmarked(currentPartIdx, currentChapterIdx);
    const starIcon = bookmarked ? '&#11088;' : '&#9734;'; // ⭐ / ☆
    const starTitle = bookmarked ? 'Убрать из закладок' : 'Добавить в закладки';
    const starBtn = `
      <button onclick="BookReader.toggleBookmark()" title="${starTitle}"
        style="background:none;border:none;cursor:pointer;font-size:22px;padding:4px 8px;color:${bookmarked ? '#D4AF37' : 'inherit'};opacity:${bookmarked ? '1' : '0.5'}">
        ${starIcon}
      </button>
    `;

    // Специальное оформление для дара
    let headerHtml = '';
    if (ch.kind === 'dar' && ch.dar_code && ch.dar_name) {
      headerHtml = `
        <div style="text-align:center;margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid rgba(212,175,55,0.25);position:relative">
          <div style="position:absolute;top:-4px;right:-6px">${starBtn}</div>
          <div style="font-size:12px;opacity:0.6;letter-spacing:2px;margin-bottom:4px">ДАР &bull; ${ch.dar_code}</div>
          <div style="font-size:26px;letter-spacing:3px;color:#D4AF37">${ch.dar_name}</div>
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
    saveProgress();
    // Помечаем главу прочитанной (если юзер реально получил доступ - не превью-замок)
    markChapterRead(currentPartIdx, currentChapterIdx);
    updateProgressBar();
  }

  function renderYupSoulBannerIfDarEnd(ch) {
    if (ch.kind !== 'dar') return '';
    return `
      <a href="${YUPSOUL_URL}" target="_blank" rel="noopener" style="text-decoration:none;display:block;margin:24px 0 0;padding:14px;background:linear-gradient(135deg,rgba(212,175,55,0.15),rgba(212,175,55,0.15));border:1px solid rgba(212,175,55,0.35);border-radius:14px;text-align:center;color:inherit">
        <div style="font-size:15px;color:#D4AF37;margin-bottom:4px">&#127925; Узнай, как звучит твоя Душа</div>
        <div style="font-size:12px;opacity:0.75">Персональная музыка по дате рождения &bull; YupSoul</div>
      </a>
    `;
  }

  // Кнопка "Открыть квесты этого дара" для глав-даров - переход в Сокровищницу
  function renderTreasuryLinkIfDar(ch) {
    if (ch.kind !== 'dar' || !ch.dar_code) return '';
    return `
      <div style="margin:24px 0 0;padding:16px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.25);border-radius:14px;text-align:center">
        <div style="font-size:13px;color:#D4AF37;margin-bottom:10px;line-height:1.5">
          Хочешь не только прочитать, но и пройти алхимию этого дара?
        </div>
        <button onclick="BookReader.openInTreasury('${ch.dar_code}')"
          style="padding:12px 18px;border-radius:12px;border:1px solid rgba(212,175,55,0.4);background:linear-gradient(135deg,rgba(212,175,55,0.25),rgba(212,175,55,0.15));color:#fff;font-size:14px;cursor:pointer;font-family:Manrope,sans-serif;display:inline-flex;align-items:center;gap:8px">
          <span style="font-size:16px">&#128302;</span>
          <span>Открыть квесты в Сокровищнице</span>
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
          nextBtn.innerHTML = '&uarr; В начало';
        } else {
          nextBtn.setAttribute('onclick', 'BookReader.nextChapter()');
          nextBtn.innerHTML = 'Вперёд &#8594;';
        }
      }
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

  // Переход к дару по коду (внешнее API)
  function goToDar(darCode) {
    if (!bookData) return false;
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
        const readMark = read && !locked ? '<span style="color:#2ecc71;font-size:12px;margin-left:4px" title="Прочитано">&#10003;</span>' : '';
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
    alert('Эта глава доступна в полной версии. Введи промо-код ниже, чтобы открыть всю книгу.');
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
          <input id="book-search-input" type="text" placeholder="Слово или фраза..." value="${escapeHtml(q)}"
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
        container.innerHTML = '<div style="text-align:center;padding:14px;font-size:12px;color:var(--text-dim);font-style:italic">Введи хотя бы 2 символа</div>';
        return;
      }
      const results = searchBook(q);
      if (results.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:14px;font-size:12px;color:var(--text-dim);font-style:italic">Ничего не найдено по запросу «${escapeHtml(q)}»</div>`;
        return;
      }
      let html = `<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;text-align:center">Найдено: <b style="color:#D4AF37">${results.length}</b>${results.length === 50 ? ' (показаны первые 50)' : ''}</div>`;
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
          <div style="font-size:14px;color:var(--text);margin-bottom:6px">Пока нет закладок</div>
          <div style="font-size:12px;color:var(--text-dim);line-height:1.5">
            Нажми на звёздочку возле заголовка главы, чтобы сохранить её сюда
          </div>
        </div>
      `;
      return;
    }

    let html = `
      <div style="background:var(--card,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:14px;padding:12px;max-height:60vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px 10px;border-bottom:1px solid rgba(212,175,55,0.2);margin-bottom:8px">
          <div style="font-size:13px;letter-spacing:1px;color:#D4AF37">&#11088; МОИ ЗАКЛАДКИ (${list.length})</div>
          <button onclick="BookReader.clearBookmarks()" style="background:none;border:none;font-size:11px;color:var(--text-dim);cursor:pointer">Очистить все</button>
        </div>
    `;

    list.forEach(b => {
      const titleShort = b.title.length > 70 ? b.title.slice(0, 70) + '...' : b.title;
      const subtitle = b.dar_name ? `Дар ${b.dar_name} &bull; ${b.dar_code}` : (b.partTitle || '');
      html += `
        <div style="display:flex;align-items:center;gap:8px;padding:10px 6px;border-radius:8px;border-bottom:1px solid rgba(255,255,255,0.04)">
          <div style="flex:1;cursor:pointer" onclick="BookReader.goTo(${b.partIdx},${b.chapterIdx})">
            <div style="font-size:13px;color:var(--text);line-height:1.35;margin-bottom:3px">${escapeHtml(titleShort)}</div>
            <div style="font-size:11px;color:var(--text-dim)">${subtitle}</div>
          </div>
          <button onclick="event.stopPropagation();BookReader.removeBookmark(${b.partIdx},${b.chapterIdx})"
            title="Убрать" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px 8px">&#10005;</button>
        </div>
      `;
    });

    html += '</div>';
    panel.innerHTML = html;
  }

  function clearBookmarks() {
    if (!confirm('Убрать все закладки? Это действие нельзя отменить.')) return;
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
        <div style="font-size:12px;letter-spacing:2px;color:var(--text-dim);margin-bottom:10px">РАЗМЕР ШРИФТА</div>
        <div style="display:flex;gap:6px;margin-bottom:16px">
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:8px;font-size:12px" onclick="BookReader.setFontSize(14)">A-</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:8px;font-size:14px" onclick="BookReader.setFontSize(16)">A</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:8px;font-size:16px" onclick="BookReader.setFontSize(18)">A+</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:8px;font-size:18px" onclick="BookReader.setFontSize(20)">A++</button>
        </div>
        <div style="font-size:12px;letter-spacing:2px;color:var(--text-dim);margin-bottom:10px">ТЕМА</div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:10px;font-size:12px" onclick="BookReader.setTheme('dark')">&#127769; Тёмная</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:10px;font-size:12px;background:#f4ecd8;color:#3a2f1a" onclick="BookReader.setTheme('sepia')">&#128196; Сепия</button>
          <button class="btn btn-ghost" style="flex:1;margin:0;padding:10px;font-size:12px;background:#fff;color:#1a1a1a" onclick="BookReader.setTheme('light')">&#9728; Светлая</button>
        </div>
      </div>
    `;
    panel.style.display = 'block';
  }

  function setFontSize(n) {
    settings.fontSize = n;
    saveSettings();
    render();
    // Оставляем панель настроек открытой
    setTimeout(() => { const p = document.getElementById('book-settings-panel'); if (p) { toggleSettings(); toggleSettings(); } }, 10);
  }
  function setTheme(t) {
    settings.theme = t;
    saveSettings();
    render();
    setTimeout(() => { const p = document.getElementById('book-settings-panel'); if (p) { toggleSettings(); toggleSettings(); } }, 10);
  }

  // -------- Промо --------
  async function submitPromo() {
    const input = document.getElementById('book-promo-input');
    if (!input) return;
    const code = input.value.trim();
    if (!code) {
      if (typeof showToast === 'function') showToast('Введи промо-код', 'error');
      else alert('Введи промо-код');
      return;
    }
    try {
      const result = await DarAPI.submitPromo(code);
      if (result.success) {
        accessLevel = result.access_level || 'full';
        if (window.PROFILE) window.PROFILE.access_level = accessLevel;
        try { localStorage.setItem('_access_level', accessLevel); } catch(e) {}
        if (typeof showToast === 'function') showToast('\u2728 Полный доступ к книге открыт!', 'success');
        else alert('Полный доступ к книге открыт!');
        render();
      } else {
        if (typeof showToast === 'function') showToast(result.message || 'Неверный промо-код', 'error');
        else alert(result.message || 'Неверный промо-код');
      }
    } catch(e) {
      if (typeof showToast === 'function') showToast(e.message || 'Не удалось активировать промо-код', 'error');
      else alert(e.message || 'Не удалось активировать промо-код');
    }
  }

  // Скопировать номер карты при клике (с фоллбэком на Telegram-API если оно есть).
  function copyCardNumber(el) {
    const number = el.getAttribute('data-number') || '';
    const tg = window.Telegram?.WebApp;
    const onCopied = () => {
      const prev = el.innerHTML;
      el.innerHTML = '\u2713 Скопировано';
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
        tg.showAlert('Скопируй номер карты вручную: ' + number);
      }
    } catch (e) {
      try { if (tg?.showAlert) tg.showAlert(number); } catch (e2) {}
    }
  }

  return {
    init, render, renderChapter,
    nextChapter, prevChapter, goTo, goToDar, openInTreasury,
    toggleTOC, toggleSettings, toggleBookmarks, toggleSearch, runSearch,
    toggleBookmark, removeBookmark, clearBookmarks,
    setFontSize, setTheme,
    submitPromo, showLocked,
    copyCardNumber
  };
})();
