#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sözcük Merdiveni — simge, sosyal kart ve uygulama görseli üretici
------------------------------------------------------------------
Pillow ile marka işaretini çizer: koyu zeminde yükselen üç kutu
(yeşil → krem → amber) — kelime oyunu + merdiven.

Renkler bu dosyada YAZMAZ: style.css içindeki :root belirteçlerinden okunur
(tek palet; bkz. ekip/tasarim-sistemi.md). favicon.svg ve tools/og-image.svg
aynı değerlerin elle tutulan kopyasıdır; tools/test_veri.py eşleşmeyi denetler.

Üretilenler:
  favicon.ico                    16/32/48 çok boyutlu (Google + tarayıcılar)
  favicon-48.png                 Google arama sonucu ikonu
  favicon-192.png                Android
  apple-touch-icon.png           180x180, iOS ana ekran
  og-image.png                   1200x630 sosyal paylaşım kartı
  tools/uygulama/simge-1024.png  iOS uygulama simgesi: opak RGB, köşesiz
  tools/uygulama/acilis-2732.png iOS açılış ekranı: zemin + ortada işaret

Kullanım:  python3 tools/ikon_uret.py
(Pillow gerekir: pip install Pillow)
"""

import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

KOK = Path(__file__).resolve().parent.parent
UYGULAMA = KOK / "tools" / "uygulama"


def belirtec_oku():
    """style.css :root bloğundaki hex renkleri {ad: (r, g, b)} olarak döndürür."""
    css = (KOK / "style.css").read_text(encoding="utf-8")
    kok = css[css.index(":root"):]
    kok = kok[:kok.index("}")]
    return {ad: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
            for ad, h in re.findall(r"--([\w-]+):\s*#([0-9a-fA-F]{6})\b", kok)}


RENK = belirtec_oku()
ZEMIN_UST = RENK["surface"]
ZEMIN_ALT = RENK["bg"]
YESIL = RENK["green"]
KREM = RENK["cream"]
AMBER = RENK["amber"]
METIN = RENK["text"]
SOLUK = RENK["text-dim"]


def font_bul(adaylar):
    """İlk bulunan yazı tipi dosyası. Arial ile Liberation Sans aynı ölçülere
    sahiptir; kart macOS'ta da Linux'ta da aynı yerleşimle çıkar."""
    for yol in adaylar:
        if Path(yol).exists():
            return yol
    sys.exit("Yazı tipi bulunamadı. Şunlardan biri kurulu olmalı:\n  " + "\n  ".join(adaylar))


FONT_BOLD = font_bul([
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
])
FONT_REG = font_bul([
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
])

SS = 4  # süper örnekleme (kenarlar yumuşasın diye yüksek çöz + küçültme)


def dikey_gradyan(w, h, ust, alt):
    """Dikey iki renkli gradyan görsel."""
    taban = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        taban.putpixel((0, y), tuple(round(ust[i] + (alt[i] - ust[i]) * t) for i in range(3)))
    return taban.resize((w, h))


def isaret_ciz(d, x0, y0, boy):
    """Marka işareti: (x0, y0) köşesinden başlayan boy×boy alana üç kutu.
    Oranlar favicon.svg ile aynı (320 birimlik alanda 130'luk kutu, 95 adım)."""
    k = boy / 320
    for (x, y, renk) in [(190, 0, AMBER), (95, 95, KREM), (0, 190, YESIL)]:
        d.rounded_rectangle([x0 + x * k, y0 + y * k, x0 + (x + 130) * k, y0 + (y + 130) * k],
                            radius=26 * k, fill=renk)


def simge_ciz(boy, yuvarlak=True):
    """Kare simge. yuvarlak=True: saydam köşeli RGBA (favicon).
    yuvarlak=False: tam dolu, opak RGB (iOS köşeyi kendi maskeler)."""
    S = boy * SS
    grad = dikey_gradyan(S, S, ZEMIN_UST, ZEMIN_ALT)
    if yuvarlak:
        img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        maske = Image.new("L", (S, S), 0)
        ImageDraw.Draw(maske).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(112 * S / 512), fill=255)
        img.paste(grad, (0, 0), maske)
    else:
        img = grad
    isaret_ciz(ImageDraw.Draw(img), 96 * S / 512, 96 * S / 512, 320 * S / 512)
    return img.resize((boy, boy), Image.LANCZOS)


def acilis_ciz(boy=2732, isaret=640):
    """Açılış ekranı: düz zemin (uygulamanın zeminiyle aynı, geçiş görünmez)
    ve ortada işaret. İşaret, her ekran oranında görünen ortadaki
    ~1200 px güvenli alanın içinde kalır."""
    S = isaret * SS
    katman = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    isaret_ciz(ImageDraw.Draw(katman), 0, 0, S)
    katman = katman.resize((isaret, isaret), Image.LANCZOS)
    img = Image.new("RGB", (boy, boy), ZEMIN_ALT)
    img.paste(katman, ((boy - isaret) // 2, (boy - isaret) // 2), katman)
    return img


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
    img = dikey_gradyan(W, H, ZEMIN_UST, ZEMIN_ALT)
    d = ImageDraw.Draw(img)
    k = 2  # 1200 mantıksal → gerçek ölçek

    d.rectangle([0, 0, W, 8 * k], fill=YESIL)   # üst yeşil şerit

    f_brand = ImageFont.truetype(FONT_BOLD, 34 * k)
    f_title = ImageFont.truetype(FONT_BOLD, 96 * k)
    f_tag = ImageFont.truetype(FONT_REG, 40 * k)
    f_sub = ImageFont.truetype(FONT_REG, 30 * k)
    f_url = ImageFont.truetype(FONT_BOLD, 34 * k)

    yaz(d, (90 * k, 222 * k), "SÖZCÜK YOLU", f_brand, AMBER, spacing=7 * k)
    d.text((88 * k, 292 * k), "Sözcük Merdiveni", font=f_title, fill=METIN, anchor="lm")
    d.text((90 * k, 390 * k), "Türkçe kelime oyunu · Her gün yeni bulmaca", font=f_tag, fill=METIN, anchor="lm")
    d.text((90 * k, 445 * k), "Ücretsiz · Üyeliksiz · Mobil uyumlu", font=f_sub, fill=SOLUK, anchor="lm")
    d.text((90 * k, 553 * k), "sözcükyolu.com", font=f_url, fill=AMBER, anchor="lm")

    isaret_ciz(d, 902 * k, 150 * k, 250 * k)    # sağda marka işareti

    return img.resize((1200, 630), Image.LANCZOS)


def main():
    # Favicon PNG'leri
    simge_ciz(48).save(KOK / "favicon-48.png")
    simge_ciz(192).save(KOK / "favicon-192.png")
    simge_ciz(180).save(KOK / "apple-touch-icon.png")

    # Çok boyutlu favicon.ico (16/32/48)
    simge_ciz(64).save(KOK / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # Sosyal kart
    og_ciz().save(KOK / "og-image.png")

    # iOS uygulaması (yollar iOS deposuyla sözleşmedir; adları değiştirmeyin)
    UYGULAMA.mkdir(exist_ok=True)
    simge_ciz(1024, yuvarlak=False).save(UYGULAMA / "simge-1024.png")
    acilis_ciz().save(UYGULAMA / "acilis-2732.png")

    print("Üretildi: favicon.ico, favicon-48.png, favicon-192.png, apple-touch-icon.png, "
          "og-image.png, tools/uygulama/simge-1024.png, tools/uygulama/acilis-2732.png")


if __name__ == "__main__":
    main()
