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

Fiiller:
  Zemberek fiilleri MASTAR halinde tutar ve onlara açık bir P: etiketi
  VERMEZ (ör. "gelmek [A:Aorist_I]", "almak", "gitmek [A:Voicing]").
  -mak/-mek ile biten gerçek isimler ise açıkça etiketlidir
  (ör. "ekmek [P:Noun]", "yemek [P:Noun]", "demek [P:Adv]").
  Bu ayrımı kullanarak mastarı atıp fiil KÖKÜNÜ ekliyoruz — Türkçede kök
  zaten emir kipidir: gelmek→gel, kalmak→kal, götürmek→götür.
  Böylece "gel/kal/götür" geçerli olur, "etmek/almak" olmaz; ekmek ve
  yemek gibi isimler ise sözlükte kalır.
  (Çekimli biçimler —gitti, gidiyor, gitmiş— sözlükte hiç yoktur; Zemberek
  yalnızca kök/lemma tutar.)
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

# -mak/-mek ile bitip de mastar OLMAYAN gerçek kelimeler yalnızca bu etiketlerle
# korunur: ekmek, yemek, emek, damak, ilmek, oymak, yamak (isim); ahmak, yumak
# (sıfat). Sözlükteki tek P:Adv olan "demek" bilinçli olarak dışarıda bırakıldı —
# mastarla birebir aynı göründüğü için oyuncuyu yanıltırdı.
KORUYAN_ETIKETLER = ("P:Noun", "P:Adj")

# Türkçeye özgü büyük harf dönüşümü (i→İ, ı→I; Python'un upper()'ı bunu bilmez)
TR_BUYUT = str.maketrans("iı", "İI")

# Şapkalı (düzeltme imli) harfleri standart Türkçe harflere indirger:
# kâse→kase, âlim→alim, âdet→adet, hükûmet→hükumet. Böylece bu kelimeler,
# oyuncunun standart klavyeyle yazdığı şapkasız biçimle oynanabilir.
SAPKA_NORMAL = str.maketrans("âîûÂÎÛ", "aiuAIU")


def sozlugu_getir():
    """Önbellekte varsa oradan okur, yoksa indirir."""
    if not ONBELLEK.exists():
        print(f"İndiriliyor: {KAYNAK_URL}")
        ONBELLEK.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(KAYNAK_URL, ONBELLEK)
    return ONBELLEK.read_text(encoding="utf-8").splitlines()


def main():
    kelimeler = set()
    fiil_koku_sayisi = 0
    sapkali_sayisi = 0
    for satir in sozlugu_getir():
        satir = satir.strip()
        if not satir or satir.startswith("#"):
            continue

        # "kelime [P:Tür; A:Özellik]" → baş kelime + etiketler
        parcalar = satir.split(None, 1)
        ham = parcalar[0]
        kelime = ham.translate(SAPKA_NORMAL)           # şapkalı → standart harf
        if kelime != ham:
            sapkali_sayisi += 1
        etiket = parcalar[1] if len(parcalar) > 1 else ""

        if any(e in etiket for e in ELENEN_ETIKETLER):
            continue
        if kelime[0].isupper():                 # özel ad güvenlik ağı
            continue

        # Mastar → kök (emir kipi). İsim/sıfat etiketi taşıyanlar gerçek
        # kelimedir (ekmek, yemek, emek, ahmak), onlara dokunmuyoruz.
        fiil_mi = (kelime.endswith(("mak", "mek"))
                   and not any(e in etiket for e in KORUYAN_ETIKETLER))
        if fiil_mi:
            kelime = kelime[:-3]                # gelmek → gel, götürmek → götür
            fiil_koku_sayisi += 1

        if len(kelime) not in UZUNLUKLAR:       # kısalma sonrası ölçülür
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
    print(f"({fiil_koku_sayisi} mastar köke indirildi; "
          f"{sapkali_sayisi} şapkalı kelime normalize edildi)")


if __name__ == "__main__":
    main()
