#!/usr/bin/env python3
"""
Обрезать все PNG-глифы даров до bounding box рисунка + добавить
одинаковое поле, чтобы все рисунки были визуально по центру одного размера.

Источник:    public/dar-png/*.png   (исходные глифы — могут быть смещены)
Назначение:  public/dar-png-trimmed/*.png  (центрированные, готовые к object-fit:contain)

Зачем: тестер прислала баг "Значок съехал" — рисунок ТО-ТА визуально съехал
в карточке игры. Причина: в исходном PNG графика смещена вниз-вправо
относительно квадратного холста.
"""

import os
import sys
from pathlib import Path
from PIL import Image, ImageOps

# Принудительно UTF-8 для stdout (на Windows может быть cp1251)
sys.stdout.reconfigure(encoding='utf-8')

SRC = Path('public/dar-png')
DST = Path('public/dar-png-trimmed')
PAD_RATIO = 0.05  # 5% поля вокруг рисунка

def trim_and_center(src_path: Path, dst_path: Path):
    img = Image.open(src_path).convert('RGBA')

    # Получаем альфа-канал (или если RGB без альфы — сравниваем с белым)
    alpha = img.split()[-1]
    # Bbox непрозрачного содержимого
    bbox = alpha.getbbox()

    if bbox is None or (bbox[2]-bbox[0] < 5 or bbox[3]-bbox[1] < 5):
        # Картинка пустая или альфа-канал не работает — сравниваем с белым
        # (на случай PNG без прозрачности)
        rgb = img.convert('RGB')
        # Делаем маску: белые/почти белые пиксели = фон
        mask = ImageOps.invert(rgb.convert('L')).point(lambda x: 255 if x > 5 else 0)
        bbox = mask.getbbox()

    if bbox is None:
        print(f'  SKIP (empty): {src_path.name}')
        return

    # Обрезаем по bbox
    cropped = img.crop(bbox)
    w, h = cropped.size
    side = max(w, h)

    # Добавляем поля чтобы получить квадрат + паддинг
    pad = int(side * PAD_RATIO)
    canvas_size = side + pad * 2

    # Прозрачный квадратный холст
    canvas = Image.new('RGBA', (canvas_size, canvas_size), (255, 255, 255, 0))
    offset_x = (canvas_size - w) // 2
    offset_y = (canvas_size - h) // 2
    canvas.paste(cropped, (offset_x, offset_y), cropped)

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst_path, 'PNG', optimize=True)

def main():
    if not SRC.exists():
        print(f'ERROR: source dir {SRC} not found')
        return 1

    files = sorted(SRC.glob('*.png'))
    print(f'Found {len(files)} PNG glyphs in {SRC}')
    print(f'Output to: {DST}\n')

    DST.mkdir(parents=True, exist_ok=True)
    for src in files:
        dst = DST / src.name
        try:
            trim_and_center(src, dst)
            src_size = src.stat().st_size
            dst_size = dst.stat().st_size
            print(f'  {src.name}: {src_size//1024}KB -> {dst_size//1024}KB')
        except Exception as e:
            print(f'  ERROR {src.name}: {e}')

    print(f'\nDone. {len(files)} files processed.')

if __name__ == '__main__':
    main()
