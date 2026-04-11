const mammoth = require('mammoth');
const path = require('path');
const fs = require('fs');

const dir = path.join('C:', 'Users', 'Sveta', 'Downloads');
const files = fs.readdirSync(dir).filter(f => f.toLowerCase().includes('книга даров') && f.endsWith('.docx'));
console.log('Найдены файлы:', files);
if (files.length === 0) { console.error('Файл не найден'); process.exit(1); }
const filePath = path.join(dir, files[0]);
console.log('Использую:', filePath);
console.log();

(async () => {
  // Получаем HTML со структурой
  const htmlResult = await mammoth.convertToHtml({ path: filePath });
  const html = htmlResult.value;
  const rawText = (await mammoth.extractRawText({ path: filePath })).value;

  console.log('=== СТАТИСТИКА ===');
  console.log('HTML длина:', html.length);
  console.log('Raw text длина:', rawText.length);
  console.log('Строк в тексте:', rawText.split('\n').length);
  console.log();

  // Статистика по тегам
  const tagCounts = {};
  const tagRegex = /<(\w+)/g;
  let m;
  while ((m = tagRegex.exec(html)) !== null) {
    tagCounts[m[1]] = (tagCounts[m[1]] || 0) + 1;
  }
  console.log('=== ТЕГИ В HTML ===');
  console.log(tagCounts);
  console.log();

  // Найдём все h1/h2/h3 - структура глав
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(x => x[1].replace(/<[^>]*>/g, '').trim());
  const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(x => x[1].replace(/<[^>]*>/g, '').trim());
  const h3 = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(x => x[1].replace(/<[^>]*>/g, '').trim());

  console.log('=== ЗАГОЛОВКИ H1 (' + h1.length + ') ===');
  h1.slice(0, 30).forEach((t, i) => console.log((i + 1) + '. ' + t));
  if (h1.length > 30) console.log('... и ещё ' + (h1.length - 30));
  console.log();

  console.log('=== ЗАГОЛОВКИ H2 (' + h2.length + ') ===');
  h2.slice(0, 20).forEach((t, i) => console.log((i + 1) + '. ' + t));
  if (h2.length > 20) console.log('... и ещё ' + (h2.length - 20));
  console.log();

  console.log('=== ЗАГОЛОВКИ H3 (' + h3.length + ') ===');
  h3.slice(0, 20).forEach((t, i) => console.log((i + 1) + '. ' + t));
  if (h3.length > 20) console.log('... и ещё ' + (h3.length - 20));
  console.log();

  // Сохраним HTML для просмотра
  fs.writeFileSync('scripts/book-preview.html', html);
  console.log('HTML сохранён в scripts/book-preview.html (' + html.length + ' байт)');

  // Картинки
  const imgCount = (html.match(/<img/g) || []).length;
  console.log('Картинок: ' + imgCount);

  // Сообщения парсера (предупреждения)
  if (htmlResult.messages.length > 0) {
    console.log();
    console.log('=== СООБЩЕНИЯ ПАРСЕРА (' + htmlResult.messages.length + ') ===');
    htmlResult.messages.slice(0, 10).forEach(m => console.log('- [' + m.type + '] ' + m.message));
  }
})().catch(e => { console.error('ОШИБКА:', e.message); process.exit(1); });
