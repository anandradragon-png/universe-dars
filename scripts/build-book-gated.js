/**
 * C3 fix — раздача книги через защищённый API.
 *
 * Полные главы книги НЕ должны лежать в статическом public/book-chapters*.json
 * (иначе платный контент качается бесплатно, пейволл только на клиенте).
 *
 * Этот скрипт:
 *  1) Кладёт ПОЛНЫЕ копии книг в НЕ-раздаваемую папку <root>/book-full/
 *     (её читает только серверный content-API type=book-chapter, за гейтом
 *      pricing.canReadFullBook).
 *  2) Перезаписывает статические public/book-chapters*.json так, что у платных
 *     глав (глобальный индекс >= FREE_CHAPTERS) поле html вырезано и заменено
 *     маркером { gated:true }. Метаданные (title/kind/dar_*) остаются — нужны
 *     для оглавления/поиска на клиенте.
 *
 * Идемпотентность: источник истины — book-full/ (если уже есть), иначе текущий
 * статический файл (первый прогон). Так повторный запуск не «дважды вырезает».
 *
 * Запуск: node scripts/build-book-gated.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const FULL_DIR = path.join(ROOT, 'book-full');

// Должно совпадать с FREE_CHAPTERS в content.js и freeChapters в book-reader.js
const FREE_CHAPTERS = 10;

const FILES = ['book-chapters.json', 'book-chapters.en.json', 'book-chapters.es.json'];

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

ensureDir(FULL_DIR);

for (const file of FILES) {
  const publicPath = path.join(PUBLIC_DIR, file);
  const fullPath = path.join(FULL_DIR, file);
  if (!fs.existsSync(publicPath) && !fs.existsSync(fullPath)) {
    console.warn('[build-book-gated] skip (missing):', file);
    continue;
  }

  // Источник полного контента: приватная копия, если есть; иначе текущий статик.
  const srcPath = fs.existsSync(fullPath) ? fullPath : publicPath;
  const book = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

  // 1) Сохраняем полную копию в приватную папку (источник истины).
  fs.writeFileSync(fullPath, JSON.stringify(book), 'utf8');

  // 2) Строим preview-версию: html только у первых FREE_CHAPTERS глав.
  let gIdx = 0;
  const preview = {
    ...book,
    parts: book.parts.map(part => ({
      ...part,
      chapters: part.chapters.map(ch => {
        const isFree = gIdx < FREE_CHAPTERS;
        gIdx++;
        if (isFree) return ch;
        // Платная глава: вырезаем html, оставляем метаданные + маркер gated.
        const { html, ...rest } = ch;
        return { ...rest, gated: true };
      })
    }))
  };

  fs.writeFileSync(publicPath, JSON.stringify(preview), 'utf8');

  const total = book.parts.reduce((s, p) => s + p.chapters.length, 0);
  const gatedCount = Math.max(0, total - FREE_CHAPTERS);
  console.log(`[build-book-gated] ${file}: total ${total}, free ${Math.min(FREE_CHAPTERS, total)}, gated ${gatedCount}`);
}

console.log('[build-book-gated] done. Full copies in book-full/, previews in public/.');
