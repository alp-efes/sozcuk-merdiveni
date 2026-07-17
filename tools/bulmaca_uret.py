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
  4. Her aday için BFS iki değeri verir: en kısa ADIM sayısı ve en kısa
     YOL sayısı (kaç farklı en-kısa kombinasyonla çözülebildiği). Bu iki
     değişkenden ZORLUK (kolay/orta/zor) hesaplanır.
  5. Üretilen her bulmacanın ÇÖZÜLEBİLİR olduğu garantidir.

Çıktı biçimi:  puzzles = [[başlangıç, hedef, adım, zorluk], ...]

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
MIN_ADIM, MAX_ADIM = 2, 6   # Bulmaca adım aralığı (en kısa çözüm adımı)
ZORLUKLAR = ("kolay", "orta", "zor")
BULMACA_BASINA_ZORLUK = 120 # Her (uzunluk, zorluk) kutusunda en fazla bulmaca
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


def bfs_mesafe_ve_yol(kaynak, komsular):
    """Her hedefe en kısa ADIM sayısı ve en kısa YOL adedini birlikte döndürür.

    Yol sayımı klasik BFS ile: v, u'nun bir seviye üstündeyse v'nin yol sayısına
    u'nunki eklenir. Grafik ağırlıksız olduğundan kenarlar hep ardışık seviyeler
    arasındadır; bu yüzden sayım doğrudur.
    """
    mesafe = {kaynak: 0}
    yol = {kaynak: 1}
    kuyruk = deque([kaynak])
    while kuyruk:
        u = kuyruk.popleft()
        for v in komsular[u]:
            if v not in mesafe:
                mesafe[v] = mesafe[u] + 1
                yol[v] = yol[u]
                kuyruk.append(v)
            elif mesafe[v] == mesafe[u] + 1:
                yol[v] += yol[u]
    return mesafe, yol


def zorluk_hesapla(adim, yol_sayisi):
    """Adım (uzunluk) ve çözüm yolu sayısına (esneklik) göre zorluk etiketi.

    Az adım → kolay (2 adım her zaman; 3 adım da çok yolluysa).
    Çok adım / tek yol → zor (5+ adım, ya da 4 adım ama tek çözüm yolu).
    Arası → orta.

    Adım sayısı baskın değişkendir; yol sayısı (esneklik) sınır durumlarını
    ayırır: aynı adımda çok yol daha kolay, tek yol daha zordur.
    """
    if adim <= 2 or (adim == 3 and yol_sayisi >= 3):
        return "kolay"
    if adim >= 5 or (adim == 4 and yol_sayisi <= 1):
        return "zor"
    return "orta"


def bulmaca_uret(uclar, komsular, rasgele):
    """Her iki ucu da onaylı listeden olan çiftleri (uzunluk, zorluk) kutularına
    böler ve her kutudan en fazla BULMACA_BASINA_ZORLUK adet örnekler."""
    kovalar = {z: [] for z in ZORLUKLAR}
    for kaynak in uclar:
        mesafe, yol = bfs_mesafe_ve_yol(kaynak, komsular)
        for hedef, adim in mesafe.items():
            if hedef in uclar and MIN_ADIM <= adim <= MAX_ADIM and kaynak < hedef:
                z = zorluk_hesapla(adim, yol[hedef])
                kovalar[z].append((kaynak, hedef, adim, z))

    secilen = []
    for z in ZORLUKLAR:
        rasgele.shuffle(kovalar[z])
        secilen.extend(kovalar[z][:BULMACA_BASINA_ZORLUK])

    rasgele.shuffle(secilen)
    # Yön de rastgele olsun (A→B yerine bazen B→A)
    return [([b, a, d, z] if rasgele.random() < 0.5 else [a, b, d, z])
            for a, b, d, z in secilen]


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

        sayim = {z: sum(1 for b in bulmacalar if b[3] == z) for z in ZORLUKLAR}
        eksik = [z for z, n in sayim.items() if n == 0]
        if eksik:
            print(f"  UYARI: {boy} harfli grupta şu zorluklar boş: {eksik}")
        print(f"{boy} harfli: {len(kelimeler)} kelime ({len(uclar)} onaylı uç), "
              f"{len(bulmacalar)} bulmaca "
              f"(kolay={sayim['kolay']} / orta={sayim['orta']} / zor={sayim['zor']})")

    HEDEF.write_text(json.dumps(cikti, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nYazıldı: {HEDEF}")


if __name__ == "__main__":
    main()
