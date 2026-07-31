/**
 * YupDar — Express-сервер для запуска на собственном хостинге.
 * Раздаёт статику из public/ и монтирует все API-обработчики.
 *
 * Запуск: node server.js
 * Порт:   PORT (env) или 3000
 */

require('dotenv').config({ path: '.env.production' });
const express = require('express');
const path    = require('path');
const cron    = require('node-cron');

const app        = express();
const PORT       = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── Тело запросов ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Статические файлы (с правильным кешированием) ─────────────────────────
// JS и CSS — immutable (у них ?v=... в URL)
app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'),
  { maxAge: '1y', immutable: true }));
app.use('/yupself-design-system.css',
  express.static(PUBLIC_DIR, { maxAge: '1y', immutable: true }));

// Картинки — 30 дней
app.use('/images', express.static(path.join(PUBLIC_DIR, 'images'), { maxAge: '30d' }));
app.use('/cards',  express.static(path.join(PUBLIC_DIR, 'cards'),  { maxAge: '30d' }));

// JSON-файлы — 1 день
app.use((req, res, next) => {
  if (req.path.endsWith('.json')) {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
  }
  next();
});

// ── Маршруты API (rewrites) ─────────────────────────────────────────────────
function rewrite(from, handlerPath, extraQuery) {
  app.all(from, (req, res) => {
    Object.assign(req.query, extraQuery);
    require(handlerPath)(req, res);
  });
}

rewrite('/api/bot-webhook',      './public/api/webhooks',      { provider: 'bot'   });
rewrite('/api/tbank-webhook',    './public/api/webhooks',      { provider: 'tbank' });
rewrite('/api/yuppay-webhook',   './public/api/webhooks',      { provider: 'yuppay'});
rewrite('/api/relatives',        './public/api/user',          { action: 'relatives' });
rewrite('/api/verify-code',      './public/api/user',          { action: 'verify'    });
rewrite('/api/promo',            './public/api/user',          { action: 'promo'     });
rewrite('/api/oracle',           './public/api/content',       { type: 'oracle'        });
rewrite('/api/shadow-review',    './public/api/content',       { type: 'shadow-review' });
rewrite('/api/section',          './public/api/content',       { type: 'section'       });
rewrite('/api/message-humor',    './public/api/content',       { type: 'message-humor' });
rewrite('/api/message',          './public/api/content',       { type: 'message'       });
rewrite('/api/sandbox-message',  './public/api/content',       { type: 'sandbox-message' });
rewrite('/api/compatibility',    './public/api/content',       { type: 'compatibility'  });
rewrite('/api/child-book',       './public/api/content',       { type: 'child-book'     });
rewrite('/api/arka-today',       './public/api/content',       { type: 'arka-today'     });
rewrite('/api/diary-dar',        './public/api/content',       { type: 'diary-dar'      });
rewrite('/api/quest',            './public/api/game-actions',  { action: 'quest'     });
rewrite('/api/referral',         './public/api/game-actions',  { action: 'referral'  });
rewrite('/api/treasury',         './public/api/game-actions',  { action: 'treasury'  });
rewrite('/api/hall-of-fame',     './public/api/leaderboard',   { mode: 'hall-of-fame' });
rewrite('/api/admin-feedback',   './public/api/feedback',      { action: 'admin'     });

// ── Прямые API-маршруты ────────────────────────────────────────────────────
app.all('/api/user',         require('./public/api/user'));
app.all('/api/content',      require('./public/api/content'));
app.all('/api/daily',        require('./public/api/daily'));
app.all('/api/daily-dar-broadcast', require('./public/api/daily-dar-broadcast'));
app.all('/api/diary',        require('./public/api/diary'));
app.all('/api/feedback',     require('./public/api/feedback'));
app.all('/api/game-actions', require('./public/api/game-actions'));
app.all('/api/health-check', require('./public/api/health-check'));
app.all('/api/hero-journey', require('./public/api/hero-journey'));
app.all('/api/leaderboard',  require('./public/api/leaderboard'));
app.all('/api/payment',      require('./public/api/payment'));
app.all('/api/pricing',      require('./public/api/pricing'));
app.all('/api/tg-web-login', require('./public/api/tg-web-login'));
app.all('/api/google-login', require('./public/api/google-login'));
app.all('/api/webhooks',     require('./public/api/webhooks'));

app.all('/api/admin/analytics',    require('./public/api/admin/analytics'));
app.all('/api/admin/clear-cache',  require('./public/api/admin/clear-cache'));
app.all('/api/admin/daily-summary',require('./public/api/admin/daily-summary'));
app.all('/api/admin/me',           require('./public/api/admin/me'));
app.all('/api/admin/payments',     require('./public/api/admin/payments'));
app.all('/api/admin/promo',        require('./public/api/admin/promo'));
app.all('/api/admin/stars-balance',require('./public/api/admin/stars-balance'));
app.all('/api/admin/stats',        require('./public/api/admin/stats'));
app.all('/api/admin/users',        require('./public/api/admin/users'));

// ── Юр-документы: extensionless /legal/... → реальный HTML из public/legal/ ──
// Лендинги ссылаются на /legal/terms|privacy|offer|cookies (без .html) и на
// /legal/<lang>/<doc> (ru/en/es). Без этого роута SPA-fallback ниже отдавал бы
// оболочку Mini App вместо документа. Варианты с .html обслуживает static.
const LEGAL_DOCS  = ['terms', 'privacy', 'offer', 'cookies'];
const LEGAL_LANGS = ['ru', 'en', 'es'];
function serveLegal(lang, doc, res, next) {
  doc = String(doc).replace(/\.html$/i, '');
  if (!LEGAL_DOCS.includes(doc)) return next();
  if (lang !== null && !LEGAL_LANGS.includes(lang)) return next();
  const rel = lang ? path.join('legal', lang, doc + '.html')
                   : path.join('legal', doc + '.html');
  res.sendFile(path.join(PUBLIC_DIR, rel), (err) => {
    if (err) next(err);
  });
}
// /legal/<doc> → корневые (RU) документы
app.get('/legal/:doc', (req, res, next) => {
  serveLegal(null, req.params.doc, res, next);
});
// /legal/<lang>/<doc> → локализованные документы
app.get('/legal/:lang/:doc', (req, res, next) => {
  serveLegal(req.params.lang, req.params.doc, res, next);
});

// ── Защита: не отдавать исходники и зависимости по HTTP ────────────────────
// Все реальные /api/* маршруты обработаны выше и до сюда НЕ доходят.
// Значит любой запрос к /api/... или /node_modules/..., долетевший сюда, —
// это попытка скачать исходник обработчика (напр. /api/payment.js,
// /api/_lib/auth.js) или файл зависимости. Отдаём 404, а не файл.
// (ЗАКОН 5 RULES.md: серверный код и node_modules не доступны наружу.)
app.use((req, res, next) => {
  if (/^\/(api|node_modules)(\/|$)/i.test(req.path)) {
    return res.status(404).send('Not found');
  }
  next();
});

// ── Статика + SPA fallback ─────────────────────────────────────────────────
app.use(express.static(PUBLIC_DIR, {
  index: 'index.html',
  maxAge: 0,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    // index.html и version.txt — никогда не кешировать
    if (filePath.endsWith('index.html') || filePath.endsWith('version.txt')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
}));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ── Cron: health-check каждые 30 минут ────────────────────────────────────
const healthHandler = require('./public/api/health-check');
cron.schedule('*/30 * * * *', async () => {
  const fakeReq = {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
    query: {}, method: 'GET'
  };
  const fakeRes = {
    status() { return this; },
    json(d)  { console.log('[cron] health:', d?.healthy); return this; },
    end()    { return this; }
  };
  try { await healthHandler(fakeReq, fakeRes); }
  catch(e) { console.error('[cron] health-check error:', e.message); }
});

// ── Cron: ежедневная сводка админу в 09:00 МСК (06:00 UTC) ─────────────────
const dailySummaryHandler = require('./public/api/admin/daily-summary');
cron.schedule('0 6 * * *', async () => {
  const fakeReq = {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
    query: {}, method: 'GET'
  };
  const fakeRes = {
    status() { return this; },
    json(d)  { console.log('[cron] daily-summary sent:', d?.ok); return this; },
    end()    { return this; }
  };
  try { await dailySummaryHandler(fakeReq, fakeRes); }
  catch(e) { console.error('[cron] daily-summary error:', e.message); }
});

// ── Cron: рассылка «Дар дня» по будням в 07:00 МСК (04:00 UTC) ─────────────
// Пн-Пт (1-5): по выходным не шлём. Идемпотентность и метрики — внутри
// обработчика (журнал daily_broadcast_log по send_date).
// ПАУЗА: реальная отправка идёт только при DAILY_DAR_BROADCAST_ENABLED=true
// (рубильник внутри обработчика). Cron тикает вхолостую, пока флаг не выставлен.
const dailyDarBroadcastHandler = require('./public/api/daily-dar-broadcast');
cron.schedule('0 4 * * 1-5', async () => {
  const fakeReq = {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
    query: {}, method: 'POST'
  };
  const fakeRes = {
    status() { return this; },
    json(d)  { console.log('[cron] daily-dar broadcast:', JSON.stringify(d)); return this; },
    end()    { return this; }
  };
  try { await dailyDarBroadcastHandler(fakeReq, fakeRes); }
  catch(e) { console.error('[cron] daily-dar broadcast error:', e.message); }
});

// ── Старт ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[YupDar] server running on port ${PORT}`);
});
