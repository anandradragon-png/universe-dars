/**
 * Конвертер "El Libro de los DARs" (испанская версия) docx -> JSON
 *
 * Вход:  C:\Users\Sveta\Documents\Book of DARs ES\Book_of_DARs_ES.docx
 * Выход: public/preview/book-chapters.es.json
 *
 * Структура — точная копия public/book-chapters.json (русская), только
 * содержимое и заголовки на испанском.
 *
 * В испанском DOCX нет Word-стилей H1/H2/H3, поэтому заголовки
 * детектятся по содержимому параграфов: жирный текст + ключевые маркеры
 * (PARTE N / Capítulo N / Introducción / Epílogo / N.N DAR XXX (a-b-c)).
 */

const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');

const srcFile = 'C:\\Users\\Sveta\\Documents\\Book of DARs ES\\Book_of_DARs_ES.docx';
const repoRoot = path.join(__dirname, '..');
const outJson = path.join(repoRoot, 'public', 'preview', 'book-chapters.es.json');

// images mapping: in ES we do NOT extract images; we map to empty refs so the
// JSON keeps the same shape as RU. Mammoth still inlines images as base64 by
// default; we override to drop them (counting only).
let imageCounter = 0;
const imageConverter = mammoth.images.imgElement(function(image) {
  imageCounter++;
  const ref = 'img-' + String(imageCounter).padStart(3, '0');
  // No ext stored — we don't save files. Reader fallback will handle it.
  return Promise.resolve({ src: '', 'data-ref': ref, alt: '' });
});

function stripTags(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function cleanHtml(html) {
  // remove fully-empty heading/paragraph artefacts
  html = html.replace(/<(h[1-6]|p)[^>]*>\s*(<strong>\s*<\/strong>)?\s*<\/\1>/g, '');
  html = html.replace(/<(h[1-6]|p)[^>]*>\s*&nbsp;\s*<\/\1>/g, '');
  html = html.replace(/\s+/g, ' ');
  html = html.replace(/>\s+</g, '><');
  return html.trim();
}

function slugify(s) {
  // Latin + digits only; replace accented chars
  return stripTags(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// --- Heading detection regexes (Spanish edition) ---
// PARTE N (1..4) — top-level part
const PART_RE = /^\s*PARTE\s+\d+/i;
// Capítulo N (часто без точки, иногда с заголовком)
const CHAPTER_RE = /^\s*Cap[ií]tulo\s+\d+/i;
// Introducción ... — единственная «intro» глава
const INTRO_RE = /^\s*Introducci[oó]n\b/i;
// Epílogo ... — финальная
const EPILOGUE_RE = /^\s*(Ep[ií]logo|Conclusi[oó]n|Agradecimientos|Conexi[oó]n con la autora|C[oó]mo apareci[oó])/i;
// DAR-главы вида "1.1  DAR LA-DA (2-8-1):" — может быть с длинными пробелами
const DAR_RE = /^\s*\d+\.\d+\s+DAR\s+([A-Z\-]+)\s*\((\d-\d-\d)\)/i;

function classifyHeadingText(text) {
  if (PART_RE.test(text)) return 'part';
  if (DAR_RE.test(text)) return 'dar';
  if (CHAPTER_RE.test(text)) return 'chapter';
  if (INTRO_RE.test(text)) return 'intro';
  if (EPILOGUE_RE.test(text)) return 'epilogue';
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

  // Mammoth produced zero H1/H2/H3 for this docx — all content is in <p>.
  // We scan all <p> blocks in order, and identify which ones are headings.
  // Strategy: a paragraph is a "heading candidate" if its plain text matches
  // one of the heading regexes (PART/CHAPTER/DAR/INTRO/EPILOGUE).
  // We also consider H1..H4 just in case.
  const blockRe = /<(h[1-6]|p)[^>]*>([\s\S]*?)<\/\1>/g;
  const blocks = [];
  let m;
  while ((m = blockRe.exec(html)) !== null) {
    blocks.push({
      tag: m[1],
      raw: m[0],
      inner: m[2],
      text: stripTags(m[2]),
      start: m.index,
      end: m.index + m[0].length
    });
  }
  console.log('blocks:', blocks.length);

  // Identify headings
  const headings = [];
  for (const b of blocks) {
    if (!b.text) continue;
    // PARTE marker may appear duplicated in TOC at the very top; skip TOC area
    // (we won't have a real TOC since mammoth doesn't render it as headings).
    const cat = classifyHeadingText(b.text);
    if (!cat) continue;

    // For chapter headings in Part 2/3 — they are short ("Capítulo 1") and
    // act as section dividers. We keep them.
    // The "Capítulo" headings in Part 1 are real chapters (e.g.
    // "Capítulo 1. Los Tres Mundos...") — also keep.
    headings.push({
      text: b.text,
      category: cat,
      tagStart: b.start,
      tagEnd: b.end
    });
  }

  // Deduplicate consecutive PARTE/Capítulo lines that point to the same place
  // (TOC duplicates). We assume the first occurrence is TOC reference, but if
  // mammoth lost the TOC styling it'll mix with real headings. We'll dedupe by
  // keeping only the LAST occurrence of each unique heading text — that's the
  // body location, since TOC appears earlier.
  // Strategy: for "part" headings we expect exactly 4. If we see more, prefer
  // last positions. Same logic for the single "intro" and "epilogue".
  // For chapters and dars we just keep order — dars/chapters don't duplicate
  // unless the TOC repeats them, which the previous inspection showed it does
  // NOT (we saw each DAR only once).
  // Group by unique key.
  function dedupe(list, key) {
    const seen = new Map();
    list.forEach(h => seen.set(key(h), h)); // last wins
    return Array.from(seen.values()).sort((a, b) => a.tagStart - b.tagStart);
  }
  // For DAR — unique by code; for chapter — unique by full text; for part —
  // unique by normalized number; for intro/epilogue — unique by category.
  const tagged = headings.map(h => {
    let key;
    if (h.category === 'part') {
      key = h.text.match(/PARTE\s+(\d+)/i)[1];
      key = 'part-' + key;
    } else if (h.category === 'dar') {
      const dm = h.text.match(DAR_RE);
      key = 'dar-' + dm[2];
    } else if (h.category === 'chapter') {
      key = 'ch-' + h.text.toLowerCase().replace(/\s+/g, ' ').trim();
    } else {
      key = h.category;
    }
    return { ...h, key };
  });
  const deduped = dedupe(tagged, h => h.key);
  console.log('headings (after dedupe):', deduped.length);

  // Counts
  const byCat = {};
  deduped.forEach(h => { byCat[h.category] = (byCat[h.category] || 0) + 1; });
  console.log('by category:', byCat);

  // Anchors that delineate chapters (i.e. produce JSON entries inside parts)
  // — anything except "part".
  const chapterAnchors = deduped.filter(h =>
    h.category === 'part' || h.category === 'chapter' ||
    h.category === 'dar' || h.category === 'intro' || h.category === 'epilogue'
  );

  // Build parts -> chapters by slicing HTML between anchors.
  const parts = [];
  let currentPart = null;

  for (let i = 0; i < chapterAnchors.length; i++) {
    const h = chapterAnchors[i];
    const nextStart = (i + 1 < chapterAnchors.length) ? chapterAnchors[i + 1].tagStart : html.length;
    const bodyHtml = cleanHtml(html.slice(h.tagEnd, nextStart));

    if (h.category === 'part') {
      currentPart = {
        id: 'part-' + (parts.length + 1),
        title: h.text,
        intro_html: bodyHtml.length < 4000 ? bodyHtml : '',
        chapters: []
      };
      parts.push(currentPart);
      continue;
    }

    if (!currentPart) {
      currentPart = { id: 'part-0', title: 'Inicio', intro_html: '', chapters: [] };
      parts.push(currentPart);
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

    // count images referenced inside body
    const imgs = (bodyHtml.match(/data-ref="img-\d+"/g) || []).length;
    chapter.image_count = imgs;

    currentPart.chapters.push(chapter);
  }

  const totalChapters = parts.reduce((s, p) => s + p.chapters.length, 0);
  console.log('parts:', parts.length, 'chapters:', totalChapters);

  // Final object — title/version on Spanish
  const output = {
    title: 'El Libro de los DARs',
    version: 'Edición 1',
    total_parts: parts.length,
    total_chapters: totalChapters,
    total_images: imageCounter,
    generated_at: new Date().toISOString(),
    parts
  };

  // Ensure dir
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(output, null, 2));
  const sizeKb = (fs.statSync(outJson).size / 1024).toFixed(1);
  console.log('Saved:', outJson, '(' + sizeKb + ' KB)');

  // DAR summary
  const dars = [];
  parts.forEach(p => p.chapters.forEach(ch => { if (ch.kind === 'dar') dars.push(ch); }));
  console.log('DAR chapters:', dars.length, '/ 64');
  if (dars.length < 64) {
    console.log('Codes found:');
    dars.forEach(d => console.log('  ', d.dar_code, d.dar_name));
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });
