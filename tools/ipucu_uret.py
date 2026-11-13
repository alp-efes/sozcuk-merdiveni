#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sözcük Merdiveni — ipuclari.json üretici
-----------------------------------------
Kaynak: tools/ipuclari.tsv (elle düzeltilebilir), satır başına:
    KELİME<TAB>cümle<TAB>TDK madde_id

Cümle, ipucunun gösterdiği sonraki kelimenin anlamını kısaca tarif eder. Bizim
yazdığımız bir açıklamadır (TDK metni kopyalanmaz); doğruluğu TDK Güncel
Türkçe Sözlük'teki o maddenin bir anlamıyla örtüşmesine dayanır. madde_id
yalnızca kaynağı gösterir, yayına çıkmaz.

Denetimler (biri bozuksa dosya yazılmaz): kelime sözlükte (words.json), yasaklı
değil, tekrar yok; cümle boş değil, büyük harfle başlar, noktayla biter, en çok
110 karakter, kelimenin kendisi ya da onunla başlayan bir sözcük (kökü) geçmez.

Çıktı: ipuclari.json → { "KELİME": "cümle", ... } (anahtarlar sıralı).
words.json'a dokunmaz; günün bulmacası değişmez.

Kullanım:  python3 tools/ipucu_uret.py
"""

import json
import re
import sys
from pathlib import Path

ARACLAR = Path(__file__).resolve().parent
KOK = ARACLAR.parent
KAYNAK = ARACLAR / "ipuclari.tsv"
HEDEF = KOK / "ipuclari.json"
EN_UZUN = 110


def kucuk(metin):
    """Türkçe küçük harf (I → ı, İ → i)."""
    return metin.replace("I", "ı").replace("İ", "i").lower()


def cumle_hatasi(kelime, cumle):
    """Cümledeki sorun (yoksa None). test_veri.py de bunu kullanır."""
    if not cumle or cumle != cumle.strip():
        return "boş ya da baş/sonda boşluk"
    if len(cumle) > EN_UZUN:
        return f"{len(cumle)} karakter (en çok {EN_UZUN})"
    if not cumle[0].isupper() or not cumle.endswith("."):
        return "büyük harfle başlamalı, noktayla bitmeli"
    sozcukler = re.findall(r"[^\W\d_]+", kucuk(cumle))
    if any(s.startswith(kucuk(kelime)) for s in sozcukler):
        return "kelimenin kendisi ya da kökü geçiyor"
    return None


def oku(sozluk, yasakli):
    """TSV'yi okur; (ipuçları, hatalar) döndürür."""
    ipuclari, hatalar = {}, []
    for no, satir in enumerate(KAYNAK.read_text(encoding="utf-8").splitlines(), 1):
        if not satir.strip() or satir.startswith("#"):
            continue
        parca = satir.split("\t")
        if len(parca) != 3:
            hatalar.append(f"{no}. satır: 3 sütun olmalı (kelime, cümle, madde_id)")
            continue
        kelime, cumle, madde = parca
        if kelime not in sozluk:
            hatalar.append(f"{no}. satır: {kelime} sözlükte yok")
        elif kelime in yasakli:
            hatalar.append(f"{no}. satır: {kelime} yasaklı")
        elif kelime in ipuclari:
            hatalar.append(f"{no}. satır: {kelime} iki kez yazılmış")
        if not madde.isdigit():
            hatalar.append(f"{no}. satır: TDK madde_id sayı olmalı: {madde!r}")
        sorun = cumle_hatasi(kelime, cumle)
        if sorun:
            hatalar.append(f"{no}. satır ({kelime}): {sorun}")
        ipuclari[kelime] = cumle
    return dict(sorted(ipuclari.items())), hatalar


def kelime_kumesi(yol):
    if not yol.exists():
        return set()
    return {s.strip() for s in yol.read_text(encoding="utf-8").splitlines()
            if s.strip() and not s.startswith("#")}


def main():
    db = json.loads((KOK / "words.json").read_text(encoding="utf-8"))
    sozluk = {k for boy in db.values() for k in boy["words"]}
    ipuclari, hatalar = oku(sozluk, kelime_kumesi(ARACLAR / "yasakli.txt"))
    if hatalar:
        print("\n".join(hatalar))
        sys.exit(f"HATA: {len(hatalar)} sorun; ipuclari.json yazılmadı")
    HEDEF.write_text(json.dumps(ipuclari, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"ipuclari.json: {len(ipuclari)} kelime, {HEDEF.stat().st_size} bayt")


if __name__ == "__main__":
    main()
