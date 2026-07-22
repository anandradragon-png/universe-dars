/**
 * Ежедневная рассылка «Дар дня» в личку @YupDarBot.
 *
 * Раз в будний день утром cron (см. server.js) дёргает этот эндпоинт. Он:
 *   1) считает общий Дар дня по дате (тот же алгоритм, что в приложении);
 *   2) берёт готовый текст дня из public/daily-dar-content.json
 *      (суть дня + 6 сфер + практика; тексты построены из энергий полей);
 *   3) добавляет ротируемую по кругу финальную строку (CTA в приложение);
 *   4) шлёт сообщение всем, кто НЕ отписался (users.daily_dar_optout=false)
 *      и у кого есть telegram_id;
 *   5) под сообщением — кнопка «Мой личный Дар дня» (deep-link с меткой)
 *      и «Отключить утренние сообщения»;
 *   6) пишет журнал в daily_broadcast_log: идемпотентность по send_date
 *      (двойной отправки за день не будет) + метрики (sent/failed/blocked).
 *
 * Защита: Bearer CRON_SECRET (как у health-check / daily-summary).
 * Ручной прогон:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" -X POST https://yupdar.com/api/daily-dar-broadcast
 */

const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./_lib/db');

// Единый deep-link на личный Дар дня (метка dailydar — для замера кликов).
const DEEP_LINK = 'https://t.me/YupDarBot?startapp=dailydar';

let _content = null;
function loadContent() {
  if (_content) return _content;
  const p = path.join(__dirname, '..', 'daily-dar-content.json');
  _content = JSON.parse(fs.readFileSync(p, 'utf8'));
  return _content;
}

function reduce(n) {
  while (n > 9) n = n.toString().split('').reduce((s, d) => s + parseInt(d, 10), 0);
  return n;
}

// Дата в МСК (UTC+3): рассылка идёт утром по Москве, код дня должен совпадать
// с тем, что увидит пользователь, когда откроет приложение.
function mskParts() {
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  return {
    day: now.getUTCDate(),
    month: now.getUTCMonth() + 1,
    year: now.getUTCFullYear(),
    dateStr: now.toISOString().slice(0, 10)
  };
}

function calcGeneralDar() {
  const { day, month, year } = mskParts();
  const digs = (x) => x.toString().split('').reduce((s, c) => s + parseInt(c, 10), 0);
  const ma = reduce(digs(day) + digs(month));
  const zhi = reduce(digs(year));
  const kun = reduce(ma + zhi);
  return { ma, zhi, kun, code: `${ma}-${zhi}-${kun}` };
}

// Вызов Telegram Bot API
async function tg(method, body) {
  const token = (process.env.BOT_TOKEN || '').trim();
  if (!token) throw new Error('BOT_TOKEN not configured');
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  return data;
}

// Собираем подпись сообщения: суть → сферы → практика → CTA.
// Всё абзацами (не сплошняком). Первая строка — суть (превью уведомления).
function buildMessage(content, day, ctaText) {
  const spheresMeta = content.meta.spheres; // [{key,label,emoji}]
  const lines = [];
  lines.push('🌅 <b>Дар дня</b>');
  lines.push('');
  lines.push(day.intro);
  lines.push('');
  lines.push(`<b>${day.name}</b>`);
  lines.push('');
  spheresMeta.forEach((s) => {
    const txt = day.spheres[s.key];
    if (txt) lines.push(`${s.emoji} <b>${s.label}.</b> ${txt}`);
  });
  lines.push('');
  lines.push(`🌱 <b>Практика дня.</b> ${day.practice}`);
  lines.push('');
  lines.push(ctaText);
  return lines.join('\n');
}

function keyboard() {
  return {
    inline_keyboard: [
      [{ text: '🎁 Мой личный Дар дня', url: DEEP_LINK }],
      [{ text: '🔕 Отключить утренние сообщения', callback_data: 'dailydar_off' }]
    ]
  };
}

module.exports = async (req, res) => {
  // Защита
  const authHeader = req.headers.authorization || '';
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const db = getSupabase();
  const { dateStr } = mskParts();
  const dar = calcGeneralDar();

  let content;
  try {
    content = loadContent();
  } catch (e) {
    return res.status(500).json({ error: 'content_load_failed', detail: e.message });
  }
  const day = content.days[dar.code];
  if (!day) {
    return res.status(500).json({ error: 'no_day_content', code: dar.code });
  }

  // Идемпотентность: если за сегодня уже отправляли — выходим.
  try {
    const { data: existing } = await db
      .from('daily_broadcast_log')
      .select('send_date')
      .eq('send_date', dateStr)
      .maybeSingle();
    if (existing) {
      return res.json({ ok: true, skipped: 'already_sent', send_date: dateStr });
    }
  } catch (e) {
    // Если журнала нет — не блокируем отправку (но метрик не будет).
    console.warn('[daily-broadcast] log check failed:', e.message);
  }

  // Ротация CTA по кругу — по номеру дня.
  const ctaArr = content.meta.cta || [];
  const dayNum = Math.floor((Date.now() + 3 * 3600 * 1000) / 86400000);
  const ctaIndex = ctaArr.length ? (dayNum % ctaArr.length) : 0;
  const ctaText = ctaArr[ctaIndex] || '';

  const text = buildMessage(content, day, ctaText);
  const kb = keyboard();

  // Получатели: есть telegram_id и не отписаны.
  let recipients = [];
  try {
    const { data, error } = await db
      .from('users')
      .select('telegram_id')
      .eq('daily_dar_optout', false)
      .not('telegram_id', 'is', null);
    if (error) throw error;
    recipients = (data || []).filter((u) => u.telegram_id);
  } catch (e) {
    return res.status(500).json({ error: 'recipients_query_failed', detail: e.message });
  }

  let sent = 0, failed = 0, blocked = 0;
  for (let i = 0; i < recipients.length; i++) {
    const chatId = recipients[i].telegram_id;
    try {
      const r = await tg('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: kb
      });
      if (r.ok) {
        sent++;
      } else {
        // 403 = бот заблокирован пользователем; помечаем отпиской, чтобы не долбить.
        if (r.error_code === 403) {
          blocked++;
          try { await db.from('users').update({ daily_dar_optout: true }).eq('telegram_id', chatId); } catch (e2) {}
        } else {
          failed++;
        }
      }
    } catch (e) {
      failed++;
    }
    // Мягкий троттлинг под лимиты Telegram (~30 msg/s).
    if (i % 25 === 24) await new Promise((r) => setTimeout(r, 1100));
  }

  // Журнал: идемпотентность + метрики.
  try {
    await db.from('daily_broadcast_log').upsert({
      send_date: dateStr,
      dar_code: dar.code,
      cta_index: ctaIndex,
      recipients: recipients.length,
      sent,
      failed,
      blocked
    }, { onConflict: 'send_date' });
  } catch (e) {
    console.warn('[daily-broadcast] log write failed:', e.message);
  }

  return res.json({
    ok: true,
    send_date: dateStr,
    dar_code: dar.code,
    cta_index: ctaIndex,
    recipients: recipients.length,
    sent, failed, blocked
  });
};
