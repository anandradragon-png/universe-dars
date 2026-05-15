/**
 * Прототип архитектуры YupDar — навигация между 4 разделами.
 */
(function () {
  'use strict';

  const tg = window.Telegram?.WebApp;
  if (tg) {
    try { tg.expand(); tg.ready(); } catch (e) {}
  }

  // Переключение вкладок
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById('tab-' + name);
    const nav = document.getElementById('nav-' + name);
    if (tab) tab.classList.add('active');
    if (nav) nav.classList.add('active');
    window.scrollTo(0, 0);
  }
  window.switchTab = switchTab;

  // Переключение подвкладок внутри секций (Сокровищница, Арка)
  function attachSubtabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      const buttons = tab.querySelectorAll('.subtab[data-subtab]');
      const contents = tab.querySelectorAll('.subtab-content[data-subtab-content]');
      if (!buttons.length || !contents.length) return;
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-subtab');
          buttons.forEach(b => b.classList.toggle('active', b === btn));
          contents.forEach(c => c.classList.toggle('active', c.getAttribute('data-subtab-content') === target));
        });
      });
    });
  }

  // Переключение языка
  function setLang(lang) {
    if (!window.previewI18n) return;
    previewI18n.setLang(lang).then(() => {
      updateLangButtonLabel();
      hideLangPicker();
    });
  }
  window.setLang = setLang;

  function toggleLangPicker(ev) {
    if (ev) ev.stopPropagation();
    const picker = document.getElementById('lang-picker');
    if (!picker) return;
    picker.classList.toggle('open');
  }
  window.toggleLangPicker = toggleLangPicker;

  function hideLangPicker() {
    const picker = document.getElementById('lang-picker');
    if (picker) picker.classList.remove('open');
  }

  function updateLangButtonLabel() {
    const btn = document.getElementById('lang-btn-label');
    if (!btn || !window.previewI18n) return;
    btn.textContent = previewI18n.getLang().toUpperCase();
  }

  // Заглушка: открыть опрос для учёных
  function openScienceSurvey() {
    const url = 'https://nauka-yupdar.vercel.app';
    if (tg && tg.openLink) tg.openLink(url);
    else window.open(url, '_blank');
  }
  window.openScienceSurvey = openScienceSurvey;

  // ЛК (личный кабинет)
  function openProfile() {
    document.getElementById('lk-backdrop')?.classList.add('open');
    document.getElementById('lk-panel')?.classList.add('open');
  }
  function closeLK() {
    document.getElementById('lk-backdrop')?.classList.remove('open');
    document.getElementById('lk-panel')?.classList.remove('open');
  }
  window.openProfile = openProfile;
  window.closeLK = closeLK;

  // === ВКЛАДКА «Я»: расчёт Дара по 4 уровням ===

  const PROFILE_KEY = '_yupdar_preview_profile';

  function loadProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function saveProfile(p) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
  }

  // Маска даты: автоматическая вставка точек
  function attachDateMask(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 8);
      let out = digits;
      if (digits.length >= 5) out = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
      else if (digits.length >= 3) out = digits.slice(0, 2) + '.' + digits.slice(2);
      input.value = out;
      const err = document.getElementById('me-date-error');
      if (err) err.textContent = '';
    });
  }

  // Маска времени HH:MM
  function attachTimeMask(input) {
    if (!input) return;
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 4);
      let out = digits;
      if (digits.length >= 3) out = digits.slice(0, 2) + ':' + digits.slice(2);
      input.value = out;
      const err = document.getElementById('depth-time-error');
      if (err) err.textContent = '';
    });
  }

  function parseDate(str) {
    const m = String(str || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const now = new Date().getFullYear();
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > now) return null;
    return { day, month, year };
  }

  function parseTime(str) {
    const m = String(str || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
  }

  function calculateMyDar() {
    const input = document.getElementById('me-date');
    const errEl = document.getElementById('me-date-error');
    const date = parseDate(input.value);
    if (!date) {
      errEl.textContent = 'Дата в формате ДД.ММ.ГГГГ';
      return;
    }
    const profile = { date, time: null, coords: null, person: null };
    saveProfile(profile);
    renderMeState();
  }
  window.calculateMyDar = calculateMyDar;

  // ЗАКОН: личные данные изменить нельзя (law_personal_data_immutable.md).
  // Функция resetMyDar намеренно удалена. Сброс — только через
  // «Полный сброс» в ЛК (тест) или через поддержку (админка).

  function renderMeState() {
    const p = loadProfile();
    const input = document.getElementById('me-input-state');
    const res = document.getElementById('me-result-state');
    if (!input || !res) return;
    if (p && p.date) {
      input.style.display = 'none';
      res.style.display = 'block';
      renderMeResult();
    } else {
      input.style.display = 'block';
      res.style.display = 'none';
    }
  }

  function renderMeResult() {
    const p = loadProfile();
    if (!p || !p.date || !window.DarsLib) return;
    const profile = DarsLib.calcProfile(p);
    if (!profile) return;
    const syn = profile.synthesis;

    document.getElementById('me-dar-name').textContent = syn.name;
    document.getElementById('me-dar-code').textContent = syn.code;
    document.getElementById('me-dar-archetype').textContent = syn.archetype || '';

    // Подсветка пройденных шагов
    setDepthStep('depth-time', p.time
      ? String(p.time.hour).padStart(2,'0') + ':' + String(p.time.minute).padStart(2,'0')
      : null);
    setDepthStep('depth-place', p.coords && p.coords.label ? p.coords.label : null);
    setDepthStep('depth-name', p.person
      ? [p.person.firstName, p.person.lastName].filter(Boolean).join(' ')
      : null);
  }

  function setDepthStep(id, value) {
    const block = document.getElementById(id);
    if (!block) return;
    const val = block.querySelector('.depth-step-value');
    const btn = block.querySelector('.depth-step-btn');
    if (value) {
      block.classList.add('filled');
      if (val) val.textContent = value;
      if (btn) {
        btn.textContent = previewI18n?.t('common.change') || 'Изменить';
      }
    } else {
      block.classList.remove('filled');
      if (val) val.textContent = '—';
      if (btn) btn.textContent = previewI18n?.t('common.add') || 'Добавить';
    }
  }

  // === Кнопки-действия на вкладке «Я» ===

  function openMyOracle() {
    // Оракул дня живёт во вкладке «Я» (а не в Арке).
    // В прототипе пока заглушка — модалка с Дар Дня + посланием.
    alert('🔮 Оракул дня — следующий этап реализации.');
  }
  window.openMyOracle = openMyOracle;

  function openMyShare() {
    // Поделиться карточкой Дара (share-card + A4 — обе опции в одной модалке).
    alert('🖼 Поделиться — модалка выбора (карточка для соцсетей / A4 для печати).');
  }
  window.openMyShare = openMyShare;

  // Сворачивающийся блок «Узнать о себе больше»
  function toggleMeMore() {
    const toggle = document.getElementById('me-more-toggle');
    const content = document.getElementById('me-more-content');
    if (!toggle || !content) return;
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    if (isOpen) {
      toggle.setAttribute('aria-expanded', 'false');
      content.hidden = true;
    } else {
      toggle.setAttribute('aria-expanded', 'true');
      content.hidden = false;
    }
  }
  window.toggleMeMore = toggleMeMore;

  // === Модалки углубления ===

  function closeDepthModals() {
    ['time', 'place', 'name'].forEach(k => {
      document.getElementById('depth-' + k + '-modal')?.classList.remove('open');
      document.getElementById('depth-' + k + '-backdrop')?.classList.remove('open');
    });
  }
  window.closeDepthModals = closeDepthModals;

  function openDepthTime() {
    closeDepthModals();
    document.getElementById('depth-time-modal')?.classList.add('open');
    document.getElementById('depth-time-backdrop')?.classList.add('open');
    const p = loadProfile();
    const input = document.getElementById('depth-time-input');
    if (input) input.value = p?.time
      ? String(p.time.hour).padStart(2,'0') + ':' + String(p.time.minute).padStart(2,'0')
      : '';
  }
  function openDepthPlace() {
    closeDepthModals();
    document.getElementById('depth-place-modal')?.classList.add('open');
    document.getElementById('depth-place-backdrop')?.classList.add('open');
    const p = loadProfile();
    const input = document.getElementById('depth-place-input');
    if (input) input.value = p?.coords?.label || '';
  }
  function openDepthName() {
    closeDepthModals();
    document.getElementById('depth-name-modal')?.classList.add('open');
    document.getElementById('depth-name-backdrop')?.classList.add('open');
    const p = loadProfile();
    document.getElementById('depth-firstname-input').value = p?.person?.firstName || '';
    document.getElementById('depth-lastname-input').value = p?.person?.lastName || '';
  }
  window.openDepthTime = openDepthTime;
  window.openDepthPlace = openDepthPlace;
  window.openDepthName = openDepthName;

  function saveDepthTime() {
    const val = document.getElementById('depth-time-input').value;
    const time = parseTime(val);
    if (!time) {
      document.getElementById('depth-time-error').textContent = 'Формат ЧЧ:ММ (например 12:20)';
      return;
    }
    const p = loadProfile() || {};
    p.time = time;
    saveProfile(p);
    closeDepthModals();
    renderMeResult();
  }
  window.saveDepthTime = saveDepthTime;

  function saveDepthPlace() {
    const label = document.getElementById('depth-place-input').value.trim();
    if (!label) {
      document.getElementById('depth-place-error').textContent = 'Укажи город';
      return;
    }
    // Заглушка координат: пока берём фиктивные (52.5, 27.5) — это Беларусь.
    // Когда подключим геокодер — заменим на реальные.
    const p = loadProfile() || {};
    p.coords = { label, lat: 52.5, lon: 27.5, _stub: true };
    saveProfile(p);
    closeDepthModals();
    renderMeResult();
  }
  window.saveDepthPlace = saveDepthPlace;

  function saveDepthName() {
    const firstName = document.getElementById('depth-firstname-input').value.trim();
    const lastName = document.getElementById('depth-lastname-input').value.trim();
    if (!firstName || !lastName) {
      document.getElementById('depth-name-error').textContent = 'Укажи имя и фамилию';
      return;
    }
    const p = loadProfile() || {};
    p.person = { firstName, lastName };
    saveProfile(p);
    closeDepthModals();
    renderMeResult();
  }
  window.saveDepthName = saveDepthName;

  // Старт
  document.addEventListener('DOMContentLoaded', async () => {
    if (window.previewI18n) {
      await previewI18n.init();
      updateLangButtonLabel();
    }
    // Маски ввода
    attachDateMask(document.getElementById('me-date'));
    attachTimeMask(document.getElementById('depth-time-input'));
    // Подвкладки внутри Сокровищницы и Арки
    attachSubtabs();
    // Рендер вкладки Я в зависимости от того, был ли расчёт
    renderMeState();
    // Закрывать выпадашку языка по клику вне
    document.addEventListener('click', (e) => {
      const picker = document.getElementById('lang-picker');
      const btn = document.getElementById('btn-lang');
      if (picker && !picker.contains(e.target) && btn && !btn.contains(e.target)) {
        hideLangPicker();
      }
    });
  });
})();
