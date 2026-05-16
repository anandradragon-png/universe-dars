// АРКА — прототип. Полная логика: табы, задачи, стратегия, ИИ-помощник в архетипе З-МАН.

const STORAGE_KEY = 'iram_prototype_v2';
const TODAY = new Date().toISOString().slice(0, 10);
const DOTERRA_REF_URL = 'https://doterra.me/vhZWLb';

// ── Состояние ────────────────────────────────────────
function defaultState() {
  return {
    days: {},
    gratitude: {},
    streakStart: TODAY,
    tasks: [
      { id: 't1', text: 'Главная задача в окне силы', type: 'resource', done: false },
      { id: 't2', text: '', type: 'neutral', done: false },
      { id: 't3', text: '', type: 'neutral', done: false }
    ],
    goal: { title: '', deadline: '', why: '' },
    steps: [
      { id: 's1', text: '', done: false },
      { id: 's2', text: '', done: false },
      { id: 's3', text: '', done: false }
    ],
    finance: [
      { id: 'f1', name: 'YupDar — тарифы', actual: 0, target: 50000 },
      { id: 'f2', name: 'Книга Даров RU', actual: 0, target: 30000 },
      { id: 'f3', name: 'Книга EN/ES (KDP)', actual: 0, target: 20000 },
      { id: 'f4', name: 'doTERRA рефералы', actual: 0, target: 10000 }
    ],
    content: [
      { id: 'c1', date: '', text: '', channel: 'Telegram', done: false },
      { id: 'c2', date: '', text: '', channel: 'Instagram', done: false }
    ]
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    return Object.assign(defaultState(), s);
  } catch (e) { return defaultState(); }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

let state = loadState();
if (!state.days[TODAY]) state.days[TODAY] = {};

// ── Приветствие ──────────────────────────────────────
// Шапка с приветствием убрана как дубль главного приложения (16.05.2026).
// Функция оставлена для совместимости, но безопасно проверяет наличие элемента.
function setGreeting() {
  const el = document.getElementById('timeOfDay');
  if (!el) return;
  const h = new Date().getHours();
  let txt = 'Доброе утро';
  if (h >= 12 && h < 17) txt = 'Добрый день';
  else if (h >= 17 && h < 22) txt = 'Тёплый закат';
  else if (h >= 22 || h < 5) txt = 'Тихой ночи';
  el.textContent = txt;
}

// ── Табы ─────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-content').forEach(c =>
        c.classList.toggle('active', c.dataset.tabContent === tab)
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ── Чек-листы ритуалов ───────────────────────────────
function initChecklist() {
  document.querySelectorAll('.check-item input[type=checkbox]').forEach(input => {
    const id = input.closest('.check-item').dataset.id;
    if (state.days[TODAY][id]) input.checked = true;
    input.addEventListener('change', () => {
      state.days[TODAY][id] = input.checked;
      saveState();
      updateProgress();
      if (input.checked) celebrate(input.nextElementSibling);
    });
  });
  updateProgress();
}

function updateProgress() {
  const all = document.querySelectorAll('.check-item input[type=checkbox]');
  const done = Array.from(all).filter(i => i.checked).length;
  document.getElementById('doneCount').textContent = done;
  document.getElementById('totalCount').textContent = all.length;
  document.getElementById('progressFill').style.width = (done / all.length * 100) + '%';
}

function celebrate(el) {
  if (!el) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
    { duration: 280, easing: 'ease-out' }
  );
}

// ── Стрик ────────────────────────────────────────────
function updateStreak() {
  const start = new Date(state.streakStart);
  const today = new Date(TODAY);
  const days = Math.floor((today - start) / 86400000) + 1;
  document.getElementById('streakDays').textContent = days;
  document.getElementById('streakWord').textContent =
    days === 1 ? 'день' :
    (days % 10 >= 2 && days % 10 <= 4 && (days < 10 || days > 20)) ? 'дня' :
    'дней';
}

// ── Дневник благодарности ────────────────────────────
function initJournal() {
  const ta = document.getElementById('gratitude');
  if (!ta) return;
  if (state.gratitude[TODAY]) ta.value = state.gratitude[TODAY];
  ta.addEventListener('input', () => {
    state.gratitude[TODAY] = ta.value;
    saveState();
  });
}

// ── Задачи дня ───────────────────────────────────────
const TASK_TYPES = ['neutral', 'resource', 'shadow'];
const TASK_TYPE_LABELS = {
  neutral: '⚖️ обычная',
  resource: '🌟 ресурсная',
  shadow: '🌑 теневая'
};

function renderTasks() {
  const list = document.getElementById('tasksList');
  list.innerHTML = '';
  state.tasks.forEach(task => {
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '');
    li.innerHTML = `
      <div class="task-checkbox${task.done ? ' done' : ''}" data-id="${task.id}"></div>
      <div class="task-text" contenteditable="true" data-id="${task.id}">${escapeHtml(task.text)}</div>
      <span class="task-type" data-id="${task.id}" data-type="${task.type}">${TASK_TYPE_LABELS[task.type]}</span>
      <button class="task-remove" data-id="${task.id}" title="Удалить">✕</button>
    `;
    list.appendChild(li);
  });
  bindTaskEvents();
}

function bindTaskEvents() {
  document.querySelectorAll('.task-checkbox[data-id]').forEach(box => {
    box.addEventListener('click', () => {
      const id = box.dataset.id;
      const t = state.tasks.find(x => x.id === id);
      if (t) { t.done = !t.done; saveState(); renderTasks(); }
    });
  });
  document.querySelectorAll('.task-text[data-id]').forEach(el => {
    el.addEventListener('blur', () => {
      const id = el.dataset.id;
      const t = state.tasks.find(x => x.id === id);
      if (t) { t.text = el.textContent.trim(); saveState(); }
    });
  });
  document.querySelectorAll('.task-type[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const t = state.tasks.find(x => x.id === id);
      if (!t) return;
      const i = TASK_TYPES.indexOf(t.type);
      t.type = TASK_TYPES[(i + 1) % TASK_TYPES.length];
      saveState();
      renderTasks();
    });
  });
  document.querySelectorAll('.task-remove[data-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      state.tasks = state.tasks.filter(x => x.id !== id);
      saveState();
      renderTasks();
    });
  });
}

function initTasksAdd() {
  document.getElementById('taskAddBtn').addEventListener('click', () => {
    const id = 't' + Date.now();
    state.tasks.push({ id, text: '', type: 'neutral', done: false });
    saveState();
    renderTasks();
  });
}

// ── Стратегия: цель ──────────────────────────────────
function initGoal() {
  ['goalTitle', 'goalDeadline', 'goalWhy'].forEach(idAttr => {
    const el = document.getElementById(idAttr);
    if (!el) return;
    const key = idAttr.replace('goal', '').toLowerCase();
    if (state.goal[key]) el.value = state.goal[key];
    el.addEventListener('input', () => {
      state.goal[key] = el.value;
      saveState();
    });
  });
}

// ── Стратегия: шаги ──────────────────────────────────
function renderSteps() {
  const list = document.getElementById('stepsList');
  list.innerHTML = '';
  state.steps.forEach((step, i) => {
    const li = document.createElement('li');
    li.className = 'step-item' + (step.done ? ' done' : '');
    li.innerHTML = `
      <div class="step-num">${i + 1}</div>
      <div class="step-text" contenteditable="true" data-id="${step.id}">${escapeHtml(step.text)}</div>
      <div class="step-toggle" data-id="${step.id}"></div>
    `;
    list.appendChild(li);
  });
  bindStepEvents();
}

function bindStepEvents() {
  document.querySelectorAll('.step-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const s = state.steps.find(x => x.id === id);
      if (s) { s.done = !s.done; saveState(); renderSteps(); }
    });
  });
  document.querySelectorAll('.step-text').forEach(el => {
    el.addEventListener('blur', () => {
      const id = el.dataset.id;
      const s = state.steps.find(x => x.id === id);
      if (s) { s.text = el.textContent.trim(); saveState(); }
    });
  });
}

function initStepsAdd() {
  document.getElementById('stepAddBtn').addEventListener('click', () => {
    state.steps.push({ id: 's' + Date.now(), text: '', done: false });
    saveState();
    renderSteps();
  });
}

// ── ИИ-предложения шагов в архетипе З-МАН ────────────
function generateStepSuggestions(goalText) {
  const t = (goalText || '').toLowerCase();

  // Шаблоны по типу цели
  if (/книг|публик|издат|kdp/.test(t)) {
    return [
      'Записать на диктофон главную мысль книги — что хочешь донести, одной фразой',
      'Составить структуру: 5–7 ключевых блоков, без деталей',
      'Написать 1 пилотную главу в закатное окно (17:30–19:30)',
      'Найти 3 человека своей аудитории — задать им 1 вопрос про боль/желание',
      'Запустить мини-анонс в Telegram до того, как готово (поток ТУМА требует движения)',
      'Назначить конкретную дату пилотной публикации — змею нужен берег'
    ];
  }
  if (/yupdar|тариф|подпис|приложен/.test(t)) {
    return [
      'Определить главный сегмент: кто платит первым — назвать имя одного реального человека',
      'Описать в одном абзаце «что человек получает за тариф» — без терминов',
      'Подготовить 3 онбординг-сообщения для нового подписчика (день 1 / 3 / 7)',
      'Запустить закрытый бета-тест на 5–10 человек из круга',
      'Собрать обратную связь через 7 дней — 3 вопроса, не больше',
      'Доработать одну ключевую функцию по фидбэку'
    ];
  }
  if (/продвиж|реклам|маркет|продаж|пиар/.test(t)) {
    return [
      'Сформулировать главное обещание: «после взаимодействия со мной человек получает...»',
      'Записать 5 коротких видео-историй — по одной важной мысли в каждом',
      'Опубликовать историю №1 в закатное окно и не подсматривать в статистику 24 часа',
      'Договориться о коллаборации с 2 близкими по духу проектами',
      'Создать простую страницу-приглашение с одной кнопкой',
      'Назначить день старта потока — конкретная дата'
    ];
  }
  if (/ирам|маяк|планир/.test(t)) {
    return [
      'Прожить с прототипом АРКА 5–7 дней — записать что отозвалось, что нет',
      'Заполнить шаблон полей для своего Дара З-МАН в dar-content.json',
      'Согласовать с командой архитектуру 3 БД: oils, practices, stones',
      'Встроить вкладку «Путь» внутрь YupDar после стабилизации тарифов и языков',
      'Запустить закрытую бету для 5 активных пользователей YupDar',
      'Запустить публичный тариф «Путь Дара» с базовой ценой'
    ];
  }
  if (/доход|деньги|финанс|выруч/.test(t)) {
    return [
      'Назвать сумму, которую хочешь — не «больше», а конкретную цифру',
      'Разложить её по 4 потокам: какие каналы → сколько даёт каждый',
      'Найти самый слабый канал → одна задача на укрепление в неделю',
      'Создать «лестницу цен»: от бесплатного входа до главного предложения',
      'Сделать одно публичное предложение / приглашение в окно силы',
      'Через 30 дней — сверка факт/план, корректировка'
    ];
  }
  if (!t) {
    return [
      '⚠ Сначала назови цель в первом поле — без направления змей кружит без смысла'
    ];
  }
  // Универсальные шаги
  return [
    'Описать желаемый результат одной фразой: «когда цель достигнута, я буду...»',
    'Найти главное препятствие — то, что больше всего держит',
    'Сформулировать первое действие, которое можно сделать за 30 минут',
    'Спросить одного человека, который уже в этой точке: что важно знать?',
    'Сделать одно видимое действие в закатное окно — публикация / звонок / письмо',
    'Зафиксировать дату следующей проверки прогресса'
  ];
}

function initStepSuggestions() {
  const btn = document.getElementById('stepSuggestBtn');
  const panel = document.getElementById('suggestionsPanel');
  if (!btn || !panel) return;

  btn.addEventListener('click', () => {
    const suggestions = generateStepSuggestions(state.goal.title);
    const html = `
      <div class="suggestions-title">🐉 Шаги в архетипе З-МАН</div>
      ${suggestions.map((s, i) => `
        <div class="suggestion-item">
          <span class="suggestion-text">${i + 1}. ${escapeHtml(s)}</span>
          <button class="suggestion-add" data-idx="${i}">＋ Взять</button>
        </div>
      `).join('')}
      <div style="font-size:11px; color:rgba(255,255,255,0.6); margin-top:8px;">
        Это предложения — подстрой под себя или добавь свои.
      </div>
    `;
    panel.innerHTML = html;
    panel.classList.add('visible');

    panel.querySelectorAll('.suggestion-add').forEach(addBtn => {
      addBtn.addEventListener('click', () => {
        if (addBtn.classList.contains('added')) return;
        const idx = +addBtn.dataset.idx;
        const text = suggestions[idx];
        state.steps.push({ id: 's' + Date.now() + idx, text, done: false });
        saveState();
        renderSteps();
        addBtn.classList.add('added');
        addBtn.textContent = '✓ Добавлено';
      });
    });
  });
}

// ── ИИ-помощник в архетипе З-МАН ─────────────────────
function aiRespond(action, input, goal, steps) {
  const text = (input || '').toLowerCase();
  const doneCount = steps.filter(s => s.done && s.text).length;
  const totalSteps = steps.filter(s => s.text).length;
  const hasGoal = !!goal.title;
  const hasDeadline = !!goal.deadline;
  const goalName = goal.title || 'твоя цель';

  // Определение состояния через ключевые слова
  const stuck = /застр|тупик|не понимаю|не получ|не могу|устала/.test(text);
  const overload = /перегруз|много|устал|выгораю|не успеваю|нет сил/.test(text);
  const fear = /страх|боюсь|тревога|сомнев/.test(text);
  const money = /деньги|доход|финанс|тариф|оплат|выруч/.test(text);
  const promo = /продвиж|реклам|маркет|книг|продаж|пиар/.test(text);

  if (action === 'advice') {
    if (stuck) return `
      🐉 <b>Змей времени говорит:</b><br><br>
      Когда поток ТУМА встречает камень, он не ломает его — он <em>обтекает</em>. Замедлись. Сядь у воды или открой кран — пусть журчит. Поставь Frankincense на ладонь. Не двигайся к шагу — позволь ему прийти к тебе.<br><br>
      <b>Конкретно сейчас:</b><br>
      ${hasGoal ? `Возьми «${goalName}» и спроси не «как сделать?», а «что в этой задаче само хочет проявиться?». Запиши первое, что придёт.` : 'Назови цель в первом поле — змей не может скользить без направления.'}<br><br>
      <em>Аспект Дара:</em> застревание лечится присутствием, не толканием.
    `;
    if (overload) return `
      🐉 <b>З-МАН напоминает:</b><br><br>
      Время — не враг, который убегает. Время — змей, которого ты <em>замедляешь</em>. Перегрузка = ты потеряла свой ритм и подстроилась под чужой.<br><br>
      <b>Опора:</b><br>
      1. Босиком на пол на 2 минуты. Активируй ЛОГОС.<br>
      2. Сократи задачи дня до <b>одной</b> ресурсной 🌟. Остальные пометь шадоу 🌑 или удали.<br>
      3. Капля Balance на запястья.<br><br>
      <em>В архетипе:</em> вечная молодость не у тех, кто всё успел — а у тех, кто живёт сейчас.
    `;
    if (fear) return `
      🐉 <b>Прислушайся:</b><br><br>
      Страх — это будущее, которое заглянуло в твоё настоящее. Змей умеет скользить туда. Спроси: <em>что именно я там вижу?</em> Назови вслух.<br><br>
      <b>Практика:</b><br>
      Vetiver на ступни. Ладони — на основание позвоночника. 7 медленных выдохов длиннее вдохов. Возврат в «сейчас».<br><br>
      <em>Тень З-МАН:</em> застревание в будущем. <em>Опора:</em> ЛОГОС-треугольник.
    `;
    if (money || promo) return `
      🐉 <b>Для движения и денег:</b><br><br>
      З-МАН ускоряет рутину и замедляет важное. ${money ? 'Финансы' : 'Продвижение'} идут к тебе, когда ты <b>в моменте</b>, а не в гонке.<br><br>
      <b>Что делать:</b><br>
      ${hasGoal ? `Для «${goalName}» — выбери 1 главное действие на этой неделе. Не 10. Одно.` : 'Сначала назови цель — без неё дракон не знает, куда плыть.'}<br>
      Делай его в <em>закатное окно силы</em> (17:30–19:30). Перед — Cypress + Vetiver.<br><br>
      <em>В архетипе:</em> деньги — это поток ТУМА. Не лови — направляй.
    `;
    // Универсальный совет
    return `
      🐉 <b>Совет дня в архетипе З-МАН:</b><br><br>
      ${hasGoal
        ? `Твоя цель «${goalName}» — это не точка вдалеке. Это <em>пункт назначения, который уже существует</em>. Змей времени умеет скользить туда, и ты можешь идти быстро или медленно — главное, не терять направление.`
        : 'Назови цель в первом поле. Без направления змей вечности кружит без смысла.'}<br><br>
      <b>Сегодня:</b> сделай одно действие в окне силы (5:30–7:30 или 17:30–19:30). Перед — масло дня (Frankincense утром, Cypress вечером).<br><br>
      <em>Принцип Дара:</em> вечная молодость — побочный эффект присутствия. Не торопись.
    `;
  }

  if (action === 'forecast') {
    if (!hasGoal) {
      return `
        🐉 <b>Прогноз невозможен без направления.</b><br><br>
        Змей времени умеет скользить в будущее, но только если есть точка прибытия. Назови цель в первом поле — и я просчитаю темп.
      `;
    }
    let dateInfo = '';
    if (hasDeadline) {
      const days = Math.ceil((new Date(goal.deadline) - new Date()) / 86400000);
      const speed = totalSteps > 0 ? Math.round(doneCount / totalSteps * 100) : 0;
      dateInfo = `
        До «${goal.deadline}» осталось <b>${days}</b> ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}.<br>
        Готовность плана: <b>${speed}%</b> (${doneCount} из ${totalSteps} шагов).<br><br>
        ${speed >= 70 ? '🌟 <b>Темп З-МАН:</b> ты в потоке. Не ускоряйся искусственно.' :
          speed >= 30 ? '⚖️ <b>Темп ТУМА:</b> волна идёт ровно. Один шаг в окно силы — и удержишь ритм.' :
          '🌑 <b>Сигнал ЛОГОС:</b> темп ниже волны. Не паникуй — выбери <em>один шаг</em> и сделай в закатное окно.'}
      `;
    } else {
      dateInfo = 'Поставь дедлайн — змей скользит быстрее, когда есть берег.<br><br>';
    }
    return `
      🐉 <b>Прогноз по «${goalName}»:</b><br><br>
      ${dateInfo}<br>
      <em>Что важно для З-МАН:</em> ты способна замедлять и ускорять. Если устанешь — замедлись на день, побудь в практике. Скорость вернётся сама.
    `;
  }

  if (action === 'correct') {
    if (!hasGoal) {
      return `
        🐉 <b>Нет цели — нечего корректировать.</b><br><br>
        Сначала направление, потом курс. Назови цель в первом поле.
      `;
    }
    const undoneStep = steps.find(s => !s.done && s.text);
    return `
      🐉 <b>Корректировка курса:</b><br><br>
      ${undoneStep
        ? `Ближайший несделанный шаг — <b>«${escapeHtml(undoneStep.text)}»</b>.<br><br>
           Раздели его на <em>самое маленькое возможное действие</em>: то, что ты можешь сделать прямо сейчас за 10 минут. Не глобально — мельчайше.`
        : 'Все шаги либо сделаны, либо пусты. Если цель не достигнута — значит, в плане не хватает шагов. Добавь 2-3 конкретных действия.'}<br><br>
      <b>Темп З-МАН:</b><br>
      • <em>Ускорять</em> — рутинные задачи, маркетинговые рассылки, мелочи<br>
      • <em>Замедлять</em> — важные решения, тексты, ключевые встречи<br><br>
      <em>Принцип:</em> змей не ломает план — он его пересобирает, пока ты дышишь.
    `;
  }

  return 'Не понял команду. Попробуй ещё раз.';
}

function initAI() {
  const responseEl = document.getElementById('aiResponse');
  document.querySelectorAll('.ai-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const input = document.getElementById('aiInput').value;
      responseEl.innerHTML = '<div class="ai-empty">🐉 змей скользит во времени…</div>';
      setTimeout(() => {
        responseEl.innerHTML = aiRespond(action, input, state.goal, state.steps);
      }, 600);
    });
  });
}

// ── ФИНАНСЫ ──────────────────────────────────────────
function renderFinance() {
  const list = document.getElementById('financeList');
  if (!list) return;
  list.innerHTML = '';
  let totalActual = 0, totalTarget = 0;
  state.finance.forEach(ch => {
    totalActual += +ch.actual || 0;
    totalTarget += +ch.target || 0;
    const pct = ch.target > 0 ? Math.min(100, (ch.actual / ch.target) * 100) : 0;
    const li = document.createElement('li');
    li.className = 'finance-item';
    li.innerHTML = `
      <div class="finance-row1">
        <input class="finance-name" data-id="${ch.id}" data-field="name" value="${escapeAttr(ch.name)}" placeholder="Название канала">
        <button class="finance-remove" data-id="${ch.id}" title="Удалить">✕</button>
      </div>
      <div class="finance-row2">
        <span class="finance-amount-label">Факт ₽</span>
        <input class="finance-amount" data-id="${ch.id}" data-field="actual" type="number" min="0" value="${ch.actual || 0}">
        <span class="finance-amount-label">Цель ₽</span>
        <input class="finance-amount" data-id="${ch.id}" data-field="target" type="number" min="0" value="${ch.target || 0}">
      </div>
      <div class="finance-progress"><div class="finance-progress-fill" style="width:${pct}%"></div></div>
    `;
    list.appendChild(li);
  });
  document.getElementById('financeTotal').textContent = totalActual.toLocaleString('ru-RU');
  document.getElementById('financeTotalTarget').textContent = totalTarget.toLocaleString('ru-RU');
  bindFinanceEvents();
}

function bindFinanceEvents() {
  document.querySelectorAll('.finance-name, .finance-amount').forEach(el => {
    el.addEventListener('input', () => {
      const id = el.dataset.id, field = el.dataset.field;
      const ch = state.finance.find(x => x.id === id);
      if (!ch) return;
      if (field === 'name') ch.name = el.value;
      else ch[field] = +el.value || 0;
      saveState();
      // Только пересчёт чисел и прогресса, без перерисовки полей
      if (field !== 'name') {
        let totalA = 0, totalT = 0;
        state.finance.forEach(c => { totalA += +c.actual || 0; totalT += +c.target || 0; });
        document.getElementById('financeTotal').textContent = totalA.toLocaleString('ru-RU');
        document.getElementById('financeTotalTarget').textContent = totalT.toLocaleString('ru-RU');
        const pct = ch.target > 0 ? Math.min(100, (ch.actual / ch.target) * 100) : 0;
        const fill = el.closest('.finance-item').querySelector('.finance-progress-fill');
        if (fill) fill.style.width = pct + '%';
      }
    });
  });
  document.querySelectorAll('.finance-remove').forEach(el => {
    el.addEventListener('click', () => {
      state.finance = state.finance.filter(x => x.id !== el.dataset.id);
      saveState();
      renderFinance();
    });
  });
}

function initFinanceAdd() {
  const btn = document.getElementById('financeAddBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.finance.push({ id: 'f' + Date.now(), name: '', actual: 0, target: 0 });
    saveState();
    renderFinance();
  });
}

// ── КОНТЕНТ-ПЛАН ─────────────────────────────────────
const CONTENT_CHANNELS = ['Telegram', 'Instagram', 'Статья', 'YouTube', 'Книга'];

function renderContent() {
  const list = document.getElementById('contentList');
  if (!list) return;
  list.innerHTML = '';
  state.content.forEach(c => {
    const li = document.createElement('li');
    li.className = 'content-item' + (c.done ? ' done' : '');
    li.innerHTML = `
      <div class="content-toggle" data-id="${c.id}"></div>
      <input class="content-date" type="date" data-id="${c.id}" value="${c.date || ''}">
      <div class="content-text" contenteditable="true" data-id="${c.id}">${escapeHtml(c.text)}</div>
      <span class="content-channel" data-id="${c.id}">${c.channel}</span>
      <button class="content-remove" data-id="${c.id}">✕</button>
    `;
    list.appendChild(li);
  });
  bindContentEvents();
}

function bindContentEvents() {
  document.querySelectorAll('.content-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const c = state.content.find(x => x.id === el.dataset.id);
      if (c) { c.done = !c.done; saveState(); renderContent(); }
    });
  });
  document.querySelectorAll('.content-date').forEach(el => {
    el.addEventListener('change', () => {
      const c = state.content.find(x => x.id === el.dataset.id);
      if (c) { c.date = el.value; saveState(); }
    });
  });
  document.querySelectorAll('.content-text').forEach(el => {
    el.addEventListener('blur', () => {
      const c = state.content.find(x => x.id === el.dataset.id);
      if (c) { c.text = el.textContent.trim(); saveState(); }
    });
  });
  document.querySelectorAll('.content-channel').forEach(el => {
    el.addEventListener('click', () => {
      const c = state.content.find(x => x.id === el.dataset.id);
      if (!c) return;
      const i = CONTENT_CHANNELS.indexOf(c.channel);
      c.channel = CONTENT_CHANNELS[(i + 1) % CONTENT_CHANNELS.length];
      saveState();
      renderContent();
    });
  });
  document.querySelectorAll('.content-remove').forEach(el => {
    el.addEventListener('click', () => {
      state.content = state.content.filter(x => x.id !== el.dataset.id);
      saveState();
      renderContent();
    });
  });
}

function initContentAdd() {
  const btn = document.getElementById('contentAddBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.content.push({ id: 'c' + Date.now(), date: '', text: '', channel: 'Telegram', done: false });
    saveState();
    renderContent();
  });
}

// ── НАСТАВНИК: УТРЕННИЙ БРИФ ─────────────────────────
function generateMentorBrief() {
  const h = new Date().getHours();
  const dow = new Date().getDay(); // 0 = Sun
  const tasksDone = state.tasks.filter(t => t.done && t.text).length;
  const tasksTotal = state.tasks.filter(t => t.text).length;
  const stepsDone = state.steps.filter(s => s.done && s.text).length;
  const stepsTotal = state.steps.filter(s => s.text).length;
  const financeActual = state.finance.reduce((s, c) => s + (+c.actual || 0), 0);
  const financeTarget = state.finance.reduce((s, c) => s + (+c.target || 0), 0);
  const finPct = financeTarget > 0 ? Math.round(financeActual / financeTarget * 100) : 0;
  const contentDone = state.content.filter(c => c.done && c.text).length;
  const contentPlanned = state.content.filter(c => !c.done && c.text).length;
  const hasGoal = !!state.goal.title;

  let greeting = 'Бриф наставника';
  let timeOfDayHint = '';
  if (h < 7) { greeting = 'Рассвет — окно силы'; timeOfDayHint = 'Ты в открытом окне силы. Самое важное — сейчас.'; }
  else if (h < 12) { greeting = 'Утренний бриф'; timeOfDayHint = 'Закатное окно ещё впереди — оставь силы.'; }
  else if (h < 17) { greeting = 'Дневной якорь'; timeOfDayHint = 'Время заземлиться. Balance на запястья.'; }
  else if (h < 20) { greeting = 'Закатное окно силы'; timeOfDayHint = 'Это твоё время. Сделай главное действие сейчас.'; }
  else { greeting = 'Вечернее скольжение'; timeOfDayHint = 'Замедли темп. Cypress на стопы. Прислушайся.'; }

  let body = `<b>${timeOfDayHint}</b>\n\n`;

  // Анализ задач
  if (tasksTotal === 0) {
    body += `🌑 <b>Задач на день пока нет.</b> Открой таб «Сегодня» и напиши 1-3 главных дела. Без направления змей кружит без смысла.\n\n`;
  } else if (tasksDone === tasksTotal) {
    body += `🌟 <b>Задачи дня сделаны.</b> Поток ТУМА течёт ровно. Не добавляй больше — поток силы важнее списка побед.\n\n`;
  } else {
    body += `⚖️ Задачи дня: <em>${tasksDone} из ${tasksTotal}</em>. Главное — сделать ресурсную 🌟 в окно силы.\n\n`;
  }

  // Анализ стратегии
  if (hasGoal && stepsTotal > 0) {
    const pct = Math.round(stepsDone / stepsTotal * 100);
    body += `🎯 Цель «<em>${escapeHtml(state.goal.title)}</em>» — готовность <em>${pct}%</em>. `;
    if (pct < 30) body += `Темп пока медленный — выбери <b>один шаг</b> на сегодня.\n\n`;
    else if (pct >= 70) body += `Ты в потоке. Не торопись.\n\n`;
    else body += `Волна ровная. Один шаг — и ритм удержан.\n\n`;
  } else if (!hasGoal) {
    body += `🎯 <b>Цели в стратегии нет.</b> Открой «Стратегию» и назови — змей не может скользить без направления.\n\n`;
  }

  // Финансы
  if (financeTarget > 0) {
    body += `💧 Потоки дохода: <em>${finPct}%</em> от месячной цели. `;
    if (finPct < 25) body += `ТУМА течёт слабо — посмотри, какой канал просел, и направь туда внимание сегодня.\n\n`;
    else if (finPct > 80) body += `Поток сильный. Не ускоряй искусственно — удержи ритм.\n\n`;
    else body += `Поток идёт. Сегодня — главное действие для самого медленного канала.\n\n`;
  }

  // Контент
  if (contentPlanned > 0) {
    body += `📢 В контент-плане ждёт <em>${contentPlanned}</em> публикаций. Сегодня — закрой одну, не больше.\n\n`;
  }

  // Воскресенье — намёк на разбор
  if (dow === 0 && h >= 18) {
    body += `📜 <b>Воскресный вечер.</b> Запусти разбор недели — змей подведёт итог семи дней.\n\n`;
  }

  body += `<em>Сегодня — день ${getStreakDays()} под АРКОЙ.</em>`;

  return { greeting, text: body };
}

function getStreakDays() {
  const start = new Date(state.streakStart);
  const today = new Date(TODAY);
  return Math.floor((today - start) / 86400000) + 1;
}

function daysWord(n) {
  return n === 1 ? 'день' :
    (n % 10 >= 2 && n % 10 <= 4 && (n < 10 || n > 20)) ? 'дня' :
    'дней';
}

function refreshMentor() {
  const brief = generateMentorBrief();
  document.getElementById('mentorGreeting').textContent = brief.greeting;
  document.getElementById('mentorText').innerHTML = brief.text;
}

function initMentor() {
  if (!document.getElementById('mentorRefresh')) return;
  document.getElementById('mentorRefresh').addEventListener('click', refreshMentor);
  document.getElementById('mentorCallBtn').addEventListener('click', () => {
    document.querySelector('.tab[data-tab=strategy]').click();
    setTimeout(() => {
      const inp = document.getElementById('aiInput');
      inp.focus();
      inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  });
  document.getElementById('weeklyBtn').addEventListener('click', generateWeeklyReview);
  refreshMentor();
}

// ── ЕЖЕНЕДЕЛЬНЫЙ РАЗБОР ──────────────────────────────
function generateWeeklyReview() {
  const tasksDone = state.tasks.filter(t => t.done).length;
  const stepsDone = state.steps.filter(s => s.done && s.text).length;
  const stepsTotal = state.steps.filter(s => s.text).length;
  const finPct = state.finance.reduce((s, c) => s + (+c.actual || 0), 0);
  const finTarget = state.finance.reduce((s, c) => s + (+c.target || 0), 0);
  const contentDone = state.content.filter(c => c.done && c.text).length;
  const streak = getStreakDays();

  const text = `🐉 <b>Разбор недели — голос З-МАН</b>

Ты прошла <em>${streak}</em> ${daysWord(streak)} по змею времени. Это не мало — это путь.

<b>Что было в потоке:</b>
${tasksDone > 0 ? `• ${tasksDone} задач дня закрыто — каждая отметка делает змея сильнее` : '• Задачи в работе — продолжаем'}
${stepsDone > 0 ? `\n• ${stepsDone} стратегических шагов из ${stepsTotal} — ТУМА не стоит` : ''}
${contentDone > 0 ? `\n• ${contentDone} публикаций ушли в мир — твой голос звучит` : ''}
${finTarget > 0 ? `\n• Финансы: ${Math.round(finPct/finTarget*100)}% от месячной цели` : ''}

<b>Что заметил наставник:</b>
${stepsTotal === 0 ? '• <em>Нет шагов в стратегии</em> — назови 3-5 на следующую неделю' :
  stepsDone < stepsTotal / 2 ? '• Темп медленнее ожидаемого — это <em>не проблема</em>, а сигнал. Замедление = накопление силы. Спроси себя: какой шаг сейчас самый важный?' :
  '• Темп хороший. Удержи ритм, не ускоряйся искусственно'}

<b>Совет на следующую неделю:</b>
Выбери <em>одно главное действие</em> — то, что двинет цель сильнее всего. Сделай его в закатное окно силы (17:30–19:30). Остальное — питай ритм.

<em>Помни: вечная молодость З-МАН — побочный эффект присутствия в моменте, а не результат гонки.</em>`;

  const el = document.getElementById('weeklyText');
  el.innerHTML = text;
  el.classList.add('visible');
}

// ── Раскрытие деталей практик ────────────────────────
function initPracticeDetails() {
  document.querySelectorAll('.info-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.info;
      const panel = document.getElementById('info-' + id);
      if (!panel) return;
      panel.classList.toggle('visible');
      btn.classList.toggle('active');
    });
  });
}

// ── Напоминание про воду ─────────────────────────────
function initWaterReminder() {
  const btn = document.getElementById('waterRemindBtn');
  if (!btn) return;
  let reminderActive = localStorage.getItem('iram_water_reminder') === 'on';
  if (reminderActive) {
    btn.classList.add('active');
    btn.textContent = '✓ Напоминания включены';
  }
  btn.addEventListener('click', async () => {
    if (reminderActive) {
      reminderActive = false;
      localStorage.removeItem('iram_water_reminder');
      btn.classList.remove('active');
      btn.textContent = '⏰ Напомнить мне';
      return;
    }
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        alert('Разреши уведомления в браузере, чтобы получать напоминания');
        return;
      }
    }
    reminderActive = true;
    localStorage.setItem('iram_water_reminder', 'on');
    btn.classList.add('active');
    btn.textContent = '✓ Напоминания включены';
    new Notification('💧 АРКА', { body: 'Напоминания о воде включены: в 12:00, 14:00, 16:00' });
  });
}

// ── doTERRA ──────────────────────────────────────────
function initDoterra() {
  const link = document.getElementById('doterraLink');
  if (link) link.href = DOTERRA_REF_URL;
}

// ── База эфирных масел ────────────────────────────────
// Краткое описание + аспект применения. Полные дозировки/предупреждения остаются
// в practice-details рядом с конкретным ритуалом (на случай чтения без попапа).
const OILS_DB = {
  frankincense: {
    name: 'Frankincense',
    desc: 'Присутствие в моменте, замедление времени, активация ЛОГОСа. Главное масло для Дара З-МАН.',
    meta: '1 капля на ладонь · 3 медленных вдоха · возвращает в «сейчас»'
  },
  vetiver: {
    name: 'Vetiver',
    desc: 'Глубокое заземление, опора у основания позвоночника. Используется только вечером — может усыплять.',
    meta: '1–2 капли на стопы · вечером · разводить с базой при чувствительной коже'
  },
  cypress: {
    name: 'Cypress',
    desc: 'Поток ТУМА, движение времени, текучесть. Снимает застревание в прошлом и страх перемен.',
    meta: '1 капля на запястья · днём · сочетается с Vetiver'
  },
  balance: {
    name: 'Balance',
    desc: 'Якорь ЛОГОС-треугольника, возвращение в «сейчас». Состав: Spruce, Ho Wood, Frankincense, Blue Tansy, Blue Chamomile.',
    meta: '1 капля на внутреннюю сторону запястий · растереть · поднести к носу'
  },
  lavender: {
    name: 'Lavender',
    desc: 'Мягкий переход в восстановление, ночное скольжение. ⚠ Строго 1–2 капли — больше даёт обратный эффект.',
    meta: '1–2 капли на подушку · перед сном · больше = перевозбуждение'
  },
  serenity: {
    name: 'Serenity',
    desc: 'Восстановление после плотного дня, мягкая опора в момент перехода в сон.',
    meta: '1–2 капли в диффузор · вечером · хорошо в паре с Lavender'
  }
};

// Открыть всплывающее окно с информацией о масле
function openOilPopup(oilKey) {
  const oil = OILS_DB[oilKey];
  if (!oil) return;
  const backdrop = document.getElementById('oilPopupBackdrop');
  const popup = document.getElementById('oilPopup');
  document.getElementById('oilPopupName').textContent = oil.name;
  document.getElementById('oilPopupDesc').textContent = oil.desc;
  document.getElementById('oilPopupMeta').textContent = oil.meta || '';
  document.getElementById('oilPopupLink').href = DOTERRA_REF_URL;
  if (backdrop) backdrop.hidden = false;
  if (popup) popup.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeOilPopup() {
  document.getElementById('oilPopupBackdrop').hidden = true;
  document.getElementById('oilPopup').hidden = true;
  document.body.style.overflow = '';
}
window.openOilPopup = openOilPopup;
window.closeOilPopup = closeOilPopup;

// При загрузке — привязываем клик к каждому .oil-hint.
// Определяем масло по тексту (data-oil или fallback на содержимое).
function initOilHints() {
  document.querySelectorAll('.oil-hint').forEach(el => {
    // Уже привязан — пропускаем
    if (el.dataset.oilInit) return;
    el.dataset.oilInit = '1';
    el.style.cursor = 'pointer';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    // Определяем ключ масла
    let key = el.dataset.oil || '';
    if (!key) {
      const txt = (el.textContent || '').toLowerCase();
      key = Object.keys(OILS_DB).find(k => txt.includes(k)) || '';
    }
    if (!key) return;
    el.addEventListener('click', () => openOilPopup(key));
    el.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOilPopup(key); }
    });
  });
}

// ── Утилиты ──────────────────────────────────────────
function escapeHtml(s) {
  return (s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// ── Запуск ───────────────────────────────────────────
setGreeting();
initTabs();
initChecklist();
updateStreak();
initJournal();
renderTasks();
initTasksAdd();
initGoal();
renderSteps();
initStepsAdd();
initStepSuggestions();
initAI();
renderFinance();
initFinanceAdd();
renderContent();
initContentAdd();
initMentor();
initPracticeDetails();
initWaterReminder();
initDoterra();
initOilHints();
