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
        entries = data || [];
      } catch (e) {
        return res.status(500).json({ error: 'Не удалось загрузить дневник' });
      }

      if (entries.length < 3) {
        return res.json({ insight: null, message: 'Нужно минимум 3 записи для анализа. Продолжай вести дневник!' });
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

        return res.json({ insight });
      } catch (e) {
        console.error('[diary] AI insight error:', e.message);
        return res.status(500).json({ error: 'Не удалось создать инсайт' });
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
