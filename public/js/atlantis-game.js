/**
 * Легенды Атлантиды — картёжная игра на 2 игроков + ИИ "Высшие Силы"
 *
 * Закон параметров карт (из memory/law_card_params.md):
 *   Магия = МА (1-я цифра кода)
 *   Жизнь = ЖИ (2-я цифра кода)
 *   Сила = КУН (3-я цифра кода)
 *   Мощность = МА + ЖИ + КУН
 *
 * Режимы: партия против одного AI-противника (Высшие Силы).
 * Раздача: по 4 карты каждому из 3 участников (юзер, AI-противник, ИИ "Высшие Силы").
 * Ход: юзер выбирает параметр → выкладывает карту → остальные отвечают → открытие → сравнение.
 * Особый параметр Мощность: выкладываются по 3 карты, считается сумма Мощности.
 *
 * Победа в партии: у кого останутся карты на руках в конце (или наибольше).
 */

const AtlantisGame = (function() {
  'use strict';

  const PLAYERS = {
    user: { id: 'user', name: 'Ты', icon: '🧙' },
    rival: { id: 'rival', name: 'Противник', icon: '🧝' },
    forces: { id: 'forces', name: 'Высшие Силы', icon: '✨' }
  };

  const PARAM_LABELS = {
    magic:    { ru: 'Магия',    icon: '🔮', color: '#9c27b0' },
    life:     { ru: 'Жизнь',    icon: '💚', color: '#4ade80' },
    power:    { ru: 'Сила',     icon: '⚡', color: '#f59e0b' },
    mightSum: { ru: 'Мощность', icon: '💥', color: '#ef4444' }
  };

  // ===== СОСТОЯНИЕ =====
  let state = null;

  function resetState() {
    state = {
      deck: [],                 // общая колода для добора
      hands: { user: [], rival: [], forces: [] },
      tablesUsed: 0,            // сколько партий сыграно
      exchangeUsed: { user: false, rival: false },
      phase: 'setup',           // setup | choose_param | lay_cards | tiebreaker | reveal | ended
      currentParam: null,
      played: { user: [], rival: [], forces: [] },
      log: []
    };
  }

  // ===== КОЛОДА =====
  function buildDeck() {
    // Все 64 дара — каждый как объект {code, name, magic, life, power, mightSum}
    const dars = window.DARS || {};
    const deck = Object.entries(dars).map(([code, name]) => {
      const [ma, zhi, kun] = code.split('-').map(Number);
      return {
        code,
        name,
        archetype: (window.DAR_ARCHETYPES || {})[code] || '',
        magic: ma,
        life: zhi,
        power: kun,
        mightSum: ma + zhi + kun
      };
    });
    return deck;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function drawCards(n) {
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (state.deck.length === 0) break;
      drawn.push(state.deck.pop());
    }
    return drawn;
  }

  // ===== ЗАПУСК =====
  function start() {
    resetState();
    state.deck = shuffle(buildDeck());
    state.hands.user = drawCards(4);
    state.hands.rival = drawCards(4);
    state.hands.forces = drawCards(4);
    state.phase = 'choose_param';
    state.log.push('Партия началась. У каждого по 4 карты.');
    render();
  }

  function quit() {
    state = null;
    if (typeof IntuitionGame !== 'undefined' && typeof backToGamesHub === 'function') {
      backToGamesHub();
    }
  }

  // ===== AI-ЛОГИКА =====
  // Противник выбирает карту со значением чуть ниже максимума для экономии сильных (эмуляция осторожности)
  function rivalChooseCardFor(param, options) {
    const hand = state.hands[options.player];
    if (!hand.length) return null;
    // Сортируем по параметру убыв. Берём средне-верхнюю
    const sorted = hand.slice().sort((a, b) => b[param] - a[param]);
    // Для мощности берём лучшую, для остальных — среднюю чтобы оставались запасы
    if (param === 'mightSum') return sorted[0];
    // 60% шанс сыграть топ, 40% — второй
    if (sorted.length === 1) return sorted[0];
    return Math.random() < 0.6 ? sorted[0] : sorted[1];
  }

  // ===== ВЫБОР ПАРАМЕТРА =====
  function chooseParam(param) {
    if (state.phase !== 'choose_param') return;
    state.currentParam = param;
    state.played = { user: [], rival: [], forces: [] };
    state.phase = 'lay_cards';
    state.log.push(`Выбран параметр: ${PARAM_LABELS[param].ru}`);
    // Если на руках меньше карт чем нужно (особенно актуально для Мощности
    // когда нужно 3 карты), Высшие Силы добирают недостающие из колоды СРАЗУ
    // на стол (в played), не в руку. Юзер видит что карты уже выложены.
    autofillFromDeck('user');
    // Если после автодобора у юзера всё ещё 0 своих карт для выкладки
    // (т.к. все недостающие уже легли), переходим к ответам противников.
    const need = needCardsPerPlayer();
    if (state.played.user.length >= need) {
      answerRival();
      answerForces();
      state.phase = 'awaiting_reveal';
    }
    render();
  }

  // Автодобор из колоды прямо на стол (played), если карт на руках < need
  function autofillFromDeck(playerId) {
    const need = needCardsPerPlayer();
    const inHand = state.hands[playerId].length;
    const alreadyPlayed = state.played[playerId].length;
    const still = need - alreadyPlayed; // сколько ещё нужно выложить
    const fromHand = Math.min(still, inHand);
    const fromDeck = Math.max(0, still - fromHand);
    if (fromDeck > 0) {
      for (let i = 0; i < fromDeck && state.deck.length > 0; i++) {
        const card = state.deck.pop();
        state.played[playerId].push(card);
      }
      if (fromDeck > 0) {
        state.log.push(`Высшие Силы дают ${PLAYERS[playerId].name} ${fromDeck} карт из колоды на стол`);
      }
    }
  }

  // ===== ВЫКЛАДЫВАНИЕ КАРТ =====
  // Для обычного параметра — по 1 карте; для мощности — по 3 (у кого меньше 3 — добор из колоды)
  function needCardsPerPlayer() {
    return state.currentParam === 'mightSum' ? 3 : 1;
  }

  function layCard(handIdx) {
    if (state.phase !== 'lay_cards') return;
    const need = needCardsPerPlayer();
    if (state.played.user.length >= need) return;
    const card = state.hands.user[handIdx];
    if (!card) return;
    state.hands.user.splice(handIdx, 1);
    state.played.user.push(card);

    if (state.played.user.length < need) {
      render();
      return;
    }

    // Пользователь выложил все нужные. AI-противник и Высшие Силы отвечают —
    // выкладывают карты в закрытую. Переход в фазу ожидания переворота:
    // юзер видит поле с закрытыми картами и жмёт "Перевернуть".
    answerRival();
    answerForces();
    state.phase = 'awaiting_reveal';
    render();
  }

  // Кнопка "Перевернуть" — открываем карты и сравниваем
  function flipCards() {
    if (state.phase !== 'awaiting_reveal') return;
    revealAndCompare();
  }

  function answerRival() {
    const need = needCardsPerPlayer();
    // Выкладываем из руки что есть (по AI-логике выбирая лучшие)
    const available = Math.min(need, state.hands.rival.length);
    for (let i = 0; i < available; i++) {
      const card = rivalChooseCardFor(state.currentParam, { player: 'rival' });
      if (!card) break;
      const idx = state.hands.rival.indexOf(card);
      if (idx >= 0) state.hands.rival.splice(idx, 1);
      state.played.rival.push(card);
    }
    // Недостающие — сразу из колоды на стол
    autofillFromDeck('rival');
  }

  function answerForces() {
    const need = needCardsPerPlayer();
    // Выкладываем из руки случайно
    const shuffled = shuffle(state.hands.forces);
    const available = Math.min(need, shuffled.length);
    for (let i = 0; i < available; i++) {
      const card = shuffled[i];
      const idx = state.hands.forces.indexOf(card);
      if (idx >= 0) state.hands.forces.splice(idx, 1);
      state.played.forces.push(card);
    }
    // Недостающие — сразу из колоды на стол
    autofillFromDeck('forces');
  }

  // ===== ОТКРЫТИЕ И СРАВНЕНИЕ =====
  function sumParam(cards, param) {
    return cards.reduce((s, c) => s + (c[param] || 0), 0);
  }

  function revealAndCompare() {
    // Переходим в фазу reveal_result — карты открыты, показываем результат,
    // но не забираем карты до нажатия "Далее". Юзер может рассмотреть карты противников.
    state.phase = 'reveal_result';
    const p = state.currentParam;
    const u = sumParam(state.played.user, p);
    const r = sumParam(state.played.rival, p);
    const f = sumParam(state.played.forces, p);
    const max = Math.max(u, r, f);
    const winners = [];
    if (u === max) winners.push('user');
    if (r === max) winners.push('rival');
    if (f === max) winners.push('forces');

    if (winners.length === 1) {
      state._pendingWinner = winners[0];
      state._pendingTie = false;
      state.log.push(`${PLAYERS[winners[0]].name}: ${state.currentParam === 'mightSum' ? 'Мощность' : PARAM_LABELS[p].ru}=${winners[0] === 'user' ? u : winners[0] === 'rival' ? r : f}`);
    } else {
      state._pendingWinner = null;
      state._pendingTie = true;
      state.log.push('Ничья! После "Далее" — добор по карте.');
    }
    render();
  }

  // Пользователь нажал "Далее" после раскрытия — применяем результат раунда
  function continueAfterReveal() {
    if (state.phase !== 'reveal_result') return;
    if (state._pendingTie) {
      // Ничья → tiebreaker
      state.phase = 'tiebreaker';
      state._pendingTie = false;
      render();
      return;
    }
    const winner = state._pendingWinner;
    if (winner) {
      const allCards = [...state.played.user, ...state.played.rival, ...state.played.forces];
      state.hands[winner].push(...allCards);
      state.log.push(`${PLAYERS[winner].name} забирает ${allCards.length} карт`);
      state.played = { user: [], rival: [], forces: [] };
      state._pendingWinner = null;
      checkEndGame();
      if (state.phase !== 'ended') {
        // Высшие Силы уравнивают: всем у кого меньше 4 карт — добирают до 4
        // из общей колоды перед новым раундом. У кого 4+ — ничего не добавляют.
        replenishHandsTo4();
        state.phase = 'choose_param';
      }
      render();
    }
  }

  // Добор карт до 4 у всех участников из общей колоды (между раундами).
  // У кого 4+ карт на руках — ничего не добавляется.
  function replenishHandsTo4() {
    const TARGET = 4;
    const added = { user: 0, rival: 0, forces: 0 };
    ['user', 'rival', 'forces'].forEach(id => {
      while (state.hands[id].length < TARGET && state.deck.length > 0) {
        state.hands[id].push(state.deck.pop());
        added[id]++;
      }
    });
    const summary = Object.entries(added).filter(([, n]) => n > 0)
      .map(([id, n]) => PLAYERS[id].name + ' +' + n).join(', ');
    if (summary) {
      state.log.push('Высшие Силы добирают карты: ' + summary);
    }
  }

  function tiebreakerLay(handIdx) {
    if (state.phase !== 'tiebreaker') return;
    const card = state.hands.user[handIdx];
    if (!card) return;
    state.hands.user.splice(handIdx, 1);
    state.played.user.push(card);

    // AI и Силы тоже по 1
    if (state.hands.rival.length === 0 && state.deck.length > 0) state.hands.rival.push(state.deck.pop());
    if (state.hands.rival.length > 0) {
      const rcard = rivalChooseCardFor(state.currentParam, { player: 'rival' });
      if (rcard) {
        const idx = state.hands.rival.indexOf(rcard);
        if (idx >= 0) state.hands.rival.splice(idx, 1);
        state.played.rival.push(rcard);
      }
    }
    if (state.hands.forces.length === 0 && state.deck.length > 0) state.hands.forces.push(state.deck.pop());
    if (state.hands.forces.length > 0) {
      const shuffled = shuffle(state.hands.forces);
      const fcard = shuffled[0];
      const idx = state.hands.forces.indexOf(fcard);
      if (idx >= 0) state.hands.forces.splice(idx, 1);
      state.played.forces.push(fcard);
    }
    // Карты выложены в закрытую — ждём "Перевернуть"
    state.phase = 'awaiting_reveal';
    render();
  }

  function checkEndGame() {
    const totalCards = state.hands.user.length + state.hands.rival.length + state.hands.forces.length;
    if (state.hands.user.length === 0 && state.hands.rival.length === 0 && state.hands.forces.length === 0) {
      state.phase = 'ended';
      // Победитель — тот, кто в крайний раунд забрал все
      return;
    }
    // Если на руках ни у кого нет карт и колода пуста — конец
    if (totalCards === 0) {
      state.phase = 'ended';
    }
  }

  // ===== ОБМЕН КАРТАМИ =====
  function exchangeCard(myIdx) {
    if (state.exchangeUsed.user) return;
    if (!state.hands.user[myIdx] || state.hands.rival.length === 0) return;
    // Пользователь отдаёт свою карту и получает СЛУЧАЙНУЮ у противника
    const myCard = state.hands.user[myIdx];
    const rivalIdx = Math.floor(Math.random() * state.hands.rival.length);
    const rivalCard = state.hands.rival[rivalIdx];
    state.hands.user[myIdx] = rivalCard;
    state.hands.rival[rivalIdx] = myCard;
    state.exchangeUsed.user = true;
    state.log.push(`Обмен: ${myCard.name} ↔ ${rivalCard.name}`);
    render();
  }

  // ===== РЕНДЕР =====
  function renderCard(card, opts) {
    opts = opts || {};
    if (!card) return '';
    // SVG-иконка дара золотом
    const raw = String(card.name).toLowerCase();
    const nfc = raw.normalize('NFC').replace(/[^\u0400-\u04FFa-z]/g, '');
    const nfd = raw.normalize('NFD').replace(/[^\u0400-\u04FFa-z\u0300-\u036F]/g, '');
    const onerror = "if(!this.dataset.tried){this.dataset.tried='1';this.src='images/dars/" + nfd + ".svg'}else{this.style.display='none'}";
    const highlight = opts.highlight || null; // 'magic' | 'life' | 'power' | 'mightSum'
    const hlColor = highlight && PARAM_LABELS[highlight] ? PARAM_LABELS[highlight].color : '#D4AF37';
    const borderColor = opts.selected ? '#D4AF37' : opts.dim ? 'rgba(255,255,255,0.1)' : 'rgba(212,175,55,0.4)';
    const onClick = opts.onClick || '';

    // В углах — треугольник параметров (Магия / Жизнь / Сила), в центре мощность
    const paramBadge = (val, param, pos) => {
      const isHl = highlight === param;
      const color = PARAM_LABELS[param].color;
      return `<div style="position:absolute;${pos};font-size:11px;color:${isHl ? '#fff' : color};font-weight:${isHl ? 800 : 700};background:${isHl ? color : 'rgba(0,0,0,0.7)'};border:1px solid ${color};border-radius:6px;padding:1px 5px;line-height:1.2;min-width:16px;text-align:center;box-shadow:${isHl ? '0 0 8px ' + color : 'none'}">${val}</div>`;
    };
    const mightBadge = () => {
      const isHl = highlight === 'mightSum';
      return `<div style="position:absolute;top:4px;left:4px;font-size:10px;color:${isHl ? '#fff' : '#ef4444'};font-weight:${isHl ? 900 : 700};background:${isHl ? '#ef4444' : 'rgba(239,68,68,0.15)'};border:1px solid #ef4444;border-radius:6px;padding:2px 6px;line-height:1.1;box-shadow:${isHl ? '0 0 8px #ef4444' : 'none'}">💥 ${card.mightSum}</div>`;
    };

    return `
      <div class="atlantis-card" ${onClick ? 'onclick="' + onClick + '"' : ''}
        style="position:relative;background:linear-gradient(135deg,#0a0a0a,#111);border:2px solid ${borderColor};border-radius:14px;padding:10px 8px 8px;min-width:110px;max-width:130px;aspect-ratio:0.72;box-shadow:${opts.selected ? '0 0 16px rgba(212,175,55,0.5)' : '0 2px 6px rgba(0,0,0,0.3)'};cursor:${onClick ? 'pointer' : 'default'};opacity:${opts.dim ? '0.6' : '1'};transition:transform .15s">
        ${mightBadge()}
        ${paramBadge(card.magic, 'magic', 'top:4px;right:4px')}
        ${paramBadge(card.life, 'life', 'bottom:28px;left:4px')}
        ${paramBadge(card.power, 'power', 'bottom:28px;right:4px')}
        <div style="width:54px;height:54px;margin:14px auto 4px;display:flex;align-items:center;justify-content:center">
          <img src="images/dars/${nfc}.svg" style="width:100%;height:100%;object-fit:contain;filter:invert(85%) sepia(25%) saturate(600%) hue-rotate(10deg) brightness(110%) drop-shadow(0 0 4px rgba(212,175,55,0.5))" onerror="${onerror}"/>
        </div>
        <div style="text-align:center;font-size:11px;color:#D4AF37;font-weight:700;letter-spacing:1px">${card.name}</div>
        <div style="text-align:center;font-size:9px;color:var(--text-muted)">${card.code}</div>
      </div>
    `;
  }

  function renderCardBack(size) {
    // size: 'normal' (для руки) | 'mini' (для игрового поля)
    const isMini = size === 'mini';
    const w = isMini ? 50 : 110;
    const ar = isMini ? 0.75 : 0.72;
    return `
      <div style="background:#080808;border:${isMini ? '1.5px' : '2px'} solid rgba(212,175,55,0.35);border-radius:${isMini ? '8px' : '14px'};width:${w}px;aspect-ratio:${ar};display:flex;align-items:center;justify-content:center;padding:4px;box-shadow:inset 0 0 12px rgba(212,175,55,0.05)">
        <img src="images/caduceus-gold.png" style="width:${isMini ? '80%' : '70%'};opacity:0.85;filter:drop-shadow(0 0 6px rgba(212,175,55,0.3))" onerror="this.style.display='none'"/>
      </div>`;
  }

  // Компактная версия карты (для игрового поля, чтобы уместить 3 ряда)
  function renderCardMini(card, highlight) {
    if (!card) return '';
    const raw = String(card.name).toLowerCase();
    const nfc = raw.normalize('NFC').replace(/[^\u0400-\u04FFa-z]/g, '');
    const nfd = raw.normalize('NFD').replace(/[^\u0400-\u04FFa-z\u0300-\u036F]/g, '');
    const onerror = "if(!this.dataset.tried){this.dataset.tried='1';this.src='images/dars/" + nfd + ".svg'}else{this.style.display='none'}";

    // Показываем только выбранный параметр крупно
    let mainVal = '';
    let mainColor = '#D4AF37';
    let mainLabel = '';
    if (highlight && PARAM_LABELS[highlight]) {
      const lbl = PARAM_LABELS[highlight];
      mainVal = card[highlight];
      mainColor = lbl.color;
      mainLabel = lbl.icon;
    }

    return `
      <div style="position:relative;background:linear-gradient(135deg,#0a0a0a,#111);border:1.5px solid ${mainColor};border-radius:10px;padding:4px;width:60px;box-shadow:0 0 10px ${mainColor}55">
        ${mainLabel ? `<div style="position:absolute;top:-8px;right:-6px;font-size:13px;font-weight:900;color:#fff;background:${mainColor};border-radius:8px;padding:1px 6px;line-height:1.2;box-shadow:0 0 6px ${mainColor}">${mainLabel}${mainVal}</div>` : ''}
        <div style="width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center">
          <img src="images/dars/${nfc}.svg" style="width:90%;height:90%;object-fit:contain;filter:invert(85%) sepia(25%) saturate(600%) hue-rotate(10deg) brightness(110%) drop-shadow(0 0 4px rgba(212,175,55,0.5))" onerror="${onerror}"/>
        </div>
        <div style="text-align:center;font-size:9px;color:#D4AF37;font-weight:700;letter-spacing:0.5px;margin-top:2px">${card.name}</div>
      </div>
    `;
  }

  // Компактная строка: иконка + имя + количество карт. Без декоративных рубашек.
  function renderOpponentRow(playerId) {
    const p = PLAYERS[playerId];
    const hand = state.hands[playerId];
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:6px">
        <div style="font-size:12px;color:var(--text)">${p.icon} <b>${p.name}</b></div>
        <div style="font-size:11px;color:var(--text-dim)">🎴 ${hand.length}</div>
      </div>
    `;
  }

  function renderChooseParam() {
    const params = ['magic', 'life', 'power', 'mightSum'];
    return `
      <div style="padding:8px 10px;background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.3);border-radius:10px;margin-bottom:8px">
        <div style="font-size:11px;color:#D4AF37;text-align:center;margin-bottom:6px;letter-spacing:1px">🎴 ВЫБЕРИ ПАРАМЕТР</div>
        <div style="display:flex;gap:6px;justify-content:center">
          ${params.map(p => {
            const lbl = PARAM_LABELS[p];
            const isMight = p === 'mightSum';
            return `<button onclick="AtlantisGame.chooseParam('${p}')" title="${lbl.ru}${isMight ? ' (3 карты, сумма)' : ''}"
              style="flex:1;padding:8px 4px;border-radius:8px;border:1.5px solid ${lbl.color};background:rgba(255,255,255,0.04);color:${lbl.color};font-size:11px;font-weight:700;cursor:pointer;font-family:Manrope,sans-serif;display:flex;flex-direction:column;gap:2px;align-items:center;min-width:0">
              <span style="font-size:16px">${lbl.icon}</span>
              <span>${lbl.ru}${isMight ? ' ×3' : ''}</span>
            </button>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderLayPhase() {
    const need = needCardsPerPlayer();
    const laid = state.played.user.length;
    const paramLbl = PARAM_LABELS[state.currentParam];
    return `
      <div style="padding:12px;background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.3);border-radius:12px;margin-bottom:10px;text-align:center">
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:3px">Параметр сражения</div>
        <div style="font-size:18px;color:${paramLbl.color};font-weight:800;letter-spacing:2px">${paramLbl.icon} ${paramLbl.ru.toUpperCase()}</div>
        <div style="font-size:11px;color:var(--text);margin-top:4px">Выложи карту ${laid}/${need}</div>
      </div>
    `;
  }

  function renderTiebreakerPhase() {
    const paramLbl = PARAM_LABELS[state.currentParam];
    return `
      <div style="padding:12px;background:rgba(255,152,0,0.08);border:1px solid rgba(255,152,0,0.4);border-radius:12px;margin-bottom:10px;text-align:center">
        <div style="font-size:14px;color:#ff9800;font-weight:700">⚖️ НИЧЬЯ — выложи ещё карту (${paramLbl.ru})</div>
      </div>
    `;
  }

  function renderRevealPhase() {
    const p = state.currentParam;
    const u = sumParam(state.played.user, p);
    const r = sumParam(state.played.rival, p);
    const f = sumParam(state.played.forces, p);
    const max = Math.max(u, r, f);
    const paramLbl = PARAM_LABELS[p];
    return `
      <div style="padding:14px;background:linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.06));border:1px solid rgba(212,175,55,0.45);border-radius:14px;margin-bottom:10px;text-align:center">
        <div style="font-size:14px;color:#D4AF37;margin-bottom:8px;font-weight:700">${paramLbl.icon} ${paramLbl.ru}</div>
        <div style="display:flex;justify-content:space-around;font-size:12px;gap:6px">
          <div style="color:${u === max ? '#4ade80' : 'var(--text-dim)'};font-weight:${u === max ? 800 : 500}">Ты: ${u}${u === max ? ' ★' : ''}</div>
          <div style="color:${r === max ? '#4ade80' : 'var(--text-dim)'};font-weight:${r === max ? 800 : 500}">Против.: ${r}${r === max ? ' ★' : ''}</div>
          <div style="color:${f === max ? '#4ade80' : 'var(--text-dim)'};font-weight:${f === max ? 800 : 500}">Высшие: ${f}${f === max ? ' ★' : ''}</div>
        </div>
      </div>
    `;
  }

  // Игровое поле — показывает карты всех игроков в 3 компактных ряда.
  // Все ряды видны на экране без прокрутки. Мини-карты 60px.
  function renderBattlefield() {
    const isReveal = state.phase === 'reveal' || state.phase === 'tiebreaker';
    const isAwaiting = state.phase === 'awaiting_reveal';
    const isResult = state.phase === 'reveal_result'; // карты открыты, ждут "Далее"
    const anyPlayed = state.played.user.length + state.played.rival.length + state.played.forces.length > 0;
    if (!anyPlayed) return '';

    const renderStack = (cards) => {
      if (!cards.length) {
        return '<div style="font-size:9px;color:var(--text-muted);opacity:0.5;padding:20px 0">—</div>';
      }
      // В awaiting_reveal — рубашки, в reveal/result — открытые мини-карты
      if (isAwaiting) return cards.map(() => renderCardBack('mini')).join('');
      return cards.map(c => renderCardMini(c, state.currentParam)).join('');
    };

    const paramLbl = state.currentParam ? PARAM_LABELS[state.currentParam] : null;
    const p = state.currentParam;

    // Для reveal_result — подсвечиваем победителя
    let uSum = 0, rSum = 0, fSum = 0, maxSum = 0;
    let winnerLabel = '';
    if (isResult && p) {
      uSum = sumParam(state.played.user, p);
      rSum = sumParam(state.played.rival, p);
      fSum = sumParam(state.played.forces, p);
      maxSum = Math.max(uSum, rSum, fSum);
      const winners = [];
      if (uSum === maxSum) winners.push('Ты');
      if (rSum === maxSum) winners.push('Противник');
      if (fSum === maxSum) winners.push('Высшие');
      winnerLabel = winners.length === 1 ? winners[0] + ' побеждает!' : '⚖️ Ничья';
    }

    const rowStyle = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;margin-bottom:4px';

    const makeRow = (iconName, label, sum, cards, isMe) => {
      const winBadge = (isResult && sum === maxSum) ? '<span style="color:#4ade80;font-weight:900;font-size:11px;margin-left:4px">★</span>' : '';
      const sumShow = isResult && p ? ` · ${paramLbl.icon}${sum}` : '';
      const bg = isResult && sum === maxSum ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.02)';
      const border = isResult && sum === maxSum ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.06)';
      return `
        <div style="${rowStyle};background:${bg};border:${border}">
          <div style="font-size:11px;color:${isMe ? '#D4AF37' : 'var(--text)'};min-width:95px;font-weight:${isMe ? 700 : 500}">${iconName} ${label}${sumShow}${winBadge}</div>
          <div style="flex:1;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">${cards}</div>
        </div>
      `;
    };

    return `
      <div style="padding:10px;background:linear-gradient(180deg,rgba(0,0,0,0.4),rgba(212,175,55,0.04));border:1.5px solid rgba(212,175,55,0.35);border-radius:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;color:#D4AF37;letter-spacing:1.5px;font-weight:700">⚔️ ПОЛЕ</div>
          ${paramLbl ? `<div style="font-size:11px;color:${paramLbl.color};font-weight:700">${paramLbl.icon} ${paramLbl.ru}</div>` : ''}
          ${winnerLabel ? `<div style="font-size:11px;color:#4ade80;font-weight:700">${winnerLabel}</div>` : ''}
        </div>
        ${makeRow('🧝', 'Противник', rSum, renderStack(state.played.rival), false)}
        ${makeRow('✨', 'Высшие', fSum, renderStack(state.played.forces), false)}
        ${makeRow('🧙', 'Ты', uSum, renderStack(state.played.user), true)}

        ${isAwaiting ? `
          <button onclick="AtlantisGame.flipCards()"
            style="width:100%;margin-top:8px;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#E8C84A,#D4AF37);color:#080808;font-size:14px;font-weight:800;cursor:pointer;font-family:Manrope,sans-serif;letter-spacing:1px;box-shadow:0 0 14px rgba(212,175,55,0.35);animation:atlPulse 1.5s ease-in-out infinite">
            🔄 ПЕРЕВЕРНУТЬ КАРТЫ
          </button>
          <style>@keyframes atlPulse{0%,100%{box-shadow:0 0 14px rgba(212,175,55,0.35)}50%{box-shadow:0 0 22px rgba(212,175,55,0.7)}}</style>
        ` : ''}

        ${isResult ? `
          <button onclick="AtlantisGame.continueAfterReveal()"
            style="width:100%;margin-top:8px;padding:12px;border-radius:10px;border:none;background:linear-gradient(135deg,#4ade80,#22c55e);color:#080808;font-size:14px;font-weight:800;cursor:pointer;font-family:Manrope,sans-serif;letter-spacing:1px;box-shadow:0 0 12px rgba(74,222,128,0.4)">
            Далее →
          </button>
        ` : ''}
      </div>
    `;
  }

  function renderEndGame() {
    const counts = {
      user: state.hands.user.length,
      rival: state.hands.rival.length,
      forces: state.hands.forces.length
    };
    const max = Math.max(counts.user, counts.rival, counts.forces);
    const winner = Object.keys(counts).find(k => counts[k] === max);
    return `
      <div style="padding:20px;text-align:center;background:linear-gradient(135deg,rgba(212,175,55,0.15),rgba(156,39,176,0.1));border:1px solid rgba(212,175,55,0.5);border-radius:16px;margin-bottom:12px">
        <div style="font-size:40px;margin-bottom:8px">👑</div>
        <div style="font-size:16px;color:#D4AF37;letter-spacing:2px;margin-bottom:8px;font-weight:700">ПАРТИЯ ЗАВЕРШЕНА</div>
        <div style="font-size:14px;color:var(--text);margin-bottom:10px">Победитель: <b style="color:${PARAM_LABELS.magic.color}">${PLAYERS[winner].icon} ${PLAYERS[winner].name}</b></div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">Карты на руках: Ты ${counts.user} · Противник ${counts.rival} · Высшие ${counts.forces}</div>
        <button onclick="AtlantisGame.start()" style="padding:10px 22px;background:linear-gradient(135deg,#E8C84A,#D4AF37);border:none;border-radius:10px;color:#080808;font-weight:700;cursor:pointer;font-family:Manrope,sans-serif">Играть снова</button>
      </div>
    `;
  }

  function renderMyHand() {
    const hand = state.hands.user;
    if (!hand.length) {
      return '<div style="text-align:center;padding:20px;color:var(--text-dim);font-size:12px">У тебя нет карт на руках</div>';
    }
    const isLay = state.phase === 'lay_cards';
    const isTie = state.phase === 'tiebreaker';
    const highlight = (isLay || isTie || state.phase === 'reveal') ? state.currentParam : null;

    return `
      <div style="padding:10px;background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.3);border-radius:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:13px;color:#D4AF37;font-weight:700">🧙 Твои карты (${hand.length})</div>
          ${!state.exchangeUsed.user && state.phase === 'choose_param' ? '<button onclick="AtlantisGame.promptExchange()" style="font-size:10px;padding:4px 8px;border-radius:8px;border:1px solid rgba(212,175,55,0.4);background:rgba(212,175,55,0.08);color:#D4AF37;cursor:pointer">🔄 Обмен (1/партию)</button>' : ''}
        </div>
        <div style="display:flex;gap:6px;overflow-x:auto;padding:4px 0">
          ${hand.map((c, i) => {
            const click = isLay ? 'AtlantisGame.layCard(' + i + ')'
              : isTie ? 'AtlantisGame.tiebreakerLay(' + i + ')'
              : '';
            return renderCard(c, { highlight, onClick: click });
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderLog() {
    if (!state.log.length) return '';
    const last5 = state.log.slice(-5).reverse();
    return `
      <div style="margin-top:10px;padding:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.06);border-radius:10px">
        <div style="font-size:10px;color:var(--text-muted);letter-spacing:1px;margin-bottom:4px">📜 Ход игры</div>
        ${last5.map(msg => '<div style="font-size:11px;color:var(--text-dim);line-height:1.5">· ' + msg + '</div>').join('')}
      </div>
    `;
  }

  function render() {
    const container = document.getElementById('game-content');
    if (!container) return;
    if (!state) { container.innerHTML = ''; return; }

    let topInfo = '';
    if (state.phase === 'ended') {
      topInfo = renderEndGame();
    } else {
      if (state.phase === 'choose_param') topInfo = renderChooseParam();
      else if (state.phase === 'lay_cards') topInfo = renderLayPhase();
      else if (state.phase === 'tiebreaker') topInfo = renderTiebreakerPhase();
      // В awaiting_reveal и reveal_result результаты показываются прямо в battlefield
    }

    container.innerHTML = `
      <div style="padding:10px 10px 40px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <button onclick="AtlantisGame.quit()" style="padding:5px 10px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-dim);font-size:10px;cursor:pointer">← Все игры</button>
          <div style="font-size:15px;color:#D4AF37;letter-spacing:2px;font-weight:700">🏛 АТЛАНТИДА</div>
          <div style="font-size:10px;color:var(--text-dim)">🎴 ${state.deck.length}</div>
        </div>
        ${renderOpponentRow('rival')}
        ${renderOpponentRow('forces')}
        ${renderBattlefield()}
        ${topInfo}
        ${renderMyHand()}
        ${renderLog()}
      </div>
    `;
  }

  // ===== ОБМЕН — UI-диалог =====
  function promptExchange() {
    if (state.phase !== 'choose_param' || state.exchangeUsed.user) return;
    if (!state.hands.user.length || !state.hands.rival.length) {
      if (typeof showToast === 'function') showToast('Нет карт для обмена', 'info');
      return;
    }
    // Показываем выбор своей карты для обмена
    const modalId = 'atlantis-exchange-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="background:linear-gradient(135deg,#0a0a0a,#111);border:1px solid rgba(212,175,55,0.4);border-radius:16px;padding:20px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto">
        <div style="font-size:14px;color:#D4AF37;font-weight:700;text-align:center;margin-bottom:10px">🔄 Какую свою карту обменять?</div>
        <div style="font-size:11px;color:var(--text-dim);text-align:center;margin-bottom:12px">Противник даст случайную взамен</div>
        <div style="display:flex;gap:6px;overflow-x:auto;padding:4px 0">
          ${state.hands.user.map((c, i) => renderCard(c, { onClick: 'AtlantisGame._doExchange(' + i + ')' })).join('')}
        </div>
        <button onclick="AtlantisGame._closeExchangeModal()" style="margin-top:10px;width:100%;padding:10px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,0.04);color:var(--text-dim);cursor:pointer">Отмена</button>
      </div>
    `;
    modal.style.display = 'flex';
  }

  function _closeExchangeModal() {
    const m = document.getElementById('atlantis-exchange-modal');
    if (m) m.style.display = 'none';
  }

  function _doExchange(idx) {
    _closeExchangeModal();
    exchangeCard(idx);
  }

  return {
    start,
    quit,
    chooseParam,
    layCard,
    flipCards,
    continueAfterReveal,
    tiebreakerLay,
    promptExchange,
    _doExchange,
    _closeExchangeModal
  };
})();
