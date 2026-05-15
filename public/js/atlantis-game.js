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
      tablesUsed: 0,
      exchangeUsed: { user: false, rival: false },
      phase: 'setup',
      currentParam: null,
      currentTurn: 'user',      // кто сейчас ходит (имеет право выбирать параметр)
      played: { user: [], rival: [], forces: [] },
      tieParticipants: [],      // участники текущего спора (при ничьей)
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
    injectStyles();
    resetState();
    state.deck = shuffle(buildDeck());
    state.hands.user = drawCards(4);
    state.hands.rival = drawCards(4);
    state.hands.forces = drawCards(4);
    state.currentTurn = 'user'; // первая партия — ходит юзер
    state.log.push('Партия началась. Первый ход твой.');
    startRound();
  }

  // Начало нового раунда.
  // ВАЖНО: currentTurn = только 'user' или 'rival'. Высшие Силы — банк,
  // не ходят, только докладывают карты в раунд.
  function startRound() {
    state.played = { user: [], rival: [], forces: [] };
    state.tieParticipants = [];
    state.currentParam = null;
    if (state.currentTurn === 'forces') state.currentTurn = 'user'; // safety
    if (state.currentTurn === 'user') {
      state.phase = 'choose_param';
      render();
      return;
    }
    // Ход противника: AI выбирает параметр + выкладывает свою карту
    const p = aiChooseParam('rival');
    state.currentParam = p;
    state.log.push(`Противник выбирает параметр: ${PARAM_LABELS[p].ru}`);
    answerRival();
    state.phase = 'lay_cards';
    autofillFromDeck('user');
    if (state.played.user.length >= needCardsPerPlayer()) {
      if (state.played.rival.length < needCardsPerPlayer()) answerRival();
      if (state.played.forces.length < needCardsPerPlayer()) answerForces();
      state.phase = 'awaiting_reveal';
    }
    render();
  }

  function switchTurnToOther() {
    state.currentTurn = state.currentTurn === 'user' ? 'rival' : 'user';
  }

  // AI выбирает параметр: ищет в руке наибольшее среднее по параметру
  function aiChooseParam(playerId) {
    const hand = state.hands[playerId];
    if (!hand.length) return 'magic';
    const params = ['magic', 'life', 'power'];
    let best = params[0];
    let bestAvg = -1;
    params.forEach(p => {
      const avg = hand.reduce((s, c) => s + c[p], 0) / hand.length;
      if (avg > bestAvg) { bestAvg = avg; best = p; }
    });
    // 20% шанс выбрать Мощность если рука позволяет
    if (hand.length >= 3 && Math.random() < 0.2) best = 'mightSum';
    return best;
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
    if (state.currentTurn !== 'user') return; // только когда ходит юзер
    state.currentParam = param;
    state.phase = 'lay_cards';
    state.log.push(`Ты выбираешь параметр: ${PARAM_LABELS[param].ru}`);
    autofillFromDeck('user');
    const need = needCardsPerPlayer();
    if (state.played.user.length >= need) {
      if (state.played.rival.length < need) answerRival();
      if (state.played.forces.length < need) answerForces();
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

    // Отвечают только те AI, кто ещё не сыграл (ходящий уже сыграл)
    if (state.played.rival.length < need) answerRival();
    if (state.played.forces.length < need) answerForces();
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
    // Учитываем ТОЛЬКО участников спора (tieParticipants) если идёт переигрывание —
    // те кто не в споре не меняют свои суммы по этому параметру в повторных раундах.
    // При первом раунде tieParticipants пуст, сравниваем всех.
    const participants = state.tieParticipants && state.tieParticipants.length
      ? state.tieParticipants.slice()
      : ['user', 'rival', 'forces'];

    const sums = {
      user: sumParam(state.played.user, p),
      rival: sumParam(state.played.rival, p),
      forces: sumParam(state.played.forces, p)
    };
    const relevantSums = participants.map(id => sums[id]);
    const max = Math.max.apply(null, relevantSums);
    const winners = participants.filter(id => sums[id] === max);

    if (winners.length === 1) {
      state._pendingWinner = winners[0];
      state._pendingTie = false;
      state._pendingTieParticipants = null;
      state.log.push(`${PLAYERS[winners[0]].name}: ${PARAM_LABELS[p].ru}=${sums[winners[0]]}`);
    } else {
      // Новая ничья — участвуют ТОЛЬКО те у кого максимум
      state._pendingWinner = null;
      state._pendingTie = true;
      state._pendingTieParticipants = winners;
      const names = winners.map(w => PLAYERS[w].name).join(' + ');
      state.log.push(`Спор: ${names} (${PARAM_LABELS[p].ru}=${max})`);
    }
    render();
  }

  // Пользователь нажал "Далее" после раскрытия — применяем результат раунда
  function continueAfterReveal() {
    if (state.phase !== 'reveal_result') return;
    if (state._pendingTie) {
      // Ничья → tiebreaker. Сохраняем список спорящих (только они докладывают).
      state.phase = 'tiebreaker';
      state.tieParticipants = state._pendingTieParticipants || [];
      state._pendingTie = false;
      state._pendingTieParticipants = null;
      render();
      return;
    }
    const winner = state._pendingWinner;
    if (!winner) return;
    const allCards = [...state.played.user, ...state.played.rival, ...state.played.forces];

    if (winner === 'forces') {
      // Высшие Силы = банк. Их "победа" — карты ОБРАТНО в общую колоду
      // (перемешиваются). Никто не забирает себе. Право хода переходит
      // к ДРУГОМУ игроку (не тому кто ходил в раунде).
      state.deck = shuffle(state.deck.concat(allCards));
      state.log.push(`✨ Высшие забирают все ${allCards.length} карт в общую колоду. Ход переходит.`);
      switchTurnToOther();
    } else {
      // Юзер или противник — забирает все карты себе
      state.hands[winner].push(...allCards);
      state.log.push(`${PLAYERS[winner].name} забирает ${allCards.length} карт — следующий ход его`);
      state.currentTurn = winner;
    }

    state.played = { user: [], rival: [], forces: [] };
    state._pendingWinner = null;
    state.tieParticipants = [];

    checkEndGame();
    if (state.phase !== 'ended') {
      replenishHandsTo4();
      startRound();
    } else {
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

  // В споре добавляют по ОДНОЙ карте только участники ничьей.
  // Остальные игроки наблюдают и карт больше не подкладывают.
  function tiebreakerLay(handIdx) {
    if (state.phase !== 'tiebreaker') return;
    const participants = state.tieParticipants || [];
    if (!participants.includes('user')) return; // юзер не в споре — кликать нельзя

    const card = state.hands.user[handIdx];
    if (!card) return;
    state.hands.user.splice(handIdx, 1);
    state.played.user.push(card);

    _tiebreakAnswer();
  }

  // Наблюдение: если юзер не в споре, по кнопке "Смотрю спор →" —
  // спорящие сами выкладывают свои карты, переход в awaiting_reveal.
  function watchTiebreaker() {
    if (state.phase !== 'tiebreaker') return;
    const participants = state.tieParticipants || [];
    if (participants.includes('user')) return; // юзер в споре, не должен использовать эту кнопку
    _tiebreakAnswer();
  }

  function _tiebreakAnswer() {
    const participants = state.tieParticipants || [];

    if (participants.includes('rival')) {
      if (state.hands.rival.length === 0 && state.deck.length > 0) {
        state.hands.rival.push(state.deck.pop());
      }
      if (state.hands.rival.length > 0) {
        const rcard = rivalChooseCardFor(state.currentParam, { player: 'rival' });
        if (rcard) {
          const idx = state.hands.rival.indexOf(rcard);
          if (idx >= 0) state.hands.rival.splice(idx, 1);
          state.played.rival.push(rcard);
        }
      }
    }

    if (participants.includes('forces')) {
      if (state.hands.forces.length === 0 && state.deck.length > 0) {
        state.hands.forces.push(state.deck.pop());
      }
      if (state.hands.forces.length > 0) {
        const shuffled = shuffle(state.hands.forces);
        const fcard = shuffled[0];
        const idx = state.hands.forces.indexOf(fcard);
        if (idx >= 0) state.hands.forces.splice(idx, 1);
        state.played.forces.push(fcard);
      }
    }

    state.phase = 'awaiting_reveal';
    render();
  }

  function checkEndGame() {
    const h = state.hands;
    const totalInHands = h.user.length + h.rival.length + h.forces.length;
    const deckEmpty = state.deck.length === 0;
    // Конец игры:
    //   1) у всех 0 карт — никто не может играть
    //   2) колода пуста И хотя бы у одного 0 карт (не может добрать)
    //   3) общая сумма карт < минимально нужной для 1 раунда (3 штуки)
    const someoneEmpty = h.user.length === 0 || h.rival.length === 0 || h.forces.length === 0;
    if (totalInHands === 0) {
      state.phase = 'ended';
      return;
    }
    if (deckEmpty && someoneEmpty) {
      state.phase = 'ended';
      return;
    }
    if (deckEmpty && totalInHands < 3) {
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
  // Инъекция CSS для физических юпик-карт (выполняется один раз)
  let _stylesInjected = false;
  function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;
    const css = `
      .phys-card {
        position: relative;
        width: 70px; aspect-ratio: 0.7;
        border-radius: 10px;
        overflow: hidden;
        border: 2px solid #D4AF37;
        box-shadow: 0 4px 16px rgba(0,0,0,0.6), 0 0 12px rgba(212,175,55,0.2);
        background: #000;
        flex-shrink: 0;
      }
      .phys-card img.card-art {
        width: 100%; height: 100%; object-fit: cover; display: block;
      }
      .phys-card .badge {
        position: absolute; font-size: 10px; font-weight: 900; line-height: 1;
        padding: 2px 5px; border-radius: 5px;
        background: rgba(0,0,0,0.88); border: 1px solid currentColor;
        text-shadow: 0 0 3px rgba(0,0,0,0.9);
        white-space: nowrap; z-index: 1;
      }
      .phys-card .b-might { top: 3px; left: 3px; color: #ef4444; font-size: 11px; }
      .phys-card .b-magic { top: 3px; right: 3px; color: #c084fc; }
      .phys-card .b-life  { bottom: 18px; left: 3px; color: #4ade80; }
      .phys-card .b-power { bottom: 18px; right: 3px; color: #f59e0b; }
      .phys-card .b-highlight {
        background: #000 !important;
        font-size: 14px !important;
        padding: 3px 7px !important;
        font-weight: 900 !important;
        z-index: 3 !important;
        border: 2px solid currentColor !important;
        box-shadow: 0 0 8px currentColor;
        text-shadow: none !important;
        letter-spacing: 0;
      }
      .phys-card .name-strip {
        position: absolute; bottom: 0; left: 0; right: 0;
        background: linear-gradient(180deg, transparent, rgba(0,0,0,0.95) 30%, rgba(0,0,0,1));
        padding: 12px 2px 4px;
        text-align: center;
        color: #ffd966;
        font-size: 10px; font-weight: 900;
        letter-spacing: 0.3px;
        text-shadow: 0 0 4px rgba(212,175,55,0.9), 0 1px 2px rgba(0,0,0,1);
        white-space: nowrap; overflow: hidden;
      }
      .phys-card.big { width: 110px; }
      .phys-card.big .badge { font-size: 12px; padding: 3px 6px; }
      .phys-card.big .b-highlight { font-size: 15px !important; padding: 4px 7px !important; }
      .phys-card.big .name-strip { font-size: 12px; padding: 16px 2px 6px; letter-spacing: 0.5px; }
      .phys-card.small {
        width: 56px; border-width: 1.5px; border-radius: 8px;
      }
      .phys-card.small .badge { font-size: 8px; padding: 1px 3px; border-radius: 3px; }
      .phys-card.small .b-might { font-size: 9px; }
      .phys-card.small .b-life, .phys-card.small .b-power { bottom: 16px; }
      .phys-card.small .b-highlight { font-size: 11px !important; padding: 2px 4px !important; border-width: 1.5px !important; }
      .phys-card.small .name-strip { font-size: 8px; padding: 10px 1px 3px; letter-spacing: 0; }
      .phys-card.clickable { cursor: pointer; transition: transform .15s, box-shadow .15s; }
      .phys-card.clickable:hover { transform: translateY(-4px); box-shadow: 0 8px 20px rgba(212,175,55,0.4); }
      .phys-card.selected { transform: translateY(-8px); box-shadow: 0 8px 25px rgba(212,175,55,0.7); border-color: #E8C84A; }
      .phys-card.dim { opacity: 0.5; }
      .atl-card-back {
        width: 52px; aspect-ratio: 0.7;
        background: linear-gradient(135deg, #0a0a2e 0%, #1a0a3e 100%);
        border: 1.5px solid #D4AF37; border-radius: 8px;
        display: flex; align-items: center; justify-content: center; padding: 3px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5), inset 0 0 10px rgba(212,175,55,0.1);
        background-image: url('images/caduceus-gold.png');
        background-size: 70%; background-repeat: no-repeat; background-position: center;
        flex-shrink: 0;
      }
      .atl-card-back.mini {
        width: 44px; border-radius: 6px; background-size: 75%;
      }
    `;
    const style = document.createElement('style');
    style.setAttribute('data-atlantis', '1');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function escapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Физическая карта с JPG юпика и параметрами в углах
  function renderCard(card, opts) {
    opts = opts || {};
    if (!card) return '';
    const highlight = opts.highlight || null;
    const size = opts.size || 'big'; // 'big' | 'small'
    const extraCls = (opts.onClick ? ' clickable' : '') + (opts.selected ? ' selected' : '') + (opts.dim ? ' dim' : '');
    const onClick = opts.onClick ? ' onclick="' + opts.onClick + '"' : '';

    const badge = (param, val) => {
      const lbl = PARAM_LABELS[param];
      const paramCls = param === 'mightSum' ? 'might' : param;
      const hlCls = highlight === param ? ' b-highlight' : '';
      return '<div class="badge b-' + paramCls + hlCls + '">' + lbl.icon + val + '</div>';
    };

    return '<div class="phys-card ' + size + extraCls + '"' + onClick + '>' +
      '<img class="card-art" src="cards/' + card.code + '.jpg" ' +
        'onerror="this.style.background=\'linear-gradient(135deg,#0a0a2e,#1a0a3e)\';this.removeAttribute(\'src\')" ' +
        'alt="' + escapeHtml(card.name) + '">' +
      badge('mightSum', card.mightSum) +
      badge('magic', card.magic) +
      badge('life', card.life) +
      badge('power', card.power) +
      '<div class="name-strip">' + escapeHtml(card.name) + '</div>' +
    '</div>';
  }

  function renderCardBack(size) {
    const cls = size === 'mini' ? 'atl-card-back mini' : 'atl-card-back';
    return '<div class="' + cls + '"></div>';
  }

  // В основной игре renderCardMini оставляем как обёртку для совместимости
  function renderCardMini(card, highlight) {
    return renderCard(card, { highlight, size: 'small' });
  }

  // Компактная строка: иконка + имя + количество карт.
  // Высшие Силы — не ходят (банк), у них всегда бейдж "БАНК".
  function renderOpponentRow(playerId) {
    const p = PLAYERS[playerId];
    const hand = state.hands[playerId];
    let badge = '';
    if (playerId === 'rival' && state.currentTurn === 'rival') {
      badge = '<span style="font-size:9px;color:#ff9800;background:rgba(255,152,0,0.15);border:1px solid rgba(255,152,0,0.4);border-radius:6px;padding:2px 6px;margin-left:6px;letter-spacing:1px">▶ ХОДИТ</span>';
    } else if (playerId === 'forces') {
      badge = '<span style="font-size:9px;color:#c084fc;background:rgba(156,39,176,0.15);border:1px solid rgba(156,39,176,0.4);border-radius:6px;padding:2px 6px;margin-left:6px;letter-spacing:1px">БАНК</span>';
    }
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:6px">
        <div style="font-size:12px;color:var(--text)">${p.icon} <b>${p.name}</b>${badge}</div>
        <div style="font-size:11px;color:var(--text-dim)">🎴 ${hand.length}</div>
      </div>
    `;
  }

  function renderChooseParam() {
    const params = ['magic', 'life', 'power', 'mightSum'];
    return `
      <div style="padding:8px 10px;background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.3);border-radius:10px;margin-bottom:8px">
        <div style="font-size:11px;color:#4ade80;text-align:center;margin-bottom:6px;letter-spacing:1px;font-weight:700">▶ ТВОЙ ХОД · ВЫБЕРИ ПАРАМЕТР</div>
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
    const turnInfo = state.currentTurn === 'user'
      ? '<div style="font-size:10px;color:#4ade80;letter-spacing:1px;font-weight:700;margin-bottom:4px">▶ ТВОЙ ХОД</div>'
      : '<div style="font-size:10px;color:#ff9800;letter-spacing:1px;font-weight:700;margin-bottom:4px">▶ ХОДИТ 🧝 ПРОТИВНИК — ОТВЕТЬ</div>';
    return `
      <div style="padding:12px;background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.3);border-radius:12px;margin-bottom:10px;text-align:center">
        ${turnInfo}
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:3px">Параметр сражения</div>
        <div style="font-size:18px;color:${paramLbl.color};font-weight:800;letter-spacing:2px">${paramLbl.icon} ${paramLbl.ru.toUpperCase()}</div>
        <div style="font-size:11px;color:var(--text);margin-top:4px">${laid >= need ? 'Все выложили' : 'Выложи карту ' + laid + '/' + need}</div>
      </div>
    `;
  }

  function renderTiebreakerPhase() {
    const paramLbl = PARAM_LABELS[state.currentParam];
    const participants = state.tieParticipants || [];
    const userInDispute = participants.includes('user');
    const names = participants.map(id => PLAYERS[id].icon + ' ' + PLAYERS[id].name).join(' ⚔ ');

    if (userInDispute) {
      return `
        <div style="padding:12px;background:rgba(255,152,0,0.08);border:1px solid rgba(255,152,0,0.4);border-radius:12px;margin-bottom:10px;text-align:center">
          <div style="font-size:13px;color:#ff9800;font-weight:700;margin-bottom:4px">⚖️ СПОР: ${names}</div>
          <div style="font-size:11px;color:var(--text-dim)">Выложи ещё одну карту (${paramLbl.icon} ${paramLbl.ru})</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Остальные участники наблюдают и карт не подкладывают</div>
        </div>
      `;
    }
    // Юзер не в споре — наблюдает
    return `
      <div style="padding:12px;background:rgba(156,39,176,0.08);border:1px solid rgba(156,39,176,0.4);border-radius:12px;margin-bottom:10px;text-align:center">
        <div style="font-size:13px;color:#c084fc;font-weight:700;margin-bottom:6px">⚖️ СПОР БЕЗ ТЕБЯ: ${names}</div>
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:10px">Твои карты больше не подкладываются. Наблюдай за спором.</div>
        <button onclick="AtlantisGame.watchTiebreaker()" style="padding:10px 20px;background:linear-gradient(135deg,#c084fc,#9c27b0);border:none;border-radius:10px;color:#fff;font-weight:700;cursor:pointer;font-family:Manrope,sans-serif;font-size:13px">👁 Смотреть спор →</button>
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

    const paramLbl = state.currentParam ? PARAM_LABELS[state.currentParam] : null;
    const p = state.currentParam;
    const isMight = p === 'mightSum';
    const cardSize = isMight ? 'small' : '';

    // Карты противника/Высших закрыты на ВСЕХ стадиях раунда.
    // Открываются только в reveal_result (после "Перевернуть").
    // Свои карты юзер видит всегда. При Мощности — компактные карты.
    const renderStack = (cards, isOwn) => {
      if (!cards.length) {
        return '<div style="font-size:9px;color:var(--text-muted);opacity:0.5;padding:20px 0">—</div>';
      }
      const shouldHide = !isOwn && !isResult;
      if (shouldHide) return cards.map(() => renderCardBack(isMight ? 'mini' : '')).join('');
      const sorted = p ? cards.slice().sort((a, b) => (b[p] || 0) - (a[p] || 0)) : cards;
      return sorted.map(c => renderCard(c, { highlight: p, size: cardSize || 'small' })).join('');
    };

    // Для reveal_result — подсвечиваем победителя
    let uSum = 0, rSum = 0, fSum = 0, maxSum = 0;
    let winnerLabel = '';
    if (isResult && p) {
      uSum = sumParam(state.played.user, p);
      rSum = sumParam(state.played.rival, p);
      fSum = sumParam(state.played.forces, p);
      maxSum = Math.max(uSum, rSum, fSum);
      const winners = [];
      // Правильные формы глагола: "Ты побеждаешь", "Противник побеждает", "Высшие побеждают"
      if (uSum === maxSum) winners.push('Ты побеждаешь!');
      if (rSum === maxSum) winners.push('Противник побеждает!');
      if (fSum === maxSum) winners.push('Высшие побеждают!');
      winnerLabel = winners.length === 1 ? winners[0] : '⚖️ Ничья';
    }

    const rowStyle = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;margin-bottom:4px';

    const makeRow = (iconName, label, sum, cards, isMe) => {
      const winBadge = (isResult && sum === maxSum) ? '<span style="color:#4ade80;font-weight:900;font-size:11px;margin-left:4px">★</span>' : '';
      const sumShow = isResult && p ? ` · ${paramLbl.icon}${sum}` : '';
      const bg = isResult && sum === maxSum ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.02)';
      const border = isResult && sum === maxSum ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.06)';
      // При Мощности (3 карты в ряд) — компактный лейбл чтобы всё помещалось
      const labelMinW = isMight ? 70 : 95;
      const labelFs = isMight ? 10 : 11;
      return `
        <div style="${rowStyle};background:${bg};border:${border}">
          <div style="font-size:${labelFs}px;color:${isMe ? '#D4AF37' : 'var(--text)'};min-width:${labelMinW}px;font-weight:${isMe ? 700 : 500}">${iconName} ${label}${sumShow}${winBadge}</div>
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
        ${makeRow('🧝', 'Противник', rSum, renderStack(state.played.rival, false), false)}
        ${makeRow('✨', 'Высшие', fSum, renderStack(state.played.forces, false), false)}
        ${makeRow('🧙', 'Ты', uSum, renderStack(state.played.user, true), true)}

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
    // Победитель финала — ТОЛЬКО между юзером и противником.
    // Высшие Силы — банк, они не соревнуются за победу.
    let titleText, titleColor, subtitle, emoji;
    if (counts.user > counts.rival) {
      titleText = 'ТЫ ПОБЕДИЛ(А)!';
      titleColor = '#4ade80';
      subtitle = 'Поздравляю, маг Атлантиды! 🏆';
      emoji = '🎉';
    } else if (counts.rival > counts.user) {
      titleText = 'ПРОТИВНИК ПОБЕДИЛ';
      titleColor = '#ff6b6b';
      subtitle = 'В следующий раз! Удачи тебе, маг.';
      emoji = '💫';
    } else {
      titleText = 'НИЧЬЯ';
      titleColor = '#D4AF37';
      subtitle = 'Силы равны — всё решится в следующей партии';
      emoji = '⚖️';
    }
    const max = Math.max(counts.user, counts.rival);

    // Конфетти-частицы (20 штук, рандомные цвета и позиции)
    const confettiColors = ['#E8C84A', '#4ade80', '#ff6b6b', '#c084fc', '#67e8f9', '#ff9800', '#e91e63'];
    let confetti = '';
    for (let i = 0; i < 30; i++) {
      const left = Math.random() * 100;
      const delay = Math.random() * 2;
      const duration = 2 + Math.random() * 2;
      const size = 6 + Math.random() * 8;
      const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
      const rotate = Math.random() * 720 - 360;
      confetti += `<div style="position:absolute;left:${left}%;top:-10px;width:${size}px;height:${size}px;background:${color};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};animation:atlConfetti ${duration}s ease-in ${delay}s infinite;transform:rotate(${rotate}deg);opacity:0.9;pointer-events:none"></div>`;
    }

    // Показываем бэкдроп-оверлей над полем
    return `
      <div id="atlantis-finale" style="position:relative;padding:30px 16px;text-align:center;background:radial-gradient(ellipse at center,rgba(212,175,55,0.2),rgba(10,10,10,0.95));border:2px solid ${titleColor};border-radius:18px;margin-bottom:12px;overflow:hidden;box-shadow:0 0 30px ${titleColor}55">
        <!-- Салют -->
        <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none">
          ${confetti}
        </div>
        <style>
          @keyframes atlConfetti {
            0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
            80%  { opacity: 1; }
            100% { transform: translateY(400px) rotate(720deg); opacity: 0; }
          }
          @keyframes atlTitle {
            0%   { transform: scale(0.3) rotate(-10deg); opacity: 0; }
            60%  { transform: scale(1.15) rotate(3deg); opacity: 1; }
            100% { transform: scale(1) rotate(0); opacity: 1; }
          }
          @keyframes atlShine {
            0%,100% { filter: drop-shadow(0 0 20px ${titleColor}); }
            50%     { filter: drop-shadow(0 0 40px ${titleColor}); }
          }
          .atl-emoji { animation: atlTitle 0.8s cubic-bezier(0.18,0.89,0.32,1.28), atlShine 2s ease-in-out 0.8s infinite; }
        </style>

        <div class="atl-emoji" style="font-size:64px;margin-bottom:8px;position:relative;z-index:2">${emoji}</div>
        <div class="atl-emoji" style="font-size:22px;color:${titleColor};letter-spacing:3px;margin-bottom:8px;font-weight:900;text-shadow:0 0 20px ${titleColor};position:relative;z-index:2">${titleText}</div>
        <div style="font-size:13px;color:var(--text);margin-bottom:16px;position:relative;z-index:2;font-style:italic">${subtitle}</div>

        <div style="display:flex;justify-content:space-around;margin:12px 0;padding:12px;background:rgba(0,0,0,0.4);border-radius:12px;position:relative;z-index:2">
          <div style="text-align:center;${counts.user > counts.rival ? 'color:#4ade80;font-weight:800' : 'color:var(--text-dim)'}">
            <div style="font-size:24px">🧙</div>
            <div style="font-size:10px;letter-spacing:1px;margin-top:2px">ТЫ</div>
            <div style="font-size:20px;font-weight:900;margin-top:2px">${counts.user}</div>
            ${counts.user > counts.rival ? '<div style="font-size:9px;color:#4ade80;font-weight:700">★ победитель</div>' : ''}
          </div>
          <div style="text-align:center;${counts.rival > counts.user ? 'color:#ff6b6b;font-weight:800' : 'color:var(--text-dim)'}">
            <div style="font-size:24px">🧝</div>
            <div style="font-size:10px;letter-spacing:1px;margin-top:2px">ПРОТИВНИК</div>
            <div style="font-size:20px;font-weight:900;margin-top:2px">${counts.rival}</div>
            ${counts.rival > counts.user ? '<div style="font-size:9px;color:#ff6b6b;font-weight:700">★ победитель</div>' : ''}
          </div>
          <div style="text-align:center;color:#c084fc;opacity:0.8">
            <div style="font-size:24px">✨</div>
            <div style="font-size:10px;letter-spacing:1px;margin-top:2px">ВЫСШИЕ (БАНК)</div>
            <div style="font-size:20px;font-weight:900;margin-top:2px">${counts.forces}</div>
          </div>
        </div>

        <button onclick="AtlantisGame.start()" style="padding:14px 30px;background:linear-gradient(135deg,#E8C84A,#D4AF37,#9A7B1A);border:none;border-radius:12px;color:#080808;font-weight:900;cursor:pointer;font-family:Manrope,sans-serif;font-size:15px;letter-spacing:2px;box-shadow:0 4px 20px rgba(212,175,55,0.4);position:relative;z-index:2">🔄 СЫГРАТЬ ЕЩЁ</button>
        <button onclick="AtlantisGame.quit()" style="margin-left:8px;padding:14px 20px;background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:12px;color:var(--text-dim);cursor:pointer;font-family:Manrope,sans-serif;font-size:13px;position:relative;z-index:2">← К играм</button>
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
    const highlight = (isLay || isTie || state.phase === 'reveal_result' || state.phase === 'awaiting_reveal') ? state.currentParam : null;

    // Сортируем карты в руке по выбранному параметру (убывание), сохраняя
    // настоящий индекс в исходной hand-массиве через data — чтобы клик работал
    // правильно даже при визуальной сортировке.
    const indexed = hand.map((c, i) => ({ c, i }));
    if (highlight) {
      indexed.sort((a, b) => (b.c[highlight] || 0) - (a.c[highlight] || 0));
    }

    // В tiebreaker если юзер не участвует в споре — клики по картам не активны
    const userInTieDispute = isTie && (state.tieParticipants || []).includes('user');
    const tieDim = isTie && !userInTieDispute;

    return `
      <div style="padding:10px;background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.3);border-radius:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:13px;color:#D4AF37;font-weight:700">🧙 Твои карты (${hand.length})${highlight ? ' · сорт. по ' + PARAM_LABELS[highlight].icon : ''}</div>
          ${!state.exchangeUsed.user && state.phase === 'choose_param' ? '<button onclick="AtlantisGame.promptExchange()" style="font-size:10px;padding:4px 8px;border-radius:8px;border:1px solid rgba(212,175,55,0.4);background:rgba(212,175,55,0.08);color:#D4AF37;cursor:pointer">🔄 Обмен (1/партию)</button>' : ''}
        </div>
        <div style="display:flex;gap:6px;overflow-x:auto;padding:4px 0;opacity:${tieDim ? '0.5' : '1'}">
          ${indexed.map(({ c, i }) => {
            const click = isLay ? 'AtlantisGame.layCard(' + i + ')'
              : (isTie && userInTieDispute) ? 'AtlantisGame.tiebreakerLay(' + i + ')'
              : '';
            return renderCard(c, { highlight, onClick: click, dim: tieDim, size: 'big' });
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
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px">
          <div style="font-size:15px;color:#D4AF37;letter-spacing:2px;font-weight:700;flex:1">🏛 АТЛАНТИДА</div>
          <button onclick="AtlantisGame.showRules()" style="padding:7px 12px;border-radius:10px;border:1.5px solid rgba(212,175,55,0.55);background:linear-gradient(135deg,rgba(212,175,55,0.15),rgba(212,175,55,0.08));color:#D4AF37;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0;box-shadow:0 0 8px rgba(212,175,55,0.2)">📜 Правила</button>
          <div style="font-size:10px;color:var(--text-dim);flex-shrink:0">🎴 ${state.deck.length}</div>
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
      if (typeof showToast === 'function') showToast(((window.i18n && i18n.t && i18n.t('atlantis.no_cards_to_swap')) || 'Нет карт для обмена'), 'info');
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
          ${state.hands.user.map((c, i) => renderCard(c, { onClick: 'AtlantisGame._doExchange(' + i + ')', size: 'big' })).join('')}
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

  // ===== ПРАВИЛА ИГРЫ =====
  function showRules() {
    injectStyles();
    const modalId = 'atlantis-rules-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);backdrop-filter:blur(4px);z-index:9500;display:flex;align-items:center;justify-content:center;padding:12px;overflow-y:auto';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="position:relative;background:linear-gradient(135deg,#0a0a0a,#141414);border:2px solid rgba(212,175,55,0.5);border-radius:18px;padding:20px 18px 16px;max-width:440px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 0 30px rgba(212,175,55,0.3)">
        <button onclick="AtlantisGame.closeRules()" style="position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:50%;border:1px solid rgba(212,175,55,0.5);background:rgba(0,0,0,0.6);color:#D4AF37;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">×</button>

        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:32px;margin-bottom:6px">🏛</div>
          <div style="font-size:18px;color:#D4AF37;letter-spacing:2px;font-weight:800">ЛЕГЕНДЫ АТЛАНТИДЫ</div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:3px;font-style:italic">Правила игры</div>
        </div>

        <div style="font-size:13px;color:var(--text);line-height:1.7">

          <div style="margin-bottom:14px;padding:10px;background:rgba(212,175,55,0.06);border-left:3px solid #D4AF37;border-radius:8px">
            <b style="color:#D4AF37">🎯 Цель:</b> набрать больше карт на руках, чем противник.
          </div>

          <div style="margin-bottom:10px"><b style="color:#D4AF37">🎴 Колода и игроки</b></div>
          <div style="margin-bottom:14px;padding-left:10px;font-size:12px;color:var(--text-dim)">
            • 64 карты, каждая — один из даров-юпиков<br>
            • Играют трое: <b style="color:#4ade80">Ты</b>, <b style="color:#ff9800">Противник</b> и <b style="color:#c084fc">Высшие Силы (банк)</b><br>
            • На старте у каждого по 4 карты
          </div>

          <div style="margin-bottom:10px"><b style="color:#D4AF37">💎 Параметры каждой карты</b></div>
          <div style="margin-bottom:14px;padding-left:10px;font-size:12px;color:var(--text-dim)">
            • <span style="color:#c084fc">🔮 Магия</span> — первая цифра кода<br>
            • <span style="color:#4ade80">💚 Жизнь</span> — вторая цифра<br>
            • <span style="color:#f59e0b">⚡ Сила</span> — третья цифра<br>
            • <span style="color:#ef4444">💥 Мощность</span> — сумма всех трёх
          </div>

          <div style="margin-bottom:10px"><b style="color:#D4AF37">▶ Ход игры</b></div>
          <div style="margin-bottom:14px;padding-left:10px;font-size:12px;color:var(--text-dim)">
            1. <b>Ходящий</b> выбирает параметр сражения (Магия / Жизнь / Сила / Мощность)<br>
            2. Все трое выкладывают карту закрытой рубашкой<br>
            3. Нажимаешь <b>«Перевернуть»</b> — карты раскрываются<br>
            4. У кого значение выбранного параметра выше — <b>забирает все карты со стола</b> себе<br>
            5. <b>Право следующего хода</b> переходит к победителю раунда
          </div>

          <div style="margin-bottom:10px"><b style="color:#ef4444">💥 Особый ход — Мощность</b></div>
          <div style="margin-bottom:14px;padding-left:10px;font-size:12px;color:var(--text-dim)">
            Каждый выкладывает <b>3 карты сразу</b>. Считается сумма Мощности всех трёх. Если карт не хватает — Высшие добирают из колоды сразу на стол.
          </div>

          <div style="margin-bottom:10px"><b style="color:#c084fc">✨ Высшие Силы — банк</b></div>
          <div style="margin-bottom:14px;padding-left:10px;font-size:12px;color:var(--text-dim)">
            Они не ходят как игрок, только докладывают карту в каждый раунд.<br>
            <b>Если побеждают Высшие</b> — все карты со стола уходят обратно в общую колоду, а право хода переходит <b>к другому игроку</b> (не к тому, кто ходил).
          </div>

          <div style="margin-bottom:10px"><b style="color:#ff9800">⚖️ Ничья — спор</b></div>
          <div style="margin-bottom:14px;padding-left:10px;font-size:12px;color:var(--text-dim)">
            Если у двоих одинаковый максимум — они <b>спорят</b>: докладывают ещё по одной карте. Остальные только наблюдают и карт больше не подкладывают. Победитель спора забирает <b>все</b> карты со стола.
          </div>

          <div style="margin-bottom:10px"><b style="color:#D4AF37">🔄 Обмен картами</b></div>
          <div style="margin-bottom:14px;padding-left:10px;font-size:12px;color:var(--text-dim)">
            Раз за партию можешь обменять свою карту на случайную карту противника.
          </div>

          <div style="margin-bottom:10px"><b style="color:#D4AF37">🎴 Добор</b></div>
          <div style="margin-bottom:14px;padding-left:10px;font-size:12px;color:var(--text-dim)">
            Между раундами Высшие Силы добирают из колоды карты всем, у кого на руках <b>меньше 4</b> — чтобы все вошли в новый раунд равными.
          </div>

          <div style="margin-top:16px;padding:10px;background:rgba(74,222,128,0.06);border-left:3px solid #4ade80;border-radius:8px">
            <b style="color:#4ade80">👑 Конец партии</b><br>
            <span style="font-size:12px;color:var(--text-dim)">Когда в колоде и на руках не остаётся достаточно карт для следующего раунда. Выигрывает тот из двоих (Ты или Противник), у кого больше карт на руках. Высшие Силы не участвуют в определении победителя.</span>
          </div>

        </div>

        <button onclick="AtlantisGame.closeRules()" style="margin-top:14px;width:100%;padding:12px;background:linear-gradient(135deg,#E8C84A,#D4AF37);border:none;border-radius:10px;color:#080808;font-weight:700;cursor:pointer;font-family:Manrope,sans-serif;font-size:14px">Понятно, играю!</button>
      </div>
    `;
    modal.style.display = 'flex';
  }

  function closeRules() {
    const m = document.getElementById('atlantis-rules-modal');
    if (m) m.style.display = 'none';
  }

  return {
    start,
    quit,
    chooseParam,
    layCard,
    flipCards,
    continueAfterReveal,
    tiebreakerLay,
    watchTiebreaker,
    promptExchange,
    showRules,
    closeRules,
    _doExchange,
    _closeExchangeModal
  };
})();
