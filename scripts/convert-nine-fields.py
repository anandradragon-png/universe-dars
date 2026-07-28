# -*- coding: utf-8 -*-
"""
Конвертер книг «Девять полей» (docx → JSON-главы в формате ридера YupDar).

Вход:  C:\\Users\\Sveta\\Desktop\\Клод\\КНИГИ\\Девять полей — книга.docx
        C:\\Users\\Sveta\\Desktop\\Клод\\КНИГИ\\Девять полей — научное изложение.docx
Выход: public/nine-fields-popular.json   (популярное изложение, 14 глав)
        public/nine-fields-science.json    (научный очерк, разделы + 9 полей)
        public/book-images/nine-*.{jpg,png}  (3 общие картинки)

Формат каждого JSON совпадает с book-chapters.json:
{ title, version, total_parts, total_chapters, total_images, parts:[
  { id, title, intro_html, chapters:[ { id, title, kind, html, image_count } ] } ] }

Запуск: python scripts/convert-nine-fields.py
"""
import re, html, os, zipfile, shutil, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = r"C:\Users\Sveta\Desktop\Клод\КНИГИ"
PUBLIC = os.path.join(ROOT, "public")
IMG_OUT = os.path.join(PUBLIC, "book-images")
os.makedirs(IMG_OUT, exist_ok=True)

# Общие картинки: имя в media docx → целевое имя в /book-images/
IMG_MAP_ORDER = ["nine-body", "nine-hands", "nine-karta"]  # порядок появления в тексте


def read_docx_blocks(path):
    """Возвращает список блоков (style, text, has_image) из document.xml."""
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    blocks = []
    for p in re.split(r"</w:p>", xml):
        texts = re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S)
        txt = html.unescape("".join(texts)).strip()
        style_m = re.search(r'w:pStyle w:val="([^"]+)"', p)
        style = style_m.group(1) if style_m else ""
        has_img = ("graphicData" in p) or ("w:drawing" in p)
        if txt or has_img:
            blocks.append((style, txt, has_img))
    return blocks


def extract_images(path, dst_names):
    """Копирует картинки из docx в /book-images/ под именами dst_names (по порядку media)."""
    saved = []
    with zipfile.ZipFile(path) as z:
        media = sorted([n for n in z.namelist() if n.startswith("word/media/")])
        for i, name in enumerate(media):
            if i >= len(dst_names):
                break
            ext = os.path.splitext(name)[1].lstrip(".").lower() or "png"
            out = dst_names[i] + "." + ext
            with z.open(name) as f, open(os.path.join(IMG_OUT, out), "wb") as o:
                shutil.copyfileobj(f, o)
            saved.append(out)
    return saved


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def unspace(s):
    """Схлопывает разрядку вида «П р и л о ж е н и е» → «Приложение»."""
    return re.sub(r"\b(?:[А-ЯЁа-яё] ){2,}[А-ЯЁа-яё]\b",
                  lambda m: m.group(0).replace(" ", ""), s)


def join_title(parts):
    """Собирает заголовок главы из строк docx: «Глава вторая» + [ЛОГОС, поле структуры]
    → «Глава вторая. ЛОГОС — поле структуры»."""
    parts = [unspace(p) for p in parts if p]
    if not parts:
        return ""
    head = parts[0]
    rest = parts[1:]
    if not rest:
        return head
    return head + ". " + " — ".join(rest)


# ── Популярная книга ────────────────────────────────────────────────────────
CH_RE = re.compile(r"^Глава\b", re.I)
APP_RE = re.compile(r"^П\s*р\s*и\s*л\s*о\s*ж", re.I)


def build_popular(src, img_files):
    blocks = read_docx_blocks(src)
    # img_files по порядку появления {IMG}. Итератор.
    img_iter = iter(img_files)

    chapters = []
    # Обложка / title
    cover_title = blocks[0][1] if blocks else "ДЕВЯТЬ ПОЛЕЙ"
    cover_sub = []
    i = 1
    while i < len(blocks) and blocks[i][1] != "От автора" and not CH_RE.match(blocks[i][1]):
        if blocks[i][1]:
            cover_sub.append(blocks[i][1])
        i += 1

    # Собираем главы: якоря — "От автора", "Глава ...", "Приложение".
    def is_anchor(txt):
        return txt == "От автора" or CH_RE.match(txt) or APP_RE.match(txt)

    # Индексы якорей
    anchors = [j for j in range(len(blocks)) if is_anchor(blocks[j][1])]
    for k, start in enumerate(anchors):
        end = anchors[k + 1] if k + 1 < len(anchors) else len(blocks)
        seg = blocks[start:end]
        # Заголовок главы: якорная строка + следующие короткие строки-названия
        # до первого ❦ / абзаца / картинки.
        title_parts = [seg[0][1]]
        body_start = 1
        for j in range(1, len(seg)):
            st, txt, img = seg[j]
            if txt == "❦" or img:
                body_start = j
                break
            # длинный абзац → тело
            if len(txt) > 80 or txt.endswith((".", "!", "?", "…", "»")):
                body_start = j
                break
            title_parts.append(txt)
            body_start = j + 1
        title = join_title(title_parts)

        # Тело → HTML
        html_parts = []
        pending_caption_for_img = False
        for j in range(body_start, len(seg)):
            st, txt, img = seg[j]
            if img:
                fname = next(img_iter, None)
                if fname:
                    html_parts.append('<figure class="book-figure"><img data-ref="' + fname + '" alt=""/>')
                    pending_caption_for_img = True
                continue
            if txt == "❦":
                continue
            if pending_caption_for_img:
                html_parts.append('<figcaption>' + esc(txt) + '</figcaption></figure>')
                pending_caption_for_img = False
                continue
            if txt.startswith("«") and txt.endswith("»"):
                html_parts.append('<blockquote class="book-quote">' + esc(txt) + '</blockquote>')
                continue
            # Подзаголовок: короткая строка без конечной точки
            if len(txt) < 70 and not txt.endswith((".", "!", "?", "…", "»", ":")):
                html_parts.append('<h3>' + esc(txt) + '</h3>')
                continue
            html_parts.append('<p>' + esc(txt) + '</p>')
        if pending_caption_for_img:
            html_parts.append('</figure>')

        kind = "intro" if seg[0][1] == "От автора" else ("epilogue" if APP_RE.match(seg[0][1]) or "послеслови" in title.lower() else "chapter")
        chapters.append({
            "id": "ch-" + str(len(chapters) + 1),
            "title": title,
            "kind": kind,
            "html": "".join(html_parts),
            "image_count": sum(1 for j in range(body_start, len(seg)) if seg[j][2]),
        })

    intro_html = "".join('<p>' + esc(s) + '</p>' for s in cover_sub)
    part = {"id": "part-1", "title": cover_title, "intro_html": intro_html, "chapters": chapters}
    return {
        "title": cover_title,
        "version": "Популярное изложение",
        "total_parts": 1,
        "total_chapters": len(chapters),
        "total_images": len(img_files),
        "parts": [part],
    }


# ── Научный очерк ───────────────────────────────────────────────────────────
def build_science(src, img_files):
    blocks = read_docx_blocks(src)
    img_iter = iter(img_files)

    cover_title = blocks[0][1] if blocks else "МОДЕЛЬ ДЕВЯТИ ПОЛЕЙ"
    cover_sub = []
    i = 1
    while i < len(blocks) and blocks[i][0] not in ("Heading1", "Heading2"):
        if blocks[i][1]:
            cover_sub.append(blocks[i][1])
        i += 1

    # Якоря — все Heading1 и Heading2 (каждое поле 3.x = своя глава).
    anchors = [j for j in range(len(blocks)) if blocks[j][0] in ("Heading1", "Heading2")]
    chapters = []
    for k, start in enumerate(anchors):
        end = anchors[k + 1] if k + 1 < len(anchors) else len(blocks)
        seg = blocks[start:end]
        title = seg[0][1]
        html_parts = []
        pending_caption = False
        # Раздел «3. Поля восприятия» — только заголовок-рубрика без тела до 3.1
        for j in range(1, len(seg)):
            st, txt, img = seg[j]
            if img:
                fname = next(img_iter, None)
                if fname:
                    html_parts.append('<figure class="book-figure"><img data-ref="' + fname + '" alt=""/>')
                    pending_caption = True
                continue
            if pending_caption:
                html_parts.append('<figcaption>' + esc(txt) + '</figcaption></figure>')
                pending_caption = False
                continue
            # Внутренние рубрики научного текста («Содержание поля.», «Феноменология.» и т.д.)
            m = re.match(r"^([А-ЯЁ][а-яё ]{2,40}\.)\s+(.*)$", txt)
            if m and len(m.group(1)) < 42:
                html_parts.append('<p><strong>' + esc(m.group(1)) + '</strong> ' + esc(m.group(2)) + '</p>')
                continue
            html_parts.append('<p>' + esc(txt) + '</p>')
        if pending_caption:
            html_parts.append('</figure>')

        low = title.lower()
        kind = "intro" if "аннотац" in low else ("epilogue" if "заключ" in low or "приложение" in low else "chapter")
        chapters.append({
            "id": "ch-" + str(len(chapters) + 1),
            "title": title,
            "kind": kind,
            "html": "".join(html_parts),
            "image_count": sum(1 for j in range(1, len(seg)) if seg[j][2]),
        })

    intro_html = "".join('<p>' + esc(s) + '</p>' for s in cover_sub)
    part = {"id": "part-1", "title": cover_title, "intro_html": intro_html, "chapters": chapters}
    return {
        "title": cover_title,
        "version": "Научное изложение",
        "total_parts": 1,
        "total_chapters": len(chapters),
        "total_images": len(img_files),
        "parts": [part],
    }


def main():
    pop_src = os.path.join(SRC_DIR, "Девять полей — книга.docx")
    sci_src = os.path.join(SRC_DIR, "Девять полей — научное изложение.docx")

    # Картинки одинаковые в обоих файлах — извлекаем один раз из популярной.
    img_files = extract_images(pop_src, IMG_MAP_ORDER)
    print("Картинки:", img_files)

    pop = build_popular(pop_src, img_files)
    sci = build_science(sci_src, img_files)

    with open(os.path.join(PUBLIC, "nine-fields-popular.json"), "w", encoding="utf-8") as f:
        json.dump(pop, f, ensure_ascii=False, indent=2)
    with open(os.path.join(PUBLIC, "nine-fields-science.json"), "w", encoding="utf-8") as f:
        json.dump(sci, f, ensure_ascii=False, indent=2)

    print("Популярная:", pop["total_chapters"], "глав")
    for c in pop["parts"][0]["chapters"]:
        print("   -", c["kind"], "|", c["title"])
    print("Научная:", sci["total_chapters"], "глав")
    for c in sci["parts"][0]["chapters"]:
        print("   -", c["kind"], "|", c["title"])


if __name__ == "__main__":
    main()
