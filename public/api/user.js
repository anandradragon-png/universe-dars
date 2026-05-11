/**
 * Консолидированный user endpoint:
 *  - action=profile (default)  — существующая user API (GET/POST)
 *  - action=relatives          — управление списком близких (GET/POST/DELETE)
 *  - action=verify             — проверка промо-кода без авторизации
 *  - action=promo              — активация промо-кода (с мягкой авторизацией)
 *
 * Роутинг по req.query.action или URL (через rewrites).
 */

const { getUser, requireUser } = require('./_lib/auth');
const { getOrCreateUser, updateUser, getUserDars, addCrystals, unlockDar, getSupabase } = require('./_lib/db');
const pricing = require('./_lib/pricing');
const { getReward, getStreakBonus } = require('./_lib/crystals');

// =====================================================================
// ========== PROFILE (default) ========================================
// =====================================================================

async function handleProfile(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

    if (req.method === 'GET') {
      // Получить или создать профиль
      const user = await getOrCreateUser(tgUser);
      const dars = await getUserDars(user.id);

      return res.json({
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          first_name: user.first_name,
          dar_code: user.dar_code,
          dar_name: user.dar_name,
          crystals: user.crystals,
          access_level: user.access_level,
          streak_count: user.streak_count || 0,
          real_first_name: user.real_first_name || '',
          real_last_name: user.real_last_name || '',
          gender: user.gender || '',
          birth_time: user.birth_time || '',
          birth_place: user.birth_place || '',
          birth_lat: user.birth_lat !== null && user.birth_lat !== undefined ? Number(user.birth_lat) : null,
          birth_lon: user.birth_lon !== null && user.birth_lon !== undefined ? Number(user.birth_lon) : null,
          profile_completed: !!user.profile_completed,
          leaderboard_name_type: user.leaderboard_name_type || 'real',
          leaderboard_custom_name: user.leaderboard_custom_name || '',
          avatar: user.avatar || '',
        },
        dars: dars.map(d => ({
          dar_code: d.dar_code,
          unlock_source: d.unlock_source,
          unlocked_sections: d.unlocked_sections
        }))
      });
    }

    if (req.method === 'POST') {
      const { action } = req.body;
      const user = await getOrCreateUser(tgUser);

      // Сохранить рассчитанный дар
      if (action === 'save_dar') {
        const { dar_code, dar_name, birth_date } = req.body;
        if (!dar_code) return res.status(400).json({ error: 'dar_code required' });

        const isFirstDar = !user.dar_code;
        await updateUser(user.id, { dar_code, dar_name, birth_date });

        // Открыть свой дар в сокровищнице
        await unlockDar(user.id, dar_code, 'own');

        // Бонус за первый расчёт
        let crystalsEarned = 0;
        if (isFirstDar) {
          crystalsEarned = getReward('signup', user.access_level);
          await addCrystals(user.id, crystalsEarned, 'signup');
        }

        return res.json({ success: true, crystals_earned: crystalsEarned });
      }

      // Ежедневный вход — прогрессивный 7-дневный цикл (11.05.2026)
      // День 1-7: 1, 2, 4, 6, 10, 12, 15 кристаллов.
      // После 7 дня — снова с 1.
      // Пропуск дня — сброс до дня 1.
      if (action === 'daily_login') {
        const today = new Date().toISOString().slice(0, 10);
        const lastDate = user.last_streak_date;

        if (lastDate === today) {
          return res.json({
            already_logged: true,
            streak: user.streak_count,
            cycle_day: user.daily_streak_day || 1
          });
        }

        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const continuesStreak = lastDate === yesterday;
        const newStreak = continuesStreak ? (user.streak_count || 0) + 1 : 1;

        // Позиция в 7-дневном цикле
        const prevCycleDay = user.daily_streak_day || 0;
        let cycleDay;
        if (!continuesStreak) {
          cycleDay = 1; // сброс при пропуске или первый вход
        } else {
          cycleDay = prevCycleDay >= 7 ? 1 : prevCycleDay + 1;
        }

        const DAILY_REWARDS = [1, 2, 4, 6, 10, 12, 15]; // дни 1..7
        const crystals = DAILY_REWARDS[cycleDay - 1] || 1;

        await updateUser(user.id, {
          streak_count: newStreak,
          last_streak_date: today,
          daily_streak_day: cycleDay
        });

        const newBalance = await addCrystals(user.id, crystals, 'daily_login', {
          streak: newStreak,
          cycle_day: cycleDay
        });

        return res.json({
          streak: newStreak,
          cycle_day: cycleDay,
          crystals_earned: crystals,
          total_crystals: newBalance
        });
      }

      // Сохранить расширенный профиль
      if (action === 'save_profile') {
        const { real_first_name, real_last_name, gender, birth_date, birth_time, birth_place, birth_lat, birth_lon } = req.body;

        // Валидация
        if (!real_first_name || !real_first_name.trim()) {
          return res.status(400).json({ error: 'Укажи своё имя' });
        }
        if (!real_last_name || !real_last_name.trim()) {
          return res.status(400).json({ error: 'Укажи свою фамилию' });
        }
        if (gender !== 'male' && gender !== 'female') {
          return res.status(400).json({ error: 'Укажи пол' });
        }
        // Дата рождения — обязательна, формат ДД.ММ.ГГГГ
        if (!birth_date || !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(birth_date)) {
          return res.status(400).json({ error: 'Укажи дату рождения в формате ДД.ММ.ГГГГ' });
        }
        const [_dd, _mm, _yyyy] = birth_date.split('.').map(Number);
        const _nowYear = new Date().getUTCFullYear();
        if (_dd < 1 || _dd > 31 || _mm < 1 || _mm > 12 || _yyyy < 1900 || _yyyy > _nowYear) {
          return res.status(400).json({ error: 'Проверь дату рождения — что-то не так' });
        }
        if (!birth_time || !/^\d{1,2}:\d{2}$/.test(birth_time)) {
          return res.status(400).json({ error: 'Укажи время рождения в формате ЧЧ:ММ' });
        }
        if (!birth_place || !birth_place.trim()) {
          return res.status(400).json({ error: 'Укажи место рождения' });
        }
        const lat = Number(birth_lat);
        const lon = Number(birth_lon);
        if (!isFinite(lat) || lat < -90 || lat > 90) {
          return res.status(400).json({ error: 'Некорректная широта. Выбери город из подсказок.' });
        }
        if (!isFinite(lon) || lon < -180 || lon > 180) {
          return res.status(400).json({ error: 'Некорректная долгота. Выбери город из подсказок.' });
        }

        try {
          await updateUser(user.id, {
            real_first_name: real_first_name.trim().slice(0, 50),
            real_last_name: real_last_name.trim().slice(0, 50),
            gender,
            birth_date,
            birth_time,
            birth_place: birth_place.trim().slice(0, 100),
            birth_lat: lat,
            birth_lon: lon,
            profile_completed: true,
          });
          return res.json({ success: true });
        } catch (dbErr) {
          console.error('save_profile DB error:', dbErr.message);
          if (dbErr.message && dbErr.message.includes('column')) {
            return res.status(500).json({ error: 'База данных не обновлена. Запусти миграцию supabase-migration-profile.sql в Supabase SQL Editor.' });
          }
          throw dbErr;
        }
      }

      // Сохранить аватарку (data URL base64)
      if (action === 'save_avatar') {
        const { avatar } = req.body || {};
        // Допускаем пустую строку для удаления
        if (typeof avatar !== 'string') {
          return res.status(400).json({ error: 'Аватарка должна быть строкой' });
        }
        // Проверка размера: 1 МБ data URL ~ 750 КБ raw
        if (avatar.length > 1100000) {
          return res.status(400).json({ error: 'Аватарка слишком большая. Максимум 1 МБ.' });
        }
        // Базовая проверка формата (если не пустая - должна быть data:image/...)
        if (avatar && !avatar.startsWith('data:image/')) {
          return res.status(400).json({ error: 'Неверный формат изображения.' });
        }
        try {
          await updateUser(user.id, { avatar });
          return res.json({ success: true });
        } catch (dbErr) {
          console.error('save_avatar DB error:', dbErr.message);
          if (dbErr.message && dbErr.message.includes('column') && dbErr.message.includes('avatar')) {
            return res.status(500).json({ error: 'База данных не обновлена. Запусти миграцию supabase-migration-avatar.sql.' });
          }
          throw dbErr;
        }
      }

      // Сохранить выбор имени для рейтинга
      if (action === 'save_leaderboard_name') {
        const { name_type, custom_name } = req.body;
        if (name_type !== 'real' && name_type !== 'tg' && name_type !== 'custom') {
          return res.status(400).json({ error: 'Неверный тип имени. Допустимые: real, tg, custom.' });
        }
        if (name_type === 'custom') {
          const trimmed = (custom_name || '').trim();
          if (trimmed.length < 2) {
            return res.status(400).json({ error: 'Твоё имя должно быть не короче 2 символов.' });
          }
          if (trimmed.length > 30) {
            return res.status(400).json({ error: 'Твоё имя не должно превышать 30 символов.' });
          }
        }
        try {
          const updated = await updateUser(user.id, {
            leaderboard_name_type: name_type,
            leaderboard_custom_name: name_type === 'custom' ? (custom_name || '').trim().slice(0, 30) : ''
          });

          // Сразу синхронизируем display_name в intuition_scores, иначе в
          // рейтинге отображается старое имя до следующей игры.
          // (Тестеры жаловались: сменил ник в настройках — в рейтинге без изменений.)
          try {
            const db = getSupabase();
            let displayName;
            if (name_type === 'custom') {
              displayName = (custom_name || '').trim().slice(0, 40);
            } else if (name_type === 'real' && updated.real_first_name) {
              const last = updated.real_last_name || '';
              displayName = (updated.real_first_name + (last ? ' ' + last.charAt(0) + '.' : '')).slice(0, 40);
            } else {
              const tg = (updated.first_name || '') + (updated.last_name ? ' ' + updated.last_name.charAt(0) + '.' : '');
              displayName = (tg || 'Странник').slice(0, 40);
            }
            await db.from('intuition_scores')
              .update({ display_name: displayName })
              .eq('user_id', user.id);
          } catch (syncErr) {
            console.warn('[user.js] leaderboard display_name sync failed:', syncErr.message);
          }

          return res.json({ success: true });
        } catch (dbErr) {
          console.error('save_leaderboard_name DB error:', dbErr.message);
          if (dbErr.message && dbErr.message.includes('column')) {
            return res.status(500).json({ error: 'База данных не обновлена. Запусти миграцию supabase-migration-leaderboard.sql.' });
          }
          throw dbErr;
        }
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('user.js error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// =====================================================================
// ========== RELATIVES (близкие) ======================================
// =====================================================================

const SLOT_LIMITS = {
  basic: 0,
  extended: 3,
  premium: Infinity
};

const VALID_RELATIONSHIPS = [
  'mother', 'father', 'son', 'daughter',
  'grandson', 'granddaughter',
  'partner', 'friend', 'sibling', 'other'
];

// --- Расчёт дара по дате рождения (DD.MM.YYYY или YYYY-MM-DD) ---
function reduce(n) {
  while (n > 9) n = String(n).split('').reduce((s, d) => s + parseInt(d), 0);
  return n;
}

function calcDarCode(birthDate) {
  // Принимаем форматы DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD
  let d, m, y;
  let s = String(birthDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    [y, m, d] = s.split('-').map(Number);
  } else {
    s = s.replace(/[\/\-\\]/g, '.');
    const parts = s.split('.');
    if (parts.length !== 3) return null;
    [d, m, y] = parts.map(Number);
  }
  if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2100) return null;
  const ma = reduce(d + m);
  const zhi = reduce(String(y).split('').reduce((s, c) => s + parseInt(c), 0));
  const kun = reduce(ma + zhi);
  return `${ma}-${zhi}-${kun}`;
}

// --- Нормализация даты в DD.MM.YYYY для хранения ---
function normalizeDate(birthDate) {
  let s = String(birthDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
  }
  s = s.replace(/[\/\-\\]/g, '.');
  const parts = s.split('.');
  if (parts.length === 3) {
    return `${parts[0].padStart(2, '0')}.${parts[1].padStart(2, '0')}.${parts[2]}`;
  }
  return s;
}

async function handleRelatives(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

    const db = getSupabase();
    const user = await getOrCreateUser(tgUser);
    // Эффективный тариф = с учётом subscription_end (если истекла — basic)
    const effectiveTier = pricing.getEffectiveTierWithSimulation(user, req);
    const slotLimit = pricing.getLimits(user, req).family_slots;
    const accessLevel = effectiveTier;

    // ========== GET: список близких + лимиты ==========
    if (req.method === 'GET') {
      let relatives = [];
      try {
        const { data, error } = await db
          .from('user_relatives')
          .select('id, name, relationship, birth_date, gender, dar_code, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });
        if (error) {
          console.warn('relatives GET error:', error.message);
          return res.status(200).json({
            relatives: [],
            slot_limit: slotLimit === Infinity ? null : slotLimit,
            slot_used: 0,
            access_level: accessLevel,
            note: 'Таблица user_relatives не создана.'
          });
        }
        relatives = data || [];
      } catch (e) {
        console.warn('relatives GET threw:', e.message);
        return res.status(200).json({
          relatives: [],
          slot_limit: slotLimit === Infinity ? null : slotLimit,
          slot_used: 0,
          access_level: accessLevel
        });
      }

      // Помечаем какие близкие СЕЙЧАС активны (первые N по тарифу),
      // а какие "заморожены" из-за понижения тарифа.
      const finiteLimit = slotLimit === Infinity ? relatives.length : slotLimit;
      const activeRelatives = relatives.map((r, i) => ({ ...r, is_active: i < finiteLimit }));
      const frozenCount = Math.max(0, relatives.length - finiteLimit);

      return res.status(200).json({
        relatives: activeRelatives,
        slot_limit: slotLimit === Infinity ? null : slotLimit,
        slot_used: relatives.length,
        slot_active: Math.min(relatives.length, finiteLimit),
        slot_frozen: frozenCount,
        access_level: accessLevel
      });
    }

    // ========== POST: добавить близкого ==========
    if (req.method === 'POST') {
      // Проверка лимита
      if (slotLimit === 0) {
        return res.status(403).json({
          error: 'Чтобы добавлять близких, нужен тариф Хранитель или выше. Открой тарифы в Личном Кабинете.',
          required_tier: 'extended'
        });
      }

      const { name, birth_date, relationship, gender } = req.body || {};

      // Валидация
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Укажи имя близкого человека.' });
      }
      const cleanName = name.trim().slice(0, 50);
      if (cleanName.length < 2) {
        return res.status(400).json({ error: 'Имя должно быть не короче 2 символов.' });
      }

      if (!birth_date) {
        return res.status(400).json({ error: 'Укажи дату рождения.' });
      }
      const dar_code = calcDarCode(birth_date);
      if (!dar_code) {
        return res.status(400).json({ error: 'Неверная дата рождения. Формат: ДД.ММ.ГГГГ' });
      }
      const normalizedDate = normalizeDate(birth_date);

      if (!relationship || !VALID_RELATIONSHIPS.includes(relationship)) {
        return res.status(400).json({ error: 'Укажи тип связи (мама/папа/сын/дочь/партнёр/друг/брат-сестра/другое).' });
      }

      const cleanGender = (gender === 'male' || gender === 'female') ? gender : null;

      // Проверка текущего количества (повторно, на случай race condition)
      const { count: currentCount } = await db
        .from('user_relatives')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (currentCount !== null && slotLimit !== Infinity && currentCount >= slotLimit) {
        return res.status(403).json({
          error: `У тебя уже ${currentCount} из ${slotLimit} слотов занято. Удали кого-то или повысь уровень доступа.`,
          slot_limit: slotLimit,
          slot_used: currentCount
        });
      }

      // Вставка
      try {
        const { data, error } = await db
          .from('user_relatives')
          .insert({
            user_id: user.id,
            name: cleanName,
            birth_date: normalizedDate,
            relationship,
            gender: cleanGender,
            dar_code
          })
          .select()
          .single();

        if (error) {
          // Нарушение UNIQUE - такой человек уже есть
          if (error.code === '23505') {
            return res.status(409).json({ error: 'Этот человек уже добавлен в твой список.' });
          }
          // Таблица не создана
          if (error.message && error.message.includes('relation') && error.message.includes('does not exist')) {
            return res.status(503).json({ error: 'Функция временно недоступна. База данных обновляется. Попробуй позже.' });
          }
          console.error('relatives POST error:', error);
          return res.status(500).json({ error: 'Не удалось сохранить. Попробуй ещё раз.' });
        }

        return res.status(200).json({
          success: true,
          relative: data
        });
      } catch (e) {
        console.error('relatives POST threw:', e.message);
        return res.status(500).json({ error: 'Не удалось сохранить. Попробуй ещё раз.' });
      }
    }

    // ========== DELETE: ЗАПРЕЩЕНО ==========
    // Удаление близких полностью отключено как защита от абуза
    // (иначе юзер мог бы удалять и добавлять разных людей в один слот,
    // используя слоты как "одноразовые проверки совместимости").
    // После сохранения близкий привязан навсегда. См. также проверку в POST.
    if (req.method === 'DELETE') {
      return res.status(403).json({
        error: 'Удаление близких отключено. Близкий, которого ты добавила, привязан к твоему аккаунту навсегда — это защита от подмены и злоупотреблений.'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('relatives.js fatal:', e.message);
    return res.status(500).json({ error: 'Что-то пошло не так. Попробуй ещё раз.' });
  }
}

// =====================================================================
// ========== VERIFY-CODE (без авторизации) ============================
// =====================================================================

async function handleVerifyCode(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    res.status(400).json({ valid: false, error: 'Код не передан' });
    return;
  }

  const validCodes = (process.env.PROMO_CODES || '')
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter(Boolean);

  const isValid = validCodes.includes(code.trim().toLowerCase());

  res.status(200).json({ valid: isValid, error: isValid ? null : 'Неверный промо-код' });
}

// =====================================================================
// ========== PROMO (активация) =========================================
// =====================================================================

async function handlePromo(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Мягкая авторизация (как в payment.js) — initData может быть expired
    let tgUser = getUser(req);
    let user = null;

    if (tgUser && tgUser.id) {
      try {
        user = await getOrCreateUser(tgUser);
      } catch (e) {
        console.warn('[promo] getOrCreateUser failed:', e.message);
      }
    }

    // Fallback: парсим user из initData без валидации hash
    if (!user) {
      try {
        const initData = req.headers['x-telegram-init-data'] || '';
        if (initData) {
          const params = new URLSearchParams(initData);
          const userJson = params.get('user');
          if (userJson) {
            const parsed = JSON.parse(userJson);
            if (parsed.id) {
              tgUser = parsed;
              user = await getOrCreateUser(parsed);
              console.log('[promo] Using unvalidated user fallback:', parsed.id);
            }
          }
        }
      } catch (e) {
        console.warn('[promo] fallback auth failed:', e.message);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Не удалось авторизоваться. Закрой и открой приложение заново.' });
    }
    const { code } = req.body;

    if (!code) return res.status(400).json({ error: 'code required' });

    // Все промокоды отключены 26.04.2026 по решению автора — тестовый период
    // завершён, дальше только платные тарифы. Если в будущем понадобятся
    // промо-кампании — раскомментировать чтение из env и завести коды.
    const extendedCodes = [];
    const premiumCodes = [];
    // const extendedCodes = (process.env.PROMO_CODES_EXTENDED || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    // const premiumCodes = (process.env.PROMO_CODES_PREMIUM || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);

    const inputCode = code.trim().toUpperCase();

    // Проверка: промокод уже был активирован этим пользователем?
    // Тестеры жаловались: при повторном вводе UNIVERSE777 снова давали +20 кристаллов.
    // Ищем в crystal_log запись с reason='promo_*' и metadata.code=inputCode
    const db = getSupabase();
    const { data: existingClaim } = await db
      .from('crystal_log')
      .select('id, amount, reason, metadata')
      .eq('user_id', user.id)
      .in('reason', ['promo_extended', 'promo_premium'])
      .eq('metadata->>code', inputCode)
      .limit(1);

    if (existingClaim && existingClaim.length > 0) {
      // Уже активирован — кристаллы не даём, но сообщаем что уровень есть
      return res.json({
        success: true,
        access_level: user.access_level,
        crystals_bonus: 0,
        message: 'Промо-код уже активирован ранее',
        already_claimed: true
      });
    }

    if (premiumCodes.includes(inputCode)) {
      await updateUser(user.id, { access_level: 'premium' });
      await addCrystals(user.id, 50, 'promo_premium', { code: inputCode });
      return res.json({ success: true, access_level: 'premium', crystals_bonus: 50 });
    }

    if (extendedCodes.includes(inputCode)) {
      if (user.access_level === 'premium') {
        // Уровень уже выше — просто фиксируем что код активирован (без повторного начисления)
        await addCrystals(user.id, 0, 'promo_extended', { code: inputCode });
        return res.json({ success: true, message: 'Already premium', access_level: 'premium', crystals_bonus: 0 });
      }
      await updateUser(user.id, { access_level: 'extended' });
      await addCrystals(user.id, 20, 'promo_extended', { code: inputCode });
      return res.json({ success: true, access_level: 'extended', crystals_bonus: 20 });
    }

    return res.json({ success: false, message: 'Invalid code' });
  } catch (e) {
    console.error('promo.js error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// =====================================================================
// ========== MAIN ROUTER ==============================================
// =====================================================================

module.exports = async (req, res) => {
  const action = (req.query && req.query.action) || '';
  const url = req.url || '';

  if (action === 'relatives' || url.includes('/relatives')) {
    return handleRelatives(req, res);
  }
  if (action === 'verify' || url.includes('/verify-code')) {
    return handleVerifyCode(req, res);
  }
  if (action === 'promo' || url.includes('/promo')) {
    return handlePromo(req, res);
  }

  // default — профиль (существующий user API)
  return handleProfile(req, res);
};
