/**
 * PDF-Ридер для мобильных устройств
 * Использует PDF.js от Mozilla для рендеринга PDF в canvas
 * Поддержка: pinch-zoom, свайп, оглавление, прогресс
 */

const PdfReader = (function() {
  let pdfDoc = null;
  let currentPage = 1;
  let totalPages = 0;
  let scale = 1;
  let isRendering = false;
  let tocOpen = false;

  const PDF_URL = 'book.pdf';

  // Оглавление (страницы для PDF-версии "Книга Даров для YupDar" — 212 стр)
  // Будет обновлено после анализа реального PDF
  const TOC = [
    { title: 'ЧАСТЬ 1. Начало пути', page: 5, items: [
      { title: 'Введение', page: 5 },
      { title: 'Три мира', page: 6 },
      { title: 'Девять полей', page: 7 },
      { title: 'Код уникальности', page: 8 },
      { title: 'Как рассчитать ДАР', page: 9 },
      { title: 'Навигатор ДАРов', page: 10 },
    ]},
    { title: 'ЧАСТЬ 2. Мир ДАРов', page: 14, items: [
      { title: '1. Поле ЛОГОС', page: 14 },
      { title: '2. Поле НИМА', page: 30 },
      { title: '3. Поле АНДРА', page: 46 },
      { title: '4. Поле ЗИНГРА', page: 62 },
      { title: '5. Поле ЛУБА', page: 78 },
      { title: '6. Поле ТУМА', page: 94 },
      { title: '7. Поле АСТРА', page: 110 },
      { title: '8. Поле БИТРА', page: 126 },
      { title: '9. Поле ОМА', page: 142 },
    ]},
    { title: 'ЧАСТЬ 3. Интеграторы', page: 160, items: [] },
    { title: 'ЧАСТЬ 4. Завершение', page: 200, items: [] },
  ];

  // Загрузка PDF.js
  function loadPdfJs() {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Загрузка PDF документа
  async function loadPdf() {
    await loadPdfJs();
    const loadingTask = pdfjsLib.getDocument(PDF_URL);
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    // Восстановить последнюю страницу
    const saved = localStorage.getItem('_pdf_page');
    if (saved) currentPage = Math.min(parseInt(saved), totalPages);
  }

  // Рендеринг одной страницы
  async function renderPage(num) {
    if (!pdfDoc || isRendering) return;
    isRendering = true;
    currentPage = num;
    localStorage.setItem('_pdf_page', num);

    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('pdf-canvas-wrap');

    try {
      const page = await pdfDoc.getPage(num);
      const containerWidth = container.clientWidth || 360;
      const viewport = page.getViewport({ scale: 1 });
      const fitScale = containerWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale: fitScale * scale });

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

      // Обновить UI
      const pageNum = document.getElementById('pdf-page-num');
      if (pageNum) pageNum.textContent = `${num} / ${totalPages}`;

      // Прогресс-бар
      const progress = document.getElementById('pdf-progress');
      if (progress) progress.style.width = `${(num / totalPages) * 100}%`;

    } catch(e) {
      console.error('PDF render error:', e);
    }
    isRendering = false;
  }

  function nextPage() { if (currentPage < totalPages) renderPage(currentPage + 1); }
  function prevPage() { if (currentPage > 1) renderPage(currentPage - 1); }
  function goToPage(num) {
    num = Math.max(1, Math.min(num, totalPages));
    tocOpen = false;
    const panel = document.getElementById('pdf-toc-panel');
    if (panel) panel.style.display = 'none';
    renderPage(num);
  }

  function zoomIn() { scale = Math.min(scale + 0.3, 3); renderPage(currentPage); }
  function zoomOut() { scale = Math.max(scale - 0.3, 0.5); renderPage(currentPage); }
  function zoomReset() { scale = 1; renderPage(currentPage); }

  // Оглавление
  function toggleTOC() {
    tocOpen = !tocOpen;
    const panel = document.getElementById('pdf-toc-panel');
    if (!panel) return;
    if (tocOpen) {
      let html = '';
      TOC.forEach(part => {
        html += `<div style="margin-bottom:8px">
          <div style="padding:8px 12px;color:var(--text);font-size:13px;font-weight:bold;letter-spacing:1px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05)" onclick="PdfReader.goToPage(${part.page})">${part.title}</div>`;
        if (part.items && part.items.length > 0) {
          part.items.forEach(item => {
            html += `<div style="padding:6px 12px 6px 24px;color:var(--text-dim);font-size:12px;cursor:pointer;border-radius:6px;margin:2px 4px" onclick="PdfReader.goToPage(${item.page})" onmouseover="this.style.background='rgba(212,175,55,0.1)'" onmouseout="this.style.background=''">${item.title} <span style="float:right;color:var(--text-muted)">${item.page}</span></div>`;
          });
        }
        html += '</div>';
      });
      panel.innerHTML = html;
      panel.style.display = 'block';
    } else {
      panel.style.display = 'none';
    }
  }

  // Ввод номера страницы
  function promptPage() {
    const num = prompt('Перейти к странице (1-' + totalPages + '):', currentPage);
    if (num) goToPage(parseInt(num));
  }

  // Главная функция рендеринга
  async function render() {
    const container = document.getElementById('book-content');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align:center;padding:16px">
        <div style="font-size:14px;color:var(--text);letter-spacing:2px;margin-bottom:8px">КНИГА ДАРОВ</div>
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px">Мобильная версия</div>

        <!-- Прогресс -->
        <div style="width:100%;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;margin-bottom:12px;overflow:hidden">
          <div id="pdf-progress" style="height:100%;background:linear-gradient(90deg,#6b21a8,#D4AF37);border-radius:2px;transition:width .3s;width:0%"></div>
        </div>

        <!-- Верхняя навигация -->
        <div style="display:flex;gap:6px;margin-bottom:12px;justify-content:center;flex-wrap:wrap">
          <button onclick="PdfReader.toggleTOC()" style="padding:8px 14px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-dim);font-size:12px;cursor:pointer;font-family:Georgia,serif">&#128220; Оглавление</button>
          <button onclick="PdfReader.zoomOut()" style="padding:8px 12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-dim);font-size:14px;cursor:pointer">&#8722;</button>
          <button onclick="PdfReader.zoomReset()" style="padding:8px 12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-dim);font-size:12px;cursor:pointer;font-family:Georgia,serif">100%</button>
          <button onclick="PdfReader.zoomIn()" style="padding:8px 12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-dim);font-size:14px;cursor:pointer">&#43;</button>
        </div>
      </div>

      <!-- Оглавление панель -->
      <div id="pdf-toc-panel" style="display:none;margin:0 16px 12px;max-height:50vh;overflow-y:auto;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:14px;padding:8px 0"></div>

      <!-- Канвас для PDF -->
      <div id="pdf-canvas-wrap" style="padding:0 8px;overflow-x:auto;-webkit-overflow-scrolling:touch;text-align:center" oncontextmenu="return false" onselectstart="return false">
        <canvas id="pdf-canvas" style="max-width:100%;border-radius:4px;box-shadow:0 2px 20px rgba(0,0,0,0.3)"></canvas>
      </div>

      <!-- Нижняя навигация -->
      <div style="display:flex;gap:10px;padding:12px 16px;align-items:center;justify-content:center">
        <button onclick="PdfReader.prevPage()" style="padding:10px 18px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text);font-size:16px;cursor:pointer">&#8592;</button>
        <div style="text-align:center;min-width:80px;cursor:pointer" onclick="PdfReader.promptPage()">
          <span id="pdf-page-num" style="font-size:14px;color:var(--text)">1 / ...</span>
        </div>
        <button onclick="PdfReader.nextPage()" style="padding:10px 18px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text);font-size:16px;cursor:pointer">&#8594;</button>
      </div>

      <div style="text-align:center;font-size:11px;color:var(--text-muted);padding-bottom:16px">Нажми на номер страницы для быстрого перехода</div>
    `;

    // Загрузка
    const canvasWrap = document.getElementById('pdf-canvas-wrap');
    canvasWrap.innerHTML = `<div style="text-align:center;padding:60px 0"><div style="font-size:32px;animation:pulse 1.5s infinite">&#128214;</div><div style="color:var(--text-dim);font-size:13px;margin-top:10px">Загрузка книги...</div></div>`;

    try {
      await loadPdf();
      canvasWrap.innerHTML = `<canvas id="pdf-canvas" style="max-width:100%;border-radius:4px;box-shadow:0 2px 20px rgba(0,0,0,0.3)"></canvas>`;
      renderPage(currentPage);

      // Свайпы для мобильных
      let touchStartX = 0;
      canvasWrap.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
      canvasWrap.addEventListener('touchend', e => {
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(diff) > 60) {
          if (diff > 0) prevPage(); else nextPage();
        }
      }, { passive: true });

    } catch(e) {
      canvasWrap.innerHTML = `<div style="text-align:center;padding:40px;color:#f87171">Ошибка загрузки PDF: ${e.message}</div>`;
    }
  }

  return {
    render, nextPage, prevPage, goToPage, promptPage,
    zoomIn, zoomOut, zoomReset, toggleTOC
  };
})();
