/**
 * Ридер книги "Книга Даров"
 * - Интерактивное оглавление (bottom sheet на мобильном, sidebar на десктопе)
 * - Ссылки ЮпСоул на разделительных страницах
 * - Защита от копирования
 */

const BookReader = (function() {
  let currentPage = 1;
  let totalPages = 265;
  let freePages = 25;
  let maxPage = 25;
  let accessLevel = 'basic';
  let isLoading = false;
  let tocOpen = false;

  const YUPSOUL_URL = 'https://www.yupsoul.ru/partners.html?ref=S3IHU4&utm_source=partners&utm_medium=partner_referral&utm_campaign=partner';

  // Страницы, на которых показывать баннер ЮпСоул
  const YUPSOUL_PAGES = [16, 35, 53, 72, 93, 121, 142, 163, 184, 209];

  // Полное оглавление книги
  const TOC = [
    { title: 'ЧАСТЬ 1. Начало пути', page: 6, items: [
      { title: 'Введение: Карта вашей уникальности', page: 6 },
      { title: 'Три мира: Где рождается реальность', page: 7 },
      { title: 'Девять полей: Из чего сотканы ДАРы', page: 8 },
      { title: 'Код вашей уникальности', page: 9 },
      { title: 'Алхимия даты: Как рассчитать свой ДАР', page: 10 },
      { title: 'Навигатор ДАРов', page: 11 },
      { title: 'Анатомия Души: Как читать портрет дара', page: 13 },
    ]},
    { title: 'ЧАСТЬ 2. Мир ДАРов', page: 16, items: [
      { title: 'Глава 1. Поле ЛОГОС', page: 16, icon: '\u25B3', items: [
        { title: 'ЛА-ДА (2-8-1)', page: 17 },
        { title: 'И-СТОК (3-7-1)', page: 20 },
        { title: 'ЖАР (4-6-1)', page: 23 },
        { title: 'ТЕ-ЛО (5-5-1)', page: 26 },
        { title: 'СВЕ-ТО (6-4-1)', page: 28 },
        { title: 'ПРИ-ТОК (7-3-1)', page: 30 },
        { title: 'ЛЕ-ЛИ (8-2-1)', page: 33 },
      ]},
      { title: 'Глава 2. Поле НИМА', page: 35, icon: '\u2726', items: [
        { title: 'БРА-МА (1-1-2)', page: 36 },
        { title: 'ГО-РА (3-8-2)', page: 38 },
        { title: 'ГУ-НА (4-7-2)', page: 40 },
        { title: 'СО-НА (5-6-2)', page: 42 },
        { title: 'У-МА (6-5-2)', page: 44 },
        { title: 'РО-ДА (7-4-2)', page: 47 },
        { title: 'МЕ-РУ (8-3-2)', page: 50 },
      ]},
      { title: 'Глава 3. Поле АНДРА', page: 53, icon: '\u{1F300}', items: [
        { title: 'ЛИ-РА (1-2-3)', page: 53 },
        { title: 'ВИ-РА (2-1-3)', page: 56 },
        { title: 'СИ-ЛА (4-8-3)', page: 59 },
        { title: 'МАТ-КА (5-7-3)', page: 61 },
        { title: 'ПА-РА (6-6-3)', page: 63 },
        { title: 'МА-ТА (7-5-3)', page: 66 },
        { title: 'АНАН-Д-РА (8-4-3)', page: 69 },
      ]},
      { title: 'Глава 4. Поле ЗИНГРА', page: 72, icon: '\u{1F525}', items: [
        { title: 'АР-КА (1-3-4)', page: 72 },
        { title: 'ЗИ-МА (2-2-4)', page: 75 },
        { title: 'ЛА-НА (3-1-4)', page: 78 },
        { title: 'РО-СА (5-8-4)', page: 81 },
        { title: 'ВОС-ХА (6-7-4)', page: 83 },
        { title: 'МА-АТ (7-6-4)', page: 87 },
        { title: 'СЕ-МА (8-5-4)', page: 90 },
      ]},
      { title: 'Глава 5. Поле ЛУБА', page: 93, icon: '\u2600', items: [
        { title: 'ЖИ-МА (1-4-5)', page: 99 },
        { title: 'АР-МА (2-3-5)', page: 102 },
        { title: 'РА-МА (3-2-5)', page: 105 },
        { title: 'РИ-МА (4-1-5)', page: 108 },
        { title: 'ТРО-НА (6-8-5)', page: 111 },
        { title: 'ЖИ-ВА (7-7-5)', page: 114 },
        { title: 'А-МА (8-6-5)', page: 117 },
      ]},
      { title: 'Глава 6. Поле ТУМА', page: 121, icon: '\u{1F30A}', items: [
        { title: 'КУ-НА (1-5-6)', page: 121 },
        { title: 'ТО-ТА (2-4-6)', page: 124 },
        { title: 'ТУ-РА (3-3-6)', page: 127 },
        { title: 'Э-МА (4-2-6)', page: 130 },
        { title: 'ЛУ-НА (5-1-6)', page: 133 },
        { title: 'ТА-РА (7-8-6)', page: 136 },
        { title: 'СО-ХА (8-7-6)', page: 139 },
      ]},
      { title: 'Глава 7. Поле АСТРА', page: 142, icon: '\u269B', items: [
        { title: 'З-МАН (1-6-7)', page: 142 },
        { title: 'БРА-Х-МА (2-5-7)', page: 145 },
        { title: 'ГРАД (3-4-7)', page: 148 },
        { title: 'АР-ХЕЙ (4-3-7)', page: 151 },
        { title: 'НИ-РА (5-2-7)', page: 154 },
        { title: 'МА-НА (6-1-7)', page: 157 },
        { title: 'ПРА-НА (8-8-7)', page: 160 },
      ]},
      { title: 'Глава 8. Поле БИТРА', page: 163, icon: '\u25EF', items: [
        { title: 'БИ-РА (1-7-8)', page: 164 },
        { title: 'СО-ЛАР (2-6-8)', page: 167 },
        { title: 'КО-ДА (3-5-8)', page: 170 },
        { title: 'ЛИ-КО (4-4-8)', page: 173 },
        { title: 'ЗЛА-ТО (5-3-8)', page: 175 },
        { title: 'БИ-МА (6-2-8)', page: 178 },
        { title: 'МИ-ДА (7-1-8)', page: 181 },
      ]},
      { title: 'Глава 9. Поле ОМА', page: 184, icon: '\u25C7', items: [
        { title: 'РАЙ (1-8-9)', page: 184 },
        { title: 'ФА-НА (2-7-9)', page: 187 },
        { title: 'ИРИЙ (3-6-9)', page: 190 },
        { title: 'ШИ-ВА (4-5-9)', page: 193 },
        { title: 'МИ-РА (5-4-9)', page: 196 },
        { title: 'ТО-РА (7-2-9)', page: 199 },
        { title: 'ТОТ (6-3-9)', page: 203 },
        { title: 'РОЙ (8-1-9)', page: 206 },
      ]},
    ]},
    { title: 'ЧАСТЬ 3. Универсалы-интеграторы', page: 209, items: [
      { title: 'Глава 1. Логос (1-9-1, 9-1-1)', page: 210 },
      { title: 'Глава 2. Нима (2-9-2, 9-2-2)', page: 216 },
      { title: 'Глава 3. Андра (3-9-3, 9-3-3)', page: 222 },
      { title: 'Глава 4. Зингра (4-9-4, 9-4-4)', page: 228 },
      { title: 'Глава 5. Луба (5-9-5, 9-5-5)', page: 234 },
      { title: 'Глава 6. Тума (6-9-6, 9-6-6)', page: 240 },
      { title: 'Глава 7. Астра (7-9-7, 9-7-7)', page: 246 },
      { title: 'Глава 8. Битра (8-9-8, 9-8-8)', page: 252 },
      { title: 'Глава 9. Ома (9-9-9)', page: 258 },
    ]},
    { title: 'ЧАСТЬ 4. Завершение пути', page: 261, items: [
      { title: 'Эпилог', page: 261 },
      { title: 'Как появилась эта книга', page: 262 },
      { title: 'Продолжение в звуке', page: 263 },
      { title: 'Связь с автором', page: 264 },
      { title: 'Благодарность', page: 265 },
    ]},
  ];

  async function init() {
    try {
      const resp = await fetch('/api/book?action=info', {
        headers: window.Telegram?.WebApp?.initData ? { 'x-telegram-init-data': window.Telegram.WebApp.initData } : {}
      });
      const info = await resp.json();
      totalPages = info.total_pages || 265;
      freePages = info.free_pages || 25;
      accessLevel = info.access_level || 'basic';
      maxPage = info.max_page || freePages;
    } catch(e) {
      console.error('Book info error:', e);
    }
  }

  function render() {
    const container = document.getElementById('book-content');
    if (!container) return;
    const hasAccess = accessLevel !== 'basic';

    container.innerHTML = `
      <div style="text-align:center;padding:20px 16px 0">
        <div style="font-size:28px;margin-bottom:10px">&#128214;</div>
        <div style="font-size:18px;color:var(--text);letter-spacing:2px;margin-bottom:4px">КНИГА ДАРОВ</div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:12px">Дизайнерская версия &bull; ${totalPages} страниц</div>
        ${!hasAccess ? `
          <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:12px;margin-bottom:12px">
            <div style="font-size:13px;color:#D4AF37;margin-bottom:4px">&#128142; Превью: первые ${freePages} страниц бесплатно</div>
            <div style="font-size:11px;color:var(--text-dim);line-height:1.4">Для полного доступа введите промо-код или оформите подписку</div>
          </div>
        ` : `
          <div style="background:rgba(46,204,113,0.1);border:1px solid rgba(46,204,113,0.3);border-radius:14px;padding:10px;margin-bottom:12px">
            <div style="font-size:13px;color:#2ecc71">&#10003; Полный доступ</div>
          </div>
        `}
      </div>

      <!-- Кнопка Оглавление -->
      <div style="padding:0 16px 8px;display:flex;gap:8px">
        <button class="btn btn-ghost" style="flex:1;margin:0;font-size:13px" onclick="BookReader.toggleTOC()">&#128220; Оглавление</button>
        <button class="btn btn-secondary" style="flex:1;margin:0;font-size:13px" onclick="BookReader.loadPage(${currentPage})">&#128214; Читать</button>
      </div>

      <!-- Панель оглавления -->
      <div id="book-toc-panel" class="book-toc-panel" style="display:none"></div>

      <!-- Страница -->
      <div id="book-page-container" style="padding:0 16px"></div>

      <!-- ЮпСоул баннер (скрыт по умолчанию) -->
      <div id="yupsoul-banner" style="display:none"></div>

      <!-- Навигация -->
      <div id="book-nav" style="display:flex;gap:10px;padding:12px 16px;align-items:center;justify-content:center">
        <button class="btn btn-ghost" style="width:auto;padding:10px 16px;margin:0" onclick="BookReader.prevPage()">&#8592;</button>
        <div style="text-align:center;min-width:100px;cursor:pointer" onclick="BookReader.toggleTOC()">
          <span id="book-page-num" style="font-size:14px;color:var(--text)">${currentPage}</span>
          <span style="font-size:12px;color:var(--text-muted)"> / ${maxPage}</span>
        </div>
        <button class="btn btn-ghost" style="width:auto;padding:10px 16px;margin:0" onclick="BookReader.nextPage()">&#8594;</button>
      </div>

      ${!hasAccess ? `
        <div style="padding:0 16px 20px">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px;text-align:center">
            <div style="font-size:13px;color:var(--text);margin-bottom:8px">&#128273; Полный доступ</div>
            <input id="book-promo-input" type="text" placeholder="Промо-код"
              style="width:100%;max-width:240px;padding:10px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;text-align:center;text-transform:uppercase;outline:none;font-family:Georgia,serif;margin-bottom:8px"/>
            <button class="btn btn-primary" style="max-width:240px;padding:10px" onclick="BookReader.submitPromo()">Активировать</button>
          </div>
        </div>
      ` : ''}
    `;
  }

  function toggleTOC() {
    tocOpen = !tocOpen;
    const panel = document.getElementById('book-toc-panel');
    if (!panel) return;

    if (tocOpen) {
      let html = '<div class="toc-list">';
      TOC.forEach(part => {
        html += `<div class="toc-part" onclick="event.stopPropagation()">
          <div class="toc-part-title" onclick="this.parentElement.classList.toggle('open')">${part.title} <span style="float:right;font-size:11px;color:var(--text-muted)">стр ${part.page}</span></div>
          <div class="toc-part-items">`;

        if (part.items) {
          part.items.forEach(ch => {
            if (ch.items) {
              // Глава с дарами
              html += `<div class="toc-chapter" onclick="event.stopPropagation()">
                <div class="toc-chapter-title" onclick="this.parentElement.classList.toggle('open')">
                  ${ch.icon || ''} ${ch.title} <span style="float:right;font-size:11px;color:var(--text-muted)">${ch.page}</span>
                </div>
                <div class="toc-chapter-items">`;
              ch.items.forEach(dar => {
                const accessible = dar.page <= maxPage;
                html += `<div class="toc-dar ${accessible ? '' : 'toc-locked'}" onclick="${accessible ? `BookReader.goToPage(${dar.page})` : 'BookReader.showUpgradePrompt()'}">
                  ${dar.title} ${!accessible ? '&#128274;' : ''}
                </div>`;
              });
              html += '</div></div>';
            } else {
              // Простой пункт
              const accessible = ch.page <= maxPage;
              html += `<div class="toc-item ${accessible ? '' : 'toc-locked'}" onclick="${accessible ? `BookReader.goToPage(${ch.page})` : 'BookReader.showUpgradePrompt()'}">
                ${ch.title} ${!accessible ? '&#128274;' : ''} <span style="float:right;font-size:11px;color:var(--text-muted)">${ch.page}</span>
              </div>`;
            }
          });
        }
        html += '</div></div>';
      });
      html += '</div>';
      panel.innerHTML = html;
      panel.style.display = 'block';
      // Автооткрыть первую часть
      const firstPart = panel.querySelector('.toc-part');
      if (firstPart) firstPart.classList.add('open');
    } else {
      panel.style.display = 'none';
    }
  }

  function goToPage(num) {
    tocOpen = false;
    const panel = document.getElementById('book-toc-panel');
    if (panel) panel.style.display = 'none';
    loadPage(num);
  }

  async function loadPage(num) {
    if (isLoading) return;
    if (num < 1) num = 1;
    if (num > maxPage) { showUpgradePrompt(); return; }

    isLoading = true;
    currentPage = num;

    const pageContainer = document.getElementById('book-page-container');
    const pageNumEl = document.getElementById('book-page-num');
    if (pageNumEl) pageNumEl.textContent = num;

    pageContainer.innerHTML = `
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:24px;animation:pulse 1.5s infinite">&#128214;</div>
        <div style="color:var(--text-dim);font-size:13px;margin-top:8px">Загрузка страницы ${num}...</div>
      </div>
    `;

    try {
      const headers = {};
      if (window.Telegram?.WebApp?.initData) headers['x-telegram-init-data'] = window.Telegram.WebApp.initData;
      const resp = await fetch(`/api/book?page=${num}`, { headers });
      const data = await resp.json();

      if (data.error) {
        if (data.need_upgrade) showUpgradePrompt();
        else pageContainer.innerHTML = `<div style="text-align:center;padding:30px;color:#f87171">${data.error}</div>`;
        isLoading = false;
        return;
      }

      pageContainer.innerHTML = `
        <div class="book-page-wrap" oncontextmenu="return false" onselectstart="return false" ondragstart="return false">
          <img src="${data.url}" alt="Страница ${num}"
            style="width:100%;border-radius:8px;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none"
            draggable="false" />
        </div>
      `;

      // Показать баннер ЮпСоул на разделительных страницах
      showYupSoulBanner(num);

    } catch(e) {
      pageContainer.innerHTML = `<div style="text-align:center;padding:30px;color:#f87171">Ошибка: ${e.message}</div>`;
    }
    isLoading = false;
  }

  function showYupSoulBanner(pageNum) {
    const banner = document.getElementById('yupsoul-banner');
    if (!banner) return;

    if (YUPSOUL_PAGES.includes(pageNum)) {
      banner.innerHTML = `
        <a href="${YUPSOUL_URL}" target="_blank" rel="noopener" style="text-decoration:none;display:block;margin:12px 16px;padding:14px;background:linear-gradient(135deg,rgba(107,33,168,0.3),rgba(212,175,55,0.2));border:1px solid rgba(212,175,55,0.4);border-radius:14px;text-align:center">
          <div style="font-size:15px;color:#D4AF37;margin-bottom:4px">&#127925; Узнайте как звучит Ваша Душа</div>
          <div style="font-size:12px;color:var(--text-dim)">Персональная музыка по дате рождения &bull; YupSoul</div>
        </a>
      `;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  function nextPage() { currentPage < maxPage ? loadPage(currentPage + 1) : showUpgradePrompt(); }
  function prevPage() { currentPage > 1 && loadPage(currentPage - 1); }

  function showUpgradePrompt() {
    const pageContainer = document.getElementById('book-page-container');
    if (!pageContainer) return;
    pageContainer.innerHTML = `
      <div style="text-align:center;padding:30px 16px">
        <div style="font-size:36px;margin-bottom:12px">&#128274;</div>
        <div style="font-size:16px;color:var(--text);margin-bottom:8px">Превью закончилось</div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:16px">
          Вы прочитали ${freePages} бесплатных страниц.<br>
          Введите промо-код для полного доступа к ${totalPages} страницам.
        </div>
      </div>
    `;
  }

  async function submitPromo() {
    const input = document.getElementById('book-promo-input');
    if (!input) return;
    const code = input.value.trim();
    if (!code) { alert('Введите промо-код'); return; }
    try {
      const result = await DarAPI.submitPromo(code);
      if (result.success) {
        accessLevel = result.access_level;
        maxPage = totalPages;
        alert('Полный доступ к книге открыт!');
        render();
      } else {
        alert(result.message || 'Неверный промо-код');
      }
    } catch(e) { alert('Ошибка: ' + e.message); }
  }

  return { init, render, loadPage, nextPage, prevPage, submitPromo, toggleTOC, goToPage, showUpgradePrompt };
})();
