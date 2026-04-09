/**
 * "Угадай Дар" — игра на развитие интуиции
 * Режимы:
 * 1. Классика (3/6/9/12 карт) — найди 1 загаданный дар
 * 2. Мультипоиск (9/12 карт) — найди 1-3 одинаковых дара, есть баф x2 и дебаф-обнуление
 * 3. Мемо (20/24/30 карт) — найди все пары (в разработке)
 */

const IntuitionGame = (function() {

  // === РЕЖИМЫ ИГРЫ ===
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
      desc: 'Найди все загаданные + избегай ловушек',
      icon: '&#127183;',
      levels: {
        hard:   { cards: 9,  crystals: 15, label: '9 карт',  opens: 4, targets: 3, hasBuff: true, hasDebuff: true },
        expert: { cards: 12, crystals: 25, label: '12 карт', opens: 5, targets: 3, hasBuff: true, hasDebuff: true },
      }
    }
  };

  let currentMode = 'classic';
  let currentLevel = 'easy';
  let cards = [];             // [{code, name, archetype, type: 'normal'|'target'|'buff'|'debuff'}]
  let targetDar = null;
  let revealed = [];          // индексы открытых карт
  let maxOpens = 1;           // сколько карт можно открыть
  let gameOver = false;
  let crystalsWon = 0;
  let buffActive = false;     // x2 бонус
  let debuffHit = false;      // обнуление

  let stats = { played: 0, correct: 0, streak: 0, bestStreak: 0, totalCrystals: 0 };
  let dailyPlayed = false;

  function loadStats() {
    try {
      const s = localStorage.getItem('_intuition_stats');
      if (s) stats = JSON.parse(s);
      dailyPlayed = localStorage.getItem('_intuition_daily') === new Date().toISOString().slice(0,10);
    } catch(e) {}
  }

  function saveStats() {
    localStorage.setItem('_intuition_stats', JSON.stringify(stats));
  }

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
            <div style="font-size:9px;color:var(--text-dim)">Заработано</div>
          </div>
        </div>

        ${stats.streak > 0 ? `<div style="font-size:13px;color:#D4AF37;margin-bottom:8px">&#128293; Серия: ${stats.streak} подряд</div>` : ''}
        ${!dailyPlayed ? `<div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:10px;padding:8px;margin-bottom:12px;font-size:11px;color:#D4AF37">&#127873; x2 кристаллов за первую игру дня!</div>` : ''}
      </div>

      <!-- Выбор режима -->
      <div style="padding:0 16px 8px">
        <div style="display:flex;gap:8px;margin-bottom:12px">
          ${Object.entries(MODES).map(([key, mode]) => `
            <button class="btn ${currentMode === key ? 'btn-secondary' : 'btn-ghost'}"
              style="flex:1;margin:0;padding:10px 6px;font-size:12px"
              onclick="IntuitionGame.setMode('${key}')">
              ${mode.icon} ${mode.name}
            </button>
          `).join('')}
        </div>
        <div style="font-size:11px;color:var(--text-dim);text-align:center;margin-bottom:10px">${MODES[currentMode].desc}</div>
      </div>

      <!-- Выбор сложности -->
      <div style="padding:0 16px 12px">
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
          ${Object.entries(MODES[currentMode].levels).map(([key, lvl]) => `
            <button class="btn ${currentLevel === key ? 'btn-secondary' : 'btn-ghost'}"
              style="width:auto;margin:0;padding:8px 14px;font-size:12px"
              onclick="IntuitionGame.setLevel('${key}')">
              ${lvl.label}
              ${lvl.hasBuff ? '<span style="font-size:9px;color:#2ecc71"> +баф</span>' : ''}
            </button>
          `).join('')}
        </div>
      </div>

      ${currentMode === 'multi' ? `
        <div style="padding:0 16px 8px">
          <div style="background:rgba(107,33,168,0.15);border:1px solid var(--border);border-radius:12px;padding:10px;font-size:11px;color:var(--text-dim);line-height:1.5">
            <div style="color:var(--text);margin-bottom:4px">&#127183; Правила Мультипоиска:</div>
            &#10024; Найди <strong>${MODES[currentMode].levels[currentLevel]?.targets || 3}</strong> одинаковых дара<br>
            &#128994; Можно открыть <strong>${MODES[currentMode].levels[currentLevel]?.opens || 4}</strong> карты<br>
            &#11088; <span style="color:#2ecc71">Баф x2</span> — удваивает выигрыш<br>
            &#128165; <span style="color:#e74c3c">Дебаф</span> — обнуляет результат раунда
          </div>
        </div>
      ` : ''}

      <div id="game-board" style="padding:0 16px"></div>

      <div style="text-align:center;padding:12px 16px">
        <button class="btn btn-secondary" onclick="IntuitionGame.startGame()">&#128302; Начать раскладку</button>
      </div>
    `;
  }

  function setMode(mode) {
    currentMode = mode;
    const levels = Object.keys(MODES[mode].levels);
    currentLevel = levels[0];
    render();
  }

  function setLevel(level) {
    currentLevel = level;
    render();
  }

  // === СТАРТ ИГРЫ ===
  function startGame() {
    const mode = MODES[currentMode];
    const lvl = mode.levels[currentLevel];
    if (!lvl) return;

    gameOver = false;
    revealed = [];
    crystalsWon = 0;
    buffActive = false;
    debuffHit = false;
    maxOpens = lvl.opens;

    if (currentMode === 'classic') {
      setupClassicGame(lvl);
    } else if (currentMode === 'multi') {
      setupMultiGame(lvl);
    }

    renderBoard();
  }

  function setupClassicGame(lvl) {
    const dars = getRandomDars(lvl.cards);
    const targetIdx = Math.floor(Math.random() * dars.length);
    targetDar = dars[targetIdx];

    cards = dars.map((d, i) => ({
      ...d, type: i === targetIdx ? 'target' : 'normal'
    }));
  }

  function setupMultiGame(lvl) {
    // Выбираем целевой дар
    const target = getRandomDars(1)[0];
    targetDar = target;

    // Заполняем карты: targets + buff + debuff + обычные
    const totalNormal = lvl.cards - lvl.targets - (lvl.hasBuff ? 1 : 0) - (lvl.hasDebuff ? 1 : 0);
    const normalDars = getRandomDars(totalNormal + 5).filter(d => d.code !== target.code).slice(0, totalNormal);

    let allCards = [];

    // Целевые карты
    for (let i = 0; i < lvl.targets; i++) {
      allCards.push({ ...target, type: 'target' });
    }

    // Баф
    if (lvl.hasBuff) {
      const buffDar = getRandomDars(10).find(d => d.code !== target.code) || normalDars[0];
      allCards.push({ ...buffDar, type: 'buff' });
    }

    // Дебаф
    if (lvl.hasDebuff) {
      const debuffDar = getRandomDars(10).find(d => d.code !== target.code && !allCards.some(c => c.code === d.code)) || normalDars[1];
      allCards.push({ ...debuffDar, type: 'debuff' });
    }

    // Обычные
    normalDars.forEach(d => allCards.push({ ...d, type: 'normal' }));

    // Обрезать до нужного количества и перемешать
    cards = shuffle(allCards.slice(0, lvl.cards));
  }

  // === РЕНДЕР ДОСКИ ===
  function renderBoard() {
    const board = document.getElementById('game-board');
    if (!board) return;
    const lvl = MODES[currentMode].levels[currentLevel];

    // Определить сетку
    const cols = cards.length <= 3 ? 3 : cards.length <= 6 ? 3 : cards.length <= 9 ? 3 : 4;

    let html = `
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:13px;color:var(--text);margin-bottom:4px">
          ${currentMode === 'multi' ? `&#127183; Найди ${lvl.targets} карт:` : '&#128302; Найди дар:'}
        </div>
        <div style="font-size:20px;color:#D4AF37;letter-spacing:2px">${targetDar.name}</div>
        <div style="font-size:11px;color:var(--text-dim);font-style:italic">${targetDar.archetype}</div>
        ${currentMode === 'multi' ? `
          <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
            Открыто: ${revealed.length} / ${maxOpens}
            ${buffActive ? ' <span style="color:#2ecc71">&#11088; x2!</span>' : ''}
            ${debuffHit ? ' <span style="color:#e74c3c">&#128165; Обнуление!</span>' : ''}
          </div>
        ` : ''}
      </div>

      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;max-width:420px;margin:0 auto">
    `;

    cards.forEach((card, i) => {
      const isRevealed = revealed.includes(i) || gameOver;

      if (isRevealed) {
        // Открытая карта
        let bg = 'var(--card)';
        let border = 'var(--border)';
        let extra = '';

        if (card.type === 'target') { bg = 'rgba(46,204,113,0.15)'; border = '#2ecc71'; extra = '<div style="font-size:14px">&#10024;</div>'; }
        else if (card.type === 'buff') { bg = 'rgba(46,204,113,0.2)'; border = '#2ecc71'; extra = '<div style="font-size:14px">&#11088; x2</div>'; }
        else if (card.type === 'debuff') { bg = 'rgba(231,76,60,0.2)'; border = '#e74c3c'; extra = '<div style="font-size:14px">&#128165;</div>'; }
        else if (revealed.includes(i)) { bg = 'rgba(255,255,255,0.05)'; border = 'rgba(255,255,255,0.1)'; }

        html += `
          <div style="background:${bg};border:2px solid ${border};border-radius:12px;padding:10px 6px;text-align:center;min-height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <div style="font-size:12px;color:var(--text);letter-spacing:1px">${card.name}</div>
            <div style="font-size:9px;color:var(--text-dim)">${card.archetype}</div>
            ${extra}
          </div>`;
      } else {
        // Закрытая карта
        html += `
          <div class="game-card-back" onclick="IntuitionGame.selectCard(${i})"
            style="background:linear-gradient(135deg,#1a0533,#0d0221);border:2px solid rgba(212,175,55,0.3);border-radius:12px;padding:10px 6px;text-align:center;cursor:pointer;min-height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all .2s">
            <div style="font-size:22px">&#10024;</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${i + 1}</div>
          </div>`;
      }
    });

    html += '</div>';

    // Результат
    if (gameOver) {
      html += renderResult();
    }

    board.innerHTML = html;
  }

  // === ВЫБОР КАРТЫ ===
  function selectCard(index) {
    if (gameOver || revealed.includes(index)) return;

    revealed.push(index);
    const card = cards[index];

    if (currentMode === 'classic') {
      // Классика — одна попытка
      gameOver = true;
      const won = card.type === 'target';
      finishGame(won);
    } else if (currentMode === 'multi') {
      // Мультипоиск — обработка бафов/дебафов
      if (card.type === 'buff') {
        buffActive = true;
      } else if (card.type === 'debuff') {
        debuffHit = true;
        gameOver = true;
        finishGame(false);
        renderBoard();
        return;
      }

      // Проверить все ли открытия использованы
      if (revealed.length >= maxOpens) {
        gameOver = true;
        const targetsFound = revealed.filter(i => cards[i].type === 'target').length;
        finishGame(targetsFound > 0);
      }
    }

    renderBoard();
  }

  // === ЗАВЕРШЕНИЕ ИГРЫ ===
  function finishGame(won) {
    const lvl = MODES[currentMode].levels[currentLevel];
    stats.played++;

    if (won && !debuffHit) {
      stats.correct++;
      stats.streak++;
      if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;

      let earned = lvl.crystals;
      if (buffActive) earned *= 2;
      if (!dailyPlayed) earned *= 2;

      // Бонус за количество найденных целей в мультипоиске
      if (currentMode === 'multi') {
        const targetsFound = revealed.filter(i => cards[i].type === 'target').length;
        earned = Math.round(earned * (targetsFound / lvl.targets));
      }

      crystalsWon = earned;
      stats.totalCrystals = (stats.totalCrystals || 0) + earned;

      if (typeof CrystalsUI !== 'undefined') CrystalsUI.animateEarn(earned);

      if (!dailyPlayed) {
        localStorage.setItem('_intuition_daily', new Date().toISOString().slice(0,10));
        dailyPlayed = true;
      }
    } else {
      stats.streak = 0;
      crystalsWon = 0;
    }

    saveStats();
  }

  // === ЭКРАН РЕЗУЛЬТАТА ===
  function renderResult() {
    const targetsFound = revealed.filter(i => cards[i].type === 'target').length;
    const totalTargets = cards.filter(c => c.type === 'target').length;
    const won = crystalsWon > 0;

    return `
      <div style="text-align:center;margin-top:20px">
        <div style="font-size:28px;margin-bottom:8px">${debuffHit ? '&#128165;' : won ? '&#127881;' : '&#128148;'}</div>
        <div style="font-size:16px;color:${won ? '#2ecc71' : '#e74c3c'};margin-bottom:6px">
          ${debuffHit ? 'Ловушка! Результат обнулён' : won ? (currentMode === 'multi' ? `Найдено ${targetsFound}/${totalTargets}!` : 'Интуиция работает!') : 'Не в этот раз...'}
        </div>
        ${won ? `
          <div style="font-size:14px;color:#D4AF37;margin-bottom:4px">
            +${crystalsWon} &#128142;
            ${buffActive ? ' (баф x2!)' : ''}
          </div>
          ${stats.streak > 1 ? `<div style="font-size:13px;color:#D4AF37">&#128293; Серия: ${stats.streak}</div>` : ''}
        ` : `
          <div style="font-size:12px;color:var(--text-dim)">
            ${currentMode === 'classic' ? 'Правильный ответ: карта ' + (cards.findIndex(c => c.type === 'target') + 1) : 'Попробуй ещё раз!'}
          </div>
        `}
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:center">
          <button class="btn btn-secondary" style="width:auto;padding:10px 20px;margin:0" onclick="IntuitionGame.startGame()">&#128260; Ещё раз</button>
          <button class="btn btn-ghost" style="width:auto;padding:10px 20px;margin:0" onclick="IntuitionGame.render()">&#128200; Меню</button>
        </div>
      </div>
    `;
  }

  return { render, setMode, setLevel, startGame, selectCard };
})();
