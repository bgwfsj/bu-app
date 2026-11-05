# -*- coding: utf-8 -*-
"""把《水墨晕染风格图片生成.png》转成 Android 图标资源。

做法：
1. 用很深的墨确定笔触 bbox，按 margin 裁一个正方形（顺带把右下角水印用邻近纸面覆盖）
2. 由亮度反推墨迹 alpha → 透明墨层（烟雾洇染一起保留）
3. 纸底单独生成：把墨区用重度模糊填平，得到纯纸面（保留纸纹）
4. 传统图标 = 纸底 + 墨层；自适应图标 = 纸底图 + 独立墨层前景（缩到安全区）
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

_SRC_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(_SRC_DIR, 'assets', 'source-art', '水墨晕染风格图片生成.png')
_HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(os.path.dirname(_HERE), 'app', 'src', 'main', 'res')

ART = 1024         # 中间层边长
MARGIN = 1.30      # 裁框相对笔触主体的放大倍数（留白）
ADAPT_FILL = 0.64  # 自适应前景里墨层占画布比例（安全区内）


def build_layers():
    im = Image.open(SRC).convert('RGB')
    w, h = im.size
    arr = np.asarray(im).astype(np.float32)
    lum = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)

    border = np.concatenate([lum[:30, :].ravel(), lum[-30:, :].ravel(),
                             lum[:, :30].ravel(), lum[:, -30:].ravel()])
    paper = float(np.median(border))

    dark = lum < 100
    xs = np.where(dark.sum(axis=0) > h * 0.012)[0]
    ys = np.where(dark.sum(axis=1) > w * 0.012)[0]
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    size = int(min(max(x1 - x0, y1 - y0) * MARGIN, h, w))
    top = max(0, min(int(round(cy - size / 2)), h - size))
    left = max(0, min(int(round(cx - size / 2)), w - size))
    print('ink bbox', (x0, y0, x1, y1), 'crop', (left, top, size))

    crop = im.crop((left, top, left + size, top + size)).convert('RGB')

    # 右下角水印：用裁框顶点处的干净纸面盖掉
    if left + size > w * 0.78 and top + size > h * 0.90:
        wx = int(max(0, w * 0.78 - left)); wy = int(max(0, h * 0.90 - top))
        patch_src = crop.crop((0, 0, min(200, size), min(200, size)))
        crop.paste(patch_src.resize((size - wx, size - wy), Image.LANCZOS), (wx, wy))
        print('watermark covered at', (wx, wy))

    crop = crop.resize((ART, ART), Image.LANCZOS)
    a2 = np.asarray(crop).astype(np.float32)
    lum2 = a2 @ np.array([0.299, 0.587, 0.114], dtype=np.float32)

    alpha = (paper - lum2) / max(1.0, paper - 40.0)
    alpha = np.clip(alpha, 0, 1) ** 0.82
    alpha = np.clip((alpha - 0.07) / 0.93, 0, 1)      # 去掉纸纹造成的薄雾
    alpha[alpha < 0.02] = 0

    ink = np.zeros((ART, ART, 4), dtype=np.uint8)
    ink[..., 0] = 16; ink[..., 1] = 14; ink[..., 2] = 12
    ink[..., 3] = (alpha * 255).astype(np.uint8)
    ink_img = Image.fromarray(ink, 'RGBA')

    # 纸底：只用“非墨像素”做归一化模糊，得到不含墨的纸面（保留纸纹，无灰雾）
    img = np.asarray(crop).astype(np.float32)
    paper_mask = (alpha <= 0.02).astype(np.float32)
    r = ART * 0.08

    def gauss(chan, radius):
        im = Image.fromarray(np.clip(chan, 0, 255).astype(np.uint8), 'L')
        return np.asarray(im.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32)

    num = np.stack([gauss(img[..., i] * paper_mask, r) for i in range(3)], axis=-1)
    den = np.clip(gauss(paper_mask * 255.0, r) / 255.0, 1e-3, 1.0)[..., None]
    plate = np.clip(num / den, 0, 255).astype(np.uint8)
    plate_img = Image.fromarray(plate).convert('RGB')
    return ink_img, plate_img, crop


def place(art, canvas, fill):
    out = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    inner = int(canvas * fill)
    off = (canvas - inner) // 2
    out.alpha_composite(art.resize((inner, inner), Image.LANCZOS), (off, off))
    return out


def main():
    ink, plate, crop = build_layers()

    for name, px in [('mipmap-mdpi', 48), ('mipmap-hdpi', 72), ('mipmap-xhdpi', 96),
                     ('mipmap-xxhdpi', 144), ('mipmap-xxxhdpi', 192)]:
        d = os.path.join(RES, name)
        os.makedirs(d, exist_ok=True)
        bg = plate.resize((px, px), Image.LANCZOS).convert('RGBA')
        icon = Image.alpha_composite(bg, ink.resize((px, px), Image.LANCZOS))
        icon.convert('RGB').save(os.path.join(d, 'ic_launcher.png'))
        print('wrote', name, px)

    d = os.path.join(RES, 'drawable-nodpi')
    os.makedirs(d, exist_ok=True)
    place(ink, 432, ADAPT_FILL).save(os.path.join(d, 'ic_launcher_fg_ink.png'))
    plate.resize((432, 432), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_bg_paper.png'))
    print('wrote adaptive layers')

    # 预览：自适应图标的圆形 / 圆角方形裁切
    bg432 = plate.resize((432, 432), Image.LANCZOS).convert('RGBA')
    fg432 = place(ink, 432, ADAPT_FILL)
    full = Image.alpha_composite(bg432, fg432)
    for name, frac in [('round', 0.3056), ('squircle', 0.42)]:
        m = Image.new('L', (432, 432), 0)
        d2 = ImageDraw.Draw(m)
        c, r = 216, 432 * frac
        if name == 'round':
            d2.ellipse([c - r, c - r, c + r, c + r], fill=255)
        else:
            d2.rounded_rectangle([c - r, c - r, c + r, c + r], radius=r * 0.42, fill=255)
        out = Image.new('RGBA', (432, 432), (0, 0, 0, 0))
        out.paste(full, (0, 0), m)
        out.resize((256, 256), Image.LANCZOS).save(os.path.join(_HERE, 'preview_%s.png' % name))
    full.resize((256, 256), Image.LANCZOS).save(os.path.join(_HERE, 'preview_full.png'))
    print('previews done')


if __name__ == '__main__':
    main()
