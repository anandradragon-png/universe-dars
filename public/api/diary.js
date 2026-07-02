/**
 * API для Дневника Дара — ежедневный трекер эмоций
 *
 * POST /api/diary
 *   action: 'save_mood'  — сохранить эмодзи состояния за сегодня
 *     body: { mood, note? }
 *   action: 'get_week'   — получить записи за последние 7 дней
 *   action: 'get_month'  — получить записи за последние 30 дней
 *   action: 'get_insight'— запросить AI-инсайт по накопленным данным
 */

const { requireUser } = require('./_lib/auth');
const { getSupabase, getOrCreateUser } = require('./_lib/db');
const pricing = require('./_lib/pricing');
const deepseek = require('./_lib/deepseek');
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');

let darContent = {};
try { darContent = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dar-content.json'), 'utf8')); } catch(e) {}
const fieldsData = require('../fields.json');
const DARS_DB = {};
fieldsData.dars.forEach(d => { DARS_DB[d.code] = d.name; });

const MOODS = {
  joy:        { ru: 'Радость',       emoji: '😊', energy: 'light' },
  calm:       { ru: 'Спокойствие',   emoji: '😌', energy: 'neutral' },
  energy:     { ru: 'Энергия',       emoji: '🔥', energy: 'light' },
  anxiety:    { ru: 'Тревога',       emoji: '😰', energy: 'shadow' },
  sadness:    { ru: 'Грусть',        emoji: '😔', energy: 'shadow' },
  irritation: { ru: 'Раздражение',   emoji: '😤', energy: 'shadow' },
  inspiration:{ ru: 'Вдохновение',   emoji: '✨', energy: 'light' },
  fatigue:    { ru: 'Усталость',     emoji: '😴', energy: 'shadow' }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-telegram-init-data, x-telegram-id');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const tgUser = requireUser(req, res);
    if (!tgUser) return;
    const user = await getOrCreateUser(tgUser);
    const db = getSupabase();
    const { action } = req.body || {};

    // ========== СОХРАНИТЬ НАСТРОЕНИЕ ==========
    if (action === 'save_mood') {
      const { mood, note } = req.body;
      if (!mood || !MOODS[mood]) {
        return res.status(400).json({ error: 'Выбери настроение из списка' });
      }

      try {
        await db.from('dar_diary').upsert({
          user_id: user.id,
          date_key: new Date().toISOString().slice(0, 10),
          mood,
          note: (note || '').slice(0, 500)
        }, { onConflict: 'user_id,date_key' });

        // Начисляем 1 кристалл за запись (ежедневная привычка)
        const { addCrystals } = require('./_lib/db');
        await addCrystals(user.id, 1, 'diary_entry');

        return res.json({ success: true, crystals_earned: 1 });
      } catch (e) {
        console.error('[diary] save_mood error:', e.message);
        if (e.message && e.message.includes('relation') && e.message.includes('does not exist')) {
          return res.json({ success: true, crystals_earned: 0, note: 'Таблица не создана' });
        }
        return res.status(500).json({ error: 'Не удалось сохранить' });
      }
    }

    // ========== ПОЛУЧИТЬ ЗАПИСИ ==========
    if (action === 'get_week' || action === 'get_month') {
      const days = action === 'get_week' ? 7 : 30;
      const since = new Date();
      since.setDate(since.getDate() - days);

      try {
        const { data } = await db
          .from('dar_diary')
          .select('date_key, mood, note, ai_insight')
          .eq('user_id', user.id)
          .gte('date_key', since.toISOString().slice(0, 10))
          .order('date_key', { ascending: false });

        const today = new Date().toISOString().slice(0, 10);
        const todayEntry = (data || []).find(d => d.date_key === today);

        return res.json({
          entries: data || [],
          today_mood: todayEntry?.mood || null,
          streak: calcStreak(data || []),
          moods_ref: MOODS
        });
      } catch (e) {
        return res.json({ entries: [], today_mood: null, streak: 0, moods_ref: MOODS });
      }
    }

    // ========== AI-ИНСАЙТ ==========
    if (action === 'get_insight') {
      // --- ТАРИФНЫЙ ГЕЙТ (C2) ---
      // Инсайт положен раз в cadenceDays. 0 = не положен вовсе (Странник).
      // TRIAL/Мастер/Хранитель проходят через tier resolver и сохраняют доступ.
      const cadenceDays = pricing.getDiaryInsightCadenceDays(user);
      if (!cadenceDays || cadenceDays <= 0) {
        return res.status(403).json({
          error: 'AI-инсайт в Дневнике доступен на тарифе Хранитель и выше.',
          paywall: {
            feature: 'diary_ai_insight',
            required_tier: 'extended',
            price: pricing.PLANS.guardian_1m
              ? { rub: pricing.PLANS.guardian_1m.rub, stars: pricing.PLANS.guardian_1m.stars }
              : null
          }
        });
      }

      // Берём последние 7-14 записей
      let entries = [];
      try {
        const since = new Date();
        since.setDate(since.getDate() - 14);
        const { data } = await db
          .from('dar_diary')
          .select('date_key, mood, note')
          .eq('user_id', user.id)
          .gte('date_key', since.toISOString().slice(0, 10))
          .order('date_key', { ascending: true });
        // В той же таблице лежат записи АРКА-Дневника (mood='arka', note=JSON).
        // Для инсайта по настроению они не годятся — берём только реальные
        // эмоции из MOODS, иначе в промпт попадёт "undefined undefined", а
        // кэш-инсайт может записаться на арка-строку.
        entries = (data || []).filter(e => e.mood && MOODS[e.mood]);
      } catch (e) {
        return res.status(500).json({ error: 'Не удалось загрузить дневник' });
      }

      if (entries.length < 3) {
        return res.json({ insight: null, message: 'Нужно минимум 3 записи для анализа. Продолжай вести дневник!' });
      }

      // --- КЭШ ПО КАДЕНЦИИ (C2) ---
      // Инсайт регенерируется не чаще раза в cadenceDays. Если в окне уже есть
      // сохранённый ai_insight — отдаём его, не тратя AI-вызов.
      const cacheSince = new Date();
      cacheSince.setDate(cacheSince.getDate() - cadenceDays);
      const cacheSinceKey = cacheSince.toISOString().slice(0, 10);
      try {
        const { data: cachedRows } = await db
          .from('dar_diary')
          .select('date_key, ai_insight')
          .eq('user_id', user.id)
          .gte('date_key', cacheSinceKey)
          .not('ai_insight', 'is', null)
          .order('date_key', { ascending: false })
          .limit(1);
        const cached = (cachedRows || [])[0];
        if (cached && cached.ai_insight) {
          return res.json({ insight: cached.ai_insight, cached: true });
        }
      } catch (e) {
        // Колонки/таблицы нет — деградируем на генерацию без кэша, не падаем
        if (!(e.message && e.message.includes('does not exist'))) {
          console.warn('[diary] insight cache lookup failed:', e.message);
        }
      }

      // Дар юзера
      const darCode = user.dar_code || '';
      const darName = DARS_DB[darCode] || '';
      const darData = darContent[darCode] || {};

      const moodSummary = entries.map(e => {
        const m = MOODS[e.mood] || {};
        return `${e.date_key}: ${m.emoji} ${m.ru}${e.note ? ' ("' + e.note.slice(0, 100) + '")' : ''}`;
      }).join('\n');

      const prompt = `Ты мудрый наставник YupDar. Проанализируй дневник эмоций человека и покажи связь с его даром.

ДАР: ${darName} (${darCode})
Суть: ${(darData.essence || '').slice(0, 300)}
Тень: ${(darData.shadow || '').slice(0, 200)}

ДНЕВНИК ЭМОЦИЙ (последние ${entries.length} дней):
${moodSummary}

ЗАДАЧА:
Напиши тёплый, персональный инсайт (3-5 предложений):
1. Какой паттерн ты видишь в эмоциях?
2. Как это связано с даром человека?
3. Когда дар раскрывается (какие эмоции = дар в действии)?
4. Когда включается тень (какие эмоции = сигнал)?
5. Одно маленькое мягкое приглашение на эту неделю (не приказ, а предложение).

Обращайся на "ты". Без длинного тире. Без кодов/формул. Тепло и конкретно.

МЯГКАЯ ПОДАЧА - КРИТИЧЕСКИ ВАЖНО:
- НИКОГДА не используй слова "нужно", "надо", "должен", "должна", "обязан", "требуется" - это энергия указания и давления.
- Вместо "тебе нужно / надо" пиши: "тебе важно", "хорошо", "полезно", "стоит", "попробуй", "обрати внимание".
- Не пиши "ты должен(на) больше отдыхать" - пиши "отдых приходит, когда", "попробуй дать себе", "полезно заметить".
- Смысл не в приказах, а в мягком приглашении к вниманию и действию.

ПРОТИВ ПОВТОРОВ:
- В инсайте НЕ повторяй одну и ту же конструкцию 2-3 раза подряд.
- Разнообразь: "Попробуй...", "Полезно обратить внимание на...", "Ключ здесь - в...", "Путь обратно - это..."
- Избегай клише "найти идеальный баланс", "обратить внимание на свои" в каждом предложении.

ЛИЧНЫЙ ТОН:
- Избегай слов "человек", "обладатель дара", "носитель" - только "ты"`;

      try {
        const useDS = deepseek.isDeepSeekEnabled('coach') && deepseek.isDeepSeekConfigured();
        let completion;
        if (useDS) {
          completion = await deepseek.chatCompletion({
            messages: [{ role: 'user', content: prompt }],
            model: 'deepseek-chat', temperature: 0.8, max_tokens: 500
          });
        } else {
          const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || '').trim() });
          completion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile', temperature: 0.8, max_tokens: 500
          });
        }
        const insight = (completion.choices[0]?.message?.content || '')
          .replace(/\u2014/g, '-').replace(/\u2013/g, '-').trim();

        // \u041a\u044d\u0448\u0438\u0440\u0443\u0435\u043c \u0438\u043d\u0441\u0430\u0439\u0442 \u043d\u0430 \u0441\u0430\u043c\u043e\u0439 \u0441\u0432\u0435\u0436\u0435\u0439 \u0437\u0430\u043f\u0438\u0441\u0438 \u0434\u043d\u0435\u0432\u043d\u0438\u043a\u0430, \u0447\u0442\u043e\u0431\u044b \u043d\u0435
        // \u0440\u0435\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0447\u0430\u0449\u0435, \u0447\u0435\u043c \u0440\u0430\u0437 \u0432 cadenceDays. \u041f\u0438\u0448\u0435\u043c \u0447\u0435\u0440\u0435\u0437 UPDATE
        // \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0435\u0439 \u0441\u0442\u0440\u043e\u043a\u0438 (mood NOT NULL \u2014 \u0432\u0441\u0442\u0430\u0432\u043b\u044f\u0442\u044c \u043f\u0443\u0441\u0442\u0443\u044e \u043d\u0435\u043b\u044c\u0437\u044f).
        // entries \u043e\u0442\u0441\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u044b \u043f\u043e \u0432\u043e\u0437\u0440\u0430\u0441\u0442\u0430\u043d\u0438\u044e \u2014 \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u044f\u044f = \u0441\u0430\u043c\u0430\u044f \u0441\u0432\u0435\u0436\u0430\u044f.
        try {
          const latestKey = entries[entries.length - 1].date_key;
          // .select() возвращает изменённые строки — по их числу видно, что
          // кэш реально записан. Если 0 — схема/ключ разошлись, и без этого
          // лога каждый вызов молча регенерировал бы инсайт (утечка AI-стоимости).
          const { data: updated } = await db.from('dar_diary')
            .update({ ai_insight: insight })
            .eq('user_id', user.id)
            .eq('date_key', latestKey)
            .select('date_key');
          if (!updated || updated.length === 0) {
            console.warn('[diary] insight cache write matched 0 rows (user', user.id, 'date', latestKey + ') — cache defeated, will regenerate next call');
          }
        } catch (e) {
          if (!(e.message && e.message.includes('does not exist'))) {
            console.warn('[diary] insight cache write failed:', e.message);
          }
        }

        return res.json({ insight });
      } catch (e) {
        console.error('[diary] AI insight error:', e.message);
        return res.status(500).json({ error: 'Не удалось создать инсайт' });
      }
    }

    // ========== АРКА-ДНЕВНИК: СОХРАНИТЬ ЗАПИСЬ ==========
    // Запись АРКА = { energy: 1-5, mood: 1-5, direction: act/rest/people/alone, note? }
    // Храним в той же таблице dar_diary хитро: mood='arka', а сам объект в note как JSON.
    // Это позволяет не менять схему БД (Светлана не любит ручные миграции).
    // Тестер Диса 03.06.2026: данные АРКА-Дневника не синхронизировались между
    // мобильным и десктопным Telegram (хранились только в localStorage устройства).
    if (action === 'save_arka') {
      const { date_key, energy, mood, direction, comment, dar_code } = req.body;
      const dateKey = date_key || new Date().toISOString().slice(0, 10);
      const payload = {
        v: 1,
        energy: typeof energy === 'number' ? energy : null,
        mood: typeof mood === 'number' ? mood : null,
        direction: direction || null,
        comment: (comment || '').slice(0, 500),
        dar_code: dar_code || null,
        ts: Date.now()
      };
      try {
        await db.from('dar_diary').upsert({
          user_id: user.id,
          date_key: dateKey,
          mood: 'arka',
          note: JSON.stringify(payload)
        }, { onConflict: 'user_id,date_key' });
        return res.json({ success: true });
      } catch (e) {
        console.error('[diary] save_arka error:', e.message);
        return res.status(500).json({ error: 'Не удалось сохранить' });
      }
    }

    // ========== АРКА-ДНЕВНИК: ПОЛУЧИТЬ ВСЕ ЗАПИСИ ==========
    if (action === 'get_arka') {
      try {
        const { data } = await db
          .from('dar_diary')
          .select('date_key, mood, note')
          .eq('user_id', user.id)
          .eq('mood', 'arka')
          .order('date_key', { ascending: false })
          .limit(365);
        const entries = (data || []).map(row => {
          try {
            const obj = JSON.parse(row.note || '{}');
            return {
              date: row.date_key,
              energy: obj.energy,
              mood: obj.mood,
              direction: obj.direction,
              comment: obj.comment || '',
              dar_code: obj.dar_code || null,
              ts: obj.ts || null
            };
          } catch (e) { return null; }
        }).filter(Boolean);
        return res.json({ entries });
      } catch (e) {
        console.error('[diary] get_arka error:', e.message);
        return res.json({ entries: [] });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[diary] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};

function calcStreak(entries) {
  if (!entries.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    if (entries.some(e => e.date_key === key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
