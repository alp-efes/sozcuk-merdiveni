#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sözcük Merdiveni — words.json üretici
--------------------------------------
Kaynaklar:
  tools/kelimeler.txt          Elle onaylı, yaygın kelimeler (bulmaca uçları
                               yalnızca buradan seçilir)
  tools/otomatik_kelimeler.txt Zemberek'ten süzülen geniş sözlük (opsiyonel;
                               üretmek için: python3 tools/sozluk_indir.py)
  tools/yasakli.txt            Oyuna alınmayacak kelimeler (opsiyonel)

İşleyiş:
  1. Doğrulama sözlüğü = (elle ∪ otomatik) − yasaklı
  2. "1 harf farkı" grafiği tüm sözlük üzerinde kurulur — oyuncu çözüm
     yolunda sözlükteki HER kelimeyi kullanabilir,
  3. Bulmaca uçları (başlangıç/hedef) yalnızca elle onaylı kelimelerden
     seçilir — kimseden bilmediği bir kelimeye "ulaşması" istenmez,
  4. BFS ile en kısa çözümü 2-5 adım olan çiftler örneklenir; üretilen
     her bulmacanın ÇÖZÜLEBİLİR olduğu garantidir.

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
MAX_BULMACA = 300           # Uzunluk başına en fazla bulmaca sayısı
TOHUM = 42                  # Tekrarlanabilir üretim için sabit seed

ARACLAR = Path(__file__).resolve().parent
KOK = ARACLAR.parent
ELLE = ARACLAR / "kelimeler.txt"
OTOMATIK = ARACLAR / "otomatik_kelimeler.txt"
YASAKLI = ARACLAR / "yasakli.txt"
HEDEF = KOK / "words.json"


def dosya_oku(yol, zorunlu=False):
    """Bir kelime dosyasını okur; geçersiz satırı uyarıp atlar."""
    if not yol.exists():
        if zorunlu:
            sys.exit(f"HATA: {yol} bulunamadı")
        return set()
    kelimeler = set()
    for satir_no, satir in enumerate(yol.read_text(encoding="utf-8").splitlines(), 1):
        kelime = satir.strip()
        if not kelime or kelime.startswith("#"):
            continue
        if not set(kelime) <= ALFABE or len(kelime) not in UZUNLUKLAR:
            print(f"  uyarı: {yol.name}:{satir_no} '{kelime}' atlandı (alfabe/uzunluk)")
            continue
        kelimeler.add(kelime)
    return kelimeler


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


def bulmaca_uret(uclar, komsular, rasgele):
    """Her iki ucu da onaylı listeden olan, 2-5 adımlık çiftleri örnekler."""
    adaylar = []
    for kaynak in uclar:
        for hedef, adim in bfs_mesafeler(kaynak, komsular).items():
            if hedef in uclar and MIN_ADIM <= adim <= MAX_ADIM and kaynak < hedef:
                adaylar.append((kaynak, hedef, adim))

    rasgele.shuffle(adaylar)
    secilen = adaylar[:MAX_BULMACA]
    # Yön de rastgele olsun (A→B yerine bazen B→A)
    return [([b, a, d] if rasgele.random() < 0.5 else [a, b, d]) for a, b, d in secilen]


def main():
    rasgele = random.Random(TOHUM)

    elle = dosya_oku(ELLE, zorunlu=True)
    otomatik = dosya_oku(OTOMATIK)
    yasakli = dosya_oku(YASAKLI)
    if not otomatik:
        print("not: otomatik_kelimeler.txt yok — yalnızca elle liste kullanılıyor "
              "(üretmek için: python3 tools/sozluk_indir.py)")

    tum = (elle | otomatik) - yasakli

    cikti = {}
    for boy in UZUNLUKLAR:
        kelimeler = sorted(k for k in tum if len(k) == boy)
        uclar = {k for k in elle - yasakli if len(k) == boy}
        komsular = komsuluk_kur(kelimeler)
        bulmacalar = bulmaca_uret(uclar, komsular, rasgele)
        if not bulmacalar:
            sys.exit(f"HATA: {boy} harfli grupta hiç çözülebilir bulmaca bulunamadı")
        cikti[str(boy)] = {"words": kelimeler, "puzzles": bulmacalar}

        adimlar = [b[2] for b in bulmacalar]
        print(f"{boy} harfli: {len(kelimeler)} kelime ({len(uclar)} onaylı uç), "
              f"{len(bulmacalar)} bulmaca "
              f"(adım: min={min(adimlar)} / ort={sum(adimlar)/len(adimlar):.1f} / max={max(adimlar)})")

    HEDEF.write_text(json.dumps(cikti, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nYazıldı: {HEDEF}")


if __name__ == "__main__":
    main()
