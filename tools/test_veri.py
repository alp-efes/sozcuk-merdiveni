#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sözcük Merdiveni — veri ve site bütünlüğü testleri
---------------------------------------------------
Bağımlılık yok; yalnızca standart kütüphane. Yayına giden dosyaları okur,
hiçbirini değiştirmez.

Denetlenenler:
  1. words.json yapısı, alfabe, sıralama, şapkalı harf sızıntısı
  2. Yasaklı kelimeler sözlükte yok
  3. Bulmaca uçları elle onaylı listeden (tools/kelimeler.txt)
  4. Her bulmaca ÇÖZÜLEBİLİR ve yazan adım sayısı gerçekten en kısa yol
  5. Zorluk etiketi üreticideki kuralla tutarlı; dokuz kutunun hepsi dolu
  6. Örnek kelimeler (KASE/GEL var, ETMEK/ALMAK yok)
  7. Site dosyaları: yerel bağlantılar var, makine alanlarında punycode,
     .assetsignore kaynak dosyaları dışarıda tutuyor
  8. Güvenlik: dış betikler yalnızca izinli adreslerden, tehlikeli DOM
     kalıpları yok, depoda gizli anahtar yok

Kullanım:  python3 tools/test_veri.py
Çıkış kodu: 0 = hepsi geçti, 1 = en az bir hata
"""

import json
import re
import sys
from collections import defaultdict, deque
from pathlib import Path

ARACLAR = Path(__file__).resolve().parent
KOK = ARACLAR.parent

ALFABE = set("ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ")
UZUNLUKLAR = ("3", "4", "5")
ZORLUKLAR = ("kolay", "orta", "zor")
MIN_ADIM, MAX_ADIM = 2, 6
PUNYCODE_ALAN = "xn--szckyolu-n4a6d.com"

# Betik/modül yüklenebilecek dış adresler. Genişletmek güvenlik incelemesi ister.
IZINLI_BETIK_ALANLARI = {"www.gstatic.com", "pagead2.googlesyndication.com"}
SITE_DOSYALARI = ("index.html", "gizlilik.html", "app.js")
# Gerçek gizli bilgi biçimleri. Firebase web apiKey (AIza…) herkese açık
# olacak şekilde tasarlandığı için listede yok.
GIZLI_KALIPLAR = {
    "özel anahtar": r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "GitHub token": r"\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{40,}",
    "Anthropic anahtarı": r"\bsk-ant-[A-Za-z0-9_-]{20,}",
    "AWS anahtarı": r"\bAKIA[0-9A-Z]{16}\b",
    "Slack token": r"\bxox[abprs]-[A-Za-z0-9-]{10,}",
    "Cloudflare API token": r"(?i)cloudflare[^\n]{0,20}token[^\n]{0,5}[=:][^\n]{0,5}[A-Za-z0-9_-]{40}",
}

hatalar = []
gecen = 0


def denetle(kosul, mesaj):
    """Koşul sağlanmıyorsa hatayı biriktirir; test ilk hatada durmaz."""
    global gecen
    if kosul:
        gecen += 1
    else:
        hatalar.append(mesaj)


def liste_oku(yol):
    if not yol.exists():
        return set()
    return {s.strip() for s in yol.read_text(encoding="utf-8").splitlines()
            if s.strip() and not s.startswith("#")}


def komsuluk_kur(kelimeler):
    kova = defaultdict(list)
    for k in kelimeler:
        for i in range(len(k)):
            kova[k[:i] + "_" + k[i + 1:]].append(k)
    komsular = defaultdict(set)
    for grup in kova.values():
        for a in grup:
            for b in grup:
                if a != b:
                    komsular[a].add(b)
    return komsular


def bfs(kaynak, komsular):
    """En kısa adım sayısı ve en kısa yol adedi (üreticiyle aynı sayım)."""
    mesafe, yol = {kaynak: 0}, {kaynak: 1}
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
    """tools/bulmaca_uret.py içindeki kuralın kopyası — ikisi birlikte değişmeli."""
    if adim <= 2 or (adim == 3 and yol_sayisi >= 3):
        return "kolay"
    if adim >= 5 or (adim == 4 and yol_sayisi <= 1):
        return "zor"
    return "orta"


def veri_testleri():
    yol = KOK / "words.json"
    denetle(yol.exists(), "words.json yok")
    if not yol.exists():
        return
    db = json.loads(yol.read_text(encoding="utf-8"))
    denetle(tuple(sorted(db)) == UZUNLUKLAR, f"words.json anahtarları {sorted(db)}, beklenen {UZUNLUKLAR}")

    onayli = liste_oku(ARACLAR / "kelimeler.txt")
    yasakli = liste_oku(ARACLAR / "yasakli.txt")
    denetle(len(onayli) > 0, "tools/kelimeler.txt boş ya da yok")

    for boy in UZUNLUKLAR:
        grup = db.get(boy, {})
        kelimeler = grup.get("words", [])
        bulmacalar = grup.get("puzzles", [])
        kume = set(kelimeler)
        n = int(boy)

        denetle(len(kelimeler) > 0, f"{boy}: kelime listesi boş")
        denetle(len(kume) == len(kelimeler), f"{boy}: yinelenen kelime var")
        denetle(kelimeler == sorted(kelimeler), f"{boy}: kelime listesi sıralı değil")
        bozuk = [k for k in kelimeler if len(k) != n or not set(k) <= ALFABE]
        denetle(not bozuk, f"{boy}: alfabe/uzunluk dışı kelimeler: {bozuk[:5]}")
        sizinti = sorted(kume & yasakli)
        denetle(not sizinti, f"{boy}: yasaklı kelime sözlükte: {sizinti[:5]}")

        denetle(len(bulmacalar) > 0, f"{boy}: bulmaca yok")
        sayim = {z: 0 for z in ZORLUKLAR}
        komsular = komsuluk_kur(kelimeler)
        onbellek = {}
        for b in bulmacalar:
            if len(b) != 4:
                hatalar.append(f"{boy}: bulmaca biçimi bozuk: {b}")
                continue
            bas, hedef, adim, zorluk = b
            ad = f"{bas}→{hedef}"
            denetle(bas in kume and hedef in kume, f"{ad}: uçlar sözlükte değil")
            denetle(bas in onayli and hedef in onayli, f"{ad}: uçlar onaylı listede değil")
            denetle(bas != hedef, f"{ad}: başlangıç ile hedef aynı")
            denetle(zorluk in ZORLUKLAR, f"{ad}: bilinmeyen zorluk '{zorluk}'")
            denetle(MIN_ADIM <= adim <= MAX_ADIM, f"{ad}: adım {adim} aralık dışında")
            if bas not in onbellek:
                onbellek[bas] = bfs(bas, komsular)
            mesafe, yol_sayisi = onbellek[bas]
            denetle(hedef in mesafe, f"{ad}: ÇÖZÜLEMİYOR")
            if hedef in mesafe:
                denetle(mesafe[hedef] == adim, f"{ad}: adım {adim} yazıyor, en kısa yol {mesafe[hedef]}")
                beklenen = zorluk_hesapla(mesafe[hedef], yol_sayisi[hedef])
                denetle(zorluk == beklenen, f"{ad}: zorluk '{zorluk}', kurala göre '{beklenen}'")
            if zorluk in sayim:
                sayim[zorluk] += 1
        bos = [z for z, s in sayim.items() if s == 0]
        denetle(not bos, f"{boy}: boş zorluk kutuları: {bos}")

    tum = set().union(*(set(db[b]["words"]) for b in UZUNLUKLAR if b in db))
    for k in ("KASE", "GEL", "GÖTÜR"):
        denetle(k in tum, f"örnek kontrol: {k} sözlükte olmalı")
    for k in ("ETMEK", "ALMAK", "DEMEK"):
        denetle(k not in tum, f"örnek kontrol: {k} sözlükte olmamalı (mastar)")


def site_testleri():
    index = (KOK / "index.html").read_text(encoding="utf-8")

    # Yerel bağlantıların hepsi depoda var mı (http, mailto, # ve data: hariç)
    for ad in ("index.html", "gizlilik.html"):
        metin = (KOK / ad).read_text(encoding="utf-8")
        for hedef in re.findall(r'(?:href|src)="([^"#?]+)', metin):
            if re.match(r"^(https?:|mailto:|data:|//)", hedef):
                continue
            dosya = KOK / hedef.lstrip("/")
            denetle(dosya.exists() or hedef in ("/", "./"), f"{ad}: yerel bağlantı kırık: {hedef}")

    # Makine alanlarında punycode (CLAUDE.md → IDN tuzağı)
    kanonik = re.search(r'<link rel="canonical" href="([^"]+)"', index)
    denetle(bool(kanonik) and PUNYCODE_ALAN in kanonik.group(1), "index.html: canonical punycode değil")
    site_haritasi = (KOK / "sitemap.xml").read_text(encoding="utf-8")
    adresler = re.findall(r"<loc>([^<]+)</loc>", site_haritasi)
    denetle(bool(adresler) and all(a.isascii() and PUNYCODE_ALAN in a for a in adresler),
            "sitemap.xml: adresler punycode olmalı")
    for ad in ("index.html", "gizlilik.html"):
        metin = (KOK / ad).read_text(encoding="utf-8")
        for posta in re.findall(r'href="mailto:([^"]+)"', metin):
            denetle(posta.isascii(), f"{ad}: mailto punycode değil: {posta}")

    # Kaynak ve ekip dosyaları yayına çıkmamalı
    yoksay = (KOK / ".assetsignore").read_text(encoding="utf-8").split()
    for girdi in (".git", ".claude", ".github", "tools", "ekip", "CLAUDE.md", "README.md"):
        denetle(girdi in yoksay, f".assetsignore: '{girdi}' eksik — dosyalar herkese açılır")

    # Gizlilik sayfası oyundan erişilebilir olmalı (AdSense/KVKK şartı)
    denetle("gizlilik.html" in index, "index.html: gizlilik sayfasına bağlantı yok")


def guvenlik_testleri():
    for ad in SITE_DOSYALARI:
        metin = (KOK / ad).read_text(encoding="utf-8")
        # Dış betik ve modül kaynakları (HTML yorumundaki şablonlar dahil)
        alanlar = re.findall(r'<script[^>]*\ssrc="https?://([^/"]+)', metin)
        alanlar += re.findall(r'(?:\bfrom\s*|\bimport\s*\(\s*)["\']https?://([^/"\']+)', metin)
        for alan in alanlar:
            denetle(alan in IZINLI_BETIK_ALANLARI,
                    f"{ad}: izinsiz dış betik adresi: {alan} (IZINLI_BETIK_ALANLARI)")
        denetle("javascript:" not in metin, f"{ad}: javascript: bağlantısı")

    js = (KOK / "app.js").read_text(encoding="utf-8")
    tehlikeli = {
        "eval(": r"\beval\s*\(",
        "new Function": r"\bnew\s+Function\b",
        "document.write": r"\bdocument\.write",
        "insertAdjacentHTML": r"\binsertAdjacentHTML\b",
        "outerHTML atama": r"\.outerHTML\s*=",
        "setTimeout(metin)": r"\bset(?:Timeout|Interval)\s*\(\s*[\"'`]",
    }
    for ad, kalip in tehlikeli.items():
        denetle(not re.search(kalip, js), f"app.js: tehlikeli kalıp: {ad}")
    # innerHTML yalnızca temizlemek için ("") kullanılabilir; metin textContent ile
    for satir_no, satir in enumerate(js.splitlines(), 1):
        m = re.search(r"\.innerHTML\s*(\+?=)\s*(.*)", satir)
        if m:
            denetle(m.group(1) == "=" and re.match(r'^(""|\'\'|``)\s*;?\s*$', m.group(2)),
                    f"app.js:{satir_no}: innerHTML'e içerik yazılıyor — textContent kullanın")

    # Depoda gizli bilgi yok (.git hariç bütün metin dosyaları)
    for yol in KOK.rglob("*"):
        if ".git" in yol.relative_to(KOK).parts[:1] or not yol.is_file():
            continue
        if yol.suffix.lower() in {".png", ".ico", ".jpg", ".jpeg", ".webp", ".gif"}:
            continue
        if yol.stat().st_size > 2_000_000:
            continue
        try:
            metin = yol.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for tur, kalip in GIZLI_KALIPLAR.items():
            denetle(not re.search(kalip, metin),
                    f"{yol.relative_to(KOK)}: olası {tur} — depodan çıkarın ve anahtarı iptal edin")


def main():
    veri_testleri()
    site_testleri()
    guvenlik_testleri()
    if hatalar:
        print(f"BAŞARISIZ — {len(hatalar)} hata, {gecen} denetim geçti\n")
        for h in hatalar[:60]:
            print("  ✗", h)
        if len(hatalar) > 60:
            print(f"  … ve {len(hatalar) - 60} hata daha")
        sys.exit(1)
    print(f"GEÇTİ — {gecen} denetim")


if __name__ == "__main__":
    main()
