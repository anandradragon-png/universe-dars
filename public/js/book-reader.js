/**
 * Ридер книги "Книга Даров"
 * Защита от копирования: no-select, no-right-click, signed URLs (60 сек)
 * Постраничная навигация
 */

const BookReader = (function() {
  let currentPage = 1;
  let totalPages = 265;
  let freePages = 25;
  let maxPage = 25;
  let accessLevel = 'basic';
  let isLoading = false;

  async function init() {
    try {
      const resp = await fetch('/api/book?action=info', {
        headers: DarAPI ? { 'x-telegram-init-data': window.Telegram?.WebApp?.initData || '' } : {}
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
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">Дизайнерская версия • ${totalPages} страниц</div>
        ${!hasAccess ? `
          <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:14px;margin-bottom:16px">
            <div style="font-size:13px;color:#D4AF37;margin-bottom:6px">&#128142; Превью: первые ${freePages} страниц бесплатно</div>
            <div style="font-size:12px;color:var(--text-dim);line-height:1.5">Для полного доступа введите промо-код из купленной книги или оформите подписку</div>
          </div>
        ` : `
          <div style="background:rgba(46,204,113,0.1);border:1px solid rgba(46,204,113,0.3);border-radius:14px;padding:10px;margin-bottom:16px">
            <div style="font-size:13px;color:#2ecc71">&#10003; Полный доступ активирован</div>
          </div>
        `}
      </div>
      <div id="book-page-container" style="padding:0 16px">
        <div style="text-align:center;padding:30px 0;color:var(--text-dim)">Нажмите "Читать" чтобы начать</div>
      </div>
      <div id="book-nav" style="display:flex;gap:10px;padding:12px 16px;align-items:center;justify-content:center">
        <button class="btn btn-ghost" style="width:auto;padding:10px 16px;margin:0" onclick="BookReader.prevPage()">&#8592;</button>
        <div style="text-align:center;min-width:100px">
          <span id="book-page-num" style="font-size:14px;color:var(--text)">${currentPage}</span>
          <span style="font-size:12px;color:var(--text-muted)"> / ${maxPage}</span>
        </div>
        <button class="btn btn-ghost" style="width:auto;padding:10px 16px;margin:0" onclick="BookReader.nextPage()">&#8594;</button>
      </div>
      <div style="text-align:center;padding:0 16px 16px">
        <button class="btn btn-secondary" onclick="BookReader.loadPage(${currentPage})">&#128214; Читать</button>
      </div>
      ${!hasAccess ? `
        <div style="padding:0 16px 20px">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px;text-align:center">
            <div style="font-size:14px;color:var(--text);margin-bottom:8px">&#128273; Получить полный доступ</div>
            <input id="book-promo-input" type="text" placeholder="Введите промо-код"
              style="width:100%;max-width:280px;padding:10px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:14px;text-align:center;text-transform:uppercase;outline:none;font-family:Georgia,serif;margin-bottom:10px"/>
            <button class="btn btn-primary" style="max-width:280px" onclick="BookReader.submitPromo()">Активировать</button>
          </div>
        </div>
      ` : ''}
    `;
  }

  async function loadPage(num) {
    if (isLoading) return;
    if (num < 1) num = 1;
    if (num > maxPage) {
      showUpgradePrompt();
      return;
    }

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
      if (window.Telegram?.WebApp?.initData) {
        headers['x-telegram-init-data'] = window.Telegram.WebApp.initData;
      }
      const resp = await fetch(`/api/book?page=${num}`, { headers });
      const data = await resp.json();

      if (data.error) {
        if (data.need_upgrade) {
          showUpgradePrompt();
        } else {
          pageContainer.innerHTML = `<div style="text-align:center;padding:30px;color:#f87171">${data.error}</div>`;
        }
        isLoading = false;
        return;
      }

      // Рендер страницы с защитой от копирования
      pageContainer.innerHTML = `
        <div class="book-page-wrap" oncontextmenu="return false" onselectstart="return false" ondragstart="return false">
          <img src="${data.url}" alt="Страница ${num}"
            style="width:100%;border-radius:8px;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none"
            draggable="false" />
        </div>
      `;

    } catch(e) {
      pageContainer.innerHTML = `<div style="text-align:center;padding:30px;color:#f87171">Ошибка загрузки: ${e.message}</div>`;
    }

    isLoading = false;
  }

  function nextPage() {
    if (currentPage < maxPage) {
      loadPage(currentPage + 1);
    } else {
      showUpgradePrompt();
    }
  }

  function prevPage() {
    if (currentPage > 1) {
      loadPage(currentPage - 1);
    }
  }

  function showUpgradePrompt() {
    const pageContainer = document.getElementById('book-page-container');
    pageContainer.innerHTML = `
      <div style="text-align:center;padding:30px 16px">
        <div style="font-size:36px;margin-bottom:12px">&#128274;</div>
        <div style="font-size:16px;color:var(--text);margin-bottom:8px">Превью закончилось</div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:16px">
          Вы прочитали ${freePages} бесплатных страниц.<br>
          Для доступа к полной книге (${totalPages} страниц) введите промо-код или оформите подписку.
        </div>
        <div style="font-size:13px;color:#D4AF37;margin-bottom:16px">
          &#128218; В полной версии: описания всех 64 даров, практики, медитации, техники безопасности
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
        alert('Промо-код активирован! Полный доступ к книге открыт.');
        render();
      } else {
        alert(result.message || 'Неверный промо-код');
      }
    } catch(e) {
      alert('Ошибка: ' + e.message);
    }
  }

  return { init, render, loadPage, nextPage, prevPage, submitPromo };
})();
