/**
 * Сокровищница — коллекция 64 даров
 * Показывает сетку всех даров, разгруппированных по полям
 * Закрытые — с замочком, открытые — со свечением
 */

const Treasury = (function() {
  let userDars = []; // [{dar_code, unlock_source, unlocked_sections}]
  let userDarCode = null; // Личный дар пользователя

  // Названия даров (из глобальной переменной DARS)
  function getDarName(code) { return window.DARS?.[code] || code; }
  function getDarArchetype(code) { return window.DAR_ARCHETYPES?.[code] || ''; }

  // Группировка по полю (КУН = 3-я цифра кода)
  function getFieldId(code) { return parseInt(code.split('-')[2]); }

  const FIELD_NAMES = {
    1:'ЛОГОС', 2:'НИМА', 3:'АНДРА', 4:'ЗИНГРА',
    5:'ЛУБА', 6:'ТУМА', 7:'АСТРА', 8:'БИТРА', 9:'ОМА'
  };

  const FIELD_COLORS = {
    1:'#e74c3c', 2:'#87ceeb', 3:'#2ecc71', 4:'#f39c12',
    5:'#ffffff', 6:'#1a1a4e', 7:'#9b59b6', 8:'#5dade2', 9:'#e8d5ff'
  };

  function init(dars, ownDarCode) {
    userDars = dars || [];
    userDarCode = ownDarCode;
  }

  function isUnlocked(code) {
    return userDars.some(d => d.dar_code === code);
  }

  function getUnlockedSections(code) {
    const d = userDars.find(d => d.dar_code === code);
    return d ? d.unlocked_sections : 0;
  }

  function render() {
    const container = document.getElementById('treasury-content');
    if (!container) return;

    const allDars = window.DARS || {};
    const totalUnlocked = userDars.length;
    const total = Object.keys(allDars).length;

    // Прогресс-бар
    const pct = Math.round((totalUnlocked / total) * 100);
    let html = `
      <div class="treasury-header">
        <div class="treasury-progress-label">${totalUnlocked} / ${total} даров открыто</div>
        <div class="treasury-progress-bar">
          <div class="treasury-progress-fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;

    // Группировка по полям
    const groups = {};
    for (let i = 1; i <= 9; i++) groups[i] = [];
    Object.entries(allDars).forEach(([code, name]) => {
      groups[getFieldId(code)].push({ code, name });
    });

    for (let fieldId = 1; fieldId <= 9; fieldId++) {
      const fieldDars = groups[fieldId];
      const fieldUnlocked = fieldDars.filter(d => isUnlocked(d.code)).length;

      html += `
        <div class="treasury-field">
          <div class="treasury-field-header">
            <span class="treasury-field-name">${FIELD_NAMES[fieldId]}</span>
            <span class="treasury-field-count">${fieldUnlocked}/${fieldDars.length}</span>
          </div>
          <div class="treasury-grid">
      `;

      fieldDars.forEach(d => {
        const unlocked = isUnlocked(d.code);
        const isOwn = d.code === userDarCode;
        const cls = [
          'treasury-card',
          unlocked ? 'treasury-unlocked' : 'treasury-locked',
          isOwn ? 'treasury-own' : ''
        ].join(' ');

        if (unlocked) {
          const sections = getUnlockedSections(d.code);
          html += `
            <div class="${cls}" onclick="Treasury.openDar('${d.code}')">
              <div class="treasury-card-icon">${isOwn ? '&#11088;' : '&#10024;'}</div>
              <div class="treasury-card-name">${d.name}</div>
              <div class="treasury-card-sections">${sections}/9</div>
            </div>`;
        } else {
          html += `
            <div class="${cls}">
              <div class="treasury-card-icon">&#128274;</div>
              <div class="treasury-card-name">???</div>
            </div>`;
        }
      });

      html += '</div></div>';
    }

    // Кнопка "Открыть случайный дар"
    html += `
      <div style="text-align:center;margin:20px 0">
        <button class="btn btn-secondary" onclick="Treasury.unlockRandom()" id="btn-unlock-random">
          &#128142; Открыть случайный дар (20 кристаллов)
        </button>
      </div>
    `;

    container.innerHTML = html;
  }

  function openDar(code) {
    const name = getDarName(code);
    const arch = getDarArchetype(code);
    const sections = getUnlockedSections(code);
    const container = document.getElementById('treasury-content');

    const SECTION_NAMES = [
      '&#128302; Суть Дара',
      '&#9881; Энергетический Рисунок',
      '&#9728; Световая Сила',
      '&#127761; Тень Дара',
      '&#128736; Активация Дара',
      '&#129496; Медитация',
      '&#128161; Сфера Применения',
      '&#9888; Техника Безопасности',
      '&#10024; Атрибуты и Якоря'
    ];

    let html = `
      <button class="btn-back" style="display:block" onclick="Treasury.render()">&#8592; Сокровищница</button>
      <div style="text-align:center;margin:16px 0">
        <div style="font-size:20px;letter-spacing:2px;color:var(--text)">${name}</div>
        <div style="font-size:13px;color:var(--text-dim);font-style:italic;margin-top:4px">${arch}</div>
        <div style="font-size:12px;color:#D4AF37;margin-top:8px">${sections}/9 секций открыто</div>
      </div>
      <div class="dar-sections-list">
    `;

    for (let i = 1; i <= 9; i++) {
      if (i <= sections) {
        // Открытая секция
        html += `
          <div class="dar-section-item dar-section-unlocked" onclick="Treasury.viewSection('${code}', ${i})">
            <span>${SECTION_NAMES[i-1]}</span>
            <span style="color:#2ecc71">&#10003;</span>
          </div>`;
      } else if (i === sections + 1) {
        // Следующая для открытия
        html += `
          <div class="dar-section-item dar-section-next" onclick="Treasury.tryUnlockSection('${code}', ${i})">
            <span>${SECTION_NAMES[i-1]}</span>
            <span style="color:#D4AF37">&#128142; 5</span>
          </div>`;
      } else {
        // Заблокирована
        html += `
          <div class="dar-section-item dar-section-locked">
            <span>${SECTION_NAMES[i-1]}</span>
            <span style="color:var(--text-muted)">&#128274;</span>
          </div>`;
      }
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // Кэш контента
  const sectionCache = {}; // "code:index" -> {title, content, quest}

  async function viewSection(code, sectionIndex) {
    const container = document.getElementById('treasury-content');
    const name = getDarName(code);
    const arch = getDarArchetype(code);

    // Показать загрузку
    container.innerHTML = `
      <button class="btn-back" style="display:block" onclick="Treasury.openDar('${code}')">&#8592; ${name}</button>
      <div style="text-align:center;padding:40px 0">
        <div style="font-size:32px;margin-bottom:12px;animation:pulse 1.5s infinite">&#10024;</div>
        <div style="color:var(--text-dim);font-size:14px">Генерирую мудрость...</div>
        <div style="color:var(--text-muted);font-size:12px;margin-top:8px">Это может занять несколько секунд</div>
      </div>
      <style>@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}</style>
    `;

    // Проверить локальный кэш
    const cacheKey = code + ':' + sectionIndex;
    let title, content, quest;

    if (sectionCache[cacheKey]) {
      title = sectionCache[cacheKey].title;
      content = sectionCache[cacheKey].content;
      quest = sectionCache[cacheKey].quest;
    } else {
      // Запросить у AI через API
      try {
        const result = await DarAPI.getSection(code, sectionIndex, name, arch);
        title = result.title;
        content = result.content;
        quest = result.quest;
      } catch(e) {
        title = `Секция ${sectionIndex}`;
        content = 'Не удалось загрузить контент. Попробуйте позже.';
        quest = null;
      }

      // Fallback: если API не вернул задание — генерируем дефолтное
      if (!quest) {
        const defaultQuests = {
          1: { question: 'Как суть этого дара проявляется в вашей повседневной жизни? Приведите конкретный пример.', hint: 'Вспомните ситуацию за последнюю неделю.', type: 'reflection', min_length: 30, crystals: 3 },
          2: { question: 'Закройте глаза и почувствуйте своё тело. Где вы ощущаете энергию дара? Опишите ощущения.', hint: 'Обратите внимание на тепло, покалывание, пульсацию.', type: 'body_practice', min_length: 30, crystals: 5 },
          3: { question: 'Вспомните момент, когда сила вашего дара проявилась ярче всего. Что вы чувствовали?', hint: 'Это мог быть момент вдохновения, ясности или глубокого покоя.', type: 'reflection', min_length: 50, crystals: 5 },
          4: { question: 'Когда вы замечали, что ваш дар проявлялся через тень? Что происходило?', hint: 'Тень — это не плохо, это сигнал к осознанности.', type: 'shadow_work', min_length: 80, crystals: 7 },
          5: { question: 'Выполните практику активации и опишите свои ощущения до и после.', hint: 'Будьте внимательны к малейшим изменениям состояния.', type: 'practice', min_length: 30, crystals: 5 },
          6: { question: 'Проведите медитацию по описанию. Какие образы и чувства пришли к вам?', hint: 'Не оценивайте — просто наблюдайте и записывайте.', type: 'meditation', min_length: 50, crystals: 7 },
          7: { question: 'В какой сфере жизни вы уже применяете свой дар? Как вы можете усилить это?', hint: 'Подумайте о работе, отношениях, творчестве.', type: 'life_application', min_length: 50, crystals: 5 },
          8: { question: 'Какие из зон риска вы узнаёте в своей жизни? Что можно изменить?', hint: 'Честность с собой — первый шаг к безопасности.', type: 'awareness', min_length: 50, crystals: 5 },
          9: { question: 'Напишите итоговую рефлексию: что вы узнали о себе, изучая этот дар? Какие инсайты получили?', hint: 'Это ваш личный путь — он уникален.', type: 'integration', min_length: 100, crystals: 10 }
        };
        quest = defaultQuests[sectionIndex] || defaultQuests[1];
      }

      sectionCache[cacheKey] = { title, content, quest };
    }

    let html = `
      <button class="btn-back" style="display:block" onclick="Treasury.openDar('${code}')">&#8592; ${name}</button>
      <div style="text-align:center;margin:16px 0">
        <div style="font-size:18px;color:var(--text);letter-spacing:1px">${title}</div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:16px">
        <p style="font-size:14px;line-height:1.8;color:#e0e0e0">${content}</p>
      </div>
    `;

    // Показать адаптивное задание от AI
    if (quest) {
      html += `
        <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:18px;margin-bottom:16px">
          <div style="font-size:14px;color:#D4AF37;margin-bottom:10px;font-weight:bold">&#128221; Задание</div>
          <p style="font-size:14px;color:var(--text);line-height:1.7;margin-bottom:6px">${quest.question}</p>
          ${quest.hint ? `<p style="font-size:12px;color:var(--text-dim);font-style:italic;margin-bottom:14px">&#128161; ${quest.hint}</p>` : ''}
          <textarea id="quest-answer" rows="5" style="width:100%;padding:12px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:Georgia,serif;font-size:14px;resize:vertical;line-height:1.6" placeholder="Напишите свой ответ..."></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <span style="font-size:11px;color:var(--text-muted)">Мин. ${quest.min_length} символов</span>
            <span style="font-size:12px;color:#D4AF37">+${quest.crystals} &#128142;</span>
          </div>
          <button class="btn btn-secondary" style="margin-top:10px" onclick="Treasury.submitQuest('${code}', ${sectionIndex}, '${quest.type}', ${quest.min_length}, ${quest.crystals})">
            Отправить ответ
          </button>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  async function submitQuest(code, sectionIndex, questType, minLength, crystalsReward) {
    const answer = document.getElementById('quest-answer')?.value?.trim();

    if (!answer || answer.length < (minLength || 10)) {
      alert(`Ответ слишком короткий. Минимум ${minLength || 10} символов, сейчас ${answer?.length || 0}.`);
      return;
    }

    // Попробовать отправить на сервер
    try {
      const result = await DarAPI.submitQuest(code, sectionIndex, questType || 'reflection', answer);
      if (result.crystals_earned) {
        CrystalsUI.animateEarn(result.crystals_earned);
      }
    } catch(e) {
      // Offline fallback — начислить локально
      CrystalsUI.animateEarn(crystalsReward || 3);
    }

    // Сохранить в localStorage как backup
    const key = '_quest_' + code + '_' + sectionIndex;
    localStorage.setItem(key, JSON.stringify({ answer, date: new Date().toISOString() }));

    alert(`Задание выполнено! +${crystalsReward || 3} кристаллов мудрости`);
    openDar(code);
  }

  async function tryUnlockSection(code, sectionIndex) {
    const cost = 5;
    if (CrystalsUI.getBalance() < cost) {
      alert(`Недостаточно кристаллов! Нужно ${cost}, у вас ${CrystalsUI.getBalance()}`);
      return;
    }
    if (!confirm(`Открыть секцию ${sectionIndex} за ${cost} кристаллов?`)) return;

    try {
      const result = await DarAPI.unlockSection(code, sectionIndex);
      CrystalsUI.animateSpend(result.crystals_spent);

      // Обновить локальные данные
      const d = userDars.find(d => d.dar_code === code);
      if (d) d.unlocked_sections = result.unlocked_sections;

      openDar(code); // Перерисовать
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  }

  async function unlockRandom() {
    const cost = 20;
    if (CrystalsUI.getBalance() < cost) {
      alert(`Недостаточно кристаллов! Нужно ${cost}, у вас ${CrystalsUI.getBalance()}`);
      return;
    }
    if (!confirm(`Открыть случайный дар за ${cost} кристаллов?`)) return;

    try {
      const result = await DarAPI.unlockRandomDar();
      if (result.success) {
        CrystalsUI.animateSpend(result.crystals_spent);
        const darName = getDarName(result.dar_code);
        userDars.push({ dar_code: result.dar_code, unlock_source: 'crystal_purchase', unlocked_sections: 1 });
        alert(`Вы открыли дар: ${darName}!`);
        render();
      } else {
        alert(result.message || 'Все дары уже открыты!');
      }
    } catch (e) {
      alert('Ошибка: ' + e.message);
    }
  }

  return { init, render, openDar, viewSection, tryUnlockSection, unlockRandom, submitQuest };
})();
