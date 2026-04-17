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

  // Названия шагов + форма "пройден/пройдена/пройдено" с корректным родом.
  // (Жалобы тестеров: "Пробуждение пройден" — неправильно, должно быть "пройдено")
  const STEPS = [
    { num: 1, name: 'Пробуждение',       emoji: '🌅', unlocked: true, passed: 'пройдено' },
    { num: 2, name: 'Встреча с Тенью',   emoji: '⚔️', unlocked: true, passed: 'пройдена' },
    { num: 3, name: 'Загадка Зеркала',   emoji: '🔮', unlocked: true, passed: 'пройдена' },
    { num: 4, name: 'Испытание Огнём',   emoji: '💪', unlocked: true, passed: 'пройдено' },
    { num: 5, name: 'Погружение',        emoji: '🌊', unlocked: true, passed: 'пройдено' },
    { num: 6, name: 'Трансформация',     emoji: '⚡', unlocked: true, passed: 'пройдена' },
    { num: 7, name: 'Коронация',         emoji: '👑', unlocked: true, passed: 'пройдена' }
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

  let timerInterval = null;

  function startTimerCountdown(endTime) {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const remaining = endTime - Date.now();
      const timerEl = document.getElementById('hero-timer');
      if (!timerEl) { clearInterval(timerInterval); return; }

      if (remaining <= 0) {
        clearInterval(timerInterval);
        // Таймер истёк - показать кнопку "Готово"
        const block = document.getElementById('hero-timer-block');
        if (block) {
          block.innerHTML = `
            <div style="text-align:center;padding:20px">
              <div style="font-size:32px;margin-bottom:8px">🔥</div>
              <div style="font-size:14px;color:#4CAF50;margin-bottom:12px">Время вышло! Задание выполнено?</div>
              <button class="hero-btn hero-btn-primary" onclick="HeroJourney.completeFireTrial()">✅ Да, выполнено!</button>
              <button class="hero-btn hero-btn-secondary" onclick="HeroJourney.completeFireTrial()" style="margin-top:8px">Пропустить</button>
            </div>`;
        }
        return;
      }

      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      timerEl.textContent = h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
    }, 1000);
  }

  function completeFireTrial() {
    // Завершаем шаг Огня - отправляем как обычный выбор
    DarAPI.journeyAction(currentDarCode, { choice_index: 0, force_complete: true }).then(data => {
      currentJourney = data.journey;
      if (data.result === 'step_complete' || data.result === 'journey_complete') {
        const nextStep = data.next_step;
        const nextInfo = nextStep ? STEPS.find(s => s.num === nextStep) : null;
        const btnText = nextInfo ? `${nextInfo.emoji} К шагу: ${nextInfo.name}` : 'Далее';
        showVictory(data.victory_text, data.reward, () => {
          if (nextStep === 2 || nextStep === 6) { renderBattle(); }
          else { HeroJourney.render(currentDarCode); }
        }, btnText);
      }
    }).catch(err => {
      if (typeof showToast === 'function') showToast(err.message || 'Ошибка', 'error');
    });
  }

  // ---- ГЛАВНЫЙ РЕНДЕР ----

  function render(darCode, darName) {
    currentDarCode = darCode;
    const container = getContainer();
    if (!container) return;

    container.innerHTML = `
      <div class="hero-journey-loading">
        <div class="hero-loading-spinner"></div>
        <p id="hero-loading-text">Открываю врата путешествия...</p>
      </div>`;
    container.style.display = 'block';
    container.scrollTop = 0;

    // Анимированные фразы ожидания
    const loadingPhrases = [
      'Открываю врата путешествия...',
      'Настраиваю энергию дара...',
      'Призываю силы поля...',
      'Формирую твой путь...',
      'Почти готово...'
    ];
    let phraseIdx = 0;
    const phraseTimer = setInterval(() => {
      phraseIdx++;
      const el = document.getElementById('hero-loading-text');
      if (el && phraseIdx < loadingPhrases.length) {
        el.textContent = loadingPhrases[phraseIdx];
        el.classList.remove('animate-fade-in');
        void el.offsetWidth;
        el.classList.add('animate-fade-in');
      }
    }, 4000);
    const clearPhrases = () => clearInterval(phraseTimer);

    DarAPI.startJourney(darCode).then(data => {
      clearPhrases();
      currentJourney = data.journey;
      currentContent = data.step_content || (data.journey && data.journey.step_state);

      if (!currentJourney) {
        container.innerHTML = '<p style="text-align:center;padding:40px;color:#aaa">Не удалось начать путешествие</p>';
        return;
      }

      const step = currentJourney.step;
      const hasScenes = currentContent && currentContent.scenes;
      const hasBattle = currentContent && currentContent.hero_hp !== undefined;
      const completedSteps = currentJourney.completed_steps || [];

      // Сначала проверяем завершение путешествия, иначе после 7/7 снова
      // показывается шаг 7 "Коронация" (клятвы) при повторном входе.
      if (currentJourney.completed_at || completedSteps.length >= 7) {
        renderJourneyComplete();
      } else if ([1, 3, 4, 5, 7].includes(step) && hasScenes) {
        renderAwakening(); // Универсальный рендер для шагов со сценами
      } else if ((step === 2 || step === 6) || hasBattle) {
        renderBattle();
      } else {
        // Нужно загрузить контент для шага
        renderAwakening();
      }
    }).catch(err => {
      clearPhrases();
      container.innerHTML = `<p style="text-align:center;padding:40px;color:#ff6b6b">${err.message || 'Ошибка загрузки'}</p>
        <button class="hero-btn hero-btn-secondary" onclick="HeroJourney.render('${darCode}')">Попробовать снова</button>`;
    });
  }

  // ---- ПРОГРЕСС-БАР (7 шагов) ----

  function renderProgress(currentStep, completedSteps) {
    const completed = completedSteps || [];
    const doneSteps = STEPS.filter(s => completed.includes(s.num));
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
    <div class="hero-step-name">${STEPS[currentStep - 1]?.emoji || ''} ${STEPS[currentStep - 1]?.name || ''}</div>
    ${doneSteps.length > 0 ? `
      <div class="hero-done-toggle" onclick="this.nextElementSibling.classList.toggle('hero-done-open');this.textContent=this.nextElementSibling.classList.contains('hero-done-open')?'Скрыть пройденные ▲':'Пройдено: ${doneSteps.length} из 7 ▼'">
        Пройдено: ${doneSteps.length} из 7 ▼
      </div>
      <div class="hero-done-list">
        ${doneSteps.map(s => `<div class="hero-done-item">✓ ${s.emoji} ${s.name}</div>`).join('')}
      </div>
    ` : ''}`;
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
    const step = currentJourney?.step || 1;
    const isFireTrial = step === 4;

    // Проверяем активный таймер
    const timerEnd = state.timer_end;
    const timerActive = timerEnd && Date.now() < timerEnd;

    container.innerHTML = `
      <div class="hero-journey-screen" style="--field-color: ${color}">
        <div class="hero-header">
          <button class="hero-back-btn" onclick="HeroJourney.close()">←</button>
          <span class="hero-field-badge" style="background:${color}">${state.field_emoji || '✦'} ${state.field_name || ''}</span>
          <span class="hero-mechanic-tag">${mechanic}</span>
        </div>
        ${renderProgress(step, currentJourney?.completed_steps)}
        <div class="hero-world-intro">${state.world || ''}</div>
        <div class="hero-content animate-fade-in">
          ${sceneIdx === 0 && state.intro ? `<p class="hero-intro-text">${state.intro}</p>` : ''}
          ${state.instruction ? `<p style="text-align:center;color:#FFA500;font-size:13px;margin-bottom:12px;font-weight:bold">${state.instruction}</p>` : ''}
          <div class="hero-scene-text">${scene?.text || ''}</div>
          ${!isFireTrial ? `<div class="hero-scene-counter">Сцена ${sceneIdx + 1} из ${state.scenes.length}</div>` : ''}

          <div id="hero-choices-area"></div>
        </div>
      </div>`;

    // Рендерим выборы или таймер отдельно (избегаем вложенных template literals)
    const choicesArea = container.querySelector('#hero-choices-area');
    if (choicesArea) {
      if (timerActive) {
        choicesArea.innerHTML = '<div class="hero-timer-block" id="hero-timer-block"><div style="text-align:center;padding:20px"><div style="font-size:14px;color:var(--text);margin-bottom:8px">🔥 Задание выполняется...</div><div id="hero-timer" style="font-size:32px;color:#FF4500;font-weight:bold;font-family:monospace"></div><p style="color:#888;font-size:12px;margin-top:8px">Вернись когда выполнишь задание</p></div></div>';
        startTimerCountdown(timerEnd);
      } else {
        let btns = '';
        (scene?.choices || []).forEach(function(c, i) {
          const timerMin = c.timer_minutes || 0;
          const timerLabel = timerMin >= 1440 ? '1 день' : timerMin >= 60 ? Math.round(timerMin/60) + ' ч' : timerMin > 0 ? timerMin + ' мин' : '';
          const crystalReward = timerMin >= 1440 ? 25 : timerMin >= 60 ? 15 : timerMin > 0 ? 5 : 0;
          const labelEsc = (c.label || '').replace(/"/g, '&quot;');
          btns += '<button class="hero-choice-btn" onclick="HeroJourney.choose(' + i + ')" data-label="' + labelEsc + '" data-timer="' + timerMin + '" data-reward="' + crystalReward + '"' + (loading ? ' disabled' : '') + '>';
          btns += '<span class="hero-choice-label hero-choice-hidden">' + (c.label || c) + '</span>';
          btns += '<span class="hero-choice-desc">' + (c.desc || c.label || '') + '</span>';
          if (isFireTrial) {
            btns += '<div style="display:flex;gap:10px;margin-top:6px;justify-content:center">';
            if (timerLabel) btns += '<span class="hero-timer-badge">⏱ ' + timerLabel + '</span>';
            if (crystalReward) btns += '<span class="hero-crystal-badge">💎 +' + crystalReward + '</span>';
            btns += '</div>';
          }
          btns += '</button>';
        });
        choicesArea.innerHTML = '<div class="hero-choices">' + btns + '</div>';
      }
    }
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
    const darCode = currentDarCode;

    container.innerHTML = `
      <div class="hero-journey-screen">
        <div class="hero-header">
          <button class="hero-back-btn" onclick="HeroJourney.close()">←</button>
          <span>Путешествие завершено!</span>
        </div>
        ${renderProgress(7, completed)}
        <div class="hero-completed-info" style="padding:16px">
          <div style="text-align:center">
            <div style="font-size:48px;margin-bottom:12px">👑</div>
            <h3 style="color:var(--text);margin-bottom:8px">Путешествие пройдено!</h3>
            <div class="hero-reward-badge" style="margin-bottom:16px">💎 ${crystals} кристаллов заработано</div>
          </div>

          <div id="hero-analysis-area">
            <div class="hero-journey-loading" style="padding:20px">
              <div class="hero-loading-spinner"></div>
              <p>Наставник анализирует твой путь...</p>
            </div>
          </div>

          <div style="margin:16px 0">
            ${STEPS.map(s => `
              <div style="display:flex;align-items:center;gap:8px;padding:6px 0;color:${completed.includes(s.num) ? '#4CAF50' : '#666'}">
                <span>${completed.includes(s.num) ? '✓' : '○'}</span>
                <span>${s.emoji} ${s.name}</span>
              </div>
            `).join('')}
          </div>

          <button class="hero-btn hero-btn-secondary" onclick="HeroJourney.restart('${darCode}')" style="margin-bottom:8px">🔄 Пройти заново (другой путь)</button>
          <button class="hero-btn hero-btn-primary" onclick="HeroJourney.close()">Вернуться в Сокровищницу</button>
        </div>
      </div>`;
    scrollToTop();

    // Загружаем AI-анализ пути
    DarAPI.getJourneyAnalysis(darCode).then(data => {
      const area = document.getElementById('hero-analysis-area');
      if (area && data.analysis) {
        const paragraphs = String(data.analysis).split('\n').filter(p => p.trim()).map(p =>
          '<p style="margin-bottom:10px">' + p + '</p>'
        ).join('');
        area.innerHTML = `
          <div class="hero-analysis animate-fade-in">
            <div style="font-size:13px;color:#D4AF37;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;text-align:center">🔮 Слепок твоего пути</div>
            <div style="font-size:14px;color:var(--text);line-height:1.7">${paragraphs}</div>
          </div>`;
      }
    }).catch(() => {
      const area = document.getElementById('hero-analysis-area');
      if (area) area.innerHTML = '<p style="color:#666;text-align:center;font-size:13px">Не удалось загрузить анализ пути</p>';
    });
  }

  // ---- ДЕЙСТВИЯ ----

  function choose(index) {
    if (loading) return;
    loading = true;

    // Визуально отмечаем выбор и раскрываем название пути
    const buttons = document.querySelectorAll('.hero-choice-btn');
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === index) {
        btn.classList.add('hero-choice-selected');
        // Раскрываем скрытое название пути
        const labelEl = btn.querySelector('.hero-choice-label');
        if (labelEl) labelEl.classList.remove('hero-choice-hidden');
        // Показываем "Твоя точка сборки..." — заметнее и крупнее,
        // чтобы пользователь успел прочитать (было: мелкий серый текст внизу,
        // который быстро пролистывался автопереходом).
        const label = btn.getAttribute('data-label') || '';
        const pathMsg = document.createElement('div');
        pathMsg.className = 'hero-path-msg animate-fade-in';
        pathMsg.style.cssText = 'margin-top:14px;padding:14px;border:1px solid rgba(212,175,55,0.35);border-radius:12px;background:rgba(212,175,55,0.06);text-align:center';
        pathMsg.innerHTML = '<div style="font-size:13px;color:#D4AF37;letter-spacing:1px;margin-bottom:6px">&#10022; ТВОЯ ТОЧКА СБОРКИ</div>' +
          '<div style="font-size:16px;color:var(--text);font-weight:600;margin-bottom:6px">' + label + '</div>' +
          '<div style="font-size:12px;color:#999;line-height:1.5">Это не хорошо и не плохо. Это то, где ты сейчас.</div>';
        btn.parentElement.after(pathMsg);
      } else {
        btn.classList.add('hero-choice-dimmed');
        // Раскрываем названия и у остальных (чтобы видеть что было)
        const labelEl = btn.querySelector('.hero-choice-label');
        if (labelEl) { labelEl.classList.remove('hero-choice-hidden'); labelEl.style.opacity = '0.5'; }
      }
    });

    // Для Испытания Огнём - запускаем таймер
    const step = currentJourney?.step || 1;
    const selectedBtn = buttons[index];
    const timerMinutes = parseInt(selectedBtn?.getAttribute('data-timer') || '0');

    if (step === 4 && timerMinutes > 0) {
      // Сохраняем таймер на сервер и показываем обратный отсчёт
      const timerEnd = Date.now() + timerMinutes * 60 * 1000;
      DarAPI.journeyAction(currentDarCode, { choice_index: index, timer_end: timerEnd }).then(data => {
        loading = false;
        currentJourney = data.journey;
        currentContent = data.journey?.step_state;
        renderAwakening(); // Перерисует с таймером
        startTimerCountdown(timerEnd);
      }).catch(err => {
        loading = false;
        if (typeof showToast === 'function') showToast(err.message || 'Ошибка', 'error');
      });
      return;
    }

    // Фоном делаем API-запрос (чтобы не ждать сети после клика "Дальше"),
    // но переход к следующей сцене/шагу показываем ТОЛЬКО после того, как
    // пользователь сам нажмёт кнопку "Дальше →". Раньше был автопереход
    // через 1.5 сек — люди не успевали прочитать "точку сборки" и сюжет.
    let serverData = null;
    let serverError = null;
    let userReady = false;

    const applyTransition = () => {
      if (!serverData) return;
      const data = serverData;
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
            HeroJourney.render(currentDarCode);
          }
        }, btnText);
        return;
      }

      if (data.result === 'next_scene') {
        currentJourney = data.journey;
        currentContent = data.journey.step_state;
        scrollToTop();
        renderAwakening();
      }
    };

    // Добавляем кнопку "Дальше →" рядом с точкой сборки
    const addContinueButton = () => {
      if (document.getElementById('hero-continue-btn')) return;
      const msg = document.querySelector('.hero-path-msg');
      if (!msg) return;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'text-align:center;margin-top:14px';
      wrap.innerHTML = '<button id="hero-continue-btn" class="hero-btn hero-btn-primary" style="min-width:180px">Дальше &rarr;</button>';
      msg.after(wrap);
      const btn = document.getElementById('hero-continue-btn');
      btn.addEventListener('click', () => {
        userReady = true;
        btn.disabled = true;
        if (serverError) {
          if (typeof showToast === 'function') showToast(serverError, 'error');
          // Разблокируем выборы для повтора
          buttons.forEach(b => b.disabled = false);
          loading = false;
          return;
        }
        if (serverData) {
          applyTransition();
        } else {
          btn.textContent = 'Загрузка...';
        }
      });
    };

    // Показываем кнопку "Дальше" с небольшой задержкой чтобы юзер
    // успел увидеть анимацию выбора и прочитать точку сборки
    setTimeout(addContinueButton, 700);

    DarAPI.journeyAction(currentDarCode, { choice_index: index }).then(data => {
      loading = false;
      serverData = data;
      if (userReady) {
        applyTransition();
      } else {
        const btn = document.getElementById('hero-continue-btn');
        if (btn && btn.textContent === 'Загрузка...') btn.textContent = 'Дальше \u2192';
      }
    }).catch(err => {
      loading = false;
      serverError = err.message || 'Ошибка';
      const btn = document.getElementById('hero-continue-btn');
      if (btn) { btn.textContent = 'Попробовать снова'; btn.disabled = false; }
      if (userReady) {
        if (typeof showToast === 'function') showToast(serverError, 'error');
        buttons.forEach(btn => btn.disabled = false);
      }
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
        <h3>${stepInfo.name || 'Шаг'} ${stepInfo.passed || 'пройден'}!</h3>
        <p>${text || ''}</p>
        ${reward ? `<div class="hero-reward-badge">+${reward} 💎</div>` : ''}
        <button class="hero-btn hero-btn-primary hero-victory-continue-btn">${btnText || 'Далее'}</button>
      </div>`;
    container.appendChild(overlay);

    // Ищем кнопку ВНУТРИ overlay (используем класс, а не id —
    // на экране уже может быть кнопка "Дальше" с id='hero-continue-btn' от applyTransition,
    // и getElementById находил ту старую кнопку, из-за чего клик по victory-кнопке
    // не срабатывал и переход Пробуждение → Битва с Тенью "зависал".
    const btn = overlay.querySelector('.hero-victory-continue-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        overlay.remove();
        if (onContinue) onContinue();
        const c = getContainer();
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
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

  function restart(darCode) {
    // Сбрасываем путешествие на сервере и начинаем заново
    DarAPI.journeyAction(darCode || currentDarCode, { restart: true }).then(() => {
      currentJourney = null;
      currentContent = null;
      HeroJourney.render(darCode || currentDarCode);
    }).catch(err => {
      if (typeof showToast === 'function') showToast(err.message || 'Ошибка', 'error');
    });
  }

  return {
    render,
    choose,
    attack,
    retryBattle,
    restart,
    completeFireTrial,
    close
  };
})();
