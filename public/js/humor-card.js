/**
 * Генератор шеринг-карточки СТЕНДАП-ЗЕРКАЛО.
 *
 * Создаёт PNG через Canvas API в двух форматах:
 *  - square 1080x1080 (для постов в Instagram, VK)
 *  - vertical 1080x1920 (для сторис)
 *
 * Дизайн:
 *  - Тёмный фон с золотистым акцентом сверху
 *  - 🎤 крупно
 *  - Архетип (большой золотой шрифт)
 *  - Девиз курсивом
 *  - Один панч-лайн из топ-10 (самая короткая и хитовая фраза)
 *  - Shar-hook внизу
 *  - QR-код + реф-ссылка yupdar.com
 *
 * Использование:
 *   HumorCard.openModal();
 *
 * Закон law_humor_message_prompt: соответствие стилю стендапа.
 */

const HumorCard = (function() {

  // === Утилиты ===

  function _esc(s) { return String(s || ''); }

  function getReferralLink() {
    try {
      const tg = window.Telegram?.WebApp;
      const botUsername = window.BOT_USERNAME || 'YupDarBot';
      const userId = tg?.initDataUnsafe?.user?.id
        || localStorage.getItem('_dev_telegram_id')
        || '';
      if (userId) {
        return `https://t.me/${botUsername}?startapp=ref_${userId}`;
      }
    } catch (e) {}
    return 'https://yupdar.com';
  }

  function getHumorData() {
    try {
      const cached = JSON.parse(localStorage.getItem('_humorData') || 'null');
      return cached && cached.data ? cached.data : null;
    } catch (e) {
      return null;
    }
  }

  function getDarCode() {
    try {
      const saved = JSON.parse(localStorage.getItem(window.STORAGE_KEY || '_darCalculator') || 'null');
      return saved && saved.gift && saved.gift.code ? saved.gift.code : '';
    } catch (e) {
      return '';
    }
  }

  // === QR-код (через Google Chart API → fallback на API quickchart) ===

  async function loadQR(text, size = 220) {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=png&margin=0&color=D4AF37&bgcolor=080808&data=${encodeURIComponent(text)}`;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('QR load failed'));
      img.src = url;
    });
  }

  // === Wrapping текста по ширине ===

  function wrapLines(ctx, text, maxWidth) {
    const words = String(text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      const w = ctx.measureText(test).width;
      if (w > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // === Звёзды (мини-фон) ===

  function drawStars(ctx, w, h, count, seed) {
    ctx.save();
    let s = seed || 42;
    function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (let i = 0; i < count; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = rnd() * 1.8 + 0.4;
      const a = rnd() * 0.6 + 0.15;
      ctx.fillStyle = `rgba(255, 240, 200, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // === Главное: рисуем карточку ===

  async function generateCard(format) {
    const isVertical = format === 'vertical';
    const w = 1080;
    const h = isVertical ? 1920 : 1080;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    const data = getHumorData();
    if (!data) throw new Error('Нет данных стендапа в кеше');

    // === ФОН: тёмный градиент ===
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1a0f0a');
    bg.addColorStop(0.5, '#0d0d0d');
    bg.addColorStop(1, '#080808');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Звёзды
    drawStars(ctx, w, h, isVertical ? 160 : 90, 137);

    // Виньетка
    const vignette = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.85);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // === ВЕРХНЯЯ ПОЛОСКА ЗОЛОТАЯ ===
    const topGrad = ctx.createLinearGradient(0, 0, 0, 4);
    topGrad.addColorStop(0, '#E8C84A');
    topGrad.addColorStop(1, '#9A7B1A');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 4);

    // === 🎤 ВВЕРХУ ===
    const iconY = isVertical ? 240 : 140;
    ctx.save();
    ctx.font = `${isVertical ? 140 : 110}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(212, 175, 55, 0.7)';
    ctx.shadowBlur = 30;
    ctx.fillText('🎤', w / 2, iconY);
    ctx.restore();

    // === АРХЕТИП (главное) ===
    const archetypeY = isVertical ? 420 : 290;
    const arch = data.archetype || {};
    const archTitle = String(arch.title || 'СТЕНДАП-ЗЕРКАЛО').toUpperCase();

    ctx.save();
    ctx.fillStyle = '#D4AF37';
    ctx.font = `800 ${isVertical ? 76 : 60}px Manrope, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // text-shadow эффект
    ctx.shadowColor = 'rgba(212, 175, 55, 0.5)';
    ctx.shadowBlur = 20;
    // Если архетип длинный — переносим
    const archLines = wrapLines(ctx, archTitle, w - 160);
    const archLineH = isVertical ? 90 : 72;
    archLines.forEach((line, i) => {
      ctx.fillText(line, w / 2, archetypeY + i * archLineH);
    });
    ctx.restore();

    let cursorY = archetypeY + archLines.length * archLineH + (isVertical ? 30 : 20);

    // === ДЕВИЗ (курсив) ===
    if (arch.motto) {
      ctx.save();
      ctx.fillStyle = 'rgba(243, 243, 243, 0.85)';
      ctx.font = `italic ${isVertical ? 34 : 28}px Manrope, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mottoLines = wrapLines(ctx, '«' + arch.motto + '»', w - 220);
      const mottoLineH = isVertical ? 46 : 38;
      mottoLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, cursorY + i * mottoLineH);
      });
      cursorY += mottoLines.length * mottoLineH + (isVertical ? 60 : 40);
      ctx.restore();
    }

    // === РАЗДЕЛИТЕЛЬ ===
    ctx.save();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.25, cursorY);
    ctx.lineTo(w * 0.75, cursorY);
    ctx.stroke();
    ctx.restore();
    cursorY += isVertical ? 60 : 40;

    // === ЛУЧШИЙ ПАНЧ ИЗ ТОП-10 (берём самый короткий и хитовый) ===
    if (Array.isArray(data.top10) && data.top10.length) {
      // Берём самый короткий не пустой пункт (минимум 20 символов)
      const candidates = data.top10
        .map(s => String(s || '').trim())
        .filter(s => s.length >= 20 && s.length <= 140);
      const punch = candidates.length
        ? candidates.sort((a, b) => a.length - b.length)[Math.floor(candidates.length / 3)]
        : (data.top10[0] || '');

      if (punch) {
        ctx.save();
        ctx.fillStyle = 'rgba(243, 243, 243, 0.95)';
        ctx.font = `600 ${isVertical ? 40 : 32}px Manrope, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const punchLines = wrapLines(ctx, '«' + punch + '»', w - 180);
        const punchLineH = isVertical ? 56 : 44;
        punchLines.forEach((line, i) => {
          ctx.fillText(line, w / 2, cursorY + i * punchLineH);
        });
        cursorY += punchLines.length * punchLineH + (isVertical ? 80 : 50);
        ctx.restore();
      }
    }

    // === НИЖНЯЯ ЧАСТЬ: CTA + QR ===
    const qrSize = isVertical ? 220 : 170;
    const qrY = h - (isVertical ? 380 : 240);
    const qrX = w / 2 - qrSize / 2;

    // CTA текст
    ctx.save();
    ctx.fillStyle = '#D4AF37';
    ctx.font = `700 ${isVertical ? 30 : 24}px Manrope, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Узнай свой Дар', w / 2, qrY - (isVertical ? 60 : 40));
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(243, 243, 243, 0.85)';
    ctx.font = `600 ${isVertical ? 24 : 20}px Manrope, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('yupdar.com', w / 2, qrY - (isVertical ? 24 : 16));
    ctx.restore();

    // QR-код
    const refLink = getReferralLink();
    try {
      const qrImg = await loadQR(refLink, qrSize);
      // Белая рамка под QR
      ctx.save();
      ctx.fillStyle = 'rgba(243, 243, 243, 0.04)';
      ctx.fillRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24);
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
      ctx.restore();
    } catch (e) {
      // Если QR не загрузился — рисуем placeholder
      ctx.save();
      ctx.fillStyle = 'rgba(212, 175, 55, 0.15)';
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = '#D4AF37';
      ctx.font = '700 18px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('yupdar.com', qrX + qrSize / 2, qrY + qrSize / 2);
      ctx.restore();
    }

    // Бренд внизу
    ctx.save();
    ctx.fillStyle = 'rgba(212, 175, 55, 0.55)';
    ctx.font = `600 ${isVertical ? 20 : 16}px Manrope, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Вселенная ДАРов · @YupDarBot', w / 2, h - 40);
    ctx.restore();

    return canvas;
  }

  // === Модальное окно ===

  function downloadCanvas(canvas, filename) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('toBlob failed')); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
          a.remove();
          resolve();
        }, 100);
      }, 'image/png', 0.95);
    });
  }

  async function openModal() {
    const data = getHumorData();
    if (!data) {
      if (typeof showToast === 'function') {
        showToast('Сначала сгенерируй стендап', 'error');
      } else {
        alert('Сначала сгенерируй стендап');
      }
      return;
    }

    // Создаём оверлей
    let overlay = document.getElementById('humor-card-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'humor-card-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.92);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';

    overlay.innerHTML = `
      <div style="max-width:480px;width:100%;background:linear-gradient(180deg,#101010,#080808);border:1px solid rgba(212,175,55,0.3);border-radius:20px;padding:22px 18px;max-height:92vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div style="font-size:16px;color:#D4AF37;font-weight:700">🎤 Карточка стендапа</div>
          <button id="hc-close" style="background:transparent;border:none;color:var(--text-dim);font-size:24px;cursor:pointer;padding:4px 8px;line-height:1">×</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:14px;background:rgba(255,255,255,0.03);border-radius:10px;padding:4px">
          <button id="hc-tab-square" data-format="square" style="flex:1;padding:10px;border-radius:8px;border:none;background:rgba(212,175,55,0.18);color:#D4AF37;font-weight:700;cursor:pointer;font-family:Manrope,sans-serif;font-size:13px">▢ Квадрат</button>
          <button id="hc-tab-vertical" data-format="vertical" style="flex:1;padding:10px;border-radius:8px;border:none;background:transparent;color:var(--text-dim);font-weight:600;cursor:pointer;font-family:Manrope,sans-serif;font-size:13px">📱 Сторис</button>
        </div>
        <div id="hc-preview" style="text-align:center;margin-bottom:14px;min-height:300px;display:flex;align-items:center;justify-content:center">
          <div style="color:var(--text-dim);font-size:13px">Готовлю карточку...</div>
        </div>
        <button id="hc-download" disabled style="width:100%;padding:14px;border-radius:14px;border:none;background:linear-gradient(160deg,#E8C84A,#D4AF37 30%,#9A7B1A 70%,#D4AF37);color:#080808;font-size:14px;font-weight:700;cursor:pointer;font-family:Manrope,sans-serif;opacity:0.5">⬇ Скачать карточку</button>
        <div style="text-align:center;margin-top:10px;font-size:11px;color:var(--text-dim);line-height:1.5">QR-код на карточке ведёт на твою реферальную ссылку.<br>Когда друзья перейдут — ты получишь кристаллы.</div>
      </div>
    `;
    document.body.appendChild(overlay);

    let currentFormat = 'square';
    let canvases = { square: null, vertical: null };

    const previewEl = overlay.querySelector('#hc-preview');
    const downloadBtn = overlay.querySelector('#hc-download');
    const tabSquare = overlay.querySelector('#hc-tab-square');
    const tabVertical = overlay.querySelector('#hc-tab-vertical');

    async function renderPreview(format) {
      previewEl.innerHTML = '<div style="color:var(--text-dim);font-size:13px">⏳ Готовлю...</div>';
      downloadBtn.disabled = true;
      downloadBtn.style.opacity = '0.5';
      try {
        if (!canvases[format]) {
          canvases[format] = await generateCard(format);
        }
        previewEl.innerHTML = '';
        const c = canvases[format];
        const previewImg = document.createElement('img');
        previewImg.src = c.toDataURL('image/png');
        previewImg.style.cssText = 'max-width:100%;max-height:60vh;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.6)';
        previewEl.appendChild(previewImg);
        downloadBtn.disabled = false;
        downloadBtn.style.opacity = '1';
        currentFormat = format;
      } catch (e) {
        previewEl.innerHTML = '<div style="color:#f87171;font-size:13px">Ошибка: ' + _esc(e.message) + '</div>';
      }
    }

    function switchTab(format) {
      [tabSquare, tabVertical].forEach(b => {
        const active = b.dataset.format === format;
        b.style.background = active ? 'rgba(212,175,55,0.18)' : 'transparent';
        b.style.color = active ? '#D4AF37' : 'var(--text-dim)';
        b.style.fontWeight = active ? '700' : '600';
      });
      renderPreview(format);
    }

    tabSquare.addEventListener('click', () => switchTab('square'));
    tabVertical.addEventListener('click', () => switchTab('vertical'));

    overlay.querySelector('#hc-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    downloadBtn.addEventListener('click', async () => {
      const c = canvases[currentFormat];
      if (!c) return;
      const code = getDarCode() || 'humor';
      const ts = Date.now();
      try {
        await downloadCanvas(c, `yupdar_humor_${code}_${currentFormat}_${ts}.png`);
        if (typeof showToast === 'function') {
          showToast('✨ Карточка сохранена', 'success');
        }
      } catch (e) {
        if (typeof showToast === 'function') {
          showToast('Не удалось скачать: ' + e.message, 'error');
        } else {
          alert('Не удалось скачать: ' + e.message);
        }
      }
    });

    // Стартуем с квадрата
    renderPreview('square');
  }

  return {
    openModal: openModal,
    generateCard: generateCard
  };
})();

window.HumorCard = HumorCard;
