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

    // Баннер книги
    html += `
      <div style="margin:0 0 16px;padding:14px;background:linear-gradient(135deg,rgba(107,33,168,0.15),rgba(212,175,55,0.1));border:1px solid rgba(212,175,55,0.3);border-radius:14px;text-align:center;cursor:pointer" onclick="switchNav('book')">
        <div style="font-size:14px;color:#D4AF37;margin-bottom:4px">&#128214; Книга Даров</div>
        <div style="font-size:11px;color:var(--text-dim)">Полное описание каждого дара с практиками и медитациями</div>
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

  // --- Парсер теневых аспектов из dar-content.json ---
  // Формат shadow: "- **Title** — description. *Коррекция:* remedy\n- **Title2** ..."
  function parseShadows(shadowText) {
    if (!shadowText || typeof shadowText !== 'string') return [];
    // Разбиваем по маркерам "- **"
    const blocks = shadowText.split(/(?:^|\n)-\s+\*\*/).map(s => s.trim()).filter(Boolean);
    const shadows = [];
    for (const block of blocks) {
      // Блок должен содержать "**" закрывающую заголовка
      const titleEnd = block.indexOf('**');
      if (titleEnd === -1) continue;
      const title = block.slice(0, titleEnd).trim();
      if (!title) continue;
      let rest = block.slice(titleEnd + 2).trim();
      // Убираем стартовый разделитель
      rest = rest.replace(/^[\s—\-:]+/, '').trim();
      // Делим на описание и коррекцию
      const corrIdx = rest.indexOf('*Коррекция:*');
      let description, correction;
      if (corrIdx !== -1) {
        description = rest.slice(0, corrIdx).trim();
        correction = rest.slice(corrIdx + '*Коррекция:*'.length).trim();
      } else {
        description = rest;
        correction = '';
      }
      // Чистим висящие знаки
      description = description.replace(/[\s.]+$/, '') + '.';
      correction = correction.replace(/[\s.]+$/, '') + (correction ? '.' : '');
      shadows.push({ title, description, correction });
    }
    return shadows;
  }

  // Максимум 5 теней на дар (обычно 3-4 в контенте)
  const MAX_SHADOWS = 5;

  function getShadows(code) {
    const darData = (window.DAR_CONTENT && window.DAR_CONTENT[code]) || {};
    const parsed = parseShadows(darData.shadow || '');
    return parsed.slice(0, MAX_SHADOWS);
  }

  function openDar(code) {
    const name = getDarName(code);
    const arch = getDarArchetype(code);
    const container = document.getElementById('treasury-content');

    const shadows = getShadows(code);
    const darData = (window.DAR_CONTENT && window.DAR_CONTENT[code]) || {};
    const hasEssence = !!(darData.essence || darData.light_power);
    const hasMeditation = !!(darData.meditation || darData.activation);
    // Структура квестов: [1] Суть дара -> [2..N] Грани -> [N+1] Медитация
    // ESSENCE_IDX = 1, SHADOWS_START = 2, MEDITATION_IDX = shadows.length + 2
    const totalQuests = (hasEssence ? 1 : 0) + shadows.length + (hasMeditation ? 1 : 0);
    // unlocked_sections из БД - счётчик пройденных квестов
    const completedCount = Math.min(getUnlockedSections(code), totalQuests);

    let html = `
      <button class="btn-back" style="display:block" onclick="Treasury.render()">&#8592; Сокровищница</button>
      <div style="text-align:center;margin:16px 0 20px">
        <div style="font-size:22px;letter-spacing:2px;color:var(--text);margin-bottom:4px">${name}</div>
        ${arch ? `<div style="font-size:13px;color:#c4a0f0;font-style:italic;margin-bottom:8px">${arch}</div>` : ''}
        <div style="font-size:12px;color:#D4AF37;letter-spacing:1px">Раскрыто: ${completedCount} из ${totalQuests || '?'}</div>
      </div>

      <div style="background:linear-gradient(135deg,rgba(107,33,168,0.12),rgba(212,175,55,0.06));border:1px solid rgba(212,175,55,0.25);border-radius:14px;padding:14px;margin-bottom:16px">
        <div style="font-size:12px;color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;font-weight:600">&#10024; Алхимия дара</div>
        <div style="font-size:13px;color:var(--text);line-height:1.6">Начни с сути дара, пройди через каждую его грань, и заверши медитацией активации. Так сила дара раскроется в тебе полностью.</div>
      </div>
    `;

    if (!totalQuests) {
      html += `<div style="text-align:center;color:var(--text-muted);padding:30px 20px;font-size:13px">Алхимия этого дара пока не раскрыта.</div>`;
      container.innerHTML = html;
      return;
    }

    html += `<div class="dar-sections-list">`;

    // [1] Квест "Суть дара" - всегда первый
    if (hasEssence) {
      const ESSENCE_IDX = 1;
      const isEssCompleted = ESSENCE_IDX <= completedCount;
      const isEssNext = ESSENCE_IDX === completedCount + 1;

      if (isEssCompleted) {
        html += `
          <div class="dar-section-item dar-section-unlocked" onclick="Treasury.openEssenceQuest('${code}')" style="flex-direction:column;align-items:flex-start;gap:4px;padding:14px;background:rgba(180,120,255,0.1);border-color:rgba(180,120,255,0.4)">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
              <span style="font-size:14px;color:#c4a0f0;font-weight:bold">&#127775; Суть дара</span>
              <span style="color:#2ecc71;font-size:16px">&#10003;</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);font-style:italic">Суть узнана - перечитать</div>
          </div>`;
      } else if (isEssNext) {
        html += `
          <div class="dar-section-item dar-section-next" onclick="Treasury.openEssenceQuest('${code}')" style="flex-direction:column;align-items:flex-start;gap:6px;padding:14px;background:rgba(180,120,255,0.08);border-color:rgba(180,120,255,0.4)">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
              <span style="font-size:14px;color:#c4a0f0;font-weight:bold">&#127775; Суть дара</span>
              <span style="color:#c4a0f0;font-size:12px">Узнать &rarr;</span>
            </div>
            <div style="font-size:12px;color:var(--text-dim);line-height:1.5">Священная энергия дара и её проявление в твоей жизни.</div>
          </div>`;
      }
      // essence первый, locked случай невозможен
    }

    // [2..N] Квесты граней
    shadows.forEach((shadow, i) => {
      const idx = (hasEssence ? 2 : 1) + i;
      const isCompleted = idx <= completedCount;
      const isNext = idx === completedCount + 1;

      if (isCompleted) {
        html += `
          <div class="dar-section-item dar-section-unlocked" onclick="Treasury.openShadowQuest('${code}', ${idx})" style="flex-direction:column;align-items:flex-start;gap:4px;padding:14px">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
              <span style="font-size:14px;color:var(--text)">&#10024; ${shadow.title}</span>
              <span style="color:#2ecc71;font-size:16px">&#10003;</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);font-style:italic">Грань раскрыта - перечитать</div>
          </div>`;
      } else if (isNext) {
        html += `
          <div class="dar-section-item dar-section-next" onclick="Treasury.openShadowQuest('${code}', ${idx})" style="flex-direction:column;align-items:flex-start;gap:6px;padding:14px">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
              <span style="font-size:14px;color:var(--text);font-weight:bold">&#10024; ${shadow.title}</span>
              <span style="color:#D4AF37;font-size:12px">Раскрыть &rarr;</span>
            </div>
            <div style="font-size:12px;color:var(--text-dim);line-height:1.5">${shadow.description.slice(0, 120)}${shadow.description.length > 120 ? '...' : ''}</div>
          </div>`;
      } else {
        html += `
          <div class="dar-section-item dar-section-locked" style="flex-direction:column;align-items:flex-start;gap:4px;padding:14px">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
              <span style="font-size:14px;color:var(--text-muted)">&#128274; Грань ${idx - (hasEssence ? 1 : 0)}</span>
              <span style="color:var(--text-muted)">&#128274;</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);font-style:italic">Откроется после раскрытия предыдущей</div>
          </div>`;
      }
    });

    // [N+1] Финальный квест: Медитация - активация дара
    if (hasMeditation) {
      const medIdx = (hasEssence ? 1 : 0) + shadows.length + 1;
      const isMedCompleted = medIdx <= completedCount;
      const isMedNext = medIdx === completedCount + 1;

      if (isMedCompleted) {
        html += `
          <div class="dar-section-item dar-section-unlocked" onclick="Treasury.openMeditationQuest('${code}')" style="flex-direction:column;align-items:flex-start;gap:4px;padding:14px;background:rgba(212,175,55,0.1);border-color:rgba(212,175,55,0.4)">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
              <span style="font-size:14px;color:#D4AF37;font-weight:bold">&#129496; Медитация активации</span>
              <span style="color:#2ecc71;font-size:16px">&#10003;</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);font-style:italic">Дар активирован - перечитать</div>
          </div>`;
      } else if (isMedNext) {
        html += `
          <div class="dar-section-item dar-section-next" onclick="Treasury.openMeditationQuest('${code}')" style="flex-direction:column;align-items:flex-start;gap:6px;padding:14px;background:rgba(212,175,55,0.08);border-color:rgba(212,175,55,0.4)">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
              <span style="font-size:14px;color:#D4AF37;font-weight:bold">&#129496; Медитация активации дара</span>
              <span style="color:#D4AF37;font-size:12px">Пройти &rarr;</span>
            </div>
            <div style="font-size:12px;color:var(--text-dim);line-height:1.5">Завершающий квест: погружение в суть дара через медитацию и телесную практику активации.</div>
          </div>`;
      } else {
        html += `
          <div class="dar-section-item dar-section-locked" style="flex-direction:column;align-items:flex-start;gap:4px;padding:14px">
            <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
              <span style="font-size:14px;color:var(--text-muted)">&#128274; Медитация активации</span>
              <span style="color:var(--text-muted)">&#128274;</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);font-style:italic">Откроется после раскрытия всех граней</div>
          </div>`;
      }
    }

    html += '</div>';

    // Если все квесты проработаны - баннер достижения
    if (completedCount === totalQuests && totalQuests > 0) {
      html += `
        <div style="margin-top:18px;padding:18px;background:linear-gradient(135deg,rgba(212,175,55,0.2),rgba(107,33,168,0.15));border:1px solid rgba(212,175,55,0.5);border-radius:14px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">&#11088;</div>
          <div style="font-size:15px;color:#D4AF37;margin-bottom:6px;letter-spacing:1px">Дар раскрыт и активирован</div>
          <div style="font-size:12px;color:var(--text-dim);line-height:1.6">Ты прошла через все грани этого дара и активировала его через медитацию. Его светлая сила раскрылась в тебе.</div>
        </div>`;
    }

    container.innerHTML = html;
  }

  // --- Парсер медитации и активации из dar-content.json ---
  // meditation и activation - строковые описания, возможно с markdown
  function cleanMarkdown(text) {
    if (!text) return '';
    return String(text)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/^#+\s*/gm, '')
      .trim();
  }

  // --- Открыть квест медитации-активации ---
  function openMeditationQuest(code) {
    const name = getDarName(code);
    const darData = (window.DAR_CONTENT && window.DAR_CONTENT[code]) || {};
    const meditation = cleanMarkdown(darData.meditation || '');
    const activation = cleanMarkdown(darData.activation || '');
    const hasEssence = !!(darData.essence || darData.light_power);
    const container = document.getElementById('treasury-content');

    const shadows = getShadows(code);
    // Meditation idx = essence(1) + shadows(N) + 1
    const medIdx = (hasEssence ? 1 : 0) + shadows.length + 1;
    const completedCount = getUnlockedSections(code);
    const alreadyDone = medIdx <= completedCount;

    const reflKey = '_meditation_refl_' + code;
    const savedReflection = localStorage.getItem(reflKey) || '';

    let html = `
      <button class="btn-back" style="display:block" onclick="Treasury.openDar('${code}')">&#8592; ${name}</button>

      <div style="text-align:center;margin:14px 0 18px">
        <div style="font-size:11px;color:#D4AF37;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">Финальный квест</div>
        <div style="font-size:20px;color:var(--text);letter-spacing:1px">&#129496; Медитация активации</div>
      </div>
    `;

    if (activation) {
      html += `
        <div style="background:rgba(107,33,168,0.12);border:1px solid rgba(180,120,255,0.3);border-radius:14px;padding:16px;margin-bottom:14px">
          <div style="font-size:11px;color:#c4a0f0;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:bold">&#127775; Практика активации</div>
          <div style="font-size:14px;color:var(--text);line-height:1.7;white-space:pre-wrap">${activation}</div>
        </div>`;
    }

    if (meditation) {
      html += `
        <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:16px;margin-bottom:14px">
          <div style="font-size:11px;color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:bold">&#129496; Медитация</div>
          <div style="font-size:14px;color:var(--text);line-height:1.7;white-space:pre-wrap">${meditation}</div>
        </div>`;
    }

    // Блок рефлексии
    html += `
      <div style="background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.3);border-radius:14px;padding:16px;margin-bottom:14px">
        <div style="font-size:11px;color:#2ecc71;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:bold">&#128151; Твой отклик</div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:10px">Запиши 1-2 предложения: что ты почувствовала во время практики? Какое качество этого дара открылось тебе?</div>
        <textarea id="meditation-reflection" rows="4" style="width:100%;padding:12px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:Georgia,serif;font-size:14px;resize:vertical;line-height:1.6" placeholder="Твои слова...">${savedReflection}</textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <span style="font-size:11px;color:var(--text-muted)">Мин. 30 символов</span>
          <span style="font-size:12px;color:#D4AF37">${alreadyDone ? '&#10003; Уже пройдено' : '+10 &#128142;'}</span>
        </div>
        <button class="btn btn-secondary" style="margin-top:10px" onclick="Treasury.submitMeditationQuest('${code}')">${alreadyDone ? 'Отправить обновлённый ответ' : 'Активировать дар'}</button>
      </div>
    `;

    container.innerHTML = html;
  }

  async function submitMeditationQuest(code) {
    const container = document.getElementById('treasury-content');
    const answer = document.getElementById('meditation-reflection')?.value?.trim();
    if (!answer || answer.length < 30) {
      alert(`Запиши хотя бы 30 символов. Сейчас: ${answer?.length || 0}.`);
      return;
    }

    const reflKey = '_meditation_refl_' + code;
    localStorage.setItem(reflKey, answer);

    const darData = (window.DAR_CONTENT && window.DAR_CONTENT[code]) || {};
    const hasEssence = !!(darData.essence || darData.light_power);
    const shadows = getShadows(code);
    const medIdx = (hasEssence ? 1 : 0) + shadows.length + 1;
    const reward = 10;

    const oldCoaching = container.querySelector('.coaching-block');
    if (oldCoaching) oldCoaching.remove();

    setSubmitButtonLoading(container, true);

    let review;
    try {
      review = await DarAPI.reviewShadow({
        quest_type: 'meditation',
        dar_name: getDarName(code),
        user_answer: answer,
        gender: getUserGender()
      });
    } catch (e) {
      review = { accepted: true, message: 'Твоя рефлексия принята.' };
    }

    setSubmitButtonLoading(container, false);

    if (!review.accepted) {
      renderCoachingBlock(container, review.message, review.coaching_questions);
      setTimeout(() => {
        const b = container.querySelector('.coaching-block');
        if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    try {
      const result = await DarAPI.submitQuest(code, medIdx, 'meditation', answer);
      if (result.crystals_earned && typeof CrystalsUI !== 'undefined') {
        CrystalsUI.animateEarn(result.crystals_earned);
      }
      const d = userDars.find(d => d.dar_code === code);
      if (d) d.unlocked_sections = Math.max(d.unlocked_sections || 0, medIdx);
    } catch (e) {
      if (typeof CrystalsUI !== 'undefined') CrystalsUI.animateEarn(reward);
      const d = userDars.find(d => d.dar_code === code);
      if (d) d.unlocked_sections = Math.max(d.unlocked_sections || 0, medIdx);
    }

    alert((review.message || 'Дар активирован!') + `\n\n+${reward} кристаллов мудрости`);
    openDar(code);
  }

  // --- Открыть квест "Суть дара" (священная энергия + рефлексия) ---
  function openEssenceQuest(code) {
    const name = getDarName(code);
    const arch = getDarArchetype(code);
    const darData = (window.DAR_CONTENT && window.DAR_CONTENT[code]) || {};
    const essence = cleanMarkdown(darData.essence || '');
    const lightPower = cleanMarkdown(darData.light_power || '');
    const container = document.getElementById('treasury-content');

    const ESSENCE_IDX = 1;
    const completedCount = getUnlockedSections(code);
    const alreadyDone = ESSENCE_IDX <= completedCount;

    const reflKey = '_essence_refl_' + code;
    const savedReflection = localStorage.getItem(reflKey) || '';

    let html = `
      <button class="btn-back" style="display:block" onclick="Treasury.openDar('${code}')">&#8592; ${name}</button>

      <div style="text-align:center;margin:14px 0 18px">
        <div style="font-size:11px;color:#c4a0f0;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">&#127775; Суть дара</div>
        <div style="font-size:20px;color:var(--text);letter-spacing:1px">${name}</div>
        ${arch ? `<div style="font-size:12px;color:#c4a0f0;font-style:italic;margin-top:4px">${arch}</div>` : ''}
      </div>
    `;

    if (essence) {
      html += `
        <div style="background:rgba(107,33,168,0.12);border:1px solid rgba(180,120,255,0.3);border-radius:14px;padding:16px;margin-bottom:14px">
          <div style="font-size:11px;color:#c4a0f0;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:bold">&#9889; Священная энергия</div>
          <div style="font-size:14px;color:var(--text);line-height:1.7;white-space:pre-wrap">${essence}</div>
        </div>`;
    }

    if (lightPower) {
      html += `
        <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:16px;margin-bottom:14px">
          <div style="font-size:11px;color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:bold">&#127775; Светлая сила</div>
          <div style="font-size:14px;color:var(--text);line-height:1.7;white-space:pre-wrap">${lightPower}</div>
        </div>`;
    }

    // Блок рефлексии
    html += `
      <div style="background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.3);border-radius:14px;padding:16px;margin-bottom:14px">
        <div style="font-size:11px;color:#2ecc71;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:bold">&#128302; Твоё наблюдение</div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:10px">Вспомни, как этот дар проявлялся в твоей жизни. В каких моментах ты чувствовала его силу? Какую суперсилу он может дать, если ты раскроешь его полностью?</div>
        <textarea id="essence-reflection" rows="5" style="width:100%;padding:12px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:Georgia,serif;font-size:14px;resize:vertical;line-height:1.6" placeholder="Твои наблюдения...">${savedReflection}</textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <span style="font-size:11px;color:var(--text-muted)">Мин. 30 символов</span>
          <span style="font-size:12px;color:#D4AF37">${alreadyDone ? '&#10003; Уже узнано' : '+5 &#128142;'}</span>
        </div>
        <button class="btn btn-secondary" style="margin-top:10px" onclick="Treasury.submitEssenceQuest('${code}')">${alreadyDone ? 'Отправить обновлённый ответ' : 'Отправить ответ'}</button>
      </div>
    `;

    container.innerHTML = html;
  }

  async function submitEssenceQuest(code) {
    const container = document.getElementById('treasury-content');
    const answer = document.getElementById('essence-reflection')?.value?.trim();
    if (!answer || answer.length < 30) {
      alert(`Запиши хотя бы 30 символов. Сейчас: ${answer?.length || 0}.`);
      return;
    }

    const reflKey = '_essence_refl_' + code;
    localStorage.setItem(reflKey, answer);

    const ESSENCE_IDX = 1;
    const reward = 5;

    const oldCoaching = container.querySelector('.coaching-block');
    if (oldCoaching) oldCoaching.remove();

    setSubmitButtonLoading(container, true);

    let review;
    try {
      review = await DarAPI.reviewShadow({
        quest_type: 'essence',
        dar_name: getDarName(code),
        user_answer: answer,
        gender: getUserGender()
      });
    } catch (e) {
      review = { accepted: true, message: 'Твоё наблюдение принято.' };
    }

    setSubmitButtonLoading(container, false);

    if (!review.accepted) {
      renderCoachingBlock(container, review.message, review.coaching_questions);
      setTimeout(() => {
        const b = container.querySelector('.coaching-block');
        if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    // Принято - засчитываем кристаллы + открываем следующую секцию
    try {
      const result = await DarAPI.submitQuest(code, ESSENCE_IDX, 'essence', answer);
      if (result.crystals_earned && typeof CrystalsUI !== 'undefined') {
        CrystalsUI.animateEarn(result.crystals_earned);
      }
      const d = userDars.find(d => d.dar_code === code);
      if (d) d.unlocked_sections = Math.max(d.unlocked_sections || 0, ESSENCE_IDX);
    } catch (e) {
      if (typeof CrystalsUI !== 'undefined') CrystalsUI.animateEarn(reward);
      const d = userDars.find(d => d.dar_code === code);
      if (d) d.unlocked_sections = Math.max(d.unlocked_sections || 0, ESSENCE_IDX);
    }

    alert((review.message || 'Суть дара узнана!') + `\n\n+${reward} кристаллов мудрости`);
    openDar(code);
  }

  // --- Открыть теневой квест (УЗНАЙ → ПРОЖИВИ → ОТПУСТИ) ---
  function openShadowQuest(code, questIdx) {
    const name = getDarName(code);
    const shadows = getShadows(code);
    const darData = (window.DAR_CONTENT && window.DAR_CONTENT[code]) || {};
    const hasEssence = !!(darData.essence || darData.light_power);
    // Грани начинаются с idx=2 если есть essence, иначе с 1
    const shadowArrayIdx = questIdx - (hasEssence ? 2 : 1);
    const shadow = shadows[shadowArrayIdx];
    const container = document.getElementById('treasury-content');
    if (!shadow) {
      openDar(code);
      return;
    }

    const completedCount = getUnlockedSections(code);
    const alreadyDone = questIdx <= completedCount;
    const displayIdx = shadowArrayIdx + 1; // для отображения "Грань 1 из N"

    // Проверить, есть ли сохранённая рефлексия
    const reflKey = '_shadow_refl_' + code + '_' + questIdx;
    const savedReflection = localStorage.getItem(reflKey) || '';

    let html = `
      <button class="btn-back" style="display:block" onclick="Treasury.openDar('${code}')">&#8592; ${name}</button>

      <div style="text-align:center;margin:14px 0 18px">
        <div style="font-size:11px;color:var(--text-muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">Грань ${displayIdx} из ${shadows.length}</div>
        <div style="font-size:20px;color:var(--text);letter-spacing:1px">${shadow.title}</div>
      </div>

      <div style="background:rgba(107,33,168,0.12);border:1px solid rgba(180,120,255,0.3);border-radius:14px;padding:16px;margin-bottom:14px">
        <div style="font-size:11px;color:#c4a0f0;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:bold">&#128302; Узнай</div>
        <div style="font-size:14px;color:var(--text);line-height:1.7">${shadow.description}</div>
      </div>
    `;

    if (shadow.correction) {
      html += `
        <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:16px;margin-bottom:14px">
          <div style="font-size:11px;color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:bold">&#127775; Проживи</div>
          <div style="font-size:14px;color:var(--text);line-height:1.7">${shadow.correction}</div>
        </div>`;
    }

    // Блок "Отпусти" - рефлексия
    html += `
      <div style="background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.3);border-radius:14px;padding:16px;margin-bottom:14px">
        <div style="font-size:11px;color:#2ecc71;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:bold">&#128151; Отпусти</div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:10px">Запиши 1-2 предложения: что ты заметила в себе через эту грань? Что хочешь отпустить?</div>
        <textarea id="shadow-reflection" rows="4" style="width:100%;padding:12px;background:rgba(255,255,255,0.07);border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:Georgia,serif;font-size:14px;resize:vertical;line-height:1.6" placeholder="Твои слова...">${savedReflection}</textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
          <span style="font-size:11px;color:var(--text-muted)">Мин. 30 символов</span>
          <span style="font-size:12px;color:#D4AF37">${alreadyDone ? '&#10003; Уже раскрыто' : '+7 &#128142;'}</span>
        </div>
        <button class="btn btn-secondary" style="margin-top:10px" onclick="Treasury.submitShadowQuest('${code}', ${questIdx})">${alreadyDone ? 'Отправить обновлённый ответ' : 'Отправить ответ'}</button>
      </div>
    `;

    container.innerHTML = html;
  }

  // Получить пол из профиля (для AI)
  function getUserGender() {
    try {
      const prof = JSON.parse(localStorage.getItem('_darProfile') || '{}');
      if (prof.gender === 'male' || prof.gender === 'female') return prof.gender;
    } catch (e) {}
    return '';
  }

  // Показать блок "AI-гуру размышляет"
  function setSubmitButtonLoading(container, loading) {
    const btns = container.querySelectorAll('button.btn-secondary');
    btns.forEach(b => {
      b.disabled = loading;
      b.style.opacity = loading ? '0.6' : '1';
      if (loading && !b.dataset.origText) {
        b.dataset.origText = b.textContent;
        b.textContent = 'Наставник размышляет...';
      } else if (!loading && b.dataset.origText) {
        b.textContent = b.dataset.origText;
        delete b.dataset.origText;
      }
    });
  }

  // Показать блок коучинг-вопросов под текстареа
  function renderCoachingBlock(container, message, questions) {
    const existing = container.querySelector('.coaching-block');
    if (existing) existing.remove();

    const block = document.createElement('div');
    block.className = 'coaching-block';
    block.style.cssText = 'margin-top:14px;background:rgba(180,120,255,0.1);border:1px solid rgba(180,120,255,0.35);border-radius:14px;padding:16px';
    let qHtml = '';
    if (questions && questions.length) {
      qHtml = '<ul style="margin:10px 0 0 0;padding-left:20px;color:var(--text);font-size:13px;line-height:1.7">' +
        questions.map(q => `<li style="margin-bottom:6px">${escapeHtmlSimple(q)}</li>`).join('') +
        '</ul>';
    }
    block.innerHTML = `
      <div style="font-size:11px;color:#c4a0f0;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;font-weight:bold">&#128172; Послание наставника</div>
      <div style="font-size:13px;color:var(--text);line-height:1.7">${escapeHtmlSimple(message)}</div>
      ${qHtml}
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px;font-style:italic">Подумай над вопросами и дополни свою рефлексию выше, затем отправь снова.</div>
    `;
    container.appendChild(block);
  }

  function escapeHtmlSimple(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function submitShadowQuest(code, questIdx) {
    const container = document.getElementById('treasury-content');
    const answer = document.getElementById('shadow-reflection')?.value?.trim();
    if (!answer || answer.length < 30) {
      alert(`Запиши хотя бы 30 символов рефлексии. Сейчас: ${answer?.length || 0}.`);
      return;
    }

    const reflKey = '_shadow_refl_' + code + '_' + questIdx;
    localStorage.setItem(reflKey, answer);

    const shadows = getShadows(code);
    const darData = (window.DAR_CONTENT && window.DAR_CONTENT[code]) || {};
    const hasEssence = !!(darData.essence || darData.light_power);
    // Грани в массиве начинаются с 0, а questIdx начинается с 2 (если есть essence) или 1
    const shadow = shadows[questIdx - (hasEssence ? 2 : 1)];

    // Убираем прошлый блок коучинг-вопросов если был
    const oldCoaching = container.querySelector('.coaching-block');
    if (oldCoaching) oldCoaching.remove();

    setSubmitButtonLoading(container, true);

    let review;
    try {
      review = await DarAPI.reviewShadow({
        quest_type: 'shadow',
        dar_name: getDarName(code),
        shadow_title: shadow?.title || '',
        shadow_description: shadow?.description || '',
        shadow_correction: shadow?.correction || '',
        user_answer: answer,
        gender: getUserGender()
      });
    } catch (e) {
      // Fallback: принимаем если API упал
      review = { accepted: true, message: 'Твоя рефлексия принята.' };
    }

    setSubmitButtonLoading(container, false);

    if (!review.accepted) {
      // Показать коучинг-вопросы - НЕ открывать секцию
      renderCoachingBlock(container, review.message, review.coaching_questions);
      // Прокрутить к блоку
      setTimeout(() => {
        const b = container.querySelector('.coaching-block');
        if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    // Ответ принят - начисляем кристаллы и открываем следующую секцию
    const reward = 7;
    try {
      const result = await DarAPI.submitQuest(code, questIdx, 'shadow_work', answer);
      if (result.crystals_earned && typeof CrystalsUI !== 'undefined') {
        CrystalsUI.animateEarn(result.crystals_earned);
      }
      const d = userDars.find(d => d.dar_code === code);
      if (d) d.unlocked_sections = Math.max(d.unlocked_sections || 0, questIdx);
    } catch (e) {
      if (typeof CrystalsUI !== 'undefined') CrystalsUI.animateEarn(reward);
      const d = userDars.find(d => d.dar_code === code);
      if (d) d.unlocked_sections = Math.max(d.unlocked_sections || 0, questIdx);
    }

    // Показать сообщение одобрения + переход
    alert((review.message || 'Грань раскрыта!') + `\n\n+${reward} кристаллов мудрости`);
    openDar(code);
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

  return { init, render, openDar, openEssenceQuest, openShadowQuest, openMeditationQuest, submitEssenceQuest, submitShadowQuest, submitMeditationQuest, unlockRandom };
})();
