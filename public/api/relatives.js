/**
 * API для управления близкими пользователя ("Моя семья и близкие")
 *
 * GET    /api/relatives        - получить список своих близких
 * POST   /api/relatives        - добавить нового близкого
 *                                body: { name, birth_date, relationship, gender? }
 * DELETE /api/relatives?id=NN  - удалить близкого по id
 *
 * Лимиты по уровню доступа:
 *   basic    (Странник)  - 0 слотов
 *   extended (Хранитель) - 3 слота
 *   premium  (Мастер)    - безлимит
 *
 * Нельзя ОБНОВИТЬ запись (по бизнес-правилу). Только удалить и добавить заново.
 */

const { requireUser } = require('./lib/auth');
const { getSupabase, getOrCreateUser } = require('./lib/db');

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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;

    const db = getSupabase();
    const user = await getOrCreateUser(tgUser);
    const accessLevel = user.access_level || 'basic';
    const slotLimit = SLOT_LIMITS[accessLevel] !== undefined ? SLOT_LIMITS[accessLevel] : 0;

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
          // Если таблица не создана - возвращаем пустой список, не ломаем UI
          return res.status(200).json({
            relatives: [],
            slot_limit: slotLimit,
            slot_used: 0,
            access_level: accessLevel,
            note: 'Таблица user_relatives не создана. Запусти supabase-migration-relatives.sql'
          });
        }
        relatives = data || [];
      } catch (e) {
        console.warn('relatives GET threw:', e.message);
        return res.status(200).json({
          relatives: [],
          slot_limit: slotLimit,
          slot_used: 0,
          access_level: accessLevel
        });
      }

      return res.status(200).json({
        relatives,
        slot_limit: slotLimit === Infinity ? null : slotLimit,
        slot_used: relatives.length,
        access_level: accessLevel
      });
    }

    // ========== POST: добавить близкого ==========
    if (req.method === 'POST') {
      // Проверка лимита
      if (slotLimit === 0) {
        return res.status(403).json({
          error: 'Чтобы добавлять близких, нужен уровень Хранитель или выше. Получи его через промо-код или открой все 64 дара.'
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
};
