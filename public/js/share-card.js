/**
 * Генератор карточек даров для шейринга в соцсети
 *
 * Создаёт PNG-изображения через Canvas API с космическим дизайном:
 * - Тёмно-фиолетовый градиентный фон
 * - Звёзды на фоне
 * - Золотая иконка дара (SVG из public/images/dars)
 * - Название дара, код, архетип
 * - Имя пользователя, дата рождения (если заполнены)
 * - Хештеги #ВселеннаяДаров #YupDar
 *
 * Два формата:
 * - 'square': 1080x1080 (для VK / Insta feed)
 * - 'vertical': 1080x1920 (для Stories)
 *
 * Использование:
 *   ShareCard.openModal('2-8-1');
 */

const ShareCard = (function() {

  // === Утилиты ===

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed: ' + src));
      img.src = src;
    });
  }

  function getDarImagePath(darCode) {
    const name = (window.DARS && window.DARS[darCode]) || '';
    if (!name) return null;
    const base = name.toLowerCase().normalize('NFC').replace(/[^а-яёa-z]/g, '');
    return base ? 'images/dars/' + base + '.svg' : null;
  }

  function getUserName() {
    try {
      const prof = JSON.parse(localStorage.getItem('_darProfile') || '{}');
      const first = (prof.real_first_name || '').trim();
      const last = (prof.real_last_name || '').trim();
      const fullName = [first, last].filter(Boolean).join(' ');
      if (fullName) return fullName;
    } catch (e) {}
    // Fallback: имя из Telegram
    return window._userName || '';
  }

  function getBirthDate() {
    try {
      const saved = localStorage.getItem(window.STORAGE_KEY || 'dar_data');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.date) return data.date;
      }
    } catch (e) {}
    return '';
  }

  // === Звёзды на фоне (детерминированные через seed) ===

  function seededRandom(seed) {
    let s = seed;
    return function() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function drawStars(ctx, w, h, count, seed) {
    const rand = seededRandom(seed);
    ctx.save();
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = rand() * 1.8 + 0.5;
      const opacity = rand() * 0.7 + 0.3;
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // У некоторых звёзд - лёгкое сияние
      if (rand() > 0.85) {
        ctx.fillStyle = `rgba(212, 175, 55, ${opacity * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Несколько крупных декоративных звёзд (✦)
  function drawDecorStars(ctx, w, h, positions, color) {
    ctx.save();
    ctx.fillStyle = color || 'rgba(212, 175, 55, 0.8)';
    ctx.font = '36px 'Manrope', sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of positions) {
      ctx.fillText('✦', p.x, p.y);
    }
    ctx.restore();
  }

  // === Перенос текста по строкам ===
  function wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // === Главная функция генерации ===

  async function generateCard(darCode, format) {
    const isVertical = format === 'vertical';
    const w = 1080;
    const h = isVertical ? 1920 : 1080;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // === ФОН: космический градиент ===
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0a0118');
    bg.addColorStop(0.4, '#0d0d0d');
    bg.addColorStop(0.7, '#2d0e5e');
    bg.addColorStop(1, '#080808');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // === Звёзды ===
    drawStars(ctx, w, h, isVertical ? 220 : 130, darCode.charCodeAt(0) * 17 + 42);

    // Декоративные крупные звёзды по углам и краям
    const cornerStars = isVertical ? [
      { x: 80, y: 110 }, { x: w - 80, y: 130 },
      { x: 60, y: h / 3 }, { x: w - 70, y: h / 2 },
      { x: 90, y: h - 220 }, { x: w - 90, y: h - 180 }
    ] : [
      { x: 80, y: 90 }, { x: w - 80, y: 100 },
      { x: 60, y: h / 2 }, { x: w - 60, y: h / 2 },
      { x: 100, y: h - 100 }, { x: w - 100, y: h - 90 }
    ];
    drawDecorStars(ctx, w, h, cornerStars);

    // === Виньетка для центрирования внимания ===
    const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // === ИКОНКА ДАРА ===
    const imgPath = getDarImagePath(darCode);
    let darImg = null;
    if (imgPath) {
      try {
        darImg = await loadImage(imgPath);
      } catch (e) {
        console.warn('[ShareCard] dar image load failed:', e.message);
      }
    }

    const iconSize = isVertical ? 380 : 300;
    const iconY = isVertical ? 380 : 240;

    if (darImg) {
      // Золотое свечение под иконкой
      ctx.save();
      const glowGrad = ctx.createRadialGradient(w / 2, iconY + iconSize / 2, 0, w / 2, iconY + iconSize / 2, iconSize);
      glowGrad.addColorStop(0, 'rgba(212, 175, 55, 0.35)');
      glowGrad.addColorStop(0.5, 'rgba(180, 120, 255, 0.15)');
      glowGrad.addColorStop(1, 'rgba(212, 175, 55, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(w / 2 - iconSize, iconY - iconSize / 2, iconSize * 2, iconSize * 2);
      ctx.restore();

      // Золотой фильтр для SVG (как в Сокровищнице)
      ctx.save();
      ctx.filter = 'invert(85%) sepia(25%) saturate(600%) hue-rotate(10deg) brightness(115%) drop-shadow(0 0 22px rgba(212,175,55,0.7))';
      ctx.drawImage(darImg, w / 2 - iconSize / 2, iconY, iconSize, iconSize);
      ctx.restore();
    } else {
      // Fallback - звезда
      ctx.save();
      ctx.fillStyle = '#D4AF37';
      ctx.shadowColor = 'rgba(212, 175, 55, 0.8)';
      ctx.shadowBlur = 40;
      ctx.font = `${iconSize}px 'Manrope', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦', w / 2, iconY + iconSize / 2);
      ctx.restore();
    }

    // === ТЕКСТ ===

    const darName = (window.DARS && window.DARS[darCode]) || darCode;
    const darArchetype = (window.DAR_ARCHETYPES && window.DAR_ARCHETYPES[darCode]) || '';

    // Заголовок "МОЙ ДАР"
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.font = '32px 'Manrope', sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('М О Й   Д А Р', w / 2, isVertical ? 200 : 140);
    ctx.restore();

    // Название дара (большое золотое)
    ctx.save();
    ctx.fillStyle = '#D4AF37';
    ctx.font = `bold ${isVertical ? 110 : 90}px 'Manrope', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(212, 175, 55, 0.5)';
    ctx.shadowBlur = 20;
    const nameY = iconY + iconSize + (isVertical ? 50 : 40);
    ctx.fillText(darName, w / 2, nameY);
    ctx.restore();

    // Код дара (под названием)
    ctx.save();
    ctx.fillStyle = 'rgba(212, 175, 55, 0.7)';
    ctx.font = `${isVertical ? 38 : 32}px 'Manrope', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const codeY = nameY + (isVertical ? 130 : 110);
    ctx.fillText(darCode, w / 2, codeY);
    ctx.restore();

    // Архетип (курсив, фиолетовый)
    if (darArchetype) {
      ctx.save();
      ctx.fillStyle = '#D4AF37';
      ctx.font = `italic ${isVertical ? 44 : 38}px 'Manrope', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const archY = codeY + (isVertical ? 70 : 60);
      const archLines = wrapText(ctx, darArchetype, w * 0.85);
      archLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, archY + i * (isVertical ? 56 : 48));
      });
      ctx.restore();
    }

    // === Разделительная линия ===
    const divY = isVertical ? h - 460 : h - 280;
    ctx.save();
    const lineGrad = ctx.createLinearGradient(w * 0.2, divY, w * 0.8, divY);
    lineGrad.addColorStop(0, 'rgba(212, 175, 55, 0)');
    lineGrad.addColorStop(0.5, 'rgba(212, 175, 55, 0.8)');
    lineGrad.addColorStop(1, 'rgba(212, 175, 55, 0)');
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, divY);
    ctx.lineTo(w * 0.8, divY);
    ctx.stroke();
    ctx.restore();

    // === Имя пользователя ===
    const userName = getUserName();
    if (userName) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.font = `${isVertical ? 48 : 40}px 'Manrope', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(userName, w / 2, divY + (isVertical ? 50 : 40));
      ctx.restore();
    }

    // === Дата рождения ===
    const birthDate = getBirthDate();
    if (birthDate) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = `${isVertical ? 32 : 28}px 'Manrope', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const dateY = divY + (isVertical ? 130 : 100) + (userName ? 0 : -40);
      ctx.fillText(birthDate, w / 2, dateY);
      ctx.restore();
    }

    // === Хештеги ===
    ctx.save();
    ctx.fillStyle = 'rgba(212, 175, 55, 0.85)';
    ctx.font = `${isVertical ? 30 : 26}px 'Manrope', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('#ВселеннаяДаров   #YupDar', w / 2, h - (isVertical ? 110 : 80));
    ctx.restore();

    // === Подпись YupDar внизу ===
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = `${isVertical ? 26 : 22}px 'Manrope', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Y u p D a r   ·   t.me/YupDarBot', w / 2, h - (isVertical ? 50 : 35));
    ctx.restore();

    return canvas;
  }

  // === Скачивание ===

  function downloadCanvas(canvas, filename) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Canvas toBlob returned null')); return; }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            resolve();
          }, 100);
        }, 'image/png', 0.95);
      } catch (e) { reject(e); }
    });
  }

  // === МОДАЛКА ===

  async function openModal(darCode) {
    if (!darCode) return;
    let modal = document.getElementById('share-card-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'share-card-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:10200;background:rgba(0,0,0,0.92);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:14px;overflow-y:auto';
      modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';

    // Лоадер
    modal.innerHTML = `
      <div style="position:relative;background:linear-gradient(135deg,#080808,#0d0d0d);border:1px solid rgba(212,175,55,0.3);border-radius:20px;padding:48px 22px 22px;max-width:480px;width:100%;max-height:92vh;overflow-y:auto">
        <button onclick="ShareCard.closeModal()" style="position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:1px solid rgba(212,175,55,0.4);background:rgba(0,0,0,0.6);color:#D4AF37;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:1">&#10005;</button>
        <div style="text-align:center;padding:30px 10px">
          <div style="font-size:36px;margin-bottom:14px;animation:pulse 1.5s ease-in-out infinite">&#127912;</div>
          <div style="font-size:14px;color:#D4AF37">Создаём твою карточку...</div>
        </div>
      </div>
    `;

    // Генерируем оба формата параллельно
    let squareCanvas, verticalCanvas;
    try {
      [squareCanvas, verticalCanvas] = await Promise.all([
        generateCard(darCode, 'square'),
        generateCard(darCode, 'vertical')
      ]);
    } catch (e) {
      console.error('[ShareCard] generation failed:', e);
      modal.querySelector('div div').innerHTML = `
        <div style="font-size:36px;margin-bottom:14px">&#9888;&#65039;</div>
        <div style="font-size:14px;color:#f87171">Не удалось создать карточку</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:8px">${e.message || 'неизвестная ошибка'}</div>
      `;
      return;
    }

    // Превью + кнопки
    const squareData = squareCanvas.toDataURL('image/png');
    const verticalData = verticalCanvas.toDataURL('image/png');
    const darName = (window.DARS && window.DARS[darCode]) || darCode;
    const safeFileBase = ('yupdar-' + darName.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '') + '-' + darCode).replace(/--+/g, '-');

    modal.innerHTML = `
      <div style="position:relative;background:linear-gradient(135deg,#080808,#0d0d0d);border:1px solid rgba(212,175,55,0.3);border-radius:20px;padding:48px 18px 22px;max-width:480px;width:100%;max-height:92vh;overflow-y:auto">
        <button onclick="ShareCard.closeModal()" style="position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:1px solid rgba(212,175,55,0.4);background:rgba(0,0,0,0.6);color:#D4AF37;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:1">&#10005;</button>
        <div style="text-align:center;margin-bottom:14px">
          <div style="font-size:13px;color:#D4AF37;letter-spacing:1.5px">&#127912; КАРТОЧКА ДЛЯ ШЕЙРИНГА</div>
        </div>
        <div id="share-tabs" style="display:flex;gap:6px;margin-bottom:14px">
          <button id="share-tab-sq" onclick="ShareCard.switchTab('square')" style="flex:1;padding:10px;border-radius:10px;border:1px solid rgba(212,175,55,0.6);background:rgba(212,175,55,0.18);color:#D4AF37;font-size:12px;cursor:pointer;font-family:Manrope,sans-serif">&#11036; Квадрат</button>
          <button id="share-tab-vt" onclick="ShareCard.switchTab('vertical')" style="flex:1;padding:10px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-dim);font-size:12px;cursor:pointer;font-family:Manrope,sans-serif">&#128247; Вертикаль</button>
        </div>
        <div id="share-preview" style="text-align:center;margin-bottom:14px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.05);border-radius:14px;padding:10px">
          <img id="share-img" src="${squareData}" style="max-width:100%;max-height:50vh;border-radius:8px;display:block;margin:0 auto">
        </div>
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <button onclick="ShareCard.download('square')" style="flex:1;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,#D4AF37,#D4AF37);color:#fff;font-size:13px;cursor:pointer;font-family:Manrope,sans-serif;font-weight:bold">&#11015; Квадрат</button>
          <button onclick="ShareCard.download('vertical')" style="flex:1;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,#D4AF37,#D4AF37);color:#fff;font-size:13px;cursor:pointer;font-family:Manrope,sans-serif;font-weight:bold">&#11015; Вертикаль</button>
        </div>
        <div style="font-size:11px;color:var(--text-dim);text-align:center;line-height:1.5;margin-top:10px">
          Скачай и поделись в Telegram, Instagram или ВКонтакте.<br>
          Друзьям интересно — пусть тоже узнают свой Дар!
        </div>
      </div>
    `;

    // Сохраняем canvas в state модалки для кнопок
    _state.canvases = { square: squareCanvas, vertical: verticalCanvas };
    _state.dataUrls = { square: squareData, vertical: verticalData };
    _state.fileBase = safeFileBase;
    _state.currentTab = 'square';
  }

  const _state = { canvases: {}, dataUrls: {}, fileBase: '', currentTab: 'square' };

  function switchTab(format) {
    _state.currentTab = format;
    const img = document.getElementById('share-img');
    if (img && _state.dataUrls[format]) img.src = _state.dataUrls[format];
    // Подсветка табов
    const sq = document.getElementById('share-tab-sq');
    const vt = document.getElementById('share-tab-vt');
    if (sq && vt) {
      const active = 'background:rgba(212,175,55,0.18);border:1px solid rgba(212,175,55,0.6);color:#D4AF37';
      const inactive = 'background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text-dim)';
      const baseStyle = 'flex:1;padding:10px;border-radius:10px;font-size:12px;cursor:pointer;font-family:Manrope,sans-serif;';
      sq.style.cssText = baseStyle + (format === 'square' ? active : inactive);
      vt.style.cssText = baseStyle + (format === 'vertical' ? active : inactive);
    }
  }

  async function download(format) {
    const canvas = _state.canvases[format];
    if (!canvas) return;
    const filename = _state.fileBase + '-' + format + '.png';
    try {
      await downloadCanvas(canvas, filename);
      if (typeof showToast === 'function') showToast('\u2728 Карточка скачана', 'success');
    } catch (e) {
      console.error('[ShareCard] download failed:', e);
      if (typeof showToast === 'function') showToast('Не удалось скачать: ' + e.message, 'error');
    }
  }

  function closeModal() {
    const modal = document.getElementById('share-card-modal');
    if (modal) modal.style.display = 'none';
  }

  return { openModal, closeModal, download, switchTab };
})();
