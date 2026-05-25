// ═══════════════════════════════════════════════════════════
// ДНЕВНИК ДАРА v2 — бесплатный freemium-крючок к АРКА
// 3 шкалы (Энергия + Настроение + Куда тянет) → мини-зеркало
// Интерпретация учитывает все 3 параметра + Дар дня
// ═══════════════════════════════════════════════════════════

const DIARY_KEY = 'arka_diary_entries';
const DIARY_LANG_KEY = '_yupdar_preview_lang';
const TODAY = new Date().toISOString().slice(0, 10);

// === i18n: словарь Дневника ===
const DIARY_I18N = {
  ru: {
    'diary.title': 'Дневник Дара',
    'diary.days': 'дней',
    'diary.subtitle': 'Отметь как ты — займёт 20 секунд',
    'diary.note_placeholder': 'Одна строка — что зацепило за день (необязательно)',
    'diary.save': 'Записать день',
    'diary.mirror_title': 'Мини-зеркало',
    'diary.cta_title': 'Открой АРКА',
    'diary.cta_sub': 'Глубокая работа с Даром каждый день',
    'diary.tomorrow': 'Завтра приду снова',
    'diary.footer': 'YupDar · бесплатно для всех',
    'diary.dar_of_day_label': 'Твой Дар сегодня',
    'diary.dar_of_day_label_general': 'Общий Дар дня',
    'diary.profile_hint': 'Рассчитай свой Дар в YupDar, и Дневник покажет персональный Дар дня',

    'scale.energy': 'Энергия',
    'scale.energy_low': 'мало',
    'scale.energy_high': 'много',

    'scale.mood': 'Настроение',
    'scale.mood_low': 'плохо',
    'scale.mood_high': 'хорошо',

    'scale.direction': 'К чему тянет',
    'dir.action': 'Действовать',
    'dir.rest': 'Отдохнуть',
    'dir.people': 'К людям',
    'dir.alone': 'Побыть одной',

    'mirror.intro_label': 'Твоё состояние сегодня',
    'mirror.dar_lead': 'Дар дня',
    'mirror.tip_lead': 'Подсказка',

    // Интерпретации по комбинации vibe (низкая/средняя/высокая) × направление
    'tip.low_action':   'Энергии мало, но тянет действовать. Сделай одно маленькое дело — и остановись. Не геройствуй сегодня.',
    'tip.low_rest':     'Тело просит паузы. Это не лень — это мудрость. Дай себе сегодня меньше, чем обычно.',
    'tip.low_people':   'Тебе нужны не любые люди — а близкие. Выбери одного. Без обязательств — просто рядом.',
    'tip.low_alone':    'Замри. Тишина сегодня — твоё лекарство. Чай, окно, ничего не делать.',

    'tip.mid_action':   'Ровный фон. Самое время для рутины — то, что давно откладываешь, сегодня пойдёт.',
    'tip.mid_rest':     'Можно отдыхать без чувства вины. Тело просит — слушай.',
    'tip.mid_people':   'Спокойный разговор без надрыва — то, что напитает. Выбери тёплого человека.',
    'tip.mid_alone':    'Время с собой. Прогулка, дневник, разбор стола — что-то простое и личное.',

    'tip.high_action':  'Окно силы открыто. Возьми одно главное дело и направь сюда всю энергию.',
    'tip.high_rest':    'Энергия есть, но тянет в покой? Послушай — иногда сила копится для завтра.',
    'tip.high_people':  'Ты как магнит сейчас. Иди к людям — встреча сегодня будет важной.',
    'tip.high_alone':   'Энергии много, но хочется в одиночество — это творческое состояние. Включи проект, который только твой.',

    'dar.tail': 'усиливает то, что ты сейчас замечаешь. Действуй из своего ритма, не из чужого.'
  },

  en: {
    'diary.title': 'Diary of the DAR',
    'diary.days': 'days',
    'diary.subtitle': 'Note how you feel — takes 20 seconds',
    'diary.note_placeholder': 'One line — what stood out today (optional)',
    'diary.save': 'Record the day',
    'diary.mirror_title': 'Mini-Mirror',
    'diary.cta_title': 'Open ARKA',
    'diary.cta_sub': 'Deep work with your DAR every day',
    'diary.tomorrow': "I'll come back tomorrow",
    'diary.footer': 'YupDar · free for everyone',
    'diary.dar_of_day_label': 'Your DAR today',
    'diary.dar_of_day_label_general': 'General DAR of the day',
    'diary.profile_hint': "Calculate your DAR in YupDar and the Diary will show your personal DAR of the day",

    'scale.energy': 'Energy',
    'scale.energy_low': 'low',
    'scale.energy_high': 'high',

    'scale.mood': 'Mood',
    'scale.mood_low': 'bad',
    'scale.mood_high': 'good',

    'scale.direction': 'What pulls you',
    'dir.action': 'To act',
    'dir.rest': 'To rest',
    'dir.people': 'To people',
    'dir.alone': 'To be alone',

    'mirror.intro_label': 'Your state today',
    'mirror.dar_lead': 'DAR of the day',
    'mirror.tip_lead': 'Hint',

    'tip.low_action':   "Energy is low, but you want to act. Do one small thing — then stop. Don't push today.",
    'tip.low_rest':     "Your body asks for a pause. It isn't laziness — it's wisdom. Give yourself less than usual today.",
    'tip.low_people':   'You need not any people — but close ones. Pick one. No obligations — just presence.',
    'tip.low_alone':    'Be still. Silence is your medicine today. Tea, a window, doing nothing.',

    'tip.mid_action':   'Steady ground. Time for routine — what you keep postponing will move today.',
    'tip.mid_rest':     'You can rest without guilt. The body asks — listen.',
    'tip.mid_people':   'A calm conversation without intensity is what will nourish. Pick a warm person.',
    'tip.mid_alone':    'Time with yourself. A walk, a journal, sorting things — something simple and personal.',

    'tip.high_action':  'A window of power is open. Take one main thing and direct all energy here.',
    'tip.high_rest':    'You have energy, but feel drawn to stillness? Listen — sometimes power gathers for tomorrow.',
    'tip.high_people':  'You are a magnet right now. Go to people — a meeting today will matter.',
    'tip.high_alone':   'High energy with a pull to solitude — that is a creative state. Open the project that is only yours.',

    'dar.tail': 'amplifies what you chose. Act from your own rhythm, not from someone else\'s.'
  },

  es: {
    'diary.title': 'Diario del DAR',
    'diary.days': 'días',
    'diary.subtitle': 'Anota cómo estás — toma 20 segundos',
    'diary.note_placeholder': 'Una línea — qué destacó del día (opcional)',
    'diary.save': 'Anotar el día',
    'diary.mirror_title': 'Mini-espejo',
    'diary.cta_title': 'Abre ARKA',
    'diary.cta_sub': 'Trabajo profundo con tu DAR cada día',
    'diary.tomorrow': 'Volveré mañana',
    'diary.footer': 'YupDar · gratis para todos',
    'diary.dar_of_day_label': 'Tu DAR hoy',
    'diary.dar_of_day_label_general': 'DAR general del día',
    'diary.profile_hint': 'Calcula tu DAR en YupDar y el Diario mostrará tu DAR personal del día',

    'scale.energy': 'Energía',
    'scale.energy_low': 'poca',
    'scale.energy_high': 'mucha',

    'scale.mood': 'Ánimo',
    'scale.mood_low': 'mal',
    'scale.mood_high': 'bien',

    'scale.direction': 'Hacia qué te atrae',
    'dir.action': 'Actuar',
    'dir.rest': 'Descansar',
    'dir.people': 'Con gente',
    'dir.alone': 'Estar sola',

    'mirror.intro_label': 'Tu estado hoy',
    'mirror.dar_lead': 'DAR del día',
    'mirror.tip_lead': 'Sugerencia',

    'tip.low_action':   'Poca energía, pero quieres actuar. Haz una sola cosa pequeña y detente. Hoy no fuerces.',
    'tip.low_rest':     'El cuerpo pide pausa. No es pereza — es sabiduría. Date hoy menos de lo usual.',
    'tip.low_people':   'Necesitas no cualquier gente — sino cercana. Elige a una persona. Sin compromisos — solo presencia.',
    'tip.low_alone':    'Quédate quieta. Hoy el silencio es tu medicina. Té, ventana, no hacer nada.',

    'tip.mid_action':   'Base estable. Tiempo para la rutina — lo que pospones avanzará hoy.',
    'tip.mid_rest':     'Puedes descansar sin culpa. El cuerpo pide — escucha.',
    'tip.mid_people':   'Una conversación tranquila, sin intensidad, te nutrirá. Elige una persona cálida.',
    'tip.mid_alone':    'Tiempo contigo. Un paseo, un diario, ordenar algo — simple y personal.',

    'tip.high_action':  'La ventana de fuerza está abierta. Toma una cosa importante y dirige toda la energía aquí.',
    'tip.high_rest':    'Tienes energía pero te atrae la quietud. Escucha — a veces la fuerza se guarda para mañana.',
    'tip.high_people':  'Eres un imán ahora. Ve hacia la gente — un encuentro hoy importará.',
    'tip.high_alone':   'Mucha energía y atracción a la soledad — es un estado creativo. Abre el proyecto que es solo tuyo.',

    'dar.tail': 'amplifica lo que elegiste. Actúa desde tu ritmo, no desde el de otros.'
  }
};

function getLang() {
  try {
    const v = localStorage.getItem(DIARY_LANG_KEY);
    if (v && DIARY_I18N[v]) return v;
  } catch (e) {}
  try {
    const v = window.parent && window.parent.localStorage.getItem(DIARY_LANG_KEY);
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
  try { return JSON.parse(localStorage.getItem(DIARY_KEY) || '[]'); }
  catch (e) { return []; }
}
function saveEntries(arr) {
  try { localStorage.setItem(DIARY_KEY, JSON.stringify(arr)); } catch (e) {}
}
function getStreak() {
  const entries = loadEntries();
  if (!entries.length) return 0;
  const uniq = [...new Set(entries.map(e => e.date))].sort().reverse();
  let streak = 0;
  const today = new Date(TODAY);
  for (let i = 0; i < uniq.length; i++) {
    const d = new Date(uniq[i]);
    const diff = Math.round((today - d) / 86400000);
    if (diff === streak) streak++;
    else break;
  }
  return streak;
}

// === Дар дня — расчёт ===
function getUserProfile() {
  try { return JSON.parse(localStorage.getItem('_yupdar_preview_profile') || 'null'); }
  catch (e) { return null; }
}
function calcDarOfDay() {
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
  // Персональный Дар дня = есть координаты И имя юзера
  let isPersonal = false;
  if (profile) {
    const hasCoords = (profile.tria && profile.tria.coords) || profile.coords;
    const hasPerson = profile.chia || profile.person;
    if (hasCoords) input.coords = profile.tria ? profile.tria.coords : profile.coords;
    if (hasPerson) {
      const p = profile.chia || profile.person;
      input.person = { firstName: p.firstName, lastName: p.lastName };
    }
    isPersonal = !!(hasCoords && hasPerson);
  }
  const p = DarsLib.calcProfile(input);
  if (!p) return null;
  const code = p.synthesis.code;
  return {
    code,
    name: p.synthesis.name,
    svgPath: DarsLib.getDarSvgPath ? DarsLib.getDarSvgPath(code) : '',
    isPersonal
  };
}

// === 3 шкалы: Энергия, Настроение, Куда ===
let energyValue = 0;     // 1..5 (0 = не выбрано)
let moodValue = 0;       // 1..5
let directionValue = ''; // 'action' | 'rest' | 'people' | 'alone'

function renderScale(containerId, current, onPick) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  let html = '<div class="diary-dots">';
  for (let i = 1; i <= 5; i++) {
    html += '<button type="button" class="diary-dot' + (i === current ? ' active' : '') + (i <= current ? ' filled' : '') + '" data-val="' + i + '" aria-label="' + i + '"></button>';
  }
  html += '</div>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('.diary-dot').forEach(b => {
    b.addEventListener('click', () => {
      const v = +b.dataset.val;
      onPick(v);
    });
  });
}

const DIRECTIONS = ['action', 'rest', 'people', 'alone'];
function renderDirections() {
  const wrap = document.getElementById('diaryDirection');
  if (!wrap) return;
  wrap.innerHTML = DIRECTIONS.map(d => {
    return '<button type="button" class="diary-dir-chip' + (directionValue === d ? ' active' : '') + '" data-dir="' + d + '">' + t('dir.' + d) + '</button>';
  }).join('');
  wrap.querySelectorAll('.diary-dir-chip').forEach(b => {
    b.addEventListener('click', () => {
      directionValue = b.dataset.dir;
      renderDirections();
      checkCanSave();
    });
  });
}

function checkCanSave() {
  const btn = document.getElementById('diarySaveBtn');
  if (!btn) return;
  btn.disabled = !(energyValue && moodValue && directionValue);
}

function renderScales() {
  renderScale('diaryEnergy', energyValue, v => { energyValue = v; renderScales(); checkCanSave(); });
  renderScale('diaryMood', moodValue, v => { moodValue = v; renderScales(); checkCanSave(); });
  renderDirections();
}

// === Дар дня ===
function renderDarOfDay() {
  const wrap = document.getElementById('diaryDarOfDay');
  if (!wrap) return;
  const dar = calcDarOfDay();
  if (!dar) { wrap.innerHTML = ''; return; }
  const label = dar.isPersonal ? t('diary.dar_of_day_label') : t('diary.dar_of_day_label_general');
  let html =
    '<div class="ddd-icon-wrap">' +
      (dar.svgPath ? '<img src="' + dar.svgPath + '" alt="" onerror="this.style.display=\'none\'">' : '') +
    '</div>' +
    '<div class="ddd-label">' + label + '</div>' +
    '<div class="ddd-name">' + dar.name + '</div>';
  if (!dar.isPersonal) {
    html += '<div class="ddd-hint">' + t('diary.profile_hint') + '</div>';
  }
  wrap.innerHTML = html;
}

function renderStreak() {
  const wrap = document.getElementById('diaryStreak');
  if (!wrap) return;
  wrap.innerHTML = '<span class="ds-num">' + getStreak() + '</span><span class="ds-label">' + t('diary.days') + '</span>';
}

// === Сохранение + мини-зеркало ===
function vibeBucket(e, m) {
  // Средняя «vibe»: 1-2 → low, 3 → mid, 4-5 → high
  const v = (e + m) / 2;
  if (v <= 2.2) return 'low';
  if (v <= 3.5) return 'mid';
  return 'high';
}

function saveDiaryEntry() {
  if (!(energyValue && moodValue && directionValue)) return;
  const note = (document.getElementById('diaryNote').value || '').trim();
  const dar = calcDarOfDay();
  const entry = {
    date: TODAY,
    energy: energyValue,
    mood: moodValue,
    direction: directionValue,
    note,
    darOfDay: dar ? dar.code : null,
    darOfDayName: dar ? dar.name : null,
    ts: Date.now()
  };
  const all = loadEntries();
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
  if (glyphWrap) {
    if (dar && dar.svgPath) {
      glyphWrap.innerHTML = '<img src="' + dar.svgPath + '" alt="" onerror="this.style.display=\'none\'">';
    } else {
      glyphWrap.innerHTML = '<span style="font-size:48px;color:#d4af37">✦</span>';
    }
  }

  // Интерпретация: vibe + direction
  const vibe = vibeBucket(entry.energy, entry.mood);
  const tipKey = 'tip.' + vibe + '_' + entry.direction;
  const tip = t(tipKey) || '';
  const darName = (dar && dar.name) || '';

  const stateLabel = t('mirror.intro_label');
  const darLead = t('mirror.dar_lead');
  const tipLead = t('mirror.tip_lead');
  const darTail = t('dar.tail');

  let html = '';
  // Краткая сводка: Энергия N/5 · Настроение N/5 · Направление
  html += '<div class="dm-summary">';
  html += '<span class="dm-pair"><b>' + t('scale.energy') + '</b> ' + entry.energy + '/5</span>';
  html += '<span class="dm-pair"><b>' + t('scale.mood') + '</b> ' + entry.mood + '/5</span>';
  html += '<span class="dm-pair"><b>' + t('dir.' + entry.direction) + '</b></span>';
  html += '</div>';
  // Подсказка от состояния
  if (tip) html += '<div class="dm-tip"><b>' + tipLead + '.</b> ' + tip + '</div>';
  // Дар дня
  if (darName) html += '<div class="dm-dar"><b>' + darLead + ': ' + darName + '</b> — ' + darTail + '</div>';

  const textEl = document.getElementById('diaryMirrorText');
  if (textEl) textEl.innerHTML = html;
}

// «Завтра приду снова» — НЕ сбрасывать форму (раньше так открывался редактор
// после успешной записи, что раздражало). Закрываем Дневник целиком:
// - внутри Telegram WebApp пробуем закрыть mini-app
// - иначе возвращаемся в родительское окно (YupDar)
function resetDiary() {
  try {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.close) {
      window.Telegram.WebApp.close();
      return;
    }
  } catch (e) {}
  try {
    if (window.parent && window.parent !== window) {
      // Если открыто в iframe внутри YupDar — переключаем родителя на вкладку «Я»
      if (typeof window.parent.switchNav === 'function') {
        window.parent.switchNav('me');
        return;
      }
    }
  } catch (e) {}
  // Фолбэк — возврат назад в истории
  try { window.history.back(); } catch (e) {}
}
window.resetDiary = resetDiary;

// === Фидбэк-кнопка ===
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
  renderDarOfDay();
  renderStreak();
  renderScales();
  const saveBtn = document.getElementById('diarySaveBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveDiaryEntry);
  // Если уже есть запись сегодня — показываем зеркало
  const today = loadEntries().find(e => e.date === TODAY);
  if (today && today.energy && today.mood && today.direction) {
    energyValue = today.energy;
    moodValue = today.mood;
    directionValue = today.direction;
    const note = document.getElementById('diaryNote');
    if (note) note.value = today.note || '';
    const dar = calcDarOfDay();
    showMirror(today, dar);
  }
});
