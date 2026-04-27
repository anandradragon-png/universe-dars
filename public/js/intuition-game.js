/**
 * "Угадай Дар" — игра на развитие интуиции
 * Классика: найди 1 дар среди 3/6/9/12 карт
 * Мультипоиск: найди 3 дара, есть Карта Света (x2) и Карта Тени (обнуление)
 * Все карты открываются ТОЛЬКО после всех ходов
 */

const IntuitionGame = (function() {

  // Балансированная экономика: шанс × награда растёт с уровнем сложности.
  // Множитель очков (×1/1.5/2/3) для рейтинга, плюс участие — чтобы не боялись сложного.
  // Бонус серии даётся только на Средне+ (стимул к повышению уровня).
  const MODES = {
    classic: {
      name: 'Классика',
      desc: 'Найди загаданный дар',
      icon: '&#128302;',
      levels: {
        // cards: сколько карт, crystals: кристаллы за победу,
        // pointsWin: очки рейтинга за победу, pointsTry: очки за участие
        // streakBonus: разрешён ли бонус серии, mult: множитель сложности
        // Песочница - тренировочное поле, очки в рейтинг НЕ идут
        easy:   { cards: 3,  crystals: 2,  pointsWin: 0,  pointsTry: 0, streakBonus: false, mult: 1,   label: 'Песочница · 3',  opens: 1, targets: 1, sandbox: true },
        medium: { cards: 6,  crystals: 5,  pointsWin: 15, pointsTry: 1, streakBonus: true,  mult: 1.5, label: 'Средне · 6',   opens: 1, targets: 1 },
        hard:   { cards: 9,  crystals: 12, pointsWin: 25, pointsTry: 3, streakBonus: true,  mult: 2,   label: 'Сложно · 9',   opens: 1, targets: 1 },
        expert: { cards: 12, crystals: 25, pointsWin: 40, pointsTry: 5, streakBonus: true,  mult: 3,   label: 'Эксперт · 12',  opens: 1, targets: 1 },
      }
    },
    multi: {
      name: 'Мультипоиск',
      desc: 'Найди загаданные дары, остерегайся Карты Тени',
      icon: '&#127183;',
      levels: {
        hard:   { cards: 9,  crystals: 20, pointsWin: 50, pointsTry: 5, streakBonus: true, mult: 2.5, label: 'Сложно · 9',  opens: 4, targets: 3, hasBonus: true, hasTrap: true },
        expert: { cards: 12, crystals: 35, pointsWin: 80, pointsTry: 8, streakBonus: true, mult: 4,   label: 'Эксперт · 12', opens: 5, targets: 3, hasBonus: true, hasTrap: true },
      }
    }
  };

  // === БАТЛ vs AI ===
  // AI-противник "Юпик" играет ту же раскладку с разной точностью.
  // После раскрытия карт — показываем "Юпик выбрал X" и сравниваем.
  const AI_OPPONENTS = {
    novice:  { name: 'Юпик-новичок',   icon: '🐣', accuracy: 0.30, desc: 'Угадывает в 30% случаев' },
    medium:  { name: 'Юпик-ученик',    icon: '🐲', accuracy: 0.55, desc: 'Угадывает в 55% случаев' },
    master:  { name: 'Юпик-мастер',    icon: '🐉', accuracy: 0.75, desc: 'Угадывает в 75% случаев' },
    grand:   { name: 'Юпик-грандмастер', icon: '👑', accuracy: 0.92, desc: 'Угадывает в 92% случаев' }
  };

  let battleMode = false;        // играем ли батл
  let battleOpponent = 'novice'; // текущий AI-противник
  let aiChoice = null;           // индекс карты которую "выбрал" AI
  let aiWon = false;             // угадал ли AI

  let currentMode = 'classic';
  let currentLevel = 'easy';
  let cards = [];
  let targetDar = null;
  let selected = [];
  let maxOpens = 1;
  let allRevealed = false;
  let gameStarted = false;

  let stats = { played: 0, correct: 0, streak: 0, bestStreak: 0, totalCrystals: 0 };
  let dailyPlayed = false;

  // Выбранное пользователем соревнование (в какой период он сейчас играет)
  let focusPeriod = 'daily'; // 'daily' | 'weekly' | 'monthly'
  function loadFocusPeriod() {
    try {
      const p = localStorage.getItem('_intuition_focus_period');
      if (p === 'daily' || p === 'weekly' || p === 'monthly') focusPeriod = p;
    } catch (e) {}
  }
  function saveFocusPeriod(p) {
    focusPeriod = p;
    localStorage.setItem('_intuition_focus_period', p);
  }

  function loadStats() {
    try {
      const s = localStorage.getItem('_intuition_stats');
      if (s) stats = JSON.parse(s);
      dailyPlayed = localStorage.getItem('_intuition_daily') === new Date().toISOString().slice(0,10);
    } catch(e) {}
    loadFocusPeriod();
  }
  function saveStats() { localStorage.setItem('_intuition_stats', JSON.stringify(stats)); }

  function getRandomDars(count) {
    const allCodes = Object.keys(window.DARS || {});
    const shuffled = allCodes.sort(() => Math.random() - 0.5);
    // Фильтр зеркальных кодов: АР-МА (2-3-5) и РА-МА (3-2-5) — это РАЗНЫЕ дары,
    // но визуально в раскладке игрок читает их как «одинаковые» (названия
    // различаются только порядком первых двух букв, иконки тоже похожи).
    // Поэтому в одной раскладке оставляем не более одной карты из каждой группы,
    // где цифры кода те же, но порядок другой.
    const signatures = new Set();
    const picked = [];
    for (const code of shuffled) {
      const sig = code.split('-').slice().sort().join('');
      if (signatures.has(sig)) continue;
      signatures.add(sig);
      picked.push(code);
      if (picked.length >= count) break;
    }
    return picked.slice(0, count).map(code => ({
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

      <!-- Соло / Батл -->
      <div style="padding:0 16px 8px">
        <div style="display:flex;gap:6px">
          <button class="btn ${!battleMode ? 'btn-secondary' : 'btn-ghost'}"
            style="flex:1;margin:0;padding:10px 6px;font-size:12px"
            onclick="IntuitionGame.setBattleMode(false)">
            &#127775; Соло
          </button>
          <button class="btn ${battleMode ? 'btn-secondary' : 'btn-ghost'}"
            style="flex:1;margin:0;padding:10px 6px;font-size:12px"
            onclick="IntuitionGame.setBattleMode(true)">
            &#9876; Батл vs AI
          </button>
        </div>
      </div>

      <!-- Выбор AI-противника (если батл) -->
      ${battleMode ? `
        <div style="padding:0 16px 10px">
          <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.3);border-radius:12px;padding:10px 12px">
            <div style="font-size:11px;color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;text-align:center">&#9876; Выбери противника</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
              ${Object.entries(AI_OPPONENTS).map(([key, ai]) => `
                <button class="btn ${battleOpponent === key ? 'btn-secondary' : 'btn-ghost'}"
                  style="width:auto;margin:0;padding:8px 10px;font-size:11px"
                  onclick="IntuitionGame.setBattleOpponent('${key}')">
                  ${ai.icon} ${ai.name.replace('Юпик-', '')}
                </button>
              `).join('')}
            </div>
            <div style="font-size:10px;color:var(--text-muted);text-align:center;margin-top:6px;font-style:italic">
              ${AI_OPPONENTS[battleOpponent].desc}
            </div>
          </div>
        </div>
      ` : ''}

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

      <!-- Соревнование (выбор периода для рейтинга) -->
      ${!MODES[currentMode].levels[currentLevel]?.sandbox ? `
        <div style="padding:0 16px 12px">
          <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.3);border-radius:12px;padding:10px 12px">
            <div style="font-size:11px;color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:600;text-align:center">&#127942; Твоё соревнование</div>
            <div style="display:flex;gap:6px;justify-content:center">
              ${[
                { key: 'daily', label: '🌅 День' },
                { key: 'weekly', label: '🌙 Неделя' },
                { key: 'monthly', label: '⭐ Месяц' }
              ].map(p => `
                <button class="btn ${focusPeriod === p.key ? 'btn-secondary' : 'btn-ghost'}"
                  style="flex:1;max-width:110px;margin:0;padding:8px 6px;font-size:11px"
                  onclick="IntuitionGame.setFocusPeriod('${p.key}')">
                  ${p.label}
                </button>
              `).join('')}
            </div>
            <div style="font-size:10px;color:var(--text-muted);text-align:center;margin-top:8px;font-style:italic">
              Очки идут во все рейтинги, но этот в фокусе
            </div>
          </div>
        </div>
      ` : `
        <div style="padding:0 16px 12px">
          <div style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.2);border-radius:12px;padding:10px 12px;text-align:center">
            <div style="font-size:11px;color:#D4AF37;font-style:italic">&#128302; Песочница — тренировочный режим, очки не идут в рейтинг</div>
          </div>
        </div>
      `}

      ${currentMode === 'multi' ? renderMultiRules() : ''}

      <div id="game-board" style="padding:0 16px"></div>

      <div style="text-align:center;padding:12px 16px">
        <button class="btn btn-secondary" onclick="IntuitionGame.startGame()">&#128302; Начать раскладку</button>
      </div>

      <div style="text-align:center;padding:0 16px 16px">
        <button class="btn btn-ghost" style="font-size:13px;padding:10px" onclick="IntuitionGame.openLeaderboard()">&#127942; Рейтинг магов</button>
      </div>
    `;
  }

  // === РЕЙТИНГ МАГОВ ===
  let leaderboardPeriod = 'daily';
  let leaderboardDifficulty = 'all'; // только для daily: all | medium | hard | expert
  let leaderboardData = null;

  async function openLeaderboard() {
    const container = document.getElementById('game-content');
    if (!container) return;
    // Синхронизируем период с фокусом игры при первом открытии
    if (!leaderboardData) leaderboardPeriod = focusPeriod;

    // @keyframes pulse вынесен в глобальный <style> в index.html — больше не
    // подклеиваем <style> в innerHTML (иначе на каждое открытие лидерборда
    // в DOM добавлялся новый stylesheet).
    container.innerHTML = `
      <div style="text-align:center;padding:40px 16px">
        <div style="font-size:32px;margin-bottom:12px;animation:pulse 1.5s infinite">&#127942;</div>
        <div style="color:var(--text-dim);font-size:14px">Загружаю рейтинг...</div>
      </div>
    `;
    try {
      leaderboardData = await DarAPI.getLeaderboard(
        leaderboardPeriod,
        leaderboardPeriod === 'daily' ? leaderboardDifficulty : undefined
      );
    } catch (e) {
      console.warn('Leaderboard load failed:', e.message);
      leaderboardData = { period: leaderboardPeriod, leaders: [], me: null, error: e.message };
    }
    renderLeaderboard();
  }

  function setLeaderboardPeriod(p) {
    leaderboardPeriod = p;
    // Для не-дневного сбрасываем difficulty
    if (p !== 'daily') leaderboardDifficulty = 'all';
    openLeaderboard();
  }

  function setLeaderboardDifficulty(d) {
    leaderboardDifficulty = d;
    openLeaderboard();
  }

  // Время до конца периода
  function timeUntilPeriodReset(period) {
    const now = new Date();
    const target = new Date(now);
    if (period === 'daily') {
      target.setDate(target.getDate() + 1);
      target.setHours(0, 0, 0, 0);
    } else if (period === 'weekly') {
      const dow = target.getDay();
      const daysToMonday = dow === 0 ? 1 : (8 - dow);
      target.setDate(target.getDate() + daysToMonday);
      target.setHours(0, 0, 0, 0);
    } else {
      target.setMonth(target.getMonth() + 1, 1);
      target.setHours(0, 0, 0, 0);
    }
    const diff = target - now;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days} д ${hours} ч`;
    if (hours > 0) return `${hours} ч ${minutes} мин`;
    return `${minutes} мин`;
  }

  function renderLeaderboard() {
    const container = document.getElementById('game-content');
    if (!container) return;
    const data = leaderboardData || { leaders: [], me: null };

    const periodTitles = {
      daily: '🌅 Маг Дня',
      weekly: '🌙 Маг Недели',
      monthly: '⭐ Маг Месяца'
    };

    let html = `
      <div style="padding:16px">
        <button class="btn-back" style="display:block;margin-bottom:12px" onclick="IntuitionGame.render()">&#8592; К игре</button>

        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:28px;margin-bottom:6px">&#127942;</div>
          <div style="font-size:18px;color:var(--text);letter-spacing:2px;margin-bottom:4px">РЕЙТИНГ МАГОВ</div>
          <div style="font-size:12px;color:var(--text-dim)">Очки за сложность и серию, песочница не учитывается</div>
        </div>

        <div style="display:flex;gap:6px;justify-content:center;margin-bottom:10px">
          ${['daily', 'weekly', 'monthly'].map(p => `
            <button class="btn ${leaderboardPeriod === p ? 'btn-secondary' : 'btn-ghost'}"
              style="flex:1;max-width:120px;margin:0;padding:8px 6px;font-size:11px"
              onclick="IntuitionGame.setLeaderboardPeriod('${p}')">
              ${periodTitles[p]}
            </button>
          `).join('')}
        </div>

        ${leaderboardPeriod === 'daily' ? `
          <div style="display:flex;gap:4px;justify-content:center;margin-bottom:10px;flex-wrap:wrap">
            ${[
              { key: 'all', label: 'Все' },
              { key: 'medium', label: 'Средне' },
              { key: 'hard', label: 'Сложно' },
              { key: 'expert', label: 'Эксперт' }
            ].map(d => `
              <button class="btn ${leaderboardDifficulty === d.key ? 'btn-secondary' : 'btn-ghost'}"
                style="margin:0;padding:6px 10px;font-size:10px;width:auto"
                onclick="IntuitionGame.setLeaderboardDifficulty('${d.key}')">
                ${d.label}
              </button>
            `).join('')}
          </div>
        ` : ''}

        <div style="text-align:center;font-size:11px;color:var(--text-muted);margin-bottom:14px">
          До сброса: <span style="color:#D4AF37">${timeUntilPeriodReset(leaderboardPeriod)}</span>
        </div>
    `;

    if (data.error) {
      html += `<div style="text-align:center;color:var(--text-muted);padding:40px 20px;font-size:13px">Не удалось загрузить рейтинг. Проверь соединение.</div>`;
    } else if (!data.leaders || data.leaders.length === 0) {
      html += `
        <div style="text-align:center;color:var(--text-muted);padding:40px 20px">
          <div style="font-size:32px;margin-bottom:10px">&#127776;</div>
          <div style="font-size:14px;color:var(--text-dim);margin-bottom:6px">Рейтинг пока пустой</div>
          <div style="font-size:12px">Стань первым магом этого периода!</div>
        </div>`;
    } else {
      html += `<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden">`;
      data.leaders.forEach((p, i) => {
        const isFirst = i === 0;
        const medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : '&#11088;';
        const bgColor = isFirst ? 'rgba(212,175,55,0.15)' : (i < 3 ? 'rgba(212,175,55,0.06)' : 'transparent');
        html += `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.05);background:${bgColor}">
            <div style="width:28px;text-align:center;font-size:${i < 3 ? '20px' : '14px'};color:${isFirst ? '#D4AF37' : 'var(--text-dim)'}">${i < 3 ? medal : (i + 1)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;color:${isFirst ? '#D4AF37' : 'var(--text)'};font-weight:${isFirst ? 'bold' : 'normal'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeText(p.display_name)}</div>
              <div style="font-size:10px;color:var(--text-muted)">Побед: ${p.games_won || 0}</div>
            </div>
            <div style="font-size:16px;color:${isFirst ? '#D4AF37' : '#D4AF37'};font-weight:bold">${p.score}</div>
          </div>
        `;
      });
      html += `</div>`;

      // Моя позиция если не в топе
      if (data.me && data.me.rank && data.me.rank > data.leaders.length) {
        html += `
          <div style="margin-top:12px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.35);border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px">
            <div style="width:28px;text-align:center;font-size:14px;color:#D4AF37">#${data.me.rank}</div>
            <div style="flex:1;font-size:13px;color:var(--text)">Твоя позиция</div>
            <div style="font-size:16px;color:#D4AF37;font-weight:bold">${data.me.score}</div>
          </div>
        `;
      } else if (data.me && data.me.score > 0) {
        html += `<div style="text-align:center;margin-top:12px;font-size:12px;color:#D4AF37">&#11088; Ты в топе!</div>`;
      } else if (data.me) {
        html += `<div style="text-align:center;margin-top:12px;font-size:12px;color:var(--text-muted)">Сыграй на среднем+ уровне, чтобы попасть в рейтинг</div>`;
      }
    }

    html += `
        <div style="margin-top:20px;padding:14px;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.25);border-radius:12px;font-size:11px;color:var(--text-dim);line-height:1.6">
          <div style="color:#D4AF37;font-weight:bold;margin-bottom:6px">&#128161; Как зарабатывать очки</div>
          &#10024; Средний уровень: +15 очков за победу<br>
          &#10024; Сложный: +25 очков (×2 множитель)<br>
          &#10024; Эксперт: +40 очков (×3 множитель)<br>
          &#10024; Серия 3+: +20% к очкам<br>
          &#10024; Серия 5+: +50%<br>
          &#10024; Серия 10+: +100%<br>
          <span style="color:var(--text-muted);font-style:italic">Песочница (3 карты) не учитывается в рейтинге</span>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function escapeText(s) {
    if (!s) return 'Странник';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderMultiRules() {
    const lvl = MODES.multi.levels[currentLevel] || MODES.multi.levels.hard;
    return `
      <div style="padding:0 16px 8px">
        <div style="background:rgba(212,175,55,0.1);border:1px solid var(--border);border-radius:12px;padding:10px;font-size:11px;color:var(--text-dim);line-height:1.5">
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
  function setBattleMode(on) { battleMode = !!on; aiChoice = null; aiWon = false; render(); }
  function setBattleOpponent(key) { battleOpponent = key; render(); }
  function setFocusPeriod(p) {
    saveFocusPeriod(p);
    // Синхронизируем с рейтингом если пользователь его откроет
    leaderboardPeriod = p;
    render();
  }

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
    // Фильтруем и по code, и по «зеркалу» (см. getRandomDars): чтобы рядом с
    // target 2-3-5 не оказался 3-2-5 — они визуально путаются.
    const targetSig = target.code.split('-').slice().sort().join('');
    const pool = getRandomDars(needed + 10).filter(d => {
      if (d.code === target.code) return false;
      const sig = d.code.split('-').slice().sort().join('');
      return sig !== targetSig;
    });
    let all = [];

    for (let i = 0; i < lvl.targets; i++) all.push({ ...target, type: 'target' });
    if (lvl.hasBonus) { const d = pool.shift(); if(d) all.push({ ...d, type: 'buff' }); }
    if (lvl.hasTrap) { const d = pool.shift(); if(d) all.push({ ...d, type: 'debuff' }); }
    pool.slice(0, needed).forEach(d => all.push({ ...d, type: 'normal' }));

    cards = shuffle(all.slice(0, lvl.cards));
  }

  // Склонение "карта" по количеству: 1 карту, 2-4 карты, 5+ карт
  function _plCard(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'карту';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'карты';
    return 'карт';
  }

  // Helper: SVG-иконка дара золотом (для искомой и Света) или красным (для Тени).
  // FS у автора хранит часть файлов в NFD (й = и + комбинирующая бреве), а JS по
  // умолчанию генерирует имена в NFC — поэтому при ошибке пробуем альтернативную
  // нормализацию (fallback: NFC → NFD, и наоборот).
  function renderDarIconHtml(darName, tone) {
    if (!darName) return '';
    const raw = String(darName).toLowerCase();
    const nfc = raw.normalize('NFC').replace(/[^\u0400-\u04FFa-z]/g, '');
    const nfd = raw.normalize('NFD').replace(/[^\u0400-\u04FFa-z\u0300-\u036F]/g, '');
    const filterGold = 'invert(85%) sepia(25%) saturate(600%) hue-rotate(10deg) brightness(110%) drop-shadow(0 0 6px rgba(212,175,55,0.4))';
    // Максимально контрастный ярко-алый фильтр для карты Тени
    const filterRed  = 'invert(40%) sepia(100%) saturate(5000%) hue-rotate(-15deg) brightness(130%) contrast(140%) drop-shadow(0 0 10px rgba(255,56,56,0.8))';
    const filter = tone === 'red' ? filterRed : filterGold;
    // Если NFC не загрузился — пробуем NFD; если и он не сработал — скрываем img
    const onerror = "if(!this.dataset.tried){this.dataset.tried='1';this.src='images/dars/" + nfd + ".svg'}else{this.style.display='none'}";
    return '<img src="images/dars/' + nfc + '.svg" ' +
      'style="width:100%;height:100%;object-fit:contain;filter:' + filter + '" ' +
      'onerror="' + onerror + '"/>';
  }

  // === РЕНДЕР ДОСКИ ===
  function renderBoard() {
    const board = document.getElementById('game-board');
    if (!board) return;
    const lvl = MODES[currentMode].levels[currentLevel];
    const cols = cards.length <= 3 ? 3 : cards.length <= 6 ? 3 : cards.length <= 9 ? 3 : 4;

    // Ищем Свет и Тень в текущей раскладке — их дары заранее известны
    const buffCard = cards.find(c => c.type === 'buff');
    const debuffCard = cards.find(c => c.type === 'debuff');

    // Блок "Свет / Искомая / Тень" — с картинками дара золотом (Свет, искомый)
    // и ярко-красным (Тень), чтобы юзер мог сонастроиться визуально.
    const ICON_SIZE = 78; // было 54
    const TARGET_ICON_SIZE = 92; // было 64
    let lightBlock = '';
    let shadowBlock = '';
    if (currentMode === 'multi' && buffCard) {
      lightBlock =
        '<div style="display:flex;flex-direction:column;align-items:center;gap:5px;min-width:92px">' +
          '<div style="font-size:10px;color:#4ade80;letter-spacing:1px;font-weight:700;text-shadow:0 0 6px rgba(74,222,128,0.4)">⭐ СВЕТ ×2</div>' +
          '<div style="width:' + ICON_SIZE + 'px;height:' + ICON_SIZE + 'px;padding:6px;border:1.5px solid rgba(74,222,128,0.6);border-radius:10px;background:rgba(74,222,128,0.1);box-sizing:border-box;box-shadow:0 0 14px rgba(74,222,128,0.25)">' +
            renderDarIconHtml(buffCard.name, 'gold') +
          '</div>' +
          '<div style="font-size:12px;color:#4ade80;letter-spacing:1px;text-align:center;font-weight:600;text-shadow:0 0 6px rgba(74,222,128,0.3)">' + buffCard.name + '</div>' +
        '</div>';
    }
    if (currentMode === 'multi' && debuffCard) {
      // Максимальная контрастность тени: ярко-алый цвет + более крупное свечение
      shadowBlock =
        '<div style="display:flex;flex-direction:column;align-items:center;gap:5px;min-width:92px">' +
          '<div style="font-size:11px;color:#ff3838;letter-spacing:1.5px;font-weight:900;text-shadow:0 0 8px rgba(255,56,56,0.7), 0 0 2px rgba(255,255,255,0.2)">💥 ТЕНЬ</div>' +
          '<div style="width:' + ICON_SIZE + 'px;height:' + ICON_SIZE + 'px;padding:6px;border:2px solid #ff3838;border-radius:10px;background:rgba(255,56,56,0.18);box-sizing:border-box;box-shadow:0 0 16px rgba(255,56,56,0.5), inset 0 0 8px rgba(255,56,56,0.2)">' +
            renderDarIconHtml(debuffCard.name, 'red') +
          '</div>' +
          '<div style="font-size:13px;color:#ff3838;letter-spacing:1px;text-align:center;font-weight:800;text-shadow:0 0 8px rgba(255,56,56,0.6)">' + debuffCard.name + '</div>' +
        '</div>';
    }

    const targetIconHtml =
      '<div style="width:' + TARGET_ICON_SIZE + 'px;height:' + TARGET_ICON_SIZE + 'px;padding:6px;border:1.5px solid rgba(212,175,55,0.55);border-radius:12px;background:rgba(212,175,55,0.08);box-sizing:border-box;box-shadow:0 0 18px rgba(212,175,55,0.3);margin:0 auto 8px">' +
        renderDarIconHtml(targetDar.name, 'gold') +
      '</div>';

    let html = `
      <div style="margin-bottom:12px">
        <div style="font-size:13px;color:var(--text);text-align:center;margin-bottom:8px">
          ${currentMode === 'multi' ? `&#127183; Найди ${lvl.targets} ${_plCard(lvl.targets)}:` : '&#128302; Найди дар:'}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 4px">
          ${lightBlock || '<div style="min-width:70px"></div>'}
          <div style="flex:1;text-align:center">
            ${targetIconHtml}
            <div style="font-size:20px;color:#D4AF37;letter-spacing:2px">${targetDar.name}</div>
            <div style="font-size:11px;color:var(--text-dim);font-style:italic">${targetDar.archetype}</div>
          </div>
          ${shadowBlock || '<div style="min-width:70px"></div>'}
        </div>
        ${!allRevealed && currentMode === 'multi' ? `
          <div id="card-counter" style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:center">Выбрано: ${selected.length} / ${maxOpens}</div>
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

        const rawLower = card.name.toLowerCase();
        const imgBaseNFC = rawLower.normalize('NFC').replace(/[^\u0400-\u04FFa-z]/g,'');
        const imgBaseNFD = rawLower.normalize('NFD').replace(/[^\u0400-\u04FFa-z\u0300-\u036F]/g,'');
        html += `
          <div style="background:${bg};border:2px solid ${border};border-radius:12px;padding:12px 6px;text-align:center;min-height:140px;display:flex;flex-direction:column;align-items:center;justify-content:center;${isSelected ? 'box-shadow:0 0 10px rgba(212,175,55,0.3)' : ''}">
            <div style="width:72px;height:72px;margin-bottom:6px;display:flex;align-items:center;justify-content:center" id="gc-${i}"></div>
            <div style="font-size:13px;color:var(--text);letter-spacing:1px;font-weight:bold">${card.name}</div>
            <div style="font-size:12px;color:#D4AF37;font-weight:700;margin-top:3px;letter-spacing:1px">${card.code}</div>
            ${badge}
          </div>`;
        setTimeout(() => {
          const w = document.getElementById('gc-'+i);
          if(w && imgBaseNFC){
            const img = new Image();
            img.style = 'width:100%;height:100%;object-fit:contain;filter:invert(85%) sepia(25%) saturate(600%) hue-rotate(10deg) brightness(110%) drop-shadow(0 0 4px #D4AF37)';
            img.onload = () => w.appendChild(img);
            img.onerror = () => {
              // Fallback: некоторые файлы хранятся в NFD (й = и + бреве)
              if (img.dataset.tried !== '1' && imgBaseNFD !== imgBaseNFC) {
                img.dataset.tried = '1';
                img.src = 'images/dars/' + imgBaseNFD + '.svg';
              }
            };
            img.src = 'images/dars/' + imgBaseNFC + '.svg';
          }
        }, 50);
      } else {
        // ЗАКРЫТАЯ КАРТА (рубашка)
        const selStyle = isSelected
          ? 'border-color:rgba(212,175,55,0.8);box-shadow:0 0 12px rgba(212,175,55,0.4);background:linear-gradient(135deg,#1a1a1a 0%,#0d0d0d 100%)'
          : '';

        // Обложка карты с золотым Кадуцеем на чёрном фоне.
        // Если картинка не загрузилась (кэш браузера, 404) — показываем стилизованный fallback.
        // data-idx нужен чтобы updateSelectionUI() мог обновлять карту точечно без
        // пересоздания всего board.innerHTML (иначе <img> пересоздаются на каждый тап
        // и рамки моргают — см. баг мерцания на Android).
        html += `
          <div class="game-card-back" data-idx="${i}" onclick="IntuitionGame.selectCard(${i})"
            style="background:#080808;border:2px solid rgba(212,175,55,0.35);border-radius:12px;padding:6px;text-align:center;cursor:pointer;min-height:90px;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:all .2s;position:relative;overflow:hidden;box-shadow:inset 0 0 20px rgba(212,175,55,0.05);${selStyle}">
            <div style="position:relative;width:70%;max-height:72px;display:flex;align-items:center;justify-content:center">
              <img src="images/caduceus-gold.png" alt="" style="width:100%;height:auto;max-height:72px;object-fit:contain;opacity:${isSelected ? '1' : '0.9'};pointer-events:none;filter:drop-shadow(0 0 8px rgba(212,175,55,0.25))" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
              <div style="display:none;font-size:32px;color:#D4AF37;text-shadow:0 0 10px rgba(212,175,55,0.5);line-height:1">&#10016;</div>
            </div>
            <div class="card-check" style="position:absolute;top:4px;right:4px;font-size:14px;color:#D4AF37;display:${isSelected ? 'block' : 'none'}">&#10003;</div>
          </div>`;
      }
    });

    html += '</div>';

    // Кнопка "Открыть карты" — всегда в DOM (чтобы updateSelectionUI мог
    // переключать видимость без перерисовки board.innerHTML).
    if (!allRevealed) {
      const showReveal = selected.length >= maxOpens;
      html += `
        <div id="reveal-btn-container" style="text-align:center;margin-top:16px;display:${showReveal ? 'block' : 'none'}">
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
    if (allRevealed) return;

    // Повторный тап по уже выбранной карте — снимаем выбор (в мультипоиске).
    // Тестеры жаловались: "выбрано 4/4 - нельзя убрать выбор".
    const alreadyIdx = selected.indexOf(index);
    if (alreadyIdx !== -1) {
      if (currentMode === 'classic') return; // в классике одна карта, отменять нечего
      selected.splice(alreadyIdx, 1);
      updateSelectionUI();
      return;
    }

    if (selected.length >= maxOpens) return;

    selected.push(index);

    if (currentMode === 'classic') {
      // Классика — 1 выбор, сразу раскрытие
      revealAll();
      return;
    }

    // В мультипоиске — обновляем только стили выбранных карт, не пересоздаём
    // весь board.innerHTML (иначе <img> пересоздаются → мерцание на Android).
    updateSelectionUI();
  }

  // Точечное обновление стиля выбранных карт, счётчика и кнопки "Открыть карты".
  // НЕ трогает <img> и общую структуру — именно поэтому картинки не моргают.
  function updateSelectionUI() {
    const board = document.getElementById('game-board');
    if (!board) return;

    cards.forEach((_, i) => {
      const el = board.querySelector('.game-card-back[data-idx="' + i + '"]');
      if (!el) return;
      const isSelected = selected.includes(i);
      if (isSelected) {
        el.style.borderColor = 'rgba(212,175,55,0.8)';
        el.style.boxShadow = '0 0 12px rgba(212,175,55,0.4)';
        el.style.background = 'linear-gradient(135deg,#1a1a1a 0%,#0d0d0d 100%)';
      } else {
        el.style.borderColor = '';
        el.style.boxShadow = 'inset 0 0 20px rgba(212,175,55,0.05)';
        el.style.background = '#080808';
      }
      const check = el.querySelector('.card-check');
      if (check) check.style.display = isSelected ? 'block' : 'none';
      const img = el.querySelector('img');
      if (img) img.style.opacity = isSelected ? '1' : '0.9';
    });

    const counter = document.getElementById('card-counter');
    if (counter) counter.textContent = 'Выбрано: ' + selected.length + ' / ' + maxOpens;

    const revealContainer = document.getElementById('reveal-btn-container');
    if (revealContainer) {
      revealContainer.style.display = selected.length >= maxOpens ? 'block' : 'none';
    }
  }

  // === РАСКРЫТИЕ ВСЕХ КАРТ ===
  function revealAll() {
    allRevealed = true;

    // В режиме батла — AI тоже "выбирает" карту
    if (battleMode) {
      simulateAI();
    }

    finishGame();
    renderBoard();
  }

  // AI-противник выбирает карту с заданной точностью
  function simulateAI() {
    const ai = AI_OPPONENTS[battleOpponent];
    if (!ai) return;

    // С вероятностью accuracy AI угадывает правильно
    if (Math.random() < ai.accuracy) {
      // AI угадал — выбирает одну из target-карт
      const targetIdx = cards.findIndex(c => c.type === 'target');
      aiChoice = targetIdx >= 0 ? targetIdx : 0;
      aiWon = true;
    } else {
      // AI не угадал — выбирает случайную НЕ-target карту
      const nonTargets = cards.map((c, i) => ({ c, i })).filter(x => x.c.type !== 'target');
      if (nonTargets.length > 0) {
        aiChoice = nonTargets[Math.floor(Math.random() * nonTargets.length)].i;
      } else {
        aiChoice = 0;
      }
      aiWon = false;
    }
  }

  // === ПОДСЧЁТ ОЧКОВ ДЛЯ РЕЙТИНГА ===
  // Формула:
  //   points = pointsTry (всегда, за участие) + (won ? pointsWin : 0)
  //   + streakBonus если серия >= 3 и уровень разрешает бонус
  //     серия 3+: +20%, серия 5+: +50%, серия 10+: +100%
  // На песочнице (easy) очки всегда 0 — не идут в рейтинг.
  function calculatePoints(lvl, won, currentStreak, targetsFound) {
    if (lvl.sandbox) return 0;
    let points = lvl.pointsTry || 0;
    if (won) {
      let winBonus = lvl.pointsWin || 0;
      // В мультипоиске пропорционально найденным целям
      if (currentMode === 'multi' && lvl.targets > 1) {
        winBonus = Math.round(winBonus * (targetsFound / lvl.targets));
      }
      points += winBonus;
    }
    // Бонус серии только на уровнях где разрешено
    if (won && lvl.streakBonus && currentStreak >= 3) {
      let bonusMultiplier = 0;
      if (currentStreak >= 10) bonusMultiplier = 1.0;      // +100%
      else if (currentStreak >= 5) bonusMultiplier = 0.5;  // +50%
      else if (currentStreak >= 3) bonusMultiplier = 0.2;  // +20%
      points = Math.round(points * (1 + bonusMultiplier));
    }
    return points;
  }

  // === ПОДСЧЁТ РЕЗУЛЬТАТА ===
  function finishGame() {
    const lvl = MODES[currentMode].levels[currentLevel];
    stats.played++;

    const targetsFound = selected.filter(i => cards[i]?.type === 'target').length;
    const hitBuff = selected.some(i => cards[i]?.type === 'buff');
    const hitDebuff = selected.some(i => cards[i]?.type === 'debuff');

    const won = targetsFound > 0 && !hitDebuff;

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

    // Считаем очки для рейтинга
    const pointsEarned = calculatePoints(lvl, won, stats.streak, targetsFound);
    stats._lastPoints = pointsEarned;

    // Отправляем на сервер (не блокируем UI)
    if (pointsEarned > 0 && typeof DarAPI !== 'undefined' && DarAPI.submitIntuitionScore) {
      DarAPI.submitIntuitionScore({
        points: pointsEarned,
        difficulty: currentLevel,
        won: won,
        streak: stats.streak
      }).catch(err => {
        console.warn('Leaderboard submit failed:', err.message);
      });
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

    // === Блок результатов батла vs AI ===
    let battleBlock = '';
    if (battleMode && aiChoice !== null) {
      const ai = AI_OPPONENTS[battleOpponent];
      const aiCardName = cards[aiChoice] ? cards[aiChoice].name : '?';
      const playerWon = won;
      const draw = playerWon === aiWon; // оба угадали или оба нет

      let battleResult, battleColor, battleEmoji;
      if (playerWon && !aiWon) {
        battleResult = 'Ты победил(а)!';
        battleColor = '#2ecc71';
        battleEmoji = '&#127942;';
      } else if (!playerWon && aiWon) {
        battleResult = `${ai.name} победил!`;
        battleColor = '#e74c3c';
        battleEmoji = '&#128148;';
      } else if (playerWon && aiWon) {
        battleResult = 'Ничья — оба угадали!';
        battleColor = '#D4AF37';
        battleEmoji = '&#129309;';
      } else {
        battleResult = 'Ничья — оба мимо!';
        battleColor = '#888';
        battleEmoji = '&#128528;';
      }

      battleBlock = `
        <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:14px;margin-top:14px">
          <div style="font-size:11px;color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;text-align:center">&#9876; БАТЛ vs AI</div>
          <div style="display:flex;gap:12px;align-items:center;justify-content:center;margin-bottom:10px">
            <div style="text-align:center">
              <div style="font-size:22px">&#128100;</div>
              <div style="font-size:11px;color:var(--text)">Ты</div>
              <div style="font-size:13px;color:${won ? '#2ecc71' : '#e74c3c'};font-weight:bold">${won ? 'Угадал' : 'Мимо'}</div>
            </div>
            <div style="font-size:22px;color:${battleColor}">${battleEmoji}</div>
            <div style="text-align:center">
              <div style="font-size:22px">${ai.icon}</div>
              <div style="font-size:11px;color:var(--text)">${ai.name.replace('Юпик-','')}</div>
              <div style="font-size:13px;color:${aiWon ? '#2ecc71' : '#e74c3c'};font-weight:bold">${aiWon ? 'Угадал' : 'Мимо'}</div>
            </div>
          </div>
          <div style="text-align:center;font-size:16px;color:${battleColor};font-weight:bold">${battleResult}</div>
          ${aiChoice !== null ? `<div style="text-align:center;font-size:10px;color:var(--text-muted);margin-top:4px">${ai.icon} выбрал карту ${aiChoice + 1}: ${aiCardName}</div>` : ''}
        </div>
      `;
    }

    return `
      <div style="text-align:center;margin-top:20px">
        <div style="font-size:28px;margin-bottom:8px">${hitDebuff ? '&#128165;' : won ? '&#127881;' : '&#128148;'}</div>
        <div style="font-size:16px;color:${won ? '#2ecc71' : '#e74c3c'};margin-bottom:6px">
          ${hitDebuff ? 'Карта Тени! Результат обнулён' : won ? (currentMode === 'multi' ? `Найдено ${targetsFound}/${totalTargets}!` : 'Интуиция работает!') : 'Не в этот раз...'}
        </div>
        ${won ? `
          <div style="font-size:14px;color:#D4AF37;margin-bottom:4px">+${stats._lastWin} &#128142; ${hitBuff ? '(Карта Света x2!)' : ''}</div>
          ${stats._lastPoints > 0 ? `<div style="font-size:13px;color:#D4AF37;margin-bottom:4px">&#127942; +${stats._lastPoints} очков в рейтинг</div>` : ''}
          ${stats.streak > 1 ? `<div style="font-size:13px;color:#D4AF37">&#128293; Серия: ${stats.streak}</div>` : ''}
        ` : `
          <div style="font-size:12px;color:var(--text-dim)">
            ${currentMode === 'classic' ? 'Правильный ответ: карта ' + (cards.findIndex(c => c.type === 'target') + 1) : 'Попробуй ещё!'}
          </div>
          ${stats._lastPoints > 0 ? `<div style="font-size:13px;color:#D4AF37;margin-top:6px">&#127942; +${stats._lastPoints} очков за участие</div>` : ''}
        `}
        ${battleBlock}
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:center">
          <button class="btn btn-secondary" style="width:auto;padding:10px 20px;margin:0" onclick="IntuitionGame.startGame()">&#128260; Ещё раз</button>
          <button class="btn btn-ghost" style="width:auto;padding:10px 20px;margin:0" onclick="IntuitionGame.render()">&#128200; Меню</button>
        </div>
      </div>
    `;
  }

  return {
    render, setMode, setLevel, setFocusPeriod,
    setBattleMode, setBattleOpponent,
    startGame, selectCard, revealAll,
    openLeaderboard, setLeaderboardPeriod, setLeaderboardDifficulty
  };
})();
