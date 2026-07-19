#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sözcük Merdiveni — favicon ve sosyal kart üretici
--------------------------------------------------
Pillow ile markalı ikonları çizer (favicon.svg / og-image.svg ile aynı motif):
koyu zeminde yükselen üç kutu (yeşil → krem → amber) — kelime oyunu + merdiven.

Üretilenler (proje köküne):
  favicon.ico            16/32/48 çok boyutlu (klasik, Google + tarayıcılar)
  favicon-48.png         Google arama sonucu ikonu
  favicon-192.png        Android
  apple-touch-icon.png   180x180, iOS ana ekran
  og-image.png           1200x630 sosyal paylaşım kartı

Kullanım:  python3 tools/ikon_uret.py
(Yeniden çalıştırmak için Pillow gerekir: pip install Pillow)
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

KOK = Path(__file__).resolve().parent.parent
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"

KOYU_UST = (36, 36, 43)      # #24242b
KOYU_ALT = (19, 19, 21)      # #131315
YESIL = (74, 157, 79)        # #4a9d4f
KREM = (233, 231, 224)       # #e9e7e0
AMBER = (201, 169, 74)       # #c9a94a
GRI = (154, 154, 160)
GRI2 = (201, 201, 208)
BEYAZ = (245, 245, 247)

SS = 4  # süper örnekleme (kenarlar yumuşasın diye yüksek çöz + küçültme)


def dikey_gradyan(w, h, ust, alt):
    """Dikey iki renkli gradyan görsel."""
    taban = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        taban.putpixel((0, y), tuple(round(ust[i] + (alt[i] - ust[i]) * t) for i in range(3)))
    return taban.resize((w, h))


def favicon_ciz(boy):
    """Verilen kenar uzunluğunda favicon (RGBA) döndürür."""
    S = boy * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Yuvarlak köşeli koyu zemin (gradyan) — yuvarlak maske ile
    grad = dikey_gradyan(S, S, KOYU_UST, KOYU_ALT).convert("RGBA")
    maske = Image.new("L", (S, S), 0)
    ImageDraw.Draw(maske).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(112 * S / 512), fill=255)
    img.paste(grad, (0, 0), maske)

    d = ImageDraw.Draw(img)
    k = S / 512  # 512 mantıksal → gerçek ölçek
    r = int(26 * k)
    # amber (üst), krem (orta), yeşil (alt) — köşegen
    for (x, y, renk) in [(286, 96, AMBER), (191, 191, KREM), (96, 286, YESIL)]:
        d.rounded_rectangle([x * k, y * k, (x + 130) * k, (y + 130) * k], radius=r, fill=renk)

    return img.resize((boy, boy), Image.LANCZOS)


def yaz(d, xy, metin, font, renk, spacing=0, anchor="lm"):
    """Harf aralıklı (letter-spacing) metin çizer; spacing=0 ise normal."""
    if spacing == 0:
        d.text(xy, metin, font=font, fill=renk, anchor=anchor)
        return
    x, y = xy
    for ch in metin:
        d.text((x, y), ch, font=font, fill=renk, anchor="lm")
        x += d.textlength(ch, font=font) + spacing


def og_ciz():
    """1200x630 sosyal paylaşım kartı."""
    W, H = 1200 * 2, 630 * 2       # 2x render, sonra küçült
    img = dikey_gradyan(W, H, KOYU_UST, KOYU_ALT).convert("RGBA")
    d = ImageDraw.Draw(img)
    k = 2  # 1200 mantıksal → gerçek ölçek

    d.rectangle([0, 0, W, 8 * k], fill=YESIL)   # üst yeşil şerit

    f_brand = ImageFont.truetype(FONT_BOLD, 34 * k)
    f_title = ImageFont.truetype(FONT_BOLD, 96 * k)
    f_tag = ImageFont.truetype(FONT_REG, 40 * k)
    f_sub = ImageFont.truetype(FONT_REG, 30 * k)
    f_url = ImageFont.truetype(FONT_BOLD, 34 * k)

    yaz(d, (90 * k, 222 * k), "SÖZCÜK YOLU", f_brand, AMBER, spacing=7 * k)
    d.text((88 * k, 292 * k), "Sözcük Merdiveni", font=f_title, fill=BEYAZ, anchor="lm")
    d.text((90 * k, 390 * k), "Türkçe kelime oyunu · Her gün yeni bulmaca", font=f_tag, fill=GRI2, anchor="lm")
    d.text((90 * k, 445 * k), "Ücretsiz · Üyeliksiz · Mobil uyumlu", font=f_sub, fill=GRI, anchor="lm")
    d.text((90 * k, 553 * k), "sözcükyolu.com", font=f_url, fill=AMBER, anchor="lm")

    # Sağ: yükselen kutu ikonu
    ox, oy, r = 902 * k, 150 * k, 20 * k
    for (x, y, renk) in [(150, 0, AMBER), (75, 75, KREM), (0, 150, YESIL)]:
        d.rounded_rectangle([ox + x * k, oy + y * k, ox + (x + 100) * k, oy + (y + 100) * k], radius=r, fill=renk)

    return img.resize((1200, 630), Image.LANCZOS)


def main():
    # Favicon PNG'leri
    favicon_ciz(48).save(KOK / "favicon-48.png")
    favicon_ciz(192).save(KOK / "favicon-192.png")
    favicon_ciz(180).save(KOK / "apple-touch-icon.png")

    # Çok boyutlu favicon.ico (16/32/48)
    ico = favicon_ciz(64)
    ico.save(KOK / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # Sosyal kart
    og_ciz().convert("RGB").save(KOK / "og-image.png", quality=92)

    print("Üretildi: favicon.ico, favicon-48.png, favicon-192.png, "
          "apple-touch-icon.png, og-image.png")


if __name__ == "__main__":
    main()
