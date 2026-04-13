/**
 * Путешествие Героя - интерактивный квест с 9 уникальными механиками по полям
 * Шаг 1: Пробуждение (уникально для каждого поля)
 * Шаг 2: Битва с Тенью (единая механика)
 */
const HeroJourney = (function() {
  'use strict';

  let currentJourney = null;
  let currentContent = null;
  let currentDarCode = null;
  let loading = false;

  // Названия шагов
  const STEPS = [
    { num: 1, name: 'Пробуждение', emoji: '🌅', unlocked: true },
    { num: 2, name: 'Встреча с Тенью', emoji: '⚔️', unlocked: true },
    { num: 3, name: 'Загадка Зеркала', emoji: '🔮', unlocked: true },
    { num: 4, name: 'Испытание Огнём', emoji: '💪', unlocked: true },
    { num: 5, name: 'Погружение', emoji: '🌊', unlocked: true },
    { num: 6, name: 'Трансформация', emoji: '⚡', unlocked: true },
    { num: 7, name: 'Коронация', emoji: '👑', unlocked: true }
  ];

  // Названия механик для UI
  const MECHANIC_NAMES = {
    strategy: 'RPG-стратегия',
    story: 'Ветвящийся сюжет',
    feelings: 'Диалог с душой',
    challenge: 'Огненный челлендж',
    riddle: 'Загадка-зеркало',
    ritual: 'Ритуал времени',
    message: 'Послание миров',
    constructor: 'Конструктор смысла',
    kaleidoscope: 'Калейдоскоп'
  };

  function getContainer() {
    return document.getElementById('hero-journey-container');
  }

  function scrollToTop() {
    const c = getContainer();
    if (c) c.scrollTop = 0;
  }

  // ---- ГЛАВНЫЙ РЕНДЕР ----

  function render(darCode, darName) {
    currentDarCode = darCode;
    const container = getContainer();
    if (!container) return;

    container.innerHTML = `
      <div class="hero-journey-loading">
        <div class="hero-loading-spinner"></div>
        <p>Открываю врата путешествия...</p>
      </div>`;
    container.style.display = 'block';
    container.scrollTop = 0;

    DarAPI.startJourney(darCode).then(data => {
      currentJourney = data.journey;
      currentContent = data.step_content || (data.journey && data.journey.step_state);

      if (!currentJourney) {
        container.innerHTML = '<p style="text-align:center;padding:40px;color:#aaa">Не удалось начать путешествие</p>';
        return;
      }

      const step = currentJourney.step;
      const hasScenes = currentContent && currentContent.scenes;
      const hasBattle = currentContent && currentContent.hero_hp !== undefined;

      if ([1, 3, 4, 5, 7].includes(step) && hasScenes) {
        renderAwakening(); // Универсальный рендер для шагов со сценами
      } else if ((step === 2 || step === 6) || hasBattle) {
        renderBattle();
      } else if (currentJourney.completed_at) {
        renderJourneyComplete();
      } else {
        // Нужно загрузить контент для шага
        renderAwakening();
      }
    }).catch(err => {
      container.innerHTML = `<p style="text-align:center;padding:40px;color:#ff6b6b">${err.message || 'Ошибка загрузки'}</p>
        <button class="hero-btn hero-btn-secondary" onclick="HeroJourney.render('${darCode}')">Попробовать снова</button>`;
    });
  }

  // ---- ПРОГРЕСС-БАР (7 шагов) ----

  function renderProgress(currentStep, completedSteps) {
    const completed = completedSteps || [];
    return `<div class="hero-progress">
      ${STEPS.map(s => {
        const done = completed.includes(s.num);
        const active = s.num === currentStep;
        const locked = !s.unlocked && !done;
        const cls = done ? 'done' : active ? 'active' : locked ? 'locked' : '';
        return `<div class="hero-step-dot ${cls}" title="${s.name}">
          <span>${done ? '✓' : locked ? '🔒' : s.emoji}</span>
        </div>`;
      }).join('<div class="hero-step-line"></div>')}
    </div>
    <div class="hero-step-name">${STEPS[currentStep - 1]?.emoji || ''} ${STEPS[currentStep - 1]?.name || ''}</div>`;
  }

  // ---- ШАГ 1: ПРОБУЖДЕНИЕ ----

  function renderAwakening() {
    const container = getContainer();
    const state = currentContent;
    if (!state || !state.scenes) return;

    const sceneIdx = state.current_scene || 0;
    const scene = state.scenes[sceneIdx];
    const mechanic = MECHANIC_NAMES[state.mechanic] || '';
    const color = state.field_color || '#D4AF37';

    container.innerHTML = `
      <div class="hero-journey-screen" style="--field-color: ${color}">
        <div class="hero-header">
          <button class="hero-back-btn" onclick="HeroJourney.close()">←</button>
          <span class="hero-field-badge" style="background:${color}">${state.field_emoji || '✦'} ${state.field_name || ''}</span>
          <span class="hero-mechanic-tag">${mechanic}</span>
        </div>
        ${renderProgress(1, currentJourney?.completed_steps)}
        <div class="hero-world-intro">${state.world || ''}</div>
        <div class="hero-content animate-fade-in">
          ${sceneIdx === 0 && state.intro ? `<p class="hero-intro-text">${state.intro}</p>` : ''}
          <div class="hero-scene-text">${scene?.text || ''}</div>
          <div class="hero-scene-counter">Сцена ${sceneIdx + 1} из ${state.scenes.length}</div>
          <div class="hero-choices">
            ${(scene?.choices || []).map((c, i) => `
              <button class="hero-choice-btn" onclick="HeroJourney.choose(${i})" ${loading ? 'disabled' : ''}>
                <span class="hero-choice-label">${c.label || c}</span>
                ${c.desc ? `<span class="hero-choice-desc">${c.desc}</span>` : ''}
              </button>
            `).join('')}
          </div>
        </div>
      </div>`;
    scrollToTop();
  }

  // ---- ШАГ 2: БИТВА С ТЕНЬЮ ----

  function renderBattle() {
    const container = getContainer();
    if (!container) { console.error('[HeroJourney] container not found'); return; }
    container.style.display = 'block';
    const state = currentJourney?.step_state || {};
    const heroHp = state.hero_hp ?? 100;
    const shadowHp = state.shadow_hp ?? 100;
    const round = state.round || 0;
    const history = state.history || [];
    const battleOver = state.battle_over || false;

    const fieldId = getFieldId(currentDarCode);
    const color = getFieldColor(fieldId);

    container.innerHTML = `
      <div class="hero-journey-screen" style="--field-color: ${color}">
        <div class="hero-header">
          <button class="hero-back-btn" onclick="HeroJourney.close()">←</button>
          <span class="hero-field-badge" style="background:${color}">⚔️ Битва с Тенью</span>
          <span class="hero-mechanic-tag">Раунд ${round}/5</span>
        </div>
        ${renderProgress(2, currentJourney?.completed_steps)}

        <div class="hero-battle-arena">
          <div class="hero-hp-bars">
            <div class="hero-hp-bar">
              <span class="hero-hp-label">🛡️ Герой</span>
              <div class="hero-hp-track">
                <div class="hero-hp-fill hero-hp-hero" style="width:${heroHp}%"></div>
              </div>
              <span class="hero-hp-num">${heroHp}</span>
            </div>
            <div class="hero-hp-bar">
              <span class="hero-hp-label">👤 Тень</span>
              <div class="hero-hp-track">
                <div class="hero-hp-fill hero-hp-shadow" style="width:${shadowHp}%"></div>
              </div>
              <span class="hero-hp-num">${shadowHp}</span>
            </div>
          </div>

          <div class="hero-battle-log">
            ${history.length === 0 && !battleOver ? `
              <div class="hero-battle-intro">
                <p>Тень твоего дара встаёт перед тобой.</p>
                <p>Чтобы победить её, отвечай честно и глубоко. Поверхностные ответы не причинят ей вреда.</p>
                <p><em>Что ты знаешь о своей тёмной стороне? Расскажи.</em></p>
              </div>
            ` : ''}
            ${history.map(h => `
              <div class="hero-battle-msg ${h.role === 'hero' ? 'hero-msg-hero' : 'hero-msg-shadow'}">
                <span class="hero-msg-label">${h.role === 'hero' ? '🛡️ Ты' : '👤 Тень'}</span>
                <p>${h.text}</p>
              </div>
            `).join('')}
          </div>

          ${battleOver ? renderBattleResult(state) : `
            <div class="hero-battle-input">
              <textarea id="hero-battle-answer" placeholder="Твой ответ Тени..." rows="3" ${loading ? 'disabled' : ''}></textarea>
              <button class="hero-btn hero-btn-attack" onclick="HeroJourney.attack()" ${loading ? 'disabled' : ''}>
                ${loading ? '⏳ Тень думает...' : '⚔️ Ударить ответом'}
              </button>
            </div>
          `}
        </div>
      </div>`;

    scrollToTop();
    // Скроллим лог битвы к последнему сообщению
    const log = container.querySelector('.hero-battle-log');
    if (log) setTimeout(() => log.scrollTop = log.scrollHeight, 100);
  }

  function renderBattleResult(state) {
    const heroWon = state.hero_won;
    const nextStep = currentJourney?.step;
    const nextInfo = nextStep ? STEPS.find(s => s.num === nextStep) : null;
    return `
      <div class="hero-battle-result ${heroWon ? 'hero-won' : 'hero-lost'}">
        <div class="hero-result-emoji">${heroWon ? '🏆' : '💫'}</div>
        <h3>${heroWon ? 'Тень побеждена!' : 'Тень оказалась сильнее...'}</h3>
        <p>${heroWon
          ? 'Ты заглянул в свою тёмную сторону и не отвернулся. Тень стала частью твоей силы.'
          : 'Не страшно. Тень всегда будет ждать. Ты можешь вернуться, когда будешь готов.'
        }</p>
        ${heroWon ? `<div class="hero-reward-badge">+${currentJourney?.crystals_earned || 0} кристаллов</div>` : ''}
        ${heroWon && nextInfo ? `
          <button class="hero-btn hero-btn-primary" onclick="HeroJourney.render('${currentDarCode}')">
            ${nextInfo.emoji} Далее: ${nextInfo.name}
          </button>
        ` : `
          <button class="hero-btn hero-btn-primary" onclick="HeroJourney.close()">
            ${heroWon ? 'Завершить' : 'Вернуться'}
          </button>
        `}
        ${!heroWon ? `<button class="hero-btn hero-btn-secondary" onclick="HeroJourney.retryBattle()">Попробовать снова</button>` : ''}
      </div>`;
  }

  // ---- ЗАВЕРШЁННОЕ ПУТЕШЕСТВИЕ ----

  function renderJourneyComplete() {
    const container = getContainer();
    if (!container) return;
    container.style.display = 'block';
    const completed = currentJourney?.completed_steps || [];
    const crystals = currentJourney?.crystals_earned || 0;

    container.innerHTML = `
      <div class="hero-journey-screen">
        <div class="hero-header">
          <button class="hero-back-btn" onclick="HeroJourney.close()">←</button>
          <span>Путешествие завершено!</span>
        </div>
        ${renderProgress(7, completed)}
        <div class="hero-completed-info" style="text-align:center;padding:24px">
          <div style="font-size:48px;margin-bottom:12px">👑</div>
          <h3 style="color:var(--text);margin-bottom:8px">Путешествие пройдено!</h3>
          <p style="color:#aaa;margin-bottom:16px">Ты прошёл все 7 шагов и раскрыл силу своего дара</p>
          <div class="hero-reward-badge" style="margin-bottom:16px">💎 ${crystals} кристаллов заработано</div>
          <div style="margin-bottom:16px">
            ${STEPS.map(s => `
              <div style="display:flex;align-items:center;gap:8px;padding:6px 0;color:${completed.includes(s.num) ? '#4CAF50' : '#666'}">
                <span>${completed.includes(s.num) ? '✓' : '○'}</span>
                <span>${s.emoji} ${s.name}</span>
              </div>
            `).join('')}
          </div>
          <button class="hero-btn hero-btn-primary" onclick="HeroJourney.close()">Вернуться в Сокровищницу</button>
        </div>
      </div>`;
    scrollToTop();
  }

  // ---- ДЕЙСТВИЯ ----

  function choose(index) {
    if (loading) return;
    loading = true;

    // Визуально отмечаем выбор
    const buttons = document.querySelectorAll('.hero-choice-btn');
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === index) btn.classList.add('hero-choice-selected');
      else btn.classList.add('hero-choice-dimmed');
    });

    DarAPI.journeyAction(currentDarCode, { choice_index: index }).then(data => {
      loading = false;

      if (data.result === 'step_complete' || data.result === 'journey_complete') {
        currentJourney = data.journey;
        const nextStep = data.next_step;
        const nextStepInfo = nextStep ? STEPS.find(s => s.num === nextStep) : null;
        const btnText = data.result === 'journey_complete'
          ? '👑 Путешествие завершено!'
          : nextStepInfo
            ? `${nextStepInfo.emoji} К шагу: ${nextStepInfo.name}`
            : 'Далее';

        showVictory(data.victory_text, data.reward, () => {
          if (data.result === 'journey_complete') {
            renderJourneyComplete();
          } else if (nextStep === 2 || nextStep === 6) {
            renderBattle();
          } else {
            // Загрузить контент для следующего шага
            HeroJourney.render(currentDarCode);
          }
        }, btnText);
        return;
      }

      if (data.result === 'next_scene') {
        currentJourney = data.journey;
        currentContent = data.journey.step_state;
        scrollToTop();
        setTimeout(() => renderAwakening(), 300);
      }
    }).catch(err => {
      loading = false;
      buttons.forEach(btn => btn.disabled = false);
      if (typeof showToast === 'function') showToast(err.message || 'Ошибка', 'error');
    });
  }

  function attack() {
    const textarea = document.getElementById('hero-battle-answer');
    if (!textarea) return;
    const answer = textarea.value.trim();
    if (answer.length < 10) {
      if (typeof showToast === 'function') showToast('Напиши хотя бы пару предложений', 'warning');
      return;
    }

    loading = true;
    const btn = document.querySelector('.hero-btn-attack');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Тень думает...'; }
    textarea.disabled = true;

    DarAPI.journeyAction(currentDarCode, { answer }).then(data => {
      loading = false;
      currentJourney = data.journey;

      if (data.result === 'battle_won' || data.result === 'battle_lost') {
        // Показываем результат в анимации
        animateBattleHit(data, () => {
          renderBattle();
        });
        return;
      }

      if (data.result === 'battle_continues') {
        animateBattleHit(data, () => {
          renderBattle();
        });
      }
    }).catch(err => {
      loading = false;
      if (btn) { btn.disabled = false; btn.textContent = '⚔️ Ударить ответом'; }
      if (textarea) textarea.disabled = false;
      if (typeof showToast === 'function') showToast(err.message || 'Ошибка', 'error');
    });
  }

  function retryBattle() {
    // Сбрасываем битву
    DarAPI.startJourney(currentDarCode).then(data => {
      currentJourney = data.journey;
      // Принудительно ставим шаг 2
      currentJourney.step = 2;
      currentJourney.step_state = { hero_hp: 100, shadow_hp: 100, round: 0, history: [] };
      renderBattle();
    });
  }

  // ---- АНИМАЦИИ ----

  function showVictory(text, reward, onContinue, btnText) {
    const container = getContainer();
    const stepInfo = STEPS.find(s => s.num === (currentJourney?.step - 1)) || {};
    const overlay = document.createElement('div');
    overlay.className = 'hero-victory-overlay animate-fade-in';
    overlay.innerHTML = `
      <div class="hero-victory-card">
        <div class="hero-victory-emoji">${stepInfo.emoji || '✨'}</div>
        <h3>${stepInfo.name || 'Шаг'} пройден!</h3>
        <p>${text || ''}</p>
        ${reward ? `<div class="hero-reward-badge">+${reward} 💎</div>` : ''}
        <button class="hero-btn hero-btn-primary" id="hero-continue-btn">${btnText || 'Далее'}</button>
      </div>`;
    container.appendChild(overlay);

    document.getElementById('hero-continue-btn').addEventListener('click', () => {
      overlay.remove();
      if (onContinue) onContinue();
      // Скроллим к контейнеру чтобы битва была видна
      const c = getContainer();
      if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function animateBattleHit(data, onDone) {
    const battle = data.battle || {};
    const score = battle.score || {};

    // Быстрая анимация удара
    const arena = document.querySelector('.hero-battle-arena');
    if (arena) arena.classList.add('hero-shake');
    setTimeout(() => {
      if (arena) arena.classList.remove('hero-shake');
      if (onDone) onDone();
    }, 500);
  }

  // ---- УТИЛИТЫ ----

  function getFieldId(darCode) {
    const parts = String(darCode).split('-');
    return parseInt(parts[2]) || 1;
  }

  function getFieldColor(fieldId) {
    const colors = {
      1: '#8B7355', 2: '#87CEEB', 3: '#4169E1', 4: '#FF4500',
      5: '#FFD700', 6: '#20B2AA', 7: '#9370DB', 8: '#708090', 9: '#E6E6FA'
    };
    return colors[fieldId] || '#D4AF37';
  }

  function close() {
    const container = getContainer();
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
    currentJourney = null;
    currentContent = null;
    currentDarCode = null;
  }

  return {
    render,
    choose,
    attack,
    retryBattle,
    close
  };
})();
