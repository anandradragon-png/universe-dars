// ═══════════════════════════════════════════════════════════
// ДНЕВНИК ДАРА — бесплатный freemium-крючок к АРКА
// 1 эмодзи настроения + 1 строка → мини-зеркало через Дар × Дар Дня × настроение
// ═══════════════════════════════════════════════════════════

const DIARY_KEY = 'arka_diary_entries';
const DIARY_LANG_KEY = '_yupdar_preview_lang';
const TODAY = new Date().toISOString().slice(0, 10);

// === i18n: словарь Дневника ===
const DIARY_I18N = {
  ru: {
    'diary.title': 'Дневник Дара',
    'diary.days': 'дней',
    'diary.question': 'Как ты сейчас?',
    'diary.note_placeholder': 'Можно добавить одну строку — что зацепило...',
    'diary.save': 'Записать',
    'diary.mirror_title': 'Мини-зеркало',
    'diary.cta_title': 'Открой АРКА',
    'diary.cta_sub': 'Глубокая работа с Даром каждый день',
    'diary.tomorrow': 'Завтра приду снова',
    'diary.footer': 'YupDar · бесплатно для всех',
    'diary.dar_of_day_label': 'Дар сегодня',
    // 8 настроений
    'mood.light':    { sym: '✦', label: 'В свете' },
    'mood.flow':     { sym: '◯', label: 'В потоке' },
    'mood.calm':     { sym: '·', label: 'Спокойно' },
    'mood.neutral':  { sym: '—', label: 'Ровно' },
    'mood.heavy':    { sym: '◐', label: 'Тяжело' },
    'mood.shadow':   { sym: '●', label: 'В тени' },
    'mood.spark':    { sym: '⚡', label: 'Заряжено' },
    'mood.unclear':  { sym: '?', label: 'Туман' },
    // Мини-зеркало: интерпретация по настроению + Дар дня
    'mirror.light_tpl':    'Сегодня ты <strong>в свете</strong>. Дар дня <em>{darDay}</em> усиливает то, что в тебе уже звучит. Используй это окно — момент редкий.',
    'mirror.flow_tpl':     'Ты <strong>в потоке</strong>. Дар дня <em>{darDay}</em> подсказывает: не форсируй, движение идёт само. Останься в этом ритме.',
    'mirror.calm_tpl':     'Внутри <strong>тихо</strong>. Это не пустота — это место, где Дар дня <em>{darDay}</em> может что-то проявить. Прислушайся.',
    'mirror.neutral_tpl':  'Сегодня <strong>ровно</strong>. Дар дня <em>{darDay}</em> приходит без напора — самое время для рутины и заботы о себе.',
    'mirror.heavy_tpl':    '<strong>Тяжело.</strong> Дар дня <em>{darDay}</em> просит тебя не давить — замедли темп, дай себе паузу. Это пройдёт.',
    'mirror.shadow_tpl':   'Ты <strong>в тени</strong>. Дар дня <em>{darDay}</em> зовёт встретиться с тем, что обычно прячется. Это сила, а не слабость.',
    'mirror.spark_tpl':    '<strong>Заряжено!</strong> Дар дня <em>{darDay}</em> хочет действия. Направь энергию в одно — туда, где она нужнее всего.',
    'mirror.unclear_tpl':  'Сегодня <strong>туман</strong>. Дар дня <em>{darDay}</em> говорит: не пытайся всё прояснить сразу. Подожди — ясность придёт сама.'
  },
  en: {
    'diary.title': 'Diary of the DAR',
    'diary.days': 'days',
    'diary.question': 'How are you right now?',
    'diary.note_placeholder': 'Add one line — what touched you...',
    'diary.save': 'Record',
    'diary.mirror_title': 'Mini-Mirror',
    'diary.cta_title': 'Open ARKA',
    'diary.cta_sub': 'Deep work with your DAR every day',
    'diary.tomorrow': "I'll come back tomorrow",
    'diary.footer': 'YupDar · free for everyone',
    'diary.dar_of_day_label': 'DAR today',
    'mood.light':    { sym: '✦', label: 'In light' },
    'mood.flow':     { sym: '◯', label: 'In flow' },
    'mood.calm':     { sym: '·', label: 'Calm' },
    'mood.neutral':  { sym: '—', label: 'Steady' },
    'mood.heavy':    { sym: '◐', label: 'Heavy' },
    'mood.shadow':   { sym: '●', label: 'In shadow' },
    'mood.spark':    { sym: '⚡', label: 'Charged' },
    'mood.unclear':  { sym: '?', label: 'Foggy' },
    'mirror.light_tpl':    "You are <strong>in light</strong> today. DAR of the day <em>{darDay}</em> amplifies what's already alive in you. Use this window — it's rare.",
    'mirror.flow_tpl':     "You are <strong>in the flow</strong>. DAR of the day <em>{darDay}</em> says: don't force, movement happens by itself. Stay in this rhythm.",
    'mirror.calm_tpl':     'It is <strong>quiet</strong> inside. Not emptiness — a place where DAR of the day <em>{darDay}</em> can reveal something. Listen.',
    'mirror.neutral_tpl':  '<strong>Steady</strong> today. DAR of the day <em>{darDay}</em> comes without pressure — time for routine and self-care.',
    'mirror.heavy_tpl':    "<strong>Heavy.</strong> DAR of the day <em>{darDay}</em> asks you not to push — slow down, give yourself a pause. This will pass.",
    'mirror.shadow_tpl':   'You are <strong>in shadow</strong>. DAR of the day <em>{darDay}</em> calls you to meet what usually hides. This is strength, not weakness.',
    'mirror.spark_tpl':    "<strong>Charged!</strong> DAR of the day <em>{darDay}</em> wants action. Direct the energy into one thing — where it's needed most.",
    'mirror.unclear_tpl':  "<strong>Foggy</strong> today. DAR of the day <em>{darDay}</em> says: don't try to clear everything at once. Wait — clarity will come."
  },
  es: {
    'diary.title': 'Diario del DAR',
    'diary.days': 'días',
    'diary.question': '¿Cómo estás ahora?',
    'diary.note_placeholder': 'Añade una línea — qué te tocó...',
    'diary.save': 'Anotar',
    'diary.mirror_title': 'Mini-espejo',
    'diary.cta_title': 'Abre ARKA',
    'diary.cta_sub': 'Trabajo profundo con tu DAR cada día',
    'diary.tomorrow': 'Volveré mañana',
    'diary.footer': 'YupDar · gratis para todos',
    'diary.dar_of_day_label': 'DAR hoy',
    'mood.light':    { sym: '✦', label: 'En luz' },
    'mood.flow':     { sym: '◯', label: 'En flujo' },
    'mood.calm':     { sym: '·', label: 'Tranquila' },
    'mood.neutral':  { sym: '—', label: 'Estable' },
    'mood.heavy':    { sym: '◐', label: 'Pesada' },
    'mood.shadow':   { sym: '●', label: 'En sombra' },
    'mood.spark':    { sym: '⚡', label: 'Cargada' },
    'mood.unclear':  { sym: '?', label: 'Niebla' },
    'mirror.light_tpl':    'Hoy estás <strong>en luz</strong>. El DAR del día <em>{darDay}</em> amplifica lo que ya vibra en ti. Usa esta ventana — es rara.',
    'mirror.flow_tpl':     'Estás <strong>en el flujo</strong>. El DAR del día <em>{darDay}</em> dice: no fuerces, el movimiento ocurre solo. Quédate en este ritmo.',
    'mirror.calm_tpl':     'Está <strong>silencioso</strong> dentro. No es vacío — es un lugar donde el DAR del día <em>{darDay}</em> puede revelar algo. Escucha.',
    'mirror.neutral_tpl':  'Hoy <strong>estable</strong>. El DAR del día <em>{darDay}</em> llega sin presión — tiempo para la rutina y el autocuidado.',
    'mirror.heavy_tpl':    '<strong>Pesado.</strong> El DAR del día <em>{darDay}</em> te pide no presionar — desacelera, date una pausa. Esto pasará.',
    'mirror.shadow_tpl':   'Estás <strong>en sombra</strong>. El DAR del día <em>{darDay}</em> te llama a encontrarte con lo que se esconde. Es fuerza, no debilidad.',
    'mirror.spark_tpl':    '<strong>¡Cargada!</strong> El DAR del día <em>{darDay}</em> quiere acción. Dirige la energía a una sola cosa — donde más se necesita.',
    'mirror.unclear_tpl':  'Hoy <strong>niebla</strong>. El DAR del día <em>{darDay}</em> dice: no intentes aclararlo todo de una vez. Espera — la claridad vendrá.'
  }
};

function getLang() {
  try {
    const v = localStorage.getItem(DIARY_LANG_KEY);
    if (v && DIARY_I18N[v]) return v;
  } catch (e) {}
  return 'ru';
}

function t(key) {
  const lang = getLang();
  const dict = DIARY_I18N[lang] || DIARY_I18N.ru;
  return dict[key] !== undefined ? dict[key] : DIARY_I18N.ru[key];
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = t(el.dataset.i18n);
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const v = t(el.dataset.i18nPlaceholder);
    if (typeof v === 'string') el.placeholder = v;
  });
}

// === Состояние Дневника ===
function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(DIARY_KEY) || '[]');
  } catch (e) { return []; }
}
function saveEntries(arr) {
  try { localStorage.setItem(DIARY_KEY, JSON.stringify(arr)); } catch (e) {}
}

// Стрик дней подряд (учитывает только записи в последовательные дни)
function getStreak() {
  const entries = loadEntries();
  if (!entries.length) return 0;
  // Уникальные даты, отсортированные по убыванию
  const uniq = [...new Set(entries.map(e => e.date))].sort().reverse();
  let streak = 0;
  const today = new Date(TODAY);
  for (let i = 0; i < uniq.length; i++) {
    const d = new Date(uniq[i]);
    const diff = Math.round((today - d) / 86400000);
    if (diff === streak) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// Сегодняшняя запись — есть ли уже?
function hasTodayEntry() {
  return loadEntries().some(e => e.date === TODAY);
}

// === Дар дня — расчёт по той же системе что в АРКА ===
function getUserProfile() {
  try {
    return JSON.parse(localStorage.getItem('_yupdar_preview_profile') || 'null');
  } catch (e) { return null; }
}

function calcDarOfDay() {
  // Используем DarsLib из главного приложения если открыт в iframe или main
  let DarsLib = null;
  if (typeof window.DarsLib !== 'undefined') DarsLib = window.DarsLib;
  if (!DarsLib && window.parent && window.parent.DarsLib) DarsLib = window.parent.DarsLib;
  if (!DarsLib) return null;

  const profile = getUserProfile();
  const now = new Date();
  const input = {
    date: { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() },
    time: { hour: now.getHours(), minute: now.getMinutes() }
  };
  if (profile) {
    if (profile.tria && profile.tria.coords) input.coords = profile.tria.coords;
    if (profile.chia) input.person = { firstName: profile.chia.firstName, lastName: profile.chia.lastName };
  }
  const p = DarsLib.calcProfile(input);
  if (!p) return null;
  const code = p.synthesis.code;
  return {
    code,
    name: p.synthesis.name,
    svgPath: DarsLib.getDarSvgPath ? DarsLib.getDarSvgPath(code) : ''
  };
}

// === Рендер настроений ===
const MOODS = ['light', 'flow', 'calm', 'neutral', 'heavy', 'shadow', 'spark', 'unclear'];
let selectedMood = null;

function renderMoods() {
  const wrap = document.getElementById('diaryMoods');
  if (!wrap) return;
  wrap.innerHTML = MOODS.map(m => {
    const data = t('mood.' + m);
    return `
      <div class="diary-mood" data-mood="${m}">
        <span class="dm-symbol">${data.sym}</span>
        <span class="dm-label">${data.label}</span>
      </div>
    `;
  }).join('');
  wrap.querySelectorAll('.diary-mood').forEach(el => {
    el.addEventListener('click', () => {
      selectedMood = el.dataset.mood;
      wrap.querySelectorAll('.diary-mood').forEach(x => x.classList.toggle('selected', x === el));
      const saveBtn = document.getElementById('diarySaveBtn');
      if (saveBtn) saveBtn.disabled = false;
    });
  });
}

// === Рендер Дара дня ===
function renderDarOfDay() {
  const wrap = document.getElementById('diaryDarOfDay');
  if (!wrap) return;
  const dar = calcDarOfDay();
  if (!dar) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = `
    <div class="ddd-icon-wrap">
      <img src="${dar.svgPath}" alt="" onerror="this.style.display='none'">
    </div>
    <div class="ddd-label">${t('diary.dar_of_day_label')}</div>
    <div class="ddd-name">${dar.name}</div>
  `;
}

// === Рендер стрика ===
function renderStreak() {
  const wrap = document.getElementById('diaryStreak');
  if (!wrap) return;
  const num = getStreak();
  wrap.innerHTML = `
    <span class="ds-num">${num}</span>
    <span class="ds-label">${t('diary.days')}</span>
  `;
}

// === Сохранение записи + мини-зеркало ===
function saveDiaryEntry() {
  if (!selectedMood) return;
  const note = document.getElementById('diaryNote').value.trim();
  const dar = calcDarOfDay();
  const entry = {
    date: TODAY,
    mood: selectedMood,
    note,
    darOfDay: dar ? dar.code : null,
    darOfDayName: dar ? dar.name : null,
    ts: Date.now()
  };
  const all = loadEntries();
  // Заменяем сегодняшнюю запись если есть
  const idx = all.findIndex(e => e.date === TODAY);
  if (idx >= 0) all[idx] = entry; else all.push(entry);
  saveEntries(all);
  showMirror(entry, dar);
  renderStreak();
}

function showMirror(entry, dar) {
  const inputState = document.getElementById('diaryInputState');
  const mirrorState = document.getElementById('diaryMirrorState');
  if (inputState) inputState.hidden = true;
  if (mirrorState) mirrorState.hidden = false;

  // Глиф Дара дня
  const glyphWrap = document.getElementById('diaryMirrorGlyph');
  if (glyphWrap && dar && dar.svgPath) {
    glyphWrap.innerHTML = `<img src="${dar.svgPath}" alt="" onerror="this.style.display='none'">`;
  }

  // Интерпретация: шаблон по настроению + подставляется Дар дня
  const tplKey = 'mirror.' + entry.mood + '_tpl';
  const tpl = t(tplKey) || '';
  const darName = (dar && dar.name) || '—';
  const text = tpl.replace(/\{darDay\}/g, darName);
  const textEl = document.getElementById('diaryMirrorText');
  if (textEl) textEl.innerHTML = text;
}

function resetDiary() {
  const inputState = document.getElementById('diaryInputState');
  const mirrorState = document.getElementById('diaryMirrorState');
  if (inputState) inputState.hidden = false;
  if (mirrorState) mirrorState.hidden = true;
  selectedMood = null;
  const note = document.getElementById('diaryNote');
  if (note) note.value = '';
  const saveBtn = document.getElementById('diarySaveBtn');
  if (saveBtn) saveBtn.disabled = true;
  // Если уже есть запись сегодня — повторное сохранение её обновит
}
window.resetDiary = resetDiary;

// === Фидбэк-кнопка (та же что в основном превью) ===
function openTesterFeedback() {
  const lang = getLang();
  let template;
  if (lang === 'en') {
    template = "Hi Svetlana! I'm testing the Diary of the DAR.\n\nWhat I liked:\n\nWhat could be better:\n\nMy DAR:";
  } else if (lang === 'es') {
    template = "¡Hola Svetlana! Estoy probando el Diario del DAR.\n\nQué me gustó:\n\nQué se podría mejorar:\n\nMi DAR:";
  } else {
    template = "Привет, Светлана! Тестирую Дневник Дара.\n\nЧто понравилось:\n\nЧто можно улучшить:\n\nМой Дар:";
  }
  window.open('https://t.me/AnandraDragon?text=' + encodeURIComponent(template), '_blank');
}
window.openTesterFeedback = openTesterFeedback;

// === Инициализация ===
document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  renderMoods();
  renderDarOfDay();
  renderStreak();
  const saveBtn = document.getElementById('diarySaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveDiaryEntry);
  // Если сегодня уже есть запись — сразу показываем мини-зеркало
  const today = loadEntries().find(e => e.date === TODAY);
  if (today) {
    selectedMood = today.mood;
    const note = document.getElementById('diaryNote');
    if (note) note.value = today.note || '';
    const dar = calcDarOfDay();
    showMirror(today, dar);
  }
});
