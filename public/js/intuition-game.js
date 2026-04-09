/**
 * "Угадай Дар" — игра на развитие интуиции
 * Классика: найди 1 дар среди 3/6/9/12 карт
 * Мультипоиск: найди 3 дара, есть Карта Света (x2) и Карта Тени (обнуление)
 * Все карты открываются ТОЛЬКО после всех ходов
 */

const IntuitionGame = (function() {

  const MODES = {
    classic: {
      name: 'Классика',
      desc: 'Найди загаданный дар',
      icon: '&#128302;',
      levels: {
        easy:   { cards: 3,  crystals: 2,  label: '3 карты',  opens: 1, targets: 1 },
        medium: { cards: 6,  crystals: 4,  label: '6 карт',   opens: 1, targets: 1 },
        hard:   { cards: 9,  crystals: 8,  label: '9 карт',   opens: 1, targets: 1 },
        expert: { cards: 12, crystals: 12, label: '12 карт',  opens: 1, targets: 1 },
      }
    },
    multi: {
      name: 'Мультипоиск',
      desc: 'Найди загаданные дары, остерегайся Карты Тени',
      icon: '&#127183;',
      levels: {
        hard:   { cards: 9,  crystals: 15, label: '9 карт',  opens: 4, targets: 3, hasBonus: true, hasTrap: true },
        expert: { cards: 12, crystals: 25, label: '12 карт', opens: 5, targets: 3, hasBonus: true, hasTrap: true },
      }
    }
  };

  let currentMode = 'classic';
  let currentLevel = 'easy';
  let cards = [];
  let targetDar = null;
  let selected = [];          // индексы выбранных карт (не раскрытых!)
  let maxOpens = 1;
  let allRevealed = false;    // все карты раскрыты
  let gameStarted = false;

  let stats = { played: 0, correct: 0, streak: 0, bestStreak: 0, totalCrystals: 0 };
  let dailyPlayed = false;

  function loadStats() {
    try {
      const s = localStorage.getItem('_intuition_stats');
      if (s) stats = JSON.parse(s);
      dailyPlayed = localStorage.getItem('_intuition_daily') === new Date().toISOString().slice(0,10);
    } catch(e) {}
  }
  function saveStats() { localStorage.setItem('_intuition_stats', JSON.stringify(stats)); }

  function getRandomDars(count) {
    const allCodes = Object.keys(window.DARS || {});
    const shuffled = allCodes.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(code => ({
      code, name: window.DARS[code], archetype: window.DAR_ARCHETYPES?.[code] || ''
    }));
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // === ГЛАВНЫЙ ЭКРАН ===
  function render() {
    loadStats();
    const container = document.getElementById('game-content');
    if (!container) return;
    const pct = stats.played > 0 ? Math.round((stats.correct / stats.played) * 100) : 0;

    container.innerHTML = `
      <div style="text-align:center;padding:16px 16px 0">
        <div style="font-size:32px;margin-bottom:6px">&#128302;</div>
        <div style="font-size:18px;color:var(--text);letter-spacing:2px;margin-bottom:12px">УГАДАЙ ДАР</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-bottom:16px">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:8px 14px;text-align:center">
            <div style="font-size:16px;color:var(--text)">${stats.played}</div>
            <div style="font-size:9px;color:var(--text-dim)">Игр</div>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:8px 14px;text-align:center">
            <div style="font-size:16px;color:#2ecc71">${pct}%</div>
            <div style="font-size:9px;color:var(--text-dim)">Точность</div>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:8px 14px;text-align:center">
            <div style="font-size:16px;color:#D4AF37">${stats.bestStreak}</div>
            <div style="font-size:9px;color:var(--text-dim)">Рекорд</div>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:8px 14px;text-align:center">
            <div style="font-size:16px;color:#D4AF37">${stats.totalCrystals || 0}</div>
            <div style="font-size:9px;color:var(--text-dim)">&#128142;</div>
          </div>
        </div>
        ${stats.streak > 0 ? `<div style="font-size:13px;color:#D4AF37;margin-bottom:8px">&#128293; Серия: ${stats.streak} подряд</div>` : ''}
        ${!dailyPlayed ? `<div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:10px;padding:8px;margin-bottom:12px;font-size:11px;color:#D4AF37">&#127873; x2 кристаллов за первую игру дня!</div>` : ''}
      </div>

      <!-- Режим -->
      <div style="padding:0 16px 8px">
        <div style="display:flex;gap:8px;margin-bottom:10px">
          ${Object.entries(MODES).map(([key, mode]) => `
            <button class="btn ${currentMode === key ? 'btn-secondary' : 'btn-ghost'}"
              style="flex:1;margin:0;padding:10px 6px;font-size:12px"
              onclick="IntuitionGame.setMode('${key}')">
              ${mode.icon} ${mode.name}
            </button>
          `).join('')}
        </div>
        <div style="font-size:11px;color:var(--text-dim);text-align:center;margin-bottom:8px">${MODES[currentMode].desc}</div>
      </div>

      <!-- Сложность -->
      <div style="padding:0 16px 12px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
          ${Object.entries(MODES[currentMode].levels).map(([key, lvl]) => `
            <button class="btn ${currentLevel === key ? 'btn-secondary' : 'btn-ghost'}"
              style="width:auto;margin:0;padding:8px 14px;font-size:12px"
              onclick="IntuitionGame.setLevel('${key}')">
              ${lvl.label}
            </button>
          `).join('')}
        </div>
      </div>

      ${currentMode === 'multi' ? renderMultiRules() : ''}

      <div id="game-board" style="padding:0 16px"></div>

      <div style="text-align:center;padding:12px 16px">
        <button class="btn btn-secondary" onclick="IntuitionGame.startGame()">&#128302; Начать раскладку</button>
      </div>
    `;
  }

  function renderMultiRules() {
    const lvl = MODES.multi.levels[currentLevel] || MODES.multi.levels.hard;
    return `
      <div style="padding:0 16px 8px">
        <div style="background:rgba(107,33,168,0.15);border:1px solid var(--border);border-radius:12px;padding:10px;font-size:11px;color:var(--text-dim);line-height:1.5">
          <div style="color:var(--text);margin-bottom:4px">&#127183; Правила:</div>
          &#10024; Найди <strong>${lvl.targets}</strong> одинаковых дара<br>
          &#128994; Можно выбрать <strong>${lvl.opens}</strong> карты<br>
          &#11088; <span style="color:#2ecc71">Карта Света</span> — даст x2 к выигрышу<br>
          &#128165; <span style="color:#e74c3c">Карта Тени</span> — обнулит результат<br>
          <em style="font-size:10px">Все карты откроются после всех выборов</em>
        </div>
      </div>
    `;
  }

  function setMode(mode) { currentMode = mode; currentLevel = Object.keys(MODES[mode].levels)[0]; render(); }
  function setLevel(level) { currentLevel = level; render(); }

  // === СТАРТ ===
  function startGame() {
    const lvl = MODES[currentMode].levels[currentLevel];
    if (!lvl) return;
    allRevealed = false;
    selected = [];
    gameStarted = true;
    maxOpens = lvl.opens;

    if (currentMode === 'classic') setupClassic(lvl);
    else setupMulti(lvl);

    renderBoard();
  }

  function setupClassic(lvl) {
    const dars = getRandomDars(lvl.cards);
    const ti = Math.floor(Math.random() * dars.length);
    targetDar = dars[ti];
    cards = dars.map((d, i) => ({ ...d, type: i === ti ? 'target' : 'normal' }));
  }

  function setupMulti(lvl) {
    const target = getRandomDars(1)[0];
    targetDar = target;
    const needed = lvl.cards - lvl.targets - (lvl.hasBonus ? 1 : 0) - (lvl.hasTrap ? 1 : 0);
    const pool = getRandomDars(needed + 10).filter(d => d.code !== target.code);
    let all = [];

    for (let i = 0; i < lvl.targets; i++) all.push({ ...target, type: 'target' });
    if (lvl.hasBonus) { const d = pool.shift(); if(d) all.push({ ...d, type: 'buff' }); }
    if (lvl.hasTrap) { const d = pool.shift(); if(d) all.push({ ...d, type: 'debuff' }); }
    pool.slice(0, needed).forEach(d => all.push({ ...d, type: 'normal' }));

    cards = shuffle(all.slice(0, lvl.cards));
  }

  // === РЕНДЕР ДОСКИ ===
  function renderBoard() {
    const board = document.getElementById('game-board');
    if (!board) return;
    const lvl = MODES[currentMode].levels[currentLevel];
    const cols = cards.length <= 3 ? 3 : cards.length <= 6 ? 3 : cards.length <= 9 ? 3 : 4;

    let html = `
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:13px;color:var(--text);margin-bottom:4px">
          ${currentMode === 'multi' ? `&#127183; Найди ${lvl.targets} карт:` : '&#128302; Найди дар:'}
        </div>
        <div style="font-size:20px;color:#D4AF37;letter-spacing:2px">${targetDar.name}</div>
        <div style="font-size:11px;color:var(--text-dim);font-style:italic">${targetDar.archetype}</div>
        ${!allRevealed && currentMode === 'multi' ? `
          <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Выбрано: ${selected.length} / ${maxOpens}</div>
        ` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;max-width:420px;margin:0 auto">
    `;

    cards.forEach((card, i) => {
      const isSelected = selected.includes(i);

      if (allRevealed) {
        // РАСКРЫТАЯ КАРТА
        let bg = 'var(--card)'; let border = 'var(--border)'; let badge = '';

        if (card.type === 'target') {
          bg = 'rgba(46,204,113,0.15)'; border = '#2ecc71';
          badge = isSelected ? '<div style="font-size:10px;color:#2ecc71;margin-top:3px">&#10024; Найден!</div>' : '';
        } else if (card.type === 'buff') {
          bg = isSelected ? 'rgba(46,204,113,0.25)' : 'rgba(46,204,113,0.08)'; border = '#2ecc71';
          badge = '<div style="font-size:9px;color:#2ecc71;margin-top:3px">&#11088; Карта Света x2</div>';
        } else if (card.type === 'debuff') {
          bg = isSelected ? 'rgba(231,76,60,0.25)' : 'rgba(231,76,60,0.08)'; border = '#e74c3c';
          badge = '<div style="font-size:9px;color:#e74c3c;margin-top:3px">&#128165; Карта Тени</div>';
        }

        if (isSelected && card.type === 'normal') {
          bg = 'rgba(255,255,255,0.08)'; border = 'rgba(255,255,255,0.2)';
        }

        const imgBase = card.name.toLowerCase().normalize('NFC').replace(/[^а-яёa-z]/g,'');
        html += `
          <div style="background:${bg};border:2px solid ${border};border-radius:12px;padding:8px 4px;text-align:center;min-height:90px;display:flex;flex-direction:column;align-items:center;justify-content:center;${isSelected ? 'box-shadow:0 0 10px rgba(212,175,55,0.3)' : ''}">
            <div style="width:32px;height:32px;margin-bottom:3px;display:flex;align-items:center;justify-content:center" id="gc-${i}"></div>
            <div style="font-size:11px;color:var(--text);letter-spacing:1px;font-weight:bold">${card.name}</div>
            <div style="font-size:8px;color:var(--text-muted)">${card.code}</div>
            ${badge}
          </div>`;
        setTimeout(() => {
          const w = document.getElementById('gc-'+i);
          if(w && imgBase){ const img=new Image(); img.src='images/dars/'+imgBase+'.svg'; img.style='width:100%;height:100%;object-fit:contain;filter:invert(85%) sepia(25%) saturate(600%) hue-rotate(10deg) brightness(110%) drop-shadow(0 0 4px #D4AF37)'; img.onload=()=>w.appendChild(img); img.onerror=()=>{}; }
        }, 50);
      } else {
        // ЗАКРЫТАЯ КАРТА (рубашка)
        const selStyle = isSelected
          ? 'border-color:rgba(212,175,55,0.8);box-shadow:0 0 12px rgba(212,175,55,0.4);background:linear-gradient(135deg,#2a0845 0%,#1a0533 100%)'
          : '';

        html += `
          <div class="game-card-back" onclick="IntuitionGame.selectCard(${i})"
            style="background:linear-gradient(135deg,#1a0533 0%,#0d0221 50%,#1a0533 100%);border:2px solid rgba(212,175,55,0.3);border-radius:12px;padding:8px 4px;text-align:center;cursor:pointer;min-height:90px;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all .2s;${selStyle}">
            <div style="font-size:10px;color:rgba(212,175,55,0.3);letter-spacing:4px;margin-bottom:4px">&#10022;</div>
            <div style="width:28px;height:28px;border:1px solid rgba(212,175,55,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center">
              <div style="font-size:14px;color:rgba(212,175,55,0.5)">${isSelected ? '&#10003;' : '&#10024;'}</div>
            </div>
            <div style="font-size:10px;color:rgba(212,175,55,0.3);letter-spacing:4px;margin-top:4px">&#10022;</div>
          </div>`;
      }
    });

    html += '</div>';

    // Кнопка "Открыть карты" (только для мультипоиска когда все выбрано)
    if (!allRevealed && selected.length >= maxOpens) {
      html += `
        <div style="text-align:center;margin-top:16px">
          <button class="btn btn-secondary" style="width:auto;padding:12px 30px;margin:0" onclick="IntuitionGame.revealAll()">
            &#128302; Открыть карты
          </button>
        </div>`;
    }

    // Результат
    if (allRevealed) {
      html += renderResult();
    }

    board.innerHTML = html;
  }

  // === ВЫБОР КАРТЫ ===
  function selectCard(index) {
    if (allRevealed || selected.includes(index)) return;
    if (selected.length >= maxOpens) return;

    selected.push(index);

    if (currentMode === 'classic') {
      // Классика — 1 выбор, сразу раскрытие
      revealAll();
      return;
    }

    renderBoard();
  }

  // === РАСКРЫТИЕ ВСЕХ КАРТ ===
  function revealAll() {
    allRevealed = true;
    finishGame();
    renderBoard();
  }

  // === ПОДСЧЁТ РЕЗУЛЬТАТА ===
  function finishGame() {
    const lvl = MODES[currentMode].levels[currentLevel];
    stats.played++;

    const targetsFound = selected.filter(i => cards[i]?.type === 'target').length;
    const hitBuff = selected.some(i => cards[i]?.type === 'buff');
    const hitDebuff = selected.some(i => cards[i]?.type === 'debuff');

    let won = targetsFound > 0 && !hitDebuff;

    if (won) {
      stats.correct++;
      stats.streak++;
      if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;

      let earned = lvl.crystals;
      if (currentMode === 'multi') {
        earned = Math.round(earned * (targetsFound / lvl.targets));
      }
      if (hitBuff) earned *= 2;
      if (!dailyPlayed) earned *= 2;

      stats.totalCrystals = (stats.totalCrystals || 0) + earned;
      stats._lastWin = earned;
      stats._hitBuff = hitBuff;
      stats._hitDebuff = false;

      if (typeof CrystalsUI !== 'undefined') CrystalsUI.animateEarn(earned);
      if (!dailyPlayed) {
        localStorage.setItem('_intuition_daily', new Date().toISOString().slice(0,10));
        dailyPlayed = true;
      }
    } else {
      stats.streak = 0;
      stats._lastWin = 0;
      stats._hitBuff = hitBuff;
      stats._hitDebuff = hitDebuff;
    }

    saveStats();
  }

  // === РЕЗУЛЬТАТ ===
  function renderResult() {
    const targetsFound = selected.filter(i => cards[i]?.type === 'target').length;
    const totalTargets = cards.filter(c => c.type === 'target').length;
    const won = stats._lastWin > 0;
    const hitDebuff = stats._hitDebuff;
    const hitBuff = stats._hitBuff;

    return `
      <div style="text-align:center;margin-top:20px">
        <div style="font-size:28px;margin-bottom:8px">${hitDebuff ? '&#128165;' : won ? '&#127881;' : '&#128148;'}</div>
        <div style="font-size:16px;color:${won ? '#2ecc71' : '#e74c3c'};margin-bottom:6px">
          ${hitDebuff ? 'Карта Тени! Результат обнулён' : won ? (currentMode === 'multi' ? `Найдено ${targetsFound}/${totalTargets}!` : 'Интуиция работает!') : 'Не в этот раз...'}
        </div>
        ${won ? `
          <div style="font-size:14px;color:#D4AF37;margin-bottom:4px">+${stats._lastWin} &#128142; ${hitBuff ? '(Карта Света x2!)' : ''}</div>
          ${stats.streak > 1 ? `<div style="font-size:13px;color:#D4AF37">&#128293; Серия: ${stats.streak}</div>` : ''}
        ` : `
          <div style="font-size:12px;color:var(--text-dim)">
            ${currentMode === 'classic' ? 'Правильный ответ: карта ' + (cards.findIndex(c => c.type === 'target') + 1) : 'Попробуй ещё!'}
          </div>
        `}
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:center">
          <button class="btn btn-secondary" style="width:auto;padding:10px 20px;margin:0" onclick="IntuitionGame.startGame()">&#128260; Ещё раз</button>
          <button class="btn btn-ghost" style="width:auto;padding:10px 20px;margin:0" onclick="IntuitionGame.render()">&#128200; Меню</button>
        </div>
      </div>
    `;
  }

  return { render, setMode, setLevel, startGame, selectCard, revealAll };
})();
