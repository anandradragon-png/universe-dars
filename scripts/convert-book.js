/**
 * Конвертер "Книга Даров" docx → HTML-chapters + извлечённые картинки
 *
 * Входные данные: C:\Users\Sveta\Downloads\Книга Даров.*.docx
 * Выходные данные:
 *   - public/book-images/img-NNN.<ext>   — все картинки из книги
 *   - public/book-chapters.json          — структурированное содержание
 *
 * Структура book-chapters.json:
 * {
 *   "title": "Книга Даров",
 *   "total_chapters": 95,
 *   "parts": [
 *     {
 *       "id": "part-1",
 *       "title": "ЧАСТЬ 1. Начало пути",
 *       "chapters": [
 *         {
 *           "id": "ch-1-intro",
 *           "title": "Введение: Карта вашей уникальности",
 *           "kind": "intro" | "chapter" | "dar" | "epilogue",
 *           "dar_code": "2-8-1"  // только для kind="dar"
 *           "dar_name": "ЛА-ДА"  // только для kind="dar"
 *           "html": "<p>...</p><h3>...</h3><img data-ref='img-012'>"
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');

// --- Пути ---
const downloadsDir = path.join('C:', 'Users', 'Sveta', 'Downloads');
const files = fs.readdirSync(downloadsDir)
  .filter(f => f.toLowerCase().includes('книга даров') && f.endsWith('.docx'));
if (files.length === 0) {
  console.error('ОШИБКА: файл "Книга Даров*.docx" не найден в Downloads');
  process.exit(1);
}
const srcFile = path.join(downloadsDir, files[0]);
console.log('Исходный файл:', srcFile);

const publicDir = path.join(__dirname, '..', 'public');
const imagesDir = path.join(publicDir, 'book-images');
const outJson = path.join(publicDir, 'book-chapters.json');

if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

// --- Сбор картинок ---
const imagesList = []; // [{ ref, filename, contentType }]
let imageCounter = 0;

const imageConverter = mammoth.images.imgElement(function(image) {
  return image.read().then(function(imageBuffer) {
    imageCounter++;
    const ref = 'img-' + String(imageCounter).padStart(3, '0');
    // Определим расширение по contentType
    let ext = 'png';
    const ct = (image.contentType || '').toLowerCase();
    if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';
    else if (ct.includes('png')) ext = 'png';
    else if (ct.includes('gif')) ext = 'gif';
    else if (ct.includes('webp')) ext = 'webp';
    else if (ct.includes('svg')) ext = 'svg';

    const filename = ref + '.' + ext;
    const outPath = path.join(imagesDir, filename);
    fs.writeFileSync(outPath, imageBuffer);

    imagesList.push({ ref, filename, contentType: image.contentType });

    // Возвращаем пустой src — в HTML потом будем брать по data-ref
    return {
      src: '',
      'data-ref': ref,
      alt: ''
    };
  });
});

// --- Утилиты ---
function cleanHtml(html) {
  // Убираем пустые параграфы и заголовки (артефакты Word)
  html = html.replace(/<(h[1-6]|p)[^>]*>\s*(<strong>\s*<\/strong>)?\s*<\/\1>/g, '');
  html = html.replace(/<(h[1-6]|p)[^>]*>\s*&nbsp;\s*<\/\1>/g, '');
  // Нормализуем множественные пробелы
  html = html.replace(/\s+/g, ' ');
  html = html.replace(/>\s+</g, '><');
  return html.trim();
}

function stripTags(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function slugify(s) {
  return stripTags(s).toLowerCase()
    .replace(/[^\w\u0400-\u04FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Регулярка для выделения дара из заголовка:
// "1.1 Дар ЛА-ДА (2-8-1): АРХИТЕКТОР ВОЗМОЖНОСТЕЙ"
const darHeadingRegex = /^\s*\d+\.\d+\s+Дар\s+([А-ЯA-Z\-\u2014\u2013\s]+?)\s*\((\d-\d-\d)\)/i;

// Семантические категории заголовков книги
const PART_RE = /^\s*ЧАСТЬ\s+\d/i;
const CHAPTER_RE = /^\s*Глава\s+\d/i;
const INTRO_RE = /^\s*(Введение|Предисловие)/i;
const EPILOGUE_RE = /^\s*(Эпилог|Заключение|Благодарност|Как появилась|Продолжение в звуке|Связь с автором)/i;

function classifyHeading(title) {
  if (PART_RE.test(title)) return 'part';
  if (CHAPTER_RE.test(title)) return 'chapter';
  if (darHeadingRegex.test(title)) return 'dar';
  if (INTRO_RE.test(title)) return 'intro';
  if (EPILOGUE_RE.test(title)) return 'epilogue';
  return 'section'; // подразделы внутри главы — остаются inline в HTML
}

// --- Основная логика ---
(async () => {
  console.log('Парсим docx через mammoth...');
  const result = await mammoth.convertToHtml(
    { path: srcFile },
    { convertImage: imageConverter }
  );

  if (result.messages.length > 0) {
    console.log('Парсер вернул предупреждений:', result.messages.length);
  }
  console.log('Картинок извлечено:', imagesList.length);

  // После mammoth заменим data-ref="img-NNN" на data-ref="img-NNN.ext" — так ридер
  // сможет сразу строить src без fallback-логики по расширению.
  let html = result.value;
  const refToFilename = {};
  imagesList.forEach(img => { refToFilename[img.ref] = img.filename; });
  html = html.replace(/data-ref="(img-\d+)"/g, function(_, ref) {
    return 'data-ref="' + (refToFilename[ref] || ref) + '"';
  });

  // Соберём все заголовки H1/H2/H3 с их позициями
  const headingRegex = /<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/g;
  const headings = [];
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const title = stripTags(match[2]);
    if (!title) continue; // пропускаем пустые (артефакты Word)
    headings.push({
      rawLevel: parseInt(match[1].substring(1), 10),
      title,
      tagStart: match.index,
      tagEnd: match.index + match[0].length,
      category: classifyHeading(title)
    });
  }

  // В docx "ЧАСТЬ 2" и "ЧАСТЬ 3" часто оформлены не как H1, а как <strong> в параграфе.
  // Формат: <p><a id="..."></a><strong>ЧАСТЬ N. ...</strong></p>
  // Исключаем ссылки оглавления в начале файла (до позиции 50000).
  const strongPartRegex = /<p[^>]*>(?:\s*<a[^>]*><\/a>\s*)?<strong>\s*(ЧАСТЬ\s+\d[^<]{0,120})\s*<\/strong>/gi;
  let pm;
  while ((pm = strongPartRegex.exec(html)) !== null) {
    const title = stripTags(pm[1]).replace(/\s+/g, ' ').trim();
    if (!PART_RE.test(title)) continue;
    // Проверим, нет ли уже такого заголовка рядом (в H1)
    const already = headings.some(h =>
      h.category === 'part' &&
      Math.abs(h.tagStart - pm.index) < 200
    );
    if (already) continue;
    headings.push({
      rawLevel: 1,
      title,
      tagStart: pm.index,
      tagEnd: pm.index + pm[0].length,
      category: 'part'
    });
  }
  // Пересортируем по позиции
  headings.sort((a, b) => a.tagStart - b.tagStart);

  console.log('Непустых заголовков:', headings.length);
  const byCat = {};
  headings.forEach(h => { byCat[h.category] = (byCat[h.category] || 0) + 1; });
  console.log('По категориям:', byCat);

  // Индекс даров из fields.json
  const fieldsData = require(path.join(publicDir, 'fields.json'));
  const darCodeSet = new Set(fieldsData.dars.map(d => d.code));

  // --- Строим структуру: части → главы ---
  // Главы — это только заголовки категорий chapter/dar/intro/epilogue.
  // Всё между одной "главой" и следующей "главой" (включая section-заголовки)
  // отдаём внутрь HTML главы.
  const parts = [];
  let currentPart = null;
  let darsMatched = 0;

  // Найдём границы глав: массив "якорных" заголовков
  const chapterAnchors = headings.filter(h =>
    h.category === 'part' || h.category === 'chapter' ||
    h.category === 'dar' || h.category === 'intro' || h.category === 'epilogue'
  );

  for (let i = 0; i < chapterAnchors.length; i++) {
    const h = chapterAnchors[i];
    // Тело = от конца этого заголовка до начала следующего якоря
    const bodyEnd = (i + 1 < chapterAnchors.length) ? chapterAnchors[i + 1].tagStart : html.length;
    const bodyHtml = cleanHtml(html.slice(h.tagEnd, bodyEnd));

    if (h.category === 'part') {
      currentPart = {
        id: 'part-' + (parts.length + 1),
        title: h.title,
        intro_html: bodyHtml.length < 4000 ? bodyHtml : '', // короткое вводное
        chapters: []
      };
      parts.push(currentPart);
      continue;
    }

    // Если главы встречаются до первой ЧАСТИ — создаём обложку
    if (!currentPart) {
      currentPart = { id: 'part-0', title: 'Начало', intro_html: '', chapters: [] };
      parts.push(currentPart);
    }

    // Определяем dar_code / dar_name для dar-глав
    let darCode = null, darName = null;
    if (h.category === 'dar') {
      const dm = h.title.match(darHeadingRegex);
      if (dm) {
        darName = dm[1].replace(/\s*-\s*/g, '-').trim();
        darCode = dm[2];
        if (darCodeSet.has(darCode)) darsMatched++;
      }
    }

    const chapter = {
      id: 'ch-' + (currentPart.chapters.length + 1) + '-' + slugify(h.title),
      title: h.title,
      kind: h.category, // chapter / dar / intro / epilogue
      html: bodyHtml
    };
    if (darCode) { chapter.dar_code = darCode; chapter.dar_name = darName; }
    currentPart.chapters.push(chapter);
  }

  console.log('Частей:', parts.length);
  console.log('Глав всего:', parts.reduce((s, p) => s + p.chapters.length, 0));
  console.log('Глав-даров найдено:', darsMatched, '/ 64');

  // Считаем картинки в каждой главе (data-ref="img-NNN.ext")
  let totalImagesInChapters = 0;
  parts.forEach(p => {
    p.chapters.forEach(ch => {
      const imgs = (ch.html.match(/data-ref="img-\d+\.[a-z]+"/g) || []).length;
      ch.image_count = imgs;
      totalImagesInChapters += imgs;
    });
  });
  console.log('Картинок привязано к главам:', totalImagesInChapters, '/', imagesList.length);

  // Собираем финальный объект
  const output = {
    title: 'Книга Даров',
    version: 'Издание 1',
    total_parts: parts.length,
    total_chapters: parts.reduce((s, p) => s + p.chapters.length, 0),
    total_images: imagesList.length,
    generated_at: new Date().toISOString(),
    parts
  };

  fs.writeFileSync(outJson, JSON.stringify(output, null, 2));
  const sizeKb = (fs.statSync(outJson).size / 1024).toFixed(1);
  console.log('Сохранено:', outJson, '(' + sizeKb + ' КБ)');

  // Краткий репорт по дарам
  console.log();
  console.log('=== ДАРЫ, НАЙДЕННЫЕ В КНИГЕ ===');
  const foundDarCodes = new Set();
  parts.forEach(p => p.chapters.forEach(ch => {
    if (ch.kind === 'dar') foundDarCodes.add(ch.dar_code);
  }));
  const missing = fieldsData.dars.filter(d => !foundDarCodes.has(d.code));
  if (missing.length > 0) {
    console.log('НЕ НАЙДЕНЫ в книге (' + missing.length + '):');
    missing.forEach(d => console.log('  -', d.code, d.name));
  } else {
    console.log('Все 64 дара найдены!');
  }

})().catch(e => {
  console.error('ОШИБКА:', e);
  process.exit(1);
});
