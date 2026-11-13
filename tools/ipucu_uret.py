#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sözcük Merdiveni — ipuclari.json üretici
-----------------------------------------
Kaynak: tools/ipuclari.tsv (elle düzeltilebilir), satır başına:
    KELİME<TAB>cümle

Cümle, ipucunun gösterdiği sonraki kelimenin anlamını kısaca tarif eder. Bizim
yazdığımız bir açıklamadır; anlamı TDK Güncel Türkçe Sözlük ile karşılaştırılarak
doğrulanır, TDK metni kopyalanmaz.

Denetimler (biri bozuksa dosya yazılmaz): kelime sözlükte (words.json), yasaklı
değil, tekrar yok; cümle boş değil, büyük harfle başlar, noktayla biter, en çok
110 karakter, kelimenin kendisi ya da onunla başlayan bir sözcük (kökü) geçmez.

TDK benzerlik denetimi (yalnızca yerel önbellek verilirse): cümle, kelimenin ve
mastarının (-mak/-mek) TDK anlamlarının hiçbirine karakter benzerliği (difflib)
bakımından ESIK_BENZERLIK ya da üstünde yakın olamaz; yalnızca başka maddeye
gönderen ("►") anlamlar hariç. Önbellek depoya girmez: TDK GTS yanıtları,
<dizin>/<küçük harfli sorgu>.json (ör. bal.json, gelmek.json).

Çıktı: ipuclari.json → { "KELİME": "cümle", ... } (anahtarlar sıralı).
words.json'a dokunmaz; günün bulmacası değişmez.

Kullanım:  python3 tools/ipucu_uret.py [--tdk ÖNBELLEK_DİZİNİ]
"""

import difflib
import json
import re
import sys
from pathlib import Path

ARACLAR = Path(__file__).resolve().parent
KOK = ARACLAR.parent
KAYNAK = ARACLAR / "ipuclari.tsv"
HEDEF = KOK / "ipuclari.json"
EN_UZUN = 110
ESIK_BENZERLIK = 0.8


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


def tdk_anlamlari(kelime, onbellek):
    """Önbellekteki TDK anlamları (kelime ve mastarı; gönderme "►" hariç)."""
    k = kucuk(kelime)
    unluler = [h for h in k if h in "aeıioöuü"]
    mastar = k + ("mak" if unluler and unluler[-1] in "aıou" else "mek")
    anlamlar = []
    for sorgu in (k, mastar):
        yol = Path(onbellek) / (sorgu + ".json")
        if not yol.exists():
            continue
        try:
            veri = json.loads(yol.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if not isinstance(veri, list):
            continue                      # {"error": "Sonuç bulunamadı"}
        for madde in veri:
            for a in madde.get("anlamlarListe") or []:
                metin = (a.get("anlam") or "").strip()
                if metin and not metin.startswith("►"):
                    anlamlar.append(metin)
    return anlamlar


def benzerlik(kelime, cumle, onbellek):
    """Cümlenin en yakın TDK anlamına karakter benzerliği (0–1) ve o anlam."""
    en = (0.0, "")
    for anlam in tdk_anlamlari(kelime, onbellek):
        oran = difflib.SequenceMatcher(None, kucuk(cumle), kucuk(anlam)).ratio()
        if oran > en[0]:
            en = (oran, anlam)
    return en


def oku(sozluk, yasakli, onbellek=None):
    """TSV'yi okur; (ipuçları, hatalar) döndürür."""
    ipuclari, hatalar = {}, []
    for no, satir in enumerate(KAYNAK.read_text(encoding="utf-8").splitlines(), 1):
        if not satir.strip() or satir.startswith("#"):
            continue
        parca = satir.split("\t")
        if len(parca) != 2:
            hatalar.append(f"{no}. satır: 2 sütun olmalı (kelime, cümle)")
            continue
        kelime, cumle = parca
        if kelime not in sozluk:
            hatalar.append(f"{no}. satır: {kelime} sözlükte yok")
        elif kelime in yasakli:
            hatalar.append(f"{no}. satır: {kelime} yasaklı")
        elif kelime in ipuclari:
            hatalar.append(f"{no}. satır: {kelime} iki kez yazılmış")
        sorun = cumle_hatasi(kelime, cumle)
        if sorun:
            hatalar.append(f"{no}. satır ({kelime}): {sorun}")
        if onbellek:
            oran, anlam = benzerlik(kelime, cumle, onbellek)
            if oran >= ESIK_BENZERLIK:
                hatalar.append(f"{no}. satır ({kelime}): TDK tanımına çok yakın ({oran:.2f}): {anlam}")
        ipuclari[kelime] = cumle
    return dict(sorted(ipuclari.items())), hatalar


def kelime_kumesi(yol):
    if not yol.exists():
        return set()
    return {s.strip() for s in yol.read_text(encoding="utf-8").splitlines()
            if s.strip() and not s.startswith("#")}


def main():
    onbellek = None
    if "--tdk" in sys.argv:
        i = sys.argv.index("--tdk")
        if i + 1 >= len(sys.argv) or not Path(sys.argv[i + 1]).is_dir():
            sys.exit("HATA: --tdk ardından TDK önbellek dizini verilmeli")
        onbellek = sys.argv[i + 1]
    db = json.loads((KOK / "words.json").read_text(encoding="utf-8"))
    sozluk = {k for boy in db.values() for k in boy["words"]}
    ipuclari, hatalar = oku(sozluk, kelime_kumesi(ARACLAR / "yasakli.txt"), onbellek)
    if hatalar:
        print("\n".join(hatalar))
        sys.exit(f"HATA: {len(hatalar)} sorun; ipuclari.json yazılmadı")
    HEDEF.write_text(json.dumps(ipuclari, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    denetim = "TDK benzerlik denetimiyle" if onbellek else "TDK benzerlik denetimi yapılmadan (--tdk yok)"
    print(f"ipuclari.json: {len(ipuclari)} kelime, {HEDEF.stat().st_size} bayt; {denetim}")


if __name__ == "__main__":
    main()
