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
      // Дефолтное имя первой задачи переведётся в renderTasks через dt('task.default_t1')
      { id: 't1', text: '', type: 'resource', done: false, _default: 'task.default_t1' },
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
    ],
    // ── Квест Открытие тени ──
    // shadows.active — массив теней которые сейчас активны (юзер их замечает)
    // shadows.passed — массив теней которые юзер прошёл (3+ записи)
    // shadows.counts — счётчик упоминаний каждой тени { 'fall_out': 2, 'stuck_future': 0 }
    // shadows.unlocked — id практик которые открылись (связь shadow_id → practice_id)
    shadows: {
      active: ['shadow_fall_out', 'shadow_stuck_future'],
      passed: ['shadow_rush', 'shadow_procrastination'],
      counts: { shadow_fall_out: 0, shadow_stuck_future: 0 },
      unlocked: ['practice_slowdown']  // p1 уже открыта по умолчанию (демо)
    },
    // Журнал записей дневника (для истории + анализа недели)
    journal: []
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

// ── i18n: словарь динамических строк (тексты, генерируемые в JS) ──────
// Статичные строки HTML переводятся через ARKA_I18N в index.html.
// Здесь — только то, что собирается из кода: бриф наставника, советы, и т.п.
const ARKA_DYN_I18N = {
  ru: {
    'greet.dawn': 'Рассвет — окно силы',
    'greet.morning': 'Утренний бриф',
    'greet.day': 'Дневной якорь',
    'greet.sunset': 'Закатное окно силы',
    'greet.evening': 'Вечернее скольжение',
    'hint.dawn': 'Ты в открытом окне силы. Самое важное — сейчас.',
    'hint.morning': 'Закатное окно ещё впереди — оставь силы.',
    'hint.day': 'Время заземлиться. Balance на запястья.',
    'hint.sunset': 'Это твоё время. Сделай главное действие сейчас.',
    'hint.evening': 'Замедли темп. Cypress на стопы. Прислушайся.',
    'brief.fallback_title': 'Бриф наставника',
    'good.morning': 'Доброе утро',
    'good.day': 'Добрый день',
    'good.sunset': 'Тёплый закат',
    'good.night': 'Тихой ночи',
    'word.day': 'день',
    'word.days_few': 'дня',
    'word.days_many': 'дней',
    'btn.delete': 'Удалить',
    'task.neutral': '⚖️ обычная',
    'task.resource': '🌟 ресурсная',
    'task.shadow': '🌑 теневая',
    'task.default_t1': 'Главная задача в окне силы',
    'finance.actual': 'Факт ₽',
    'finance.target': 'Цель ₽',
    'finance.name_placeholder': 'Название канала',
    // === ЗЕРКАЛО МОМЕНТА (Hero AI) ===
    // Понятный голос: имя — период дня — Дар дня — приглашение
    'mirror.enter': 'Войди',
    'mirror.return': '← Зеркало',
    'mirror.dar_of_day_label': 'Твой Дар сегодня —',
    // Период дня — короткая понятная фраза
    'mirror.period_dawn': 'Рассвет. Самое сильное окно дня.',
    'mirror.period_morning': 'Утро. Время для главного.',
    'mirror.period_day': 'Полдень. Время для спокойных дел.',
    'mirror.period_sunset': 'Закатное окно силы.',
    'mirror.period_evening': 'Вечер. Время замедлиться.',
    'mirror.period_night': 'Ночь. Время для тишины.',
    // Тизер — что юзер получит, нажав «Войди»
    'mirror.teaser_d1': 'Войди — и АРКА начнёт узнавать тебя через ритм твоего Дара.',
    'mirror.teaser_d2': 'Войди — я уже чувствую, как ты входишь в ритм.',
    'mirror.teaser_d3': 'Войди — сегодня я покажу тебе первый паттерн, который заметила.',
    'mirror.teaser_dN': 'Войди — твой день ждёт.',
    // === ШЕРИНГ-КАРТОЧКА ===
    'share.download': 'Скачать',
    'share.send': 'Отправить',
    'share.default_quote': 'Мой день в АРКА',
    'share.day_prefix': 'День ',
    'share.day_suffix': 'в АРКА',
    'share.tg_message': 'Мой день в АРКА',
    'share.mirror_quote_tpl': 'Сегодня {dar} ведёт меня',
    'tasks.no_tasks': '🌑 <b>Задач на день пока нет.</b> Открой таб «Сегодня» и напиши 1-3 главных дела. Без направления змей кружит без смысла.',
    'tasks.all_done': '🌟 <b>Задачи дня сделаны.</b> Поток ТУМА течёт ровно. Не добавляй больше — поток силы важнее списка побед.',
    'tasks.partial': '⚖️ Задачи дня: <em>{done} из {total}</em>. Главное — сделать ресурсную 🌟 в окно силы.',
    'goal.progress': '🎯 Цель «<em>{title}</em>» — готовность <em>{pct}%</em>. ',
    'goal.slow': 'Темп пока медленный — выбери <b>один шаг</b> на сегодня.',
    'goal.fast': 'Ты в потоке. Не торопись.',
    'goal.steady': 'Волна ровная. Один шаг — и ритм удержан.',
    'goal.none': '🎯 <b>Цели в стратегии нет.</b> Открой «Стратегию» и назови — змей не может скользить без направления.',
    'fin.progress': '💧 Потоки дохода: <em>{pct}%</em> от месячной цели. ',
    'fin.low': 'ТУМА течёт слабо — посмотри, какой канал просел, и направь туда внимание сегодня.',
    'fin.high': 'Поток сильный. Не ускоряй искусственно — удержи ритм.',
    'fin.mid': 'Поток идёт. Сегодня — главное действие для самого медленного канала.'
  },
  en: {
    'greet.dawn': 'Dawn — Power Window',
    'greet.morning': 'Morning Brief',
    'greet.day': 'Midday Anchor',
    'greet.sunset': 'Sunset Power Window',
    'greet.evening': 'Evening Glide',
    'hint.dawn': 'You are in an open power window. What matters most — is now.',
    'hint.morning': 'Sunset window is still ahead — save your strength.',
    'hint.day': 'Time to ground. Balance on the wrists.',
    'hint.sunset': 'This is your time. Take the main action now.',
    'hint.evening': 'Slow down. Cypress on the feet. Listen.',
    'brief.fallback_title': "Mentor's Brief",
    'good.morning': 'Good morning',
    'good.day': 'Good day',
    'good.sunset': 'Warm sunset',
    'good.night': 'Quiet night',
    'word.day': 'day',
    'word.days_few': 'days',
    'word.days_many': 'days',
    'btn.delete': 'Delete',
    'task.neutral': '⚖️ ordinary',
    'task.resource': '🌟 resource',
    'task.shadow': '🌑 shadow',
    'task.default_t1': 'Main task in the power window',
    'finance.actual': 'Actual $',
    'finance.target': 'Target $',
    'finance.name_placeholder': 'Channel name',
    // === MIRROR OF THE MOMENT (Hero AI) ===
    'mirror.enter': 'Enter',
    'mirror.return': '← Mirror',
    'mirror.dar_of_day_label': 'Your DAR today —',
    'mirror.period_dawn': 'Dawn. The strongest window of the day.',
    'mirror.period_morning': 'Morning. Time for the main thing.',
    'mirror.period_day': 'Noon. Time for calm tasks.',
    'mirror.period_sunset': 'Sunset power window.',
    'mirror.period_evening': 'Evening. Time to slow down.',
    'mirror.period_night': 'Night. Time for silence.',
    'mirror.teaser_d1': 'Enter — and ARKA will start to know you through the rhythm of your DAR.',
    'mirror.teaser_d2': "Enter — I already feel you entering the rhythm.",
    'mirror.teaser_d3': "Enter — today I'll show you the first pattern I've noticed.",
    'mirror.teaser_dN': 'Enter — your day is waiting.',
    // === SHARE CARD ===
    'share.download': 'Download',
    'share.send': 'Send',
    'share.default_quote': 'My day in ARKA',
    'share.day_prefix': 'Day ',
    'share.day_suffix': 'in ARKA',
    'share.tg_message': 'My day in ARKA',
    'share.mirror_quote_tpl': 'Today {dar} leads me',
    'tasks.no_tasks': "🌑 <b>No tasks for today.</b> Open the «Today» tab and write 1-3 main things. Without direction, the serpent circles without meaning.",
    'tasks.all_done': '🌟 <b>Today\'s tasks are done.</b> The TUMA flow runs smoothly. Don\'t add more — the flow of power matters more than the list of victories.',
    'tasks.partial': "⚖️ Today's tasks: <em>{done} of {total}</em>. The main thing — do the resourceful 🌟 in the power window.",
    'goal.progress': '🎯 Goal «<em>{title}</em>» — readiness <em>{pct}%</em>. ',
    'goal.slow': 'The pace is slow — choose <b>one step</b> for today.',
    'goal.fast': "You're in the flow. Don't rush.",
    'goal.steady': 'The wave is steady. One step — and the rhythm is held.',
    'goal.none': '🎯 <b>No goal in the strategy.</b> Open «Strategy» and name it — the serpent cannot glide without direction.',
    'fin.progress': '💧 Income flows: <em>{pct}%</em> of monthly goal. ',
    'fin.low': 'TUMA flows weakly — see which channel has dipped, and direct attention there today.',
    'fin.high': "The flow is strong. Don't accelerate artificially — hold the rhythm.",
    'fin.mid': 'The flow is moving. Today — the main action for the slowest channel.'
  },
  es: {
    'greet.dawn': 'Amanecer — Ventana de Poder',
    'greet.morning': 'Informe Matutino',
    'greet.day': 'Ancla del Día',
    'greet.sunset': 'Ventana de Poder del Atardecer',
    'greet.evening': 'Deslizamiento Vespertino',
    'hint.dawn': 'Estás en una ventana de poder abierta. Lo más importante — es ahora.',
    'hint.morning': 'La ventana del atardecer aún está por delante — reserva tus fuerzas.',
    'hint.day': 'Hora de aterrizar. Balance en las muñecas.',
    'hint.sunset': 'Este es tu tiempo. Realiza la acción principal ahora.',
    'hint.evening': 'Reduce el ritmo. Cypress en los pies. Escucha.',
    'brief.fallback_title': 'Informe del Mentor',
    'good.morning': 'Buenos días',
    'good.day': 'Buen día',
    'good.sunset': 'Cálido atardecer',
    'good.night': 'Tranquila noche',
    'word.day': 'día',
    'word.days_few': 'días',
    'word.days_many': 'días',
    'btn.delete': 'Eliminar',
    'task.neutral': '⚖️ ordinaria',
    'task.resource': '🌟 de recurso',
    'task.shadow': '🌑 de sombra',
    'task.default_t1': 'Tarea principal en la ventana de poder',
    'finance.actual': 'Real $',
    'finance.target': 'Meta $',
    'finance.name_placeholder': 'Nombre del canal',
    // === ESPEJO DEL MOMENTO (Hero IA) ===
    'mirror.enter': 'Entra',
    'mirror.return': '← Espejo',
    'mirror.dar_of_day_label': 'Tu DAR hoy —',
    'mirror.period_dawn': 'Amanecer. La ventana más fuerte del día.',
    'mirror.period_morning': 'Mañana. Hora para lo principal.',
    'mirror.period_day': 'Mediodía. Hora para tareas tranquilas.',
    'mirror.period_sunset': 'Ventana de poder del atardecer.',
    'mirror.period_evening': 'Tarde. Hora de bajar el ritmo.',
    'mirror.period_night': 'Noche. Hora del silencio.',
    'mirror.teaser_d1': 'Entra — y ARKA empezará a conocerte a través del ritmo de tu DAR.',
    'mirror.teaser_d2': 'Entra — ya siento cómo entras en el ritmo.',
    'mirror.teaser_d3': 'Entra — hoy te mostraré el primer patrón que he notado.',
    'mirror.teaser_dN': 'Entra — tu día te espera.',
    // === TARJETA PARA COMPARTIR ===
    'share.download': 'Descargar',
    'share.send': 'Enviar',
    'share.default_quote': 'Mi día en ARKA',
    'share.day_prefix': 'Día ',
    'share.day_suffix': 'en ARKA',
    'share.tg_message': 'Mi día en ARKA',
    'share.mirror_quote_tpl': 'Hoy {dar} me guía',
    'tasks.no_tasks': '🌑 <b>No hay tareas para hoy.</b> Abre la pestaña «Hoy» y escribe 1-3 tareas principales. Sin dirección, la serpiente gira sin sentido.',
    'tasks.all_done': '🌟 <b>Las tareas del día están hechas.</b> El flujo TUMA corre suave. No añadas más — el flujo de poder importa más que la lista de victorias.',
    'tasks.partial': '⚖️ Tareas del día: <em>{done} de {total}</em>. Lo principal — hacer la tarea de recurso 🌟 en la ventana de poder.',
    'goal.progress': '🎯 Meta «<em>{title}</em>» — preparación <em>{pct}%</em>. ',
    'goal.slow': 'El ritmo es lento — elige <b>un paso</b> para hoy.',
    'goal.fast': 'Estás en el flujo. No te apresures.',
    'goal.steady': 'La ola es estable. Un paso — y el ritmo se mantiene.',
    'goal.none': '🎯 <b>No hay meta en la estrategia.</b> Abre «Estrategia» y nómbrala — la serpiente no puede deslizarse sin dirección.',
    'fin.progress': '💧 Flujos de ingresos: <em>{pct}%</em> de la meta mensual. ',
    'fin.low': 'TUMA fluye débilmente — mira qué canal se ha hundido y dirige tu atención allí hoy.',
    'fin.high': 'El flujo es fuerte. No aceleres artificialmente — mantén el ritmo.',
    'fin.mid': 'El flujo se mueve. Hoy — la acción principal para el canal más lento.'
  }
};
function dynLang() {
  const KEY = '_yupdar_preview_lang';
  try { const v = window.parent.localStorage.getItem(KEY); if (v && ARKA_DYN_I18N[v]) return v; } catch (e) {}
  try { const v = localStorage.getItem(KEY); if (v && ARKA_DYN_I18N[v]) return v; } catch (e) {}
  return 'ru';
}
function dt(key, params) {
  const lang = dynLang();
  // Ищем сначала в ARKA_DYN_I18N (для динамических строк из JS),
  // затем в ARKA_I18N (для статичных HTML-ключей)
  let str = (ARKA_DYN_I18N[lang] && ARKA_DYN_I18N[lang][key])
         || (ARKA_DYN_I18N.ru && ARKA_DYN_I18N.ru[key]);
  if (str === undefined) {
    // ARKA_I18N определён в HTML script-блоке — может быть недоступен в момент загрузки app.js
    try {
      if (typeof ARKA_I18N !== 'undefined') {
        str = (ARKA_I18N[lang] && ARKA_I18N[lang][key])
           || (ARKA_I18N.ru && ARKA_I18N.ru[key]);
      }
    } catch (e) {}
  }
  if (str === undefined) str = key;
  if (params) {
    Object.keys(params).forEach(k => {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
    });
  }
  return str;
}

// ── Иконка ЛИЧНОГО Дара пользователя (заменяет 🐉) ────────────────
// Берём профиль из localStorage основного приложения, ищем код Дара,
// возвращаем <img> с PNG-глифом из /dar-png-map.json.
// Если профиль не рассчитан — fallback на нейтральный сакральный символ ✦
let _userDarIconCache = null;
let _darPngMap = null;
function loadDarPngMap() {
  if (_darPngMap !== null) return _darPngMap;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/dar-png-map.json', false);
    xhr.send();
    if (xhr.status === 200) _darPngMap = JSON.parse(xhr.responseText);
    else _darPngMap = {};
  } catch (e) { _darPngMap = {}; }
  return _darPngMap;
}
function getUserDarIconHtml(size, extraStyle) {
  size = size || 24;
  extraStyle = extraStyle || '';
  // Попытка взять из window.parent
  let profile = null;
  try { profile = JSON.parse(window.parent.localStorage.getItem('_yupdar_preview_profile') || 'null'); } catch (e) {}
  if (!profile) {
    try { profile = JSON.parse(localStorage.getItem('_yupdar_preview_profile') || 'null'); } catch (e) {}
  }
  // Код Дара (синтез) — формат 'X-Y-Z'
  let code = null;
  if (profile) {
    if (profile.synthesis && profile.synthesis.code) code = profile.synthesis.code;
    else if (profile.code) code = profile.code;
    else if (profile.oda && profile.tuna && profile.tria) {
      code = profile.oda.digit + '-' + profile.tuna.digit + '-' + profile.tria.digit;
    }
  }
  const map = loadDarPngMap();
  const file = code && map[code] ? map[code] : null;
  if (file) {
    const src = '/dar-png/' + encodeURIComponent(file);
    return '<img class="user-dar-ic" src="' + src + '" alt="" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;vertical-align:middle;' + extraStyle + '" onerror="this.outerHTML=\'<span style=&quot;font-size:' + Math.round(size*0.8) + 'px&quot;>✦</span>\'">';
  }
  // Fallback: нейтральный сакральный символ
  return '<span class="user-dar-fallback" style="font-size:' + Math.round(size*0.85) + 'px;vertical-align:middle;' + extraStyle + '">✦</span>';
}

// Заменить все статичные 🐉 в DOM на иконку личного Дара
function replaceArkaDragons() {
  try {
    // Атрибуты с эмодзи (textContent)
    const all = document.querySelectorAll('[data-i18n], .tab-emoji, .streak-icon, .mirror-icon, .ts-icon, .card-icon, .mentor-badge, .dr-dragon, .cm-dragon-btn, .suggest-btn, .evo-ai-title, .mentor-btn, .demo-banner');
    all.forEach(el => {
      if (el.innerHTML && el.innerHTML.indexOf('🐉') !== -1) {
        // Сохраняем структуру — заменяем 🐉 на placeholder
        el.innerHTML = el.innerHTML.replace(/🐉/g, getUserDarIconHtml(20, 'margin-right:4px;'));
      }
    });
    // Иконка зеркала — крупнее
    const mIcon = document.querySelector('#arkaMirror .mirror-icon');
    if (mIcon && mIcon.textContent.trim() === '🐉') {
      mIcon.innerHTML = getUserDarIconHtml(72, 'filter:drop-shadow(0 0 18px rgba(212,175,55,0.5));');
    }
    // Бэйдж стрика
    const streak = document.querySelector('.streak-icon');
    if (streak && streak.textContent.trim() === '🐉') {
      streak.innerHTML = getUserDarIconHtml(22);
    }
  } catch (e) {}
}

// ── Приветствие ──────────────────────────────────────
// Шапка с приветствием убрана как дубль главного приложения (16.05.2026).
// Функция оставлена для совместимости, но безопасно проверяет наличие элемента.
function setGreeting() {
  const el = document.getElementById('timeOfDay');
  if (!el) return;
  const h = new Date().getHours();
  let txt = dt('good.morning');
  if (h >= 12 && h < 17) txt = dt('good.day');
  else if (h >= 17 && h < 22) txt = dt('good.sunset');
  else if (h >= 22 || h < 5) txt = dt('good.night');
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
// ── Фокус по времени дня: показываем только актуальный ритуал ───────
// Снимает перегруз во вкладке «Сегодня» — глаза не разбегаются.
function getCurrentPeriod() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12)  return 'dawn';   // утро
  if (h >= 12 && h < 17) return 'day';    // дневной якорь
  if (h >= 17 && h < 20) return 'dusk';   // главное окно силы
  return 'night';                          // вечер/ночь
}

function focusTodayByTime() {
  const current = getCurrentPeriod();
  const today = document.querySelector('[data-tab-content="today"]');
  if (!today) return;
  // Собираем ВСЕ карточки «Сегодня» в один аккордеон
  const groups = [];
  // 1) Окна силы — закрыто по умолчанию (информация о биоритме)
  const pw = today.querySelector('.power-window');
  if (pw) groups.push({ el: pw, headerSel: null, defaultOpen: false, type: 'pw' });
  // 2) Важные дела
  const tasks = today.querySelector('.tasks-card');
  if (tasks) groups.push({ el: tasks, headerSel: '.card-header', defaultOpen: false, type: 'tasks' });
  // 3) Ритуалы по периодам
  today.querySelectorAll('.ritual[data-ritual]').forEach(r => {
    groups.push({ el: r, headerSel: '.ritual-header', defaultOpen: r.dataset.ritual === current, type: 'ritual' });
  });
  // Прогресс не делаем сворачиваемым (он мелкий, всегда внизу)

  // Применяем классы и навешиваем клики
  groups.forEach((g, idx) => {
    g.el.classList.add('today-foldable');
    if (g.defaultOpen) g.el.classList.remove('today-folded');
    else g.el.classList.add('today-folded');

    // Для ритуалов поддерживаем старые классы
    if (g.type === 'ritual') {
      g.el.classList.toggle('ritual-active', g.defaultOpen);
      g.el.classList.toggle('ritual-folded', !g.defaultOpen);
    }

    const header = g.headerSel ? g.el.querySelector(g.headerSel) : g.el;
    if (!header) return;
    if (header.dataset.fold) return;
    header.dataset.fold = '1';
    header.style.cursor = 'pointer';
    header.addEventListener('click', (e) => {
      if (e.target.closest('button, input, a, select, textarea, label, details, summary, .ritual-time')) return;
      const isOpen = !g.el.classList.contains('today-folded');
      if (isOpen) {
        g.el.classList.add('today-folded');
        if (g.type === 'ritual') {
          g.el.classList.remove('ritual-active');
          g.el.classList.add('ritual-folded');
        }
      } else {
        // Сворачиваем все остальные карточки в «Сегодня»
        groups.forEach(o => {
          if (o === g) return;
          o.el.classList.add('today-folded');
          if (o.type === 'ritual') {
            o.el.classList.remove('ritual-active');
            o.el.classList.add('ritual-folded');
          }
        });
        g.el.classList.remove('today-folded');
        if (g.type === 'ritual') {
          g.el.classList.remove('ritual-folded');
          g.el.classList.add('ritual-active');
        }
      }
    });
  });

  // Легенда — свёрнута по умолчанию
  const legend = document.querySelector('.task-legend');
  if (legend && legend.open) legend.open = false;
}

// Внедряем CSS для свёрнутых ритуалов и секций один раз
function injectTodayFocusStyles() {
  if (document.getElementById('today-focus-css')) return;
  const s = document.createElement('style');
  s.id = 'today-focus-css';
  s.textContent = `
    .ritual[data-ritual] { position: relative; transition: opacity .2s; }
    .ritual[data-ritual] .ritual-header { cursor: pointer; user-select: none; }
    .ritual[data-ritual]::after {
      position: absolute;
      right: 18px; top: 22px;
      color: var(--accent-soft, #d4af37);
      font-size: 14px;
      pointer-events: none;
      opacity: 0.7;
    }
    .ritual-folded { opacity: 0.7; }
    .ritual-folded:hover { opacity: 1; }
    .ritual-folded .ritual-header { margin-bottom: 0; }
    .ritual-folded::after { content: '▾'; }
    .ritual-folded .checklist,
    .ritual-folded .journal { display: none; }
    .ritual-active { opacity: 1; }
    .ritual-active::after { content: '▴'; }

    /* Универсальный фолдинг для секций в Дар/Стратегия/Путь */
    .arka-foldable { position: relative; transition: opacity .2s; }
    .arka-foldable .card-header { cursor: pointer; user-select: none; }
    .arka-foldable::after {
      position: absolute;
      right: 18px; top: 18px;
      color: var(--accent-soft, #d4af37);
      font-size: 14px;
      pointer-events: none;
      opacity: 0.7;
    }
    .arka-foldable.folded { opacity: 0.7; }
    .arka-foldable.folded:hover { opacity: 1; }
    .arka-foldable.folded::after { content: '▾'; }
    .arka-foldable.folded > *:not(.card-header):not(.section-header) { display: none !important; }
    .arka-foldable:not(.folded)::after { content: '▴'; }

    /* Аккордеон в «Сегодня»: и для карточек, и для ритуалов */
    .today-foldable { position: relative; transition: opacity .2s; }
    .today-foldable::after {
      position: absolute;
      right: 18px; top: 18px;
      color: var(--accent-soft, #d4af37);
      font-size: 14px;
      pointer-events: none;
      opacity: 0.7;
      content: '▴';
    }
    .today-foldable.today-folded { opacity: 0.7; }
    .today-foldable.today-folded:hover { opacity: 1; }
    .today-foldable.today-folded::after { content: '▾'; }
    /* Сворачиваем всё, кроме шапок */
    .today-foldable.today-folded > *:not(.card-header):not(.ritual-header):not(.pw-icon):not(.pw-text) { display: none !important; }
    /* Окно силы — у него своя структура без card-header */
    .power-window.today-folded .pw-text > *:not(.pw-title) { display: none !important; }
  `;
  document.head.appendChild(s);
}

// Универсальный аккордеон секций в Дар / Стратегия / Путь
// Логика: первая секция в табе раскрыта, остальные свёрнуты.
// Клик по шапке раскрывает её и сворачивает все остальные в табе.
function initSectionFolding() {
  const tabs = ['dar', 'strategy', 'path'];
  tabs.forEach(tabName => {
    const tabContent = document.querySelector('[data-tab-content="' + tabName + '"]');
    if (!tabContent) return;
    const allSections = tabContent.querySelectorAll(':scope > section');
    // Только те, у которых есть шапка (card-header / section-header / mentor-title)
    const foldable = [];
    allSections.forEach(sec => {
      let header = sec.querySelector('.card-header, .section-header');
      // Fallback: первая «титульная» строка секции
      if (!header) header = sec.querySelector('.mentor-title, h2, h3');
      if (header) foldable.push({sec, header});
    });
    foldable.forEach((item, idx) => {
      item.sec.classList.add('arka-foldable');
      if (idx === 0) item.sec.classList.remove('folded');
      else item.sec.classList.add('folded');
      if (item.header.dataset.fold) return;
      item.header.dataset.fold = '1';
      item.header.style.cursor = 'pointer';
      item.header.addEventListener('click', (e) => {
        if (e.target.closest('button, input, a, select, textarea, label')) return;
        const isOpen = !item.sec.classList.contains('folded');
        if (isOpen) {
          // свернуть текущий
          item.sec.classList.add('folded');
        } else {
          // свернуть всех остальных в этом табе, раскрыть этот
          foldable.forEach(o => { if (o !== item) o.sec.classList.add('folded'); });
          item.sec.classList.remove('folded');
        }
      });
    });
  });
}

function initChecklist() {
  injectTodayFocusStyles();
  focusTodayByTime();
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
  const d = document.getElementById('streakDays');
  const w = document.getElementById('streakWord');
  if (!d || !w) return;  // блок стрика убран из «Сегодня»
  const start = new Date(state.streakStart);
  const today = new Date(TODAY);
  const days = Math.floor((today - start) / 86400000) + 1;
  d.textContent = days;
  w.textContent =
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
function getTaskTypeLabels() {
  return {
    neutral: dt('task.neutral'),
    resource: dt('task.resource'),
    shadow: dt('task.shadow')
  };
}
// Старая константа оставлена для совместимости (на случай если где-то ещё используется)
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
      <div class="task-text" contenteditable="true" data-id="${task.id}">${escapeHtml(task.text || (task._default ? dt(task._default) : ''))}</div>
      <span class="task-type" data-id="${task.id}" data-type="${task.type}">${getTaskTypeLabels()[task.type]}</span>
      <button class="task-remove" data-id="${task.id}" title="${dt('btn.delete')}">✕</button>
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
        <input class="finance-name" data-id="${ch.id}" data-field="name" value="${escapeAttr(ch.name)}" placeholder="${dt('finance.name_placeholder')}">
        <button class="finance-remove" data-id="${ch.id}" title="${dt('btn.delete')}">✕</button>
      </div>
      <div class="finance-row2">
        <span class="finance-amount-label">${dt('finance.actual')}</span>
        <input class="finance-amount" data-id="${ch.id}" data-field="actual" type="number" min="0" value="${ch.actual || 0}">
        <span class="finance-amount-label">${dt('finance.target')}</span>
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

  let greeting = dt('brief.fallback_title');
  let timeOfDayHint = '';
  if (h < 7) { greeting = dt('greet.dawn'); timeOfDayHint = dt('hint.dawn'); }
  else if (h < 12) { greeting = dt('greet.morning'); timeOfDayHint = dt('hint.morning'); }
  else if (h < 17) { greeting = dt('greet.day'); timeOfDayHint = dt('hint.day'); }
  else if (h < 20) { greeting = dt('greet.sunset'); timeOfDayHint = dt('hint.sunset'); }
  else { greeting = dt('greet.evening'); timeOfDayHint = dt('hint.evening'); }

  let body = `<b>${timeOfDayHint}</b>\n\n`;

  // Анализ задач
  if (tasksTotal === 0) {
    body += dt('tasks.no_tasks') + `\n\n`;
  } else if (tasksDone === tasksTotal) {
    body += dt('tasks.all_done') + `\n\n`;
  } else {
    body += dt('tasks.partial', { done: tasksDone, total: tasksTotal }) + `\n\n`;
  }

  // Анализ стратегии
  if (hasGoal && stepsTotal > 0) {
    const pct = Math.round(stepsDone / stepsTotal * 100);
    body += dt('goal.progress', { title: escapeHtml(state.goal.title), pct });
    if (pct < 30) body += dt('goal.slow') + `\n\n`;
    else if (pct >= 70) body += dt('goal.fast') + `\n\n`;
    else body += dt('goal.steady') + `\n\n`;
  } else if (!hasGoal) {
    body += dt('goal.none') + `\n\n`;
  }

  // Финансы
  if (financeTarget > 0) {
    body += dt('fin.progress', { pct: finPct });
    if (finPct < 25) body += dt('fin.low') + `\n\n`;
    else if (finPct > 80) body += dt('fin.high') + `\n\n`;
    else body += dt('fin.mid') + `\n\n`;
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

// ── Зеркало момента (Hero AI при открытии АРКА) ─────────
// Закон no_overload: 1 экран, 1 послание, 1 кнопка. Никаких других элементов.
// Послание собирается из 4 параметров: время суток × Дар × день в АРКА × контекст.
//
// Логика показа:
// - Первое открытие АРКА в этот день → Зеркало (полный экран).
// - После «Войти в день» → обычные табы + маленькая кнопка возврата вверху.
// - Через 4+ часов после последнего просмотра → Зеркало снова (по желанию юзера).

// Рассчитать «Дар дня» по той же системе ОДА/ТУНА/ТРИА/ЧИА,
// но с подстановкой СЕГОДНЯШНЕЙ даты и ТЕКУЩЕГО времени.
// Это даёт уникальный архетип, ведущий юзера именно сегодня.
function calcDarOfDay(userProfile) {
  let DarsLib = null;
  try { DarsLib = window.parent.DarsLib || null; } catch (e) {}
  if (!DarsLib || !DarsLib.calcProfile) return null;

  const now = new Date();
  const input = {
    date: { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() },
    time: { hour: now.getHours(), minute: now.getMinutes() }
  };
  // Координаты места рождения юзера (стабильный персональный фактор)
  if (userProfile && userProfile.tria && userProfile.tria.coords) {
    input.coords = userProfile.tria.coords;
  } else if (userProfile && userProfile.coords) {
    input.coords = userProfile.coords;
  }
  // Имя и фамилия юзера (стабильный персональный фактор)
  if (userProfile && userProfile.chia) {
    input.person = { firstName: userProfile.chia.firstName, lastName: userProfile.chia.lastName };
  } else if (userProfile && userProfile.person) {
    input.person = userProfile.person;
  }

  const profile = DarsLib.calcProfile(input);
  if (!profile) return null;

  // Дар дня = синтез (пока = ОДА текущего дня)
  const code = profile.synthesis.code;
  const name = profile.synthesis.name;
  const archetype = profile.synthesis.archetype || DarsLib.getDarArchetype(code, 'ru') || '';
  // SVG-путь для иконки
  let svgPath = '';
  try { svgPath = DarsLib.getDarSvgPath(code); } catch (e) {}

  return { code, name, archetype, svgPath };
}

function getMirrorState() {
  // Какой период дня сейчас
  const h = new Date().getHours();
  let period = 'morning';
  if (h < 5) period = 'night';
  else if (h < 9) period = 'dawn';
  else if (h < 12) period = 'morning';
  else if (h < 17) period = 'day';
  else if (h < 20) period = 'sunset';
  else if (h < 23) period = 'evening';
  else period = 'night';

  // Какой день в АРКА (по streak)
  let arkaDay = 1;
  try {
    const sStart = state.streakStart || TODAY;
    const startD = new Date(sStart);
    const todayD = new Date(TODAY);
    arkaDay = Math.max(1, Math.round((todayD - startD) / 86400000) + 1);
  } catch (e) {}

  // Имя юзера и его профиль (для расчёта Дара дня)
  let userName = '';
  let userProfile = null;
  try {
    userProfile = JSON.parse(window.parent.localStorage.getItem('_yupdar_preview_profile') || 'null');
    if (userProfile && userProfile.chia && userProfile.chia.firstName) userName = userProfile.chia.firstName;
  } catch (e) {}

  // Дар дня
  const darOfDay = calcDarOfDay(userProfile);

  return { period, arkaDay, userName, darOfDay };
}

// Безопасный dt — возвращает '' если ключа нет или значение пустое (вместо самого ключа)
function dtOrEmpty(key) {
  const lang = dynLang();
  // Сначала ARKA_DYN_I18N
  let dict = ARKA_DYN_I18N[lang] || ARKA_DYN_I18N.ru;
  let v = (dict[key] !== undefined) ? dict[key] : (ARKA_DYN_I18N.ru[key] !== undefined ? ARKA_DYN_I18N.ru[key] : undefined);
  // Потом ARKA_I18N
  if (v === undefined) {
    try {
      if (typeof ARKA_I18N !== 'undefined') {
        const dict2 = ARKA_I18N[lang] || ARKA_I18N.ru;
        v = (dict2[key] !== undefined) ? dict2[key] : (ARKA_I18N.ru[key] !== undefined ? ARKA_I18N.ru[key] : undefined);
      }
    } catch (e) {}
  }
  return (v == null || v === undefined) ? '' : v;
}

function generateMirror() {
  const { period, arkaDay, userName, darOfDay } = getMirrorState();

  // Понятная фраза о текущем моменте — короткая, конкретная.
  // Только период дня — без эзотерики, чтобы любой понял.
  const periodLabel = dtOrEmpty('mirror.period_' + period);

  // Послание Дара дня — короткий вопрос/приглашение в архетипе ЭТОГО Дара
  let darInvite = '';
  if (darOfDay && darOfDay.archetype) {
    darInvite = darOfDay.archetype;  // например: "Гармонизатор границ"
  }

  // Что юзер увидит/получит, нажав «Войди» — конкретно, по-человечески
  const teaser = arkaDay === 1 ? dtOrEmpty('mirror.teaser_d1')
                  : arkaDay === 2 ? dtOrEmpty('mirror.teaser_d2')
                  : arkaDay === 3 ? dtOrEmpty('mirror.teaser_d3')
                  : dtOrEmpty('mirror.teaser_dN');

  return {
    name: userName || dtOrEmpty('banner.friend'),
    periodLabel,
    darOfDay,
    darInvite,
    teaser
  };
}

function renderMirror() {
  const el = document.getElementById('mirrorMessage');
  if (!el) return;
  const m = generateMirror();

  // Иконка Дара дня — SVG-глиф из основного приложения,
  // fallback на PNG личного Дара пользователя.
  const iconEl = document.querySelector('#arkaMirror .mirror-icon');
  if (iconEl && m.darOfDay && m.darOfDay.svgPath) {
    iconEl.innerHTML = '<img src="' + m.darOfDay.svgPath + '" alt="" style="width:72px;height:72px;filter:drop-shadow(0 0 18px rgba(212,175,55,0.5))" onerror="this.outerHTML=\'' + getUserDarIconHtml(72, 'filter:drop-shadow(0 0 18px rgba(212,175,55,0.5));').replace(/'/g, '&apos;') + '\'">';
  } else if (iconEl) {
    iconEl.innerHTML = getUserDarIconHtml(72, 'filter:drop-shadow(0 0 18px rgba(212,175,55,0.5));');
  }

  // Текст послания — простой и понятный
  let html = '';
  if (m.name) html += '<span class="mirror-name">' + escapeHtml(m.name) + '</span>';
  // Период дня (одна короткая фраза)
  if (m.periodLabel) html += '<span class="mirror-line">' + m.periodLabel + '</span>';
  // Дар дня — отдельной строкой, выделенный
  if (m.darOfDay && m.darOfDay.name) {
    const label = dtOrEmpty('mirror.dar_of_day_label');  // "Дар дня:" / "DAR of the day:" / "DAR del día:"
    html += '<span class="mirror-line mirror-dar-of-day">' + label + ' <b>' + escapeHtml(m.darOfDay.name) + '</b></span>';
    if (m.darInvite) {
      html += '<span class="mirror-line mirror-archetype"><em>' + escapeHtml(m.darInvite) + '</em></span>';
    }
  }
  // Что внутри (тизер)
  if (m.teaser) html += '<span class="mirror-line mirror-teaser">' + m.teaser + '</span>';

  el.innerHTML = html;
}

function enterDay() {
  const mirror = document.getElementById('arkaMirror');
  const main = document.getElementById('arkaMain');
  const returnBtn = document.getElementById('mirrorReturnBtn');
  if (mirror) mirror.hidden = true;
  if (main) main.hidden = false;
  if (returnBtn) returnBtn.hidden = false;
  try { localStorage.setItem('arka_mirror_seen_at', Date.now().toString()); } catch (e) {}
}

function returnToMirror() {
  const mirror = document.getElementById('arkaMirror');
  const main = document.getElementById('arkaMain');
  const returnBtn = document.getElementById('mirrorReturnBtn');
  if (mirror) { renderMirror(); mirror.hidden = false; }
  if (main) main.hidden = true;
  if (returnBtn) returnBtn.hidden = true;
}
window.returnToMirror = returnToMirror;

// Возврат в главное меню YupDar (родительский iframe)
function backToYupDar() {
  try {
    // Если открыто внутри iframe основного приложения — переключаем там вкладку на «Я»
    if (window.parent && window.parent !== window && typeof window.parent.switchTab === 'function') {
      window.parent.switchTab('me');
      return;
    }
  } catch (e) {}
  // Фоллбэк — переход на главное превью
  try { window.location.href = '/preview/'; } catch (e) {}
}
window.backToYupDar = backToYupDar;

function initMirror() {
  renderMirror();
  const btn = document.getElementById('mirrorEnterBtn');
  if (btn) btn.addEventListener('click', enterDay);

  // Решаем: показывать ли Зеркало сейчас?
  // - В первое посещение сегодня: ДА
  // - Если юзер видел Зеркало < 4 часов назад: НЕТ (сразу основной экран)
  let seenAt = 0;
  try { seenAt = parseInt(localStorage.getItem('arka_mirror_seen_at') || '0', 10); } catch (e) {}
  const fourHours = 4 * 60 * 60 * 1000;
  if (seenAt && (Date.now() - seenAt) < fourHours) {
    // Юзер недавно «вошёл в день» — показываем основной экран сразу
    enterDay();
  }
}

// ── Шеринг-карточка инсайтов ─────────────────────────────────
// Генерирует красивую PNG-карточку с Даром, инсайтом и брендингом.
// Используется для виральности — юзер делится в Stories/чатах.
//
// Размер 540×960 = соотношение 9:16 (Instagram Stories / Telegram Stories).

let _lastShareDataUrl = null;

function drawShareCard(opts) {
  const canvas = document.getElementById('shareCanvas');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Фон — глубокий бирюзово-синий с золотыми пятнами (тема З-МАН)
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0a1929');
  bgGrad.addColorStop(0.5, '#0F1F33');
  bgGrad.addColorStop(1, '#0a1929');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);
  // Радиальные свечения
  const glow1 = ctx.createRadialGradient(W * 0.2, H * 0.15, 0, W * 0.2, H * 0.15, W * 0.6);
  glow1.addColorStop(0, 'rgba(125, 211, 252, 0.18)');
  glow1.addColorStop(1, 'rgba(125, 211, 252, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(W * 0.85, H * 0.85, 0, W * 0.85, H * 0.85, W * 0.6);
  glow2.addColorStop(0, 'rgba(212, 175, 55, 0.15)');
  glow2.addColorStop(1, 'rgba(212, 175, 55, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Золотая рамка-обводка
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // Лого YupDar сверху
  ctx.fillStyle = '#D4AF37';
  ctx.font = 'bold 32px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('✦ АРКА', W / 2, 100);
  ctx.font = '14px Manrope, sans-serif';
  ctx.fillStyle = 'rgba(212, 175, 55, 0.65)';
  ctx.fillText('Y U P D A R', W / 2, 130);

  // Имя юзера
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Manrope, sans-serif';
  ctx.fillText(opts.userName || 'Друг', W / 2, 220);

  // Дар (в большом размере)
  ctx.fillStyle = '#D4AF37';
  ctx.font = 'bold 64px Manrope, sans-serif';
  ctx.fillText(opts.darName || '—', W / 2, 320);

  // Архетип
  ctx.fillStyle = '#7DD3FC';
  ctx.font = 'italic 22px Manrope, sans-serif';
  ctx.fillText(opts.archetype || '', W / 2, 360);

  // Цитата / инсайт — центральная часть
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '24px Manrope, sans-serif';
  const quote = opts.quote || '';
  const lines = wrapText(ctx, '«' + quote + '»', W - 100);
  let y = 480;
  lines.forEach(line => {
    ctx.fillText(line, W / 2, y);
    y += 36;
  });

  // День в АРКА — внизу
  ctx.fillStyle = 'rgba(212, 175, 55, 0.65)';
  ctx.font = '16px Manrope, sans-serif';
  ctx.fillText((opts.dayLabel || '') , W / 2, H - 100);

  // Подпись «public-yup-land1.vercel.app/preview/»
  ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
  ctx.font = '13px Manrope, sans-serif';
  ctx.fillText('public-yup-land1.vercel.app/preview', W / 2, H - 60);

  // Сохраняем dataURL для скачивания
  _lastShareDataUrl = canvas.toDataURL('image/png');
  return _lastShareDataUrl;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4); // максимум 4 строки цитаты
}

// Открыть шеринг — generates карточка по контексту
function openShareCard(context, customQuote) {
  const overlay = document.getElementById('shareOverlay');
  if (!overlay) return;

  // Подтягиваем данные юзера + Дара дня
  const { userName, darOfDay } = getMirrorState();

  // Цитата — либо передана, либо генерируется из контекста
  let quote = customQuote;
  if (!quote) {
    if (context === 'mirror' && darOfDay) {
      // «Сегодня <Дар> ведёт меня» — поэтичная универсальная цитата
      const tpl = dtOrEmpty('share.mirror_quote_tpl') || 'Сегодня {dar} ведёт меня';
      quote = tpl.replace('{dar}', darOfDay.name || '');
    } else {
      quote = dtOrEmpty('share.default_quote');
    }
  }

  // День в АРКА
  const { arkaDay } = getMirrorState();
  const dayLabel = (dtOrEmpty('share.day_prefix') || 'День ') + arkaDay + ' ' + (dtOrEmpty('share.day_suffix') || 'в АРКА');

  drawShareCard({
    userName: userName || dtOrEmpty('banner.friend'),
    darName: darOfDay ? darOfDay.name : '',
    archetype: darOfDay ? darOfDay.archetype : '',
    quote: quote || '',
    dayLabel
  });

  overlay.hidden = false;
}
window.openShareCard = openShareCard;

function closeShareCard() {
  const overlay = document.getElementById('shareOverlay');
  if (overlay) overlay.hidden = true;
}
window.closeShareCard = closeShareCard;

function downloadShareCard() {
  if (!_lastShareDataUrl) return;
  const a = document.createElement('a');
  a.href = _lastShareDataUrl;
  a.download = 'arka-' + Date.now() + '.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
window.downloadShareCard = downloadShareCard;

// Шеринг через Telegram WebApp API (если доступно) или копирование ссылки
// ═══════════════════════════════════════════════════
// КВЕСТ: ОТКРЫТИЕ ТЕНИ
// ═══════════════════════════════════════════════════
// Логика:
// 1. В Дневнике эволюции при выборе «Тень» появляется селект «Какая?»
// 2. При сохранении записи — счётчик этой тени +1
// 3. Когда счётчик >= 3 → анимация открытия → тень в «Пройденные» + разблокировка практики

// Каталог теней: каждая тень = id → имя + связанная практика которая открывается
const SHADOWS_CATALOG = {
  shadow_fall_out:      { i18n: 'arka.shadow_fall_out',       unlocks: 'practice_breath_sync' },
  shadow_stuck_future:  { i18n: 'arka.shadow_stuck_future',   unlocks: 'practice_slide_past' },
  shadow_rush:          { i18n: 'arka.shadow_rush',           unlocks: 'practice_logos_anchor' },
  shadow_procrastination: { i18n: 'arka.shadow_procrastination', unlocks: 'practice_slowdown' }
};

// Каталог практик: id → ключ имени + время + ключ имени связанной тени
const PRACTICES_CATALOG = {
  practice_slowdown:     { i18n: 'arka.trainer_p1', time: '5 мин', requires: null },
  practice_breath_sync:  { i18n: 'arka.trainer_p2', time: '3 мин', requires: 'shadow_fall_out' },
  practice_slide_past:   { i18n: 'arka.trainer_p3', time: '7 мин', requires: 'shadow_stuck_future' },
  practice_logos_anchor: { i18n: 'arka.trainer_p4', time: '2 мин', requires: 'shadow_rush' }
};

// Рендер Карты роста — пройденные + активные тени из state.shadows
function renderGrowthMap() {
  const doneEl = document.getElementById('growthShadowsDone');
  const activeEl = document.getElementById('growthShadowsActive');
  if (!doneEl || !activeEl) return;
  const sh = state.shadows || { passed: [], active: [] };

  doneEl.innerHTML = sh.passed.map(id => {
    const sh = SHADOWS_CATALOG[id];
    if (!sh) return '';
    return '<span class="gs-tag">' + escapeHtml(dt(sh.i18n) || dtOrEmpty(sh.i18n) || id) + '</span>';
  }).join('');

  activeEl.innerHTML = sh.active.map(id => {
    const sh = SHADOWS_CATALOG[id];
    if (!sh) return '';
    const cnt = (state.shadows.counts && state.shadows.counts[id]) || 0;
    const progress = cnt > 0 ? ' (' + cnt + '/3)' : '';
    return '<span class="gs-tag gs-tag-active">' + escapeHtml(dt(sh.i18n) || id) + progress + '</span>';
  }).join('');
}

// Рендер списка практик в Тренажёре с учётом блокировок
function renderTrainerPractices() {
  // Тренажёр рендерится статично в HTML. Применяем классы lock/unlock по state.shadows.unlocked.
  document.querySelectorAll('.trainer-practice').forEach((el, idx) => {
    const practiceIds = ['practice_slowdown', 'practice_breath_sync', 'practice_slide_past', 'practice_logos_anchor'];
    const pid = practiceIds[idx];
    if (!pid) return;
    const isUnlocked = state.shadows.unlocked.indexOf(pid) >= 0;
    el.classList.toggle('trainer-practice-locked', !isUnlocked);
    // Заменяем mark на замок если закрыто
    const mark = el.querySelector('.tp-mark');
    if (mark && !isUnlocked) mark.textContent = '🔒';
  });
}

// Заполнить селект активных теней в Дневнике
function renderShadowSelect() {
  const sel = document.getElementById('evoShadowSelect');
  if (!sel) return;
  const placeholderText = dtOrEmpty('arka.journal_which_shadow') || 'Какая тень?';
  let html = '<option value="">' + escapeHtml(placeholderText) + '</option>';
  state.shadows.active.forEach(id => {
    const sh = SHADOWS_CATALOG[id];
    if (!sh) return;
    html += '<option value="' + id + '">' + escapeHtml(dt(sh.i18n) || id) + '</option>';
  });
  sel.innerHTML = html;
}

// Сохранение записи в Дневник + квест-логика
function saveJournalEntry() {
  const textarea = document.getElementById('evoTextarea');
  const select = document.getElementById('evoShadowSelect');
  const activeTab = document.querySelector('.evo-tab.evo-tab-active');
  const evoType = activeTab ? activeTab.dataset.evo : 'light';
  const text = (textarea && textarea.value || '').trim();
  if (!text) return;

  // Сохраняем запись
  if (!Array.isArray(state.journal)) state.journal = [];
  const entry = { date: TODAY, type: evoType, text, shadowId: null };
  if (evoType === 'shadow' && select && select.value) {
    entry.shadowId = select.value;
  }
  state.journal.push(entry);

  // Если тип «тень» и выбран shadowId — инкремент счётчика
  if (entry.shadowId) {
    if (!state.shadows.counts) state.shadows.counts = {};
    state.shadows.counts[entry.shadowId] = (state.shadows.counts[entry.shadowId] || 0) + 1;
    // Проверяем: достигнут порог?
    if (state.shadows.counts[entry.shadowId] >= 3 && state.shadows.passed.indexOf(entry.shadowId) === -1) {
      passShadow(entry.shadowId);
      saveState();
      return;
    }
  }

  saveState();
  // Очистка
  if (textarea) textarea.value = '';
  renderGrowthMap();
}

// Тень прошла → перевести в пройденные, разблокировать практику, показать анимацию
function passShadow(shadowId) {
  const sh = SHADOWS_CATALOG[shadowId];
  if (!sh) return;

  // Перевод тени
  state.shadows.active = state.shadows.active.filter(x => x !== shadowId);
  if (state.shadows.passed.indexOf(shadowId) === -1) state.shadows.passed.push(shadowId);

  // Разблокировка практики
  let unlockedPracticeId = null;
  if (sh.unlocks && state.shadows.unlocked.indexOf(sh.unlocks) === -1) {
    state.shadows.unlocked.push(sh.unlocks);
    unlockedPracticeId = sh.unlocks;
  }

  // Показать анимацию
  showShadowUnlock(shadowId, unlockedPracticeId);

  // Обновить UI
  renderGrowthMap();
  renderTrainerPractices();

  // Очистка ввода
  const textarea = document.getElementById('evoTextarea');
  if (textarea) textarea.value = '';
}

// Полноэкранная анимация открытия тени
function showShadowUnlock(shadowId, practiceId) {
  const sh = SHADOWS_CATALOG[shadowId];
  const pr = practiceId ? PRACTICES_CATALOG[practiceId] : null;
  const overlay = document.getElementById('shadowUnlockOverlay');
  if (!overlay) return;
  const shadowName = dt(sh.i18n) || shadowId;
  const practiceName = pr ? (dt(pr.i18n) || practiceId) : '';
  document.getElementById('shadowUnlockShadow').textContent = shadowName;
  const prEl = document.getElementById('shadowUnlockPractice');
  if (prEl) {
    if (practiceName) {
      prEl.innerHTML = '<span class="su-label" data-i18n="arka.unlock_new_practice">Открылась новая практика</span><span class="su-practice-name">' + escapeHtml(practiceName) + '</span>';
      prEl.hidden = false;
    } else {
      prEl.hidden = true;
    }
  }
  applyArkaI18n();
  overlay.hidden = false;
}
function closeShadowUnlock() {
  const overlay = document.getElementById('shadowUnlockOverlay');
  if (overlay) overlay.hidden = true;
}
window.closeShadowUnlock = closeShadowUnlock;

// ═══════════════════════════════════════════════════
// ПИСЬМО СЕБЕ НА 30 ДНЕЙ
// ═══════════════════════════════════════════════════
// 3 состояния:
// 1. NOT_YET — день < 3 (карточка скрыта)
// 2. PROMPT — день >= 3, письмо не запечатано (карточка-приглашение)
// 3. SEALED — письмо запечатано (карточка с обратным отсчётом)
// 4. READY — прошло 30 дней или открыта первая тень после запечатывания
//
// Состояние в localStorage:
// - arka_letter_text — текст письма
// - arka_letter_sealed_at — timestamp запечатывания
// - arka_letter_opened — true когда уже открыто

const LETTER_DAYS = 30;

function getLetterState() {
  let text = '';
  let sealedAt = 0;
  let opened = false;
  try {
    text = localStorage.getItem('arka_letter_text') || '';
    sealedAt = parseInt(localStorage.getItem('arka_letter_sealed_at') || '0', 10);
    opened = localStorage.getItem('arka_letter_opened') === '1';
  } catch (e) {}

  // День в АРКА
  let arkaDay = 1;
  try {
    const sStart = state.streakStart || TODAY;
    arkaDay = Math.max(1, Math.round((new Date(TODAY) - new Date(sStart)) / 86400000) + 1);
  } catch (e) {}

  // Дней с запечатывания
  let daysSealed = 0;
  if (sealedAt) {
    daysSealed = Math.floor((Date.now() - sealedAt) / 86400000);
  }
  const daysLeft = Math.max(0, LETTER_DAYS - daysSealed);

  let phase = 'NOT_YET';
  if (arkaDay >= 3 && !sealedAt) phase = 'PROMPT';
  else if (sealedAt && !opened && daysLeft > 0) phase = 'SEALED';
  else if (sealedAt && !opened && daysLeft === 0) phase = 'READY';
  else if (opened) phase = 'OPENED';

  return { text, sealedAt, opened, arkaDay, daysSealed, daysLeft, phase };
}

function renderLetterCard() {
  const card = document.getElementById('letterCard');
  if (!card) return;
  const st = getLetterState();

  if (st.phase === 'NOT_YET' || st.phase === 'OPENED') {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  if (st.phase === 'PROMPT') {
    card.innerHTML =
      '<div class="lc-seal">📜</div>' +
      '<div class="lc-title">' + escapeHtml(dt('arka.letter_card_title')) + '</div>' +
      '<div class="lc-hint">' + escapeHtml(dt('arka.letter_card_hint')) + '</div>' +
      '<button class="lc-btn" onclick="openLetterInput()">' + escapeHtml(dt('arka.letter_card_btn')) + '</button>';
  } else if (st.phase === 'SEALED') {
    card.innerHTML =
      '<div class="lc-seal">📜</div>' +
      '<div class="lc-title">' + escapeHtml(dt('arka.letter_sealed_title')) + '</div>' +
      '<div class="lc-status">' +
        escapeHtml(dt('arka.letter_sealed_status_pre')) +
        ' <span class="lc-countdown">' + st.daysLeft + '</span> ' +
        escapeHtml(dt('arka.letter_sealed_status_post')) +
      '</div>';
  } else if (st.phase === 'READY') {
    card.innerHTML =
      '<div class="lc-seal">📜</div>' +
      '<div class="lc-title">' + escapeHtml(dt('arka.letter_ready_title')) + '</div>' +
      '<div class="lc-hint">' + escapeHtml(dt('arka.letter_ready_hint')) + '</div>' +
      '<button class="lc-btn" onclick="openLetterReveal()">' + escapeHtml(dt('arka.letter_ready_btn')) + '</button>';
  }
}

function openLetterInput() {
  const overlay = document.getElementById('letterInputOverlay');
  if (overlay) overlay.hidden = false;
}
window.openLetterInput = openLetterInput;

function closeLetterInput() {
  const overlay = document.getElementById('letterInputOverlay');
  if (overlay) overlay.hidden = true;
}
window.closeLetterInput = closeLetterInput;

function sealLetter() {
  const ta = document.getElementById('letterTextarea');
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;
  try {
    localStorage.setItem('arka_letter_text', text);
    localStorage.setItem('arka_letter_sealed_at', Date.now().toString());
    localStorage.removeItem('arka_letter_opened');
  } catch (e) {}
  closeLetterInput();
  renderLetterCard();
}

function openLetterReveal() {
  const st = getLetterState();
  if (!st.text) return;
  document.getElementById('letterOpenText').textContent = st.text;
  const sealedDate = new Date(st.sealedAt);
  const dateStr = sealedDate.getDate() + '.' + String(sealedDate.getMonth() + 1).padStart(2, '0') + '.' + sealedDate.getFullYear();
  document.getElementById('letterOpenDate').textContent = dt('arka.letter_open_from') + ' ' + dateStr;
  const overlay = document.getElementById('letterOpenOverlay');
  if (overlay) overlay.hidden = false;
}
window.openLetterReveal = openLetterReveal;

function closeLetterOpen() {
  const overlay = document.getElementById('letterOpenOverlay');
  if (overlay) overlay.hidden = true;
  try { localStorage.setItem('arka_letter_opened', '1'); } catch (e) {}
  renderLetterCard();
}
window.closeLetterOpen = closeLetterOpen;

function initLetter() {
  renderLetterCard();
  const btn = document.getElementById('letterSealBtn');
  if (btn) btn.addEventListener('click', sealLetter);
}

// ═══════════════════════════════════════════════════
// КОЛЬЦО СИЛЫ — социальная фича
// ═══════════════════════════════════════════════════
// Демо-список близких: имя, эмодзи-состояние, может ли получить «🐉»
// В реальном проде эти данные будут приходить с сервера через приглашения.

function getCircleMembers() {
  // Демо-данные. В проде — fetch с сервера.
  let circle = [];
  try {
    const raw = localStorage.getItem('arka_circle');
    if (raw) circle = JSON.parse(raw);
  } catch (e) {}
  // Если пусто — даём демо-данные при первом запуске
  if (!circle.length) {
    circle = [
      { id: 'm1', name: 'Маша', state: 'light', sent: false },
      { id: 'm2', name: 'Лена', state: 'neutral', sent: false }
    ];
    try { localStorage.setItem('arka_circle', JSON.stringify(circle)); } catch (e) {}
  }
  return circle;
}

function saveCircleMembers(list) {
  try { localStorage.setItem('arka_circle', JSON.stringify(list)); } catch (e) {}
}

function getStateEmoji(state) {
  switch (state) {
    case 'light': return '🌟';
    case 'shadow': return '🌑';
    case 'neutral': default: return '⚖️';
  }
}
function getStateLabel(state) {
  switch (state) {
    case 'light': return dt('arka.circle_state_light');
    case 'shadow': return dt('arka.circle_state_shadow');
    case 'neutral': default: return dt('arka.circle_state_neutral');
  }
}

function renderCircle() {
  const container = document.getElementById('circleMembers');
  if (!container) return;
  const members = getCircleMembers();
  if (!members.length) {
    container.innerHTML = '<div class="circle-empty">' + escapeHtml(dt('arka.circle_empty')) + '</div>';
    return;
  }
  container.innerHTML = members.map(m => {
    const initial = (m.name || '?').charAt(0);
    return '<div class="circle-member">' +
      '<div class="cm-avatar">' + escapeHtml(initial) + '</div>' +
      '<div class="cm-info">' +
        '<div class="cm-name">' + escapeHtml(m.name) + '</div>' +
        '<div class="cm-status"><span class="cm-status-emoji">' + getStateEmoji(m.state) + '</span> ' + escapeHtml(getStateLabel(m.state)) + '</div>' +
      '</div>' +
      '<button class="cm-dragon-btn' + (m.sent ? ' sent' : '') + '" onclick="sendDragon(\'' + m.id + '\')" title="' + escapeAttr(dt('arka.circle_send_dragon')) + '">' + getUserDarIconHtml(26) + '</button>' +
    '</div>';
  }).join('');
}

function sendDragon(memberId) {
  const members = getCircleMembers();
  const m = members.find(x => x.id === memberId);
  if (!m || m.sent) return;
  m.sent = true;
  saveCircleMembers(members);
  renderCircle();
  // Простая «вспышка» — короткое сообщение или ничего, не перегружаем UI
}
window.sendDragon = sendDragon;

function inviteToCircle() {
  // В реальном проде — открывает Telegram share с приглашением
  const inviteUrl = 'https://public-yup-land1.vercel.app/preview/';
  const text = dt('arka.circle_invite_text');
  try {
    if (window.parent && window.parent.Telegram && window.parent.Telegram.WebApp && window.parent.Telegram.WebApp.openTelegramLink) {
      window.parent.Telegram.WebApp.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(inviteUrl) + '&text=' + encodeURIComponent(text));
      return;
    }
  } catch (e) {}
  window.open('https://t.me/share/url?url=' + encodeURIComponent(inviteUrl) + '&text=' + encodeURIComponent(text), '_blank');
}
window.inviteToCircle = inviteToCircle;

// Симуляция: при первом открытии АРКА в течение дня — иногда «приходит» дракон от близкого
function maybeReceiveDragon() {
  // Демо-логика: 30% шанс если есть кто-то в Кольце и сегодня ещё не получали
  try {
    const lastReceived = localStorage.getItem('arka_last_dragon_received') || '';
    if (lastReceived === TODAY) return;  // уже получили сегодня
    const members = getCircleMembers();
    if (!members.length) return;
    if (Math.random() > 0.3) return;
    const sender = members[Math.floor(Math.random() * members.length)];
    setTimeout(() => showDragonReceived(sender.name), 4000);  // через 4 сек после загрузки
    localStorage.setItem('arka_last_dragon_received', TODAY);
  } catch (e) {}
}

function showDragonReceived(senderName) {
  const overlay = document.getElementById('dragonReceivedOverlay');
  const label = document.getElementById('dragonReceivedFrom');
  if (!overlay || !label) return;
  label.textContent = senderName;
  overlay.hidden = false;
}
function closeDragonReceived() {
  const overlay = document.getElementById('dragonReceivedOverlay');
  if (overlay) overlay.hidden = true;
}
window.closeDragonReceived = closeDragonReceived;

function initCircle() {
  renderCircle();
  maybeReceiveDragon();
}

// Инициализация квеста теней
function initShadowQuest() {
  renderGrowthMap();
  renderTrainerPractices();
  renderShadowSelect();

  // Переключение вкладок дневника: показываем/скрываем селект тени
  document.querySelectorAll('.evo-tab[data-evo]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.evo-tab').forEach(t => t.classList.toggle('evo-tab-active', t === tab));
      const sel = document.getElementById('evoShadowSelect');
      if (sel) sel.hidden = tab.dataset.evo !== 'shadow';
    });
  });

  // Сохранение записи
  const btn = document.getElementById('evoSaveBtn');
  if (btn) btn.addEventListener('click', saveJournalEntry);
}

function shareViaTelegram() {
  const shareUrl = 'https://public-yup-land1.vercel.app/preview/';
  const shareText = dtOrEmpty('share.tg_message') || 'Мой день в АРКА';
  // Если открыто в Telegram WebApp — используем нативный API
  try {
    if (window.parent && window.parent.Telegram && window.parent.Telegram.WebApp) {
      const tg = window.parent.Telegram.WebApp;
      if (tg.openTelegramLink) {
        const url = 'https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareText);
        tg.openTelegramLink(url);
        return;
      }
    }
  } catch (e) {}
  // Фоллбэк — обычная ссылка t.me/share
  window.open('https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareText), '_blank');
}
window.shareViaTelegram = shareViaTelegram;

// ── Запуск ───────────────────────────────────────────
setGreeting();
initTabs();
initMirror();
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
initShadowQuest();
initLetter();
initCircle();
initSectionFolding();

// ── Авто-замена 🐉 на иконку личного Дара пользователя ─────────────
// Запускается после рендера и затем на каждое изменение DOM
// (с защитой от бесконечного цикла самоизменений).
let __dragonReplaceLock = false;
let __dragonReplaceTimer = null;
function replaceAllDragonNodes() {
  if (__dragonReplaceLock) return;
  __dragonReplaceLock = true;
  try {
    const root = document.body;
    if (!root) { __dragonReplaceLock = false; return; }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeValue && n.nodeValue.indexOf('🐉') !== -1) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    if (!nodes.length) { __dragonReplaceLock = false; return; }
    nodes.forEach(node => {
      const parent = node.parentNode;
      if (!parent) return;
      let size = 20;
      const cls = parent.className || '';
      if (cls.indexOf('mirror-icon') !== -1) size = 64;
      else if (cls.indexOf('streak-icon') !== -1) size = 22;
      else if (cls.indexOf('tab-emoji') !== -1) size = 22;
      else if (cls.indexOf('card-icon') !== -1 || cls.indexOf('ts-icon') !== -1) size = 22;
      else if (cls.indexOf('cm-dragon-btn') !== -1) size = 26;
      else if (cls.indexOf('dr-dragon') !== -1) size = 110;
      const html = node.nodeValue.replace(/🐉/g, getUserDarIconHtml(size));
      const span = document.createElement('span');
      span.innerHTML = html;
      parent.replaceChild(span, node);
    });
  } catch (e) {}
  __dragonReplaceLock = false;
}
function scheduleDragonReplace() {
  if (__dragonReplaceLock) return;
  if (__dragonReplaceTimer) return;
  __dragonReplaceTimer = setTimeout(() => {
    __dragonReplaceTimer = null;
    replaceAllDragonNodes();
  }, 250);
}
// Первичный проход (после всех init)
setTimeout(replaceAllDragonNodes, 0);
// Наблюдаем за обновлениями DOM (renderTasks, renderCircle и т.п.) с дебаунсом
try {
  const mo = new MutationObserver(muts => {
    if (__dragonReplaceLock) return;
    let need = false;
    for (const m of muts) {
      // Игнорируем добавления узлов user-dar-ic — это наша же замена
      if (m.addedNodes && m.addedNodes.length) {
        for (const a of m.addedNodes) {
          if (a.nodeType === 3 && a.nodeValue && a.nodeValue.indexOf('🐉') !== -1) { need = true; break; }
          if (a.nodeType === 1 && a.textContent && a.textContent.indexOf('🐉') !== -1) { need = true; break; }
        }
      }
      if (need) break;
    }
    if (need) scheduleDragonReplace();
  });
  mo.observe(document.body, { childList: true, subtree: true });
} catch (e) {}
