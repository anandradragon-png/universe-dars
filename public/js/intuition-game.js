/**
 * "Угадай Дар" — игра на развитие интуиции
 * Раскладка карт рубашкой вверх, нужно найти загаданный дар
 */

const IntuitionGame = (function() {
  // Настройки сложности
  const LEVELS = {
    easy:   { cards: 3, crystals: 2, label: 'Новичок',    icon: '&#11088;' },
    medium: { cards: 5, crystals: 4, label: 'Практик',    icon: '&#128302;' },
    hard:   { cards: 9, crystals: 8, label: 'Мастер',     icon: '&#128081;' },
  };

  let currentLevel = 'easy';
  let targetDar = null;     // {code, name, archetype}
  let cards = [];           // [{code, name, isTarget}]
  let revealed = false;
  let selectedIndex = -1;
  let stats = { played: 0, correct: 0, streak: 0, bestStreak: 0 };
  let dailyPlayed = false;

  function loadStats() {
    try {
      const saved = localStorage.getItem('_intuition_stats');
      if (saved) stats = JSON.parse(saved);
      const today = new Date().toISOString().slice(0, 10);
      dailyPlayed = localStorage.getItem('_intuition_daily') === today;
    } catch(e) {}
  }

  function saveStats() {
    localStorage.setItem('_intuition_stats', JSON.stringify(stats));
  }

  function getRandomDars(count) {
    const allCodes = Object.keys(window.DARS || {});
    const shuffled = allCodes.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(code => ({
      code,
      name: window.DARS[code],
      archetype: window.DAR_ARCHETYPES?.[code] || ''
    }));
  }

  function render() {
    loadStats();
    const container = document.getElementById('game-content');
    if (!container) return;

    const pct = stats.played > 0 ? Math.round((stats.correct / stats.played) * 100) : 0;

    container.innerHTML = `
      <div style="text-align:center;padding:20px 16px 0">
        <div style="font-size:32px;margin-bottom:8px">&#128302;</div>
        <div style="font-size:18px;color:var(--text);letter-spacing:2px;margin-bottom:4px">УГАДАЙ ДАР</div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">Игра на развитие интуиции</div>

        <!-- Статистика -->
        <div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px">
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 16px;text-align:center">
            <div style="font-size:18px;color:var(--text)">${stats.played}</div>
            <div style="font-size:10px;color:var(--text-dim)">Игр</div>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 16px;text-align:center">
            <div style="font-size:18px;color:#2ecc71">${pct}%</div>
            <div style="font-size:10px;color:var(--text-dim)">Точность</div>
          </div>
          <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 16px;text-align:center">
            <div style="font-size:18px;color:#D4AF37">${stats.bestStreak}</div>
            <div style="font-size:10px;color:var(--text-dim)">Рекорд</div>
          </div>
        </div>

        ${stats.streak > 0 ? `
          <div style="font-size:13px;color:#D4AF37;margin-bottom:12px">&#128293; Серия: ${stats.streak} подряд</div>
        ` : ''}

        ${!dailyPlayed ? `
          <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:12px;padding:10px;margin-bottom:16px">
            <div style="font-size:12px;color:#D4AF37">&#127873; Ежедневный бонус: x2 кристаллов за первую игру!</div>
          </div>
        ` : ''}
      </div>

      <!-- Выбор сложности -->
      <div style="padding:0 16px 12px">
        <div style="font-size:13px;color:var(--text-dim);text-align:center;margin-bottom:8px">Выберите сложность:</div>
        <div style="display:flex;gap:8px">
          ${Object.entries(LEVELS).map(([key, lvl]) => `
            <button class="btn ${currentLevel === key ? 'btn-secondary' : 'btn-ghost'}"
              style="flex:1;margin:0;padding:10px 6px;font-size:12px"
              onclick="IntuitionGame.setLevel('${key}')">
              ${lvl.icon} ${lvl.label}<br><span style="font-size:10px;color:var(--text-muted)">${lvl.cards} карт</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Игровое поле -->
      <div id="game-board" style="padding:0 16px"></div>

      <!-- Кнопка начала -->
      <div style="text-align:center;padding:16px">
        <button class="btn btn-secondary" onclick="IntuitionGame.startGame()">&#128302; Начать раскладку</button>
      </div>
    `;
  }

  function setLevel(level) {
    currentLevel = level;
    render();
  }

  function startGame() {
    const lvl = LEVELS[currentLevel];
    revealed = false;
    selectedIndex = -1;

    // Выбрать случайные дары для карт
    const dars = getRandomDars(lvl.cards);
    const targetIdx = Math.floor(Math.random() * dars.length);
    targetDar = dars[targetIdx];

    cards = dars.map((d, i) => ({
      code: d.code,
      name: d.name,
      archetype: d.archetype,
      isTarget: i === targetIdx
    }));

    renderBoard();
  }

  function renderBoard() {
    const board = document.getElementById('game-board');
    if (!board) return;
    const lvl = LEVELS[currentLevel];

    let html = `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:14px;color:var(--text);margin-bottom:4px">&#128302; Найди дар:</div>
        <div style="font-size:22px;color:#D4AF37;letter-spacing:2px;margin-bottom:4px">${targetDar.name}</div>
        <div style="font-size:12px;color:var(--text-dim);font-style:italic">${targetDar.archetype}</div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);text-align:center;margin-bottom:12px">Почувствуй, за какой картой прячется этот дар...</div>
      <div class="game-cards-grid" style="display:grid;grid-template-columns:repeat(${lvl.cards <= 3 ? 3 : lvl.cards <= 5 ? 3 : 3},1fr);gap:10px;max-width:400px;margin:0 auto">
    `;

    cards.forEach((card, i) => {
      if (revealed) {
        // Показать все карты
        const isCorrect = card.isTarget;
        const wasSelected = i === selectedIndex;
        let borderColor = 'var(--border)';
        if (isCorrect) borderColor = '#2ecc71';
        else if (wasSelected) borderColor = '#e74c3c';

        html += `
          <div style="background:${isCorrect ? 'rgba(46,204,113,0.15)' : wasSelected ? 'rgba(231,76,60,0.15)' : 'var(--card)'};border:2px solid ${borderColor};border-radius:14px;padding:14px 8px;text-align:center;min-height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center">
            <div style="font-size:14px;color:var(--text);letter-spacing:1px;margin-bottom:4px">${card.name}</div>
            <div style="font-size:10px;color:var(--text-dim);font-style:italic">${card.archetype}</div>
            ${isCorrect ? '<div style="font-size:18px;margin-top:6px">&#10024;</div>' : ''}
            ${wasSelected && !isCorrect ? '<div style="font-size:18px;margin-top:6px">&#10060;</div>' : ''}
          </div>
        `;
      } else {
        // Карта рубашкой вверх
        html += `
          <div class="game-card-back" onclick="IntuitionGame.selectCard(${i})"
            style="background:linear-gradient(135deg,#1a0533,#0d0221);border:2px solid rgba(212,175,55,0.3);border-radius:14px;padding:14px 8px;text-align:center;cursor:pointer;min-height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all .2s">
            <div style="font-size:28px">&#10024;</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px">${i + 1}</div>
          </div>
        `;
      }
    });

    html += '</div>';

    if (revealed) {
      const won = cards[selectedIndex]?.isTarget;
      const crystalsEarned = won ? lvl.crystals * (dailyPlayed ? 1 : 2) : 0;

      html += `
        <div style="text-align:center;margin-top:20px">
          <div style="font-size:24px;margin-bottom:8px">${won ? '&#127881;' : '&#128148;'}</div>
          <div style="font-size:16px;color:${won ? '#2ecc71' : '#e74c3c'};margin-bottom:6px">
            ${won ? 'Верно! Интуиция работает!' : 'Не угадал... Практика делает мастера!'}
          </div>
          ${won ? `
            <div style="font-size:14px;color:#D4AF37;margin-bottom:4px">+${crystalsEarned} кристаллов ${!dailyPlayed ? '(x2 ежедневный бонус!)' : ''}</div>
            ${stats.streak > 1 ? `<div style="font-size:13px;color:#D4AF37">&#128293; Серия: ${stats.streak} подряд!</div>` : ''}
          ` : `
            <div style="font-size:13px;color:var(--text-dim)">Правильный ответ: карта ${cards.findIndex(c => c.isTarget) + 1}</div>
          `}
          <div style="display:flex;gap:8px;margin-top:16px;justify-content:center">
            <button class="btn btn-secondary" style="width:auto;padding:12px 24px;margin:0" onclick="IntuitionGame.startGame()">&#128260; Ещё раз</button>
            <button class="btn btn-ghost" style="width:auto;padding:12px 24px;margin:0" onclick="IntuitionGame.render()">&#128200; Статистика</button>
          </div>
        </div>
      `;
    }

    board.innerHTML = html;
  }

  function selectCard(index) {
    if (revealed) return;
    selectedIndex = index;
    revealed = true;

    const won = cards[index]?.isTarget;
    const lvl = LEVELS[currentLevel];

    // Обновить статистику
    stats.played++;
    if (won) {
      stats.correct++;
      stats.streak++;
      if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;

      // Начислить кристаллы
      const multiplier = dailyPlayed ? 1 : 2;
      const earned = lvl.crystals * multiplier;
      if (typeof CrystalsUI !== 'undefined') CrystalsUI.animateEarn(earned);

      // Отметить ежедневную игру
      if (!dailyPlayed) {
        const today = new Date().toISOString().slice(0, 10);
        localStorage.setItem('_intuition_daily', today);
        dailyPlayed = true;
      }
    } else {
      stats.streak = 0;
    }

    saveStats();

    // Анимация: сначала показать выбранную карту, потом все
    setTimeout(() => renderBoard(), 300);
  }

  return { render, setLevel, startGame, selectCard };
})();
