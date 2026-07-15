#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sözcük Merdiveni — words.json üretici
--------------------------------------
tools/kelimeler.txt dosyasındaki kelimelerden:
  1. Uzunluğa göre (3/4/5) sözlükleri ayırır,
  2. "1 harf farkı" grafiğini kurar,
  3. BFS ile ÇÖZÜLEBİLİRLİĞİ GARANTİ bulmaca çiftleri üretir
     (en kısa çözüm 2-5 adım arasında olanlar seçilir),
  4. Sonucu proje kökündeki words.json dosyasına yazar.

Kullanım:  python3 tools/bulmaca_uret.py
"""

import json
import random
import sys
from collections import defaultdict, deque
from pathlib import Path

# Türk alfabesi (29 harf) — doğrulama için
ALFABE = set("ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ")
UZUNLUKLAR = (3, 4, 5)      # Desteklenen kelime boyları
MIN_ADIM, MAX_ADIM = 2, 5   # Bulmaca zorluk aralığı (en kısa çözüm adımı)
MAX_BULMACA = 200           # Uzunluk başına en fazla bulmaca sayısı
TOHUM = 42                  # Tekrarlanabilir üretim için sabit seed

KOK = Path(__file__).resolve().parent.parent
KAYNAK = Path(__file__).resolve().parent / "kelimeler.txt"
HEDEF = KOK / "words.json"


def kelimeleri_oku():
    """Listeyi okur, doğrular, uzunluğa göre gruplar."""
    gruplar = defaultdict(list)
    gorulen = set()
    for satir_no, satir in enumerate(KAYNAK.read_text(encoding="utf-8").splitlines(), 1):
        kelime = satir.strip()
        if not kelime or kelime.startswith("#"):
            continue
        if not set(kelime) <= ALFABE:
            sys.exit(f"HATA (satır {satir_no}): '{kelime}' Türk alfabesi dışında karakter içeriyor")
        if len(kelime) not in UZUNLUKLAR:
            sys.exit(f"HATA (satır {satir_no}): '{kelime}' {len(kelime)} harfli — sadece {UZUNLUKLAR} destekleniyor")
        if kelime in gorulen:
            print(f"  uyarı: '{kelime}' birden fazla kez listede, tekilleştirildi")
            continue
        gorulen.add(kelime)
        gruplar[len(kelime)].append(kelime)
    return gruplar


def komsuluk_kur(kelimeler):
    """Aralarında tam 1 harf fark olan kelimeleri eşler (joker desenli kovalama)."""
    desen_kovasi = defaultdict(list)  # "K_L" -> [KEL, KIL, KOL, KUL, KÜL]
    for k in kelimeler:
        for i in range(len(k)):
            desen_kovasi[k[:i] + "_" + k[i + 1:]].append(k)

    komsular = defaultdict(set)
    for kova in desen_kovasi.values():
        for a in kova:
            for b in kova:
                if a != b:
                    komsular[a].add(b)
    return komsular


def bfs_mesafeler(kaynak, komsular):
    """Kaynaktan erişilebilen tüm kelimelere en kısa adım sayısı."""
    mesafe = {kaynak: 0}
    kuyruk = deque([kaynak])
    while kuyruk:
        simdiki = kuyruk.popleft()
        for komsu in komsular[simdiki]:
            if komsu not in mesafe:
                mesafe[komsu] = mesafe[simdiki] + 1
                kuyruk.append(komsu)
    return mesafe


def bulmaca_uret(kelimeler, komsular, rasgele):
    """MIN_ADIM..MAX_ADIM aralığında çözümü olan tüm çiftleri toplar, örnekler."""
    adaylar = []
    for kaynak in kelimeler:
        for hedef, adim in bfs_mesafeler(kaynak, komsular).items():
            if MIN_ADIM <= adim <= MAX_ADIM and kaynak < hedef:  # çift tekrarını önle
                adaylar.append((kaynak, hedef, adim))

    rasgele.shuffle(adaylar)
    secilen = adaylar[:MAX_BULMACA]
    # Yön de rastgele olsun (A→B yerine bazen B→A)
    return [([b, a, d] if rasgele.random() < 0.5 else [a, b, d]) for a, b, d in secilen]


def main():
    rasgele = random.Random(TOHUM)
    gruplar = kelimeleri_oku()

    cikti = {}
    for boy in UZUNLUKLAR:
        kelimeler = sorted(gruplar[boy])
        komsular = komsuluk_kur(kelimeler)
        bulmacalar = bulmaca_uret(kelimeler, komsular, rasgele)
        if not bulmacalar:
            sys.exit(f"HATA: {boy} harfli grupta hiç çözülebilir bulmaca bulunamadı")
        cikti[str(boy)] = {"words": kelimeler, "puzzles": bulmacalar}

        bagli = sum(1 for k in kelimeler if komsular[k])
        adimlar = [b[2] for b in bulmacalar]
        print(f"{boy} harfli: {len(kelimeler)} kelime "
              f"({bagli} tanesinin komşusu var), {len(bulmacalar)} bulmaca "
              f"(adım dağılımı min={min(adimlar)} / ort={sum(adimlar)/len(adimlar):.1f} / max={max(adimlar)})")

    HEDEF.write_text(json.dumps(cikti, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nYazıldı: {HEDEF}")


if __name__ == "__main__":
    main()
