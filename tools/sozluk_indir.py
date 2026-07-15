#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sözcük Merdiveni — açık kaynak sözlük içe aktarıcı
---------------------------------------------------
Zemberek-NLP projesinin TDK temelli ana sözlüğünü (Apache 2.0 lisanslı)
indirir, oyuna uygun kelimeleri süzer ve tools/otomatik_kelimeler.txt
dosyasına yazar. Ardından bulmaca üretimi için şunu çalıştırın:

    python3 tools/bulmaca_uret.py

Filtreler:
  - Yalnızca 3/4/5 harfli kelimeler
  - Yalnızca 29 harfli Türk alfabesi (â, î, û gibi şapkalılar elenir —
    oyun klavyesinde bu harfler yok)
  - Noktalama (P:Punc), ikileme kökleri (P:Dup), özel adlar (Prop)
    ve kısaltmalar (Abbrv) elenir
"""

import sys
import urllib.request
from pathlib import Path

KAYNAK_URL = ("https://raw.githubusercontent.com/ahmetaa/zemberek-nlp/"
              "master/morphology/src/main/resources/tr/master-dictionary.dict")
ARACLAR = Path(__file__).resolve().parent
ONBELLEK = ARACLAR / ".cache" / "master-dictionary.dict"
CIKTI = ARACLAR / "otomatik_kelimeler.txt"

KUCUK_ALFABE = set("abcçdefgğhıijklmnoöprsştuüvyz")
UZUNLUKLAR = (3, 4, 5)
# Bu etiketlerden birini taşıyan satırlar oyuna alınmaz
ELENEN_ETIKETLER = ("P:Punc", "P:Dup", "Prop", "Abbrv")

# Türkçeye özgü büyük harf dönüşümü (i→İ, ı→I; Python'un upper()'ı bunu bilmez)
TR_BUYUT = str.maketrans("iı", "İI")


def sozlugu_getir():
    """Önbellekte varsa oradan okur, yoksa indirir."""
    if not ONBELLEK.exists():
        print(f"İndiriliyor: {KAYNAK_URL}")
        ONBELLEK.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(KAYNAK_URL, ONBELLEK)
    return ONBELLEK.read_text(encoding="utf-8").splitlines()


def main():
    kelimeler = set()
    for satir in sozlugu_getir():
        satir = satir.strip()
        if not satir or satir.startswith("#"):
            continue

        # "kelime [P:Tür; A:Özellik]" → baş kelime + etiketler
        parcalar = satir.split(None, 1)
        kelime = parcalar[0]
        etiket = parcalar[1] if len(parcalar) > 1 else ""

        if any(e in etiket for e in ELENEN_ETIKETLER):
            continue
        if kelime[0].isupper():                 # özel ad güvenlik ağı
            continue
        if len(kelime) not in UZUNLUKLAR:
            continue
        if not set(kelime) <= KUCUK_ALFABE:     # şapkalı/yabancı harf eler
            continue

        kelimeler.add(kelime.translate(TR_BUYUT).upper())

    if len(kelimeler) < 500:
        sys.exit(f"HATA: yalnızca {len(kelimeler)} kelime süzüldü — kaynak format değişmiş olabilir")

    baslik = (
        "# BU DOSYA OTOMATİK ÜRETİLİR — elle düzenlemeyin!\n"
        "# Kaynak: Zemberek-NLP master-dictionary (Apache 2.0)\n"
        "# Yeniden üretmek için: python3 tools/sozluk_indir.py\n"
        "# Elle kelime eklemek için tools/kelimeler.txt kullanın.\n"
    )
    CIKTI.write_text(baslik + "\n".join(sorted(kelimeler)) + "\n", encoding="utf-8")

    boylar = {n: sum(1 for k in kelimeler if len(k) == n) for n in UZUNLUKLAR}
    print(f"Yazıldı: {CIKTI}")
    print(f"Toplam {len(kelimeler)} kelime — " +
          ", ".join(f"{n} harfli: {boylar[n]}" for n in UZUNLUKLAR))


if __name__ == "__main__":
    main()
