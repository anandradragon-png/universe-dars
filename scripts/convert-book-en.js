/**
 * Конвертер "The Book of DARs" (английская версия) docx -> JSON
 *
 * Вход:  C:\Users\Sveta\Documents\Book of DARs EN\Book of DARs (paperback 6x9) — Liana edits.docx
 * Выход: public/preview/book-chapters.en.json
 *
 * Структура — точная копия public/book-chapters.json (русская), только
 * содержимое и заголовки на английском. В EN DOCX есть полноценные стили
 * H1 (Part), H2 (Chapter/Field/Intro/Epilogue), H3 (DAR / Universal field titles).
 */

const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');

// Можно переопределить через CLI: node convert-book-en.js "C:\path\to\file.docx"
const srcFile = process.argv[2] ||
  'C:\\Users\\Sveta\\Documents\\Book of DARs EN\\Book of DARs (paperback 6x9) \u2014 Liana edits.docx';
const repoRoot = path.join(__dirname, '..');
const outJson = path.join(repoRoot, 'public', 'preview', 'book-chapters.en.json');

// Считаем картинки и не сохраняем их (как и в ES-конвертере).
let imageCounter = 0;
const imageConverter = mammoth.images.imgElement(function () {
  imageCounter++;
  const ref = 'img-' + String(imageCounter).padStart(3, '0');
  return Promise.resolve({ src: '', 'data-ref': ref, alt: '' });
});

function stripTags(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function cleanHtml(html) {
  // Снять пустые <p>/<hN>
  html = html.replace(/<(h[1-6]|p)[^>]*>\s*(<strong>\s*<\/strong>)?\s*<\/\1>/g, '');
  html = html.replace(/<(h[1-6]|p)[^>]*>\s*&nbsp;\s*<\/\1>/g, '');
  html = html.replace(/\s+/g, ' ');
  html = html.replace(/>\s+</g, '><');
  return html.trim();
}

function slugify(s) {
  return stripTags(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// --- Регулярки распознавания заголовков (EN) ---
const PART_RE = /^\s*Part\s+(One|Two|Three|Four|Five|Six)\b/i;
const CHAPTER_RE = /^\s*Chapter\s+\d+/i;
const FIELD_RE = /^\s*Field\s+\d+/i;
const INTRO_RE = /^\s*Introduction\b/i;
const EPILOGUE_RE = /^\s*(Epilogue|Conclusion|Acknowledg(e)?ments|Glossary|About\s+the\s+Author|How\s+This\s+Book|What\s+Comes\s+Next|Continuing\s+in\s+Sound|Connect\s+With\s+the\s+Author|Gratitude\s+That\s+Becomes\s+Energy|A\s+Note\s+on\s+Language)/i;
// DAR XXX (n-n-n) — h3
const DAR_RE = /^\s*DAR\s+([A-Z][A-Z\-]+)\s*\((\d-\d-\d)\)/i;

function classifyHeadingText(tag, text) {
  if (tag === 'h1' && PART_RE.test(text)) return 'part';
  if (tag === 'h3' && DAR_RE.test(text)) return 'dar';
  // h2 group
  if (FIELD_RE.test(text)) return 'chapter'; // "Field 1: LOGOS" — раздел внутри Part 2
  if (INTRO_RE.test(text)) return 'intro';
  if (EPILOGUE_RE.test(text)) return 'epilogue';
  if (CHAPTER_RE.test(text)) return 'chapter';
  // h1 для Glossary/About — попадают сюда через EPILOGUE_RE
  return null;
}

(async () => {
  if (!fs.existsSync(srcFile)) {
    console.error('SRC missing:', srcFile);
    process.exit(1);
  }
  console.log('Reading:', srcFile);
  const result = await mammoth.convertToHtml({ path: srcFile }, { convertImage: imageConverter });
  let html = result.value;
  console.log('HTML length:', html.length, 'images:', imageCounter);

  // Собираем все блоки h1..h4 + p, в порядке появления.
  const blockRe = /<(h[1-6]|p)[^>]*>([\s\S]*?)<\/\1>/g;
  const blocks = [];
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    blocks.push({
      tag: m[1].toLowerCase(),
      raw: m[0],
      inner: m[2],
      text: stripTags(m[2]),
      start: m.index,
      end: m.index + m[0].length
    });
  }
  console.log('blocks:', blocks.length);

  // Определяем якоря-заголовки
  const headings = [];
  for (const b of blocks) {
    if (!b.text) continue;
    const cat = classifyHeadingText(b.tag, b.text);
    if (!cat) continue;
    headings.push({
      tag: b.tag,
      text: b.text,
      category: cat,
      tagStart: b.start,
      tagEnd: b.end
    });
  }
  console.log('raw headings:', headings.length);

  // Лёгкая дедупликация одинаковых текстов подряд (на случай TOC)
  const dedup = [];
  for (const h of headings) {
    const last = dedup[dedup.length - 1];
    if (last && last.text === h.text && (h.tagStart - last.tagEnd) < 500) continue;
    dedup.push(h);
  }
  console.log('after near-dup dedupe:', dedup.length);

  const byCat = {};
  dedup.forEach(h => { byCat[h.category] = (byCat[h.category] || 0) + 1; });
  console.log('by category:', byCat);

  // Список «якорей глав» — всё кроме part: они начинают главы внутри текущей части.
  // Сами part — начинают новую часть.
  // Чтобы соответствовать RU/ES (4 части): только первые 4 «part» становятся parts;
  // если бы было больше H1 — лишние пошли бы в последнюю часть как epilogue, но
  // EPILOGUE_RE уже ловит Glossary/About — они классифицируются как epilogue (h1),
  // потому что classifyHeadingText не возвращает 'part' для h1 без слова "Part N".
  const parts = [];
  let currentPart = null;

  // Чтобы соответствовать RU/ES (ровно 4 части): материалы до первого H1 (Part)
  // — например, «A Note on Language», «Acknowledgements» — складываем в буфер
  // и потом прицепляем как первые главы Part One.
  const prefaceBuffer = [];

  for (let i = 0; i < dedup.length; i++) {
    const h = dedup[i];
    const nextStart = (i + 1 < dedup.length) ? dedup[i + 1].tagStart : html.length;
    const bodyHtml = cleanHtml(html.slice(h.tagEnd, nextStart));

    if (h.category === 'part') {
      currentPart = {
        id: 'part-' + (parts.length + 1),
        title: h.text,
        intro_html: bodyHtml.length < 4000 ? bodyHtml : '',
        chapters: []
      };
      parts.push(currentPart);
      // если копили preface — вкидываем в начало первой части
      if (parts.length === 1 && prefaceBuffer.length) {
        for (const pb of prefaceBuffer) {
          pb.id = 'ch-' + (currentPart.chapters.length + 1) + '-' + slugify(pb.title);
          currentPart.chapters.push(pb);
        }
        prefaceBuffer.length = 0;
      }
      continue;
    }

    // якорь главы
    if (!currentPart) {
      // до первого Part — кладём во временный буфер
      let darCode = null, darName = null;
      if (h.category === 'dar') {
        const dm = h.text.match(DAR_RE);
        if (dm) { darName = dm[1].trim(); darCode = dm[2]; }
      }
      const ch = {
        id: 'ch-preface-' + slugify(h.text),
        title: h.text,
        kind: h.category,
        html: bodyHtml
      };
      if (darCode) { ch.dar_code = darCode; ch.dar_name = darName; }
      ch.image_count = (bodyHtml.match(/data-ref="img-\d+"/g) || []).length;
      prefaceBuffer.push(ch);
      continue;
    }

    let darCode = null, darName = null;
    if (h.category === 'dar') {
      const dm = h.text.match(DAR_RE);
      if (dm) {
        darName = dm[1].trim();
        darCode = dm[2];
      }
    }

    const chapter = {
      id: 'ch-' + (currentPart.chapters.length + 1) + '-' + slugify(h.text),
      title: h.text,
      kind: h.category,
      html: bodyHtml
    };
    if (darCode) { chapter.dar_code = darCode; chapter.dar_name = darName; }
    const imgs = (bodyHtml.match(/data-ref="img-\d+"/g) || []).length;
    chapter.image_count = imgs;

    currentPart.chapters.push(chapter);
  }

  // Если есть preface (part-0), а в RU/ES структуре всего 4 части — оставим как
  // отдельный part-0; UI читателя умеет показывать любое число частей.
  const totalChapters = parts.reduce((s, p) => s + p.chapters.length, 0);
  console.log('parts:', parts.length, 'chapters:', totalChapters);

  // Финальный объект
  const output = {
    title: 'The Book of DARs',
    version: 'Edition 1',
    total_parts: parts.length,
    total_chapters: totalChapters,
    total_images: imageCounter,
    generated_at: new Date().toISOString(),
    parts
  };

  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(output, null, 2));
  const sizeKb = (fs.statSync(outJson).size / 1024).toFixed(1);
  console.log('Saved:', outJson, '(' + sizeKb + ' KB)');

  // Сводка по DAR
  const dars = [];
  parts.forEach(p => p.chapters.forEach(ch => { if (ch.kind === 'dar') dars.push(ch); }));
  console.log('DAR chapters:', dars.length, '/ 64');
  if (dars.length < 64) {
    console.log('Codes found:');
    dars.forEach(d => console.log('  ', d.dar_code, d.dar_name));
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });
