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
  9. Tasarım sistemi: style.css içinde :root dışında sabit renk yok, simgeler
     aynı paletten, uygulama simgesi 1024×1024 ve alfasız; metin/zemin
     çiftleri WCAG AA; yazı tipi yerel dosyadan ve lisansı yanında

Kullanım:  python3 tools/test_veri.py
Çıkış kodu: 0 = hepsi geçti, 1 = en az bir hata
"""

import html
import json
import re
import sys
import unicodedata
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
IZINLI_BETIK_ALANLARI = {"pagead2.googlesyndication.com"}
SITE_DOSYALARI = ("index.html", "gizlilik.html", "app.js")
# Emoji yasağının istisnaları: düzyazıdaki oklar ve paylaşılan sonuç ızgarası
EMOJI_DOSYALARI = SITE_DOSYALARI + ("style.css", "tools/magaza_gorsel.js")
IZINLI_SIMGELER = set("→←↓")
PAYLASIM_IZGARASI = set("🟩⬜")
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

    # Web'de ipucu "ücretsiz" diye anılmaz (ücretli ipucu izlenimi vermesin)
    denetle("Günde bir ipucu hakkın var" in index and "ipucu ücretsizdir" not in index, "index.html: ipucu hakkı metni yanlış")

    # Gizlilik sayfası oyundan erişilebilir olmalı (AdSense/KVKK şartı)
    denetle("gizlilik.html" in index, "index.html: gizlilik sayfasına bağlantı yok")

    # Gizlilik metni gerçek davranışı anlatmalı (alp-efes/sozcuk-merdiveni#9)
    giz = (KOK / "gizlilik.html").read_text(encoding="utf-8")
    for anahtar in ("sm_state", "sm_gunluk_", "sm_ipucu_", "sm_uzunluk", "sm_zorluk", "iOS Uygulaması"):
        denetle(anahtar in giz, f"gizlilik.html: '{anahtar}' anlatılmamış")
    # app.js'in yazdığı her yerel depolama anahtarı gizlilik metninde de olmalı
    for anahtar in set(re.findall(r'"(sm_[a-z_]+)', (KOK / "app.js").read_text(encoding="utf-8"))):
        denetle(anahtar in giz, f"gizlilik.html: app.js'teki '{anahtar}' anahtarı anlatılmamış")
    denetle("kabul etmiş sayılırsınız" not in giz, "gizlilik.html: 'kullanarak kabul' ifadesi geçerli rıza değildir")
    # Analitik tamamen kaldırıldı (2026-11-13 sahip kararı): geri gelmemeli.
    # Tek istisna: eski izleri silen temizlik kodu (index.html) ve bunu anlatan metin.
    kalip = re.compile(r"firebase|gstatic|googletagmanager|google-analytics|trackEvent|gtag\(", re.I)
    for ad in ("index.html", "app.js", "style.css"):
        metin = (KOK / ad).read_text(encoding="utf-8")
        if ad == "index.html":   # yorumlar ve eski IndexedDB adları (temizlik kodu) sayılmaz
            metin = re.sub(r"<!--.*?-->", "", metin, flags=re.S)
            metin = re.sub(r'"firebase-(?:installations|heartbeat)-database"', "", metin)
        bulunan = sorted(set(m.lower() for m in kalip.findall(metin)))
        denetle(not bulunan, f"{ad}: analitik kalıntısı: {bulunan}")
    for ad in ("index.html", "style.css"):
        metin = (KOK / ad).read_text(encoding="utf-8")
        denetle("cerez-tercihi" not in metin and 'id="izin"' not in metin and ".izin" not in metin,
                f"{ad}: izin bildirimi/Çerez Tercihleri kalıntısı")
    # Tek istisna: geçmiş veriyi anlatan, id="gecmis-analitik" işaretli paragraf
    giz_gecmissiz = re.sub(r'<p id="gecmis-analitik">.*?</p>', "", giz, flags=re.S)
    denetle('<p id="gecmis-analitik">' in giz, "gizlilik.html: geçmiş analitik paragrafı (gecmis-analitik) yok")
    denetle(not re.search(r"firebase|google llc|google analytics|sm_izin", giz_gecmissiz, re.I),
            "gizlilik.html: geçmiş analitik paragrafı dışında kaldırılan analitikten söz ediyor")


def guvenlik_testleri():
    for ad in SITE_DOSYALARI:
        metin = (KOK / ad).read_text(encoding="utf-8")
        # Dış betik ve modül kaynakları (HTML yorumundaki şablonlar dahil)
        alanlar = re.findall(r'<script[^>]*\ssrc="https?://([^/"]+)', metin)
        alanlar += re.findall(r'(?:\bfrom\s*|\bimport\s*\(\s*)["\']https?://([^/"\']+)', metin)
        # Yan etkili import "https://…" ve betik gövdelerindeki her https:// metni
        # (ör. const SDK = "https://…/"); JSON-LD blokları betik değildir
        alanlar += re.findall(r'\bimport\s*["\']https?://([^/"\']+)', metin)
        for govde in re.findall(r'<script(?![^>]*ld\+json)[^>]*>(.*?)</script>', metin, re.S):
            alanlar += re.findall(r'["\'`]https?://([^/"\'`\s]+)', govde)
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


# CSS renk adları (adlandırılmış ve sistem renkleri). transparent, currentColor,
# inherit, initial, unset, none renk değeri sayılmaz; listede yoklar.
CSS_RENK_ADLARI = """
aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond
blue blueviolet brown burlywood cadetblue chartreuse chocolate coral
cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid
darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod
gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue
lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod
palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon
sandybrown seagreen seashell sienna silver skyblue slateblue slategray
slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet
wheat white whitesmoke yellow yellowgreen
accentcolor accentcolortext activetext buttonborder buttonface buttontext
canvas canvastext field fieldtext graytext highlight highlighttext linktext
mark marktext selecteditem selecteditemtext visitedtext
""".split()

# tools/ikon_uret.py çıktıları: her biri ürettiği paleti "palet" metin parçasında taşır
URETILEN_PNG = ("favicon-48.png", "favicon-192.png", "apple-touch-icon.png", "og-image.png",
                "tools/uygulama/simge-1024.png", "tools/uygulama/acilis-2732.png")


def png_bilgi(yol):
    """PNG başlığını bağımlılıksız okur: (en, boy, alfa_var_mi, {tEXt anahtarı: metin})."""
    veri = yol.read_bytes()
    if veri[:8] != b"\x89PNG\r\n\x1a\n" or veri[12:16] != b"IHDR":
        return None
    en, boy = int.from_bytes(veri[16:20], "big"), int.from_bytes(veri[20:24], "big")
    alfa = veri[25] in (4, 6)                 # renk türü: gri+alfa ya da RGBA
    metinler = {}
    konum = 8
    while konum + 8 <= len(veri):             # parçaları gez: tRNS de saydamlık demektir
        uzunluk, tur = int.from_bytes(veri[konum:konum + 4], "big"), veri[konum + 4:konum + 8]
        if tur == b"tRNS":
            alfa = True
        elif tur == b"tEXt":
            anahtar, _, metin = veri[konum + 8:konum + 8 + uzunluk].partition(b"\0")
            metinler[anahtar.decode("latin-1")] = metin.decode("latin-1")
        elif tur == b"IEND":
            break
        konum += 12 + uzunluk
    return en, boy, alfa, metinler


def css_degerleri(css):
    """Kural gövdelerindeki bildirim değerleri (seçiciler ve özellik adları hariç).
    Dizgiler, url() ve --ad belirteç adları atılır; var(--x, red) gibi bir
    yedek değer ise kalır ve denetlenir."""
    degerler = []
    for govde in re.findall(r"\{([^{}]*)\}", css):
        for bildirim in govde.split(";"):
            if ":" in bildirim:
                deger = bildirim.split(":", 1)[1]
                deger = re.sub(r'"[^"]*"|\'[^\']*\'|url\([^)]*\)|--[\w-]+', " ", deger)
                degerler.append(deger)
    return degerler


def tasarim_testleri():
    """Tasarım sistemi (ekip/tasarim-sistemi.md): tek palet, uygulama görselleri."""
    css = re.sub(r"/\*.*?\*/", "", (KOK / "style.css").read_text(encoding="utf-8"), flags=re.S)
    kok_bloklari = re.findall(r":root\s*\{([^}]*)\}", css)
    denetle(bool(kok_bloklari), "style.css: :root bloğu yok")
    kok = "".join(kok_bloklari)
    tanimli = set(re.findall(r"(--[\w-]+)\s*:", kok))
    adli_palet = {ad: h.lower() for ad, h in re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})\b", kok)}
    palet = set(adli_palet.values())

    # :root dışında sabit renk yok (hex, renk işlevi, renk adı); her belirteç tanımlı
    renk_adi = re.compile(r"(?<![\w-])(?:" + "|".join(CSS_RENK_ADLARI) + r")(?![\w-])", re.I)
    sabit = set()
    for deger in css_degerleri(re.sub(r":root\s*\{[^}]*\}", "", css)):
        sabit.update(re.findall(r"#[0-9a-fA-F]{3,8}\b", deger))
        sabit.update(m + "(" for m in re.findall(
            r"\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(", deger, re.I))
        sabit.update(m.lower() for m in renk_adi.findall(deger))
    denetle(not sabit, f"style.css: :root dışında sabit renk: {sorted(sabit)[:5]} — belirteç kullanın")
    eksik = sorted(set(re.findall(r"var\((--[\w-]+)", css)) - tanimli)
    denetle(not eksik, f"style.css: tanımsız belirteç: {eksik[:5]}")

    # Simgeler ve tarayıcı çubuğu rengi aynı paletten
    for ad in ("favicon.svg", "tools/og-image.svg"):
        renkler = {h.lower() for h in re.findall(r"#[0-9a-fA-F]{6}\b", (KOK / ad).read_text(encoding="utf-8"))}
        denetle(renkler <= palet, f"{ad}: palet dışı renk: {sorted(renkler - palet)} (style.css :root)")
    for ad in ("index.html", "gizlilik.html"):
        tema = re.search(r'<meta name="theme-color" content="([^"]+)"', (KOK / ad).read_text(encoding="utf-8"))
        denetle(bool(tema) and tema.group(1).lower() in palet, f"{ad}: theme-color palette yok")
    uretici = (ARACLAR / "ikon_uret.py").read_text(encoding="utf-8")
    denetle("style.css" in uretici and not re.search(r"#[0-9a-fA-F]{6}\b", uretici),
            "tools/ikon_uret.py: sabit renk var — renkler style.css'ten okunmalı")

    # Üretilen PNG'ler güncel paletle mi üretilmiş (bayat simge yakalanır)
    for ad in URETILEN_PNG:
        yol = KOK / ad
        bilgi = png_bilgi(yol) if yol.exists() else None
        ozet = dict(re.findall(r"([\w-]+)=(#[0-9a-f]{6})", bilgi[3].get("palet", ""))) if bilgi else {}
        farkli = sorted(f"--{a} {h}≠{adli_palet.get(a)}" for a, h in ozet.items() if adli_palet.get(a) != h)
        denetle(bool(ozet) and not farkli,
                f"{ad}: güncel paletle üretilmemiş {farkli[:3] or '(palet özeti yok)'} — python3 tools/ikon_uret.py")

    # iOS deposuyla sözleşme: yol, ölçü, alfasız simge
    beklenen = {"simge-1024.png": (1024, 1024), "acilis-2732.png": (2732, 2732)}
    for ad, olcu in beklenen.items():
        yol = ARACLAR / "uygulama" / ad
        bilgi = png_bilgi(yol) if yol.exists() else None
        denetle(bool(bilgi), f"tools/uygulama/{ad} yok ya da PNG değil — python3 tools/ikon_uret.py")
        if bilgi:
            denetle(bilgi[:2] == olcu, f"tools/uygulama/{ad}: {bilgi[0]}×{bilgi[1]}, {olcu[0]}×{olcu[1]} olmalı")
            denetle(not bilgi[2], f"tools/uygulama/{ad}: alfa kanalı var — App Store reddeder")
    magaza = sorted((ARACLAR / "uygulama" / "magaza").glob("*.png"))
    denetle(3 <= len(magaza) <= 5, f"tools/uygulama/magaza: {len(magaza)} görsel, 3–5 olmalı")
    for yol in magaza:
        bilgi = png_bilgi(yol)
        denetle(bool(bilgi) and bilgi[:2] == (1320, 2868), f"tools/uygulama/magaza/{yol.name}: 1320×2868 olmalı")


# Metin rengi / zemin rengi çiftleri (ekip/tasarim-sistemi.md kontrast tablosu).
# Gradyanlı dolgularda en açık uç (-top) denetlenir: beyaz metin için en kötü durum.
KONTRAST_CIFTLERI = (
    ("text", "bg"), ("text", "surface"), ("text", "surface-2"), ("text", "block-top"), ("text", "block-bottom"),
    ("text-dim", "bg"), ("text-dim", "surface"), ("text-dim", "surface-2"),
    ("on-accent", "accent"), ("on-accent", "accent-top"), ("on-accent", "green"), ("on-accent", "green-top"),
    ("accent", "bg"), ("accent", "surface"),
)


def kontrast(a, b):
    """WCAG 2.1 kontrast oranı; a ve b '#rrggbb'."""
    def parlaklik(h):
        k = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        k = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in k]
        return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2]
    acik, koyu = sorted((parlaklik(a), parlaklik(b)), reverse=True)
    return (acik + 0.05) / (koyu + 0.05)


def yazi_ve_kontrast_testleri():
    """Palet AA veriyor; yazı tipi yalnızca depodaki dosyadan yükleniyor."""
    ham = (KOK / "style.css").read_text(encoding="utf-8")
    css = re.sub(r"/\*.*?\*/", "", ham, flags=re.S)
    kok = css[css.index(":root"):]
    palet = dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})\b", kok[:kok.index("}")]))
    for metin, zemin in KONTRAST_CIFTLERI:
        if metin not in palet or zemin not in palet:
            denetle(False, f"style.css: kontrast çifti için belirteç yok: --{metin} / --{zemin}")
            continue
        oran = kontrast(palet[metin], palet[zemin])
        denetle(oran >= 4.5, f"style.css: --{metin} / --{zemin} kontrastı {oran:.2f}, en az 4,5 olmalı (WCAG AA)")

    # Yazı tipi ve diğer CSS kaynakları: yalnızca depodaki dosyalar
    adresler = re.findall(r"url\(\s*[\"']?([^\"')]+)", css)
    denetle(any(a.endswith(".woff2") for a in adresler), "style.css: @font-face yerel woff2 dosyası göstermiyor")
    for adres in adresler:
        denetle(not re.match(r"^(https?:|//|data:)", adres) and (KOK / adres).is_file(),
                f"style.css: url({adres}) depoda yerel bir dosya olmalı")
    denetle("@import" not in css, "style.css: @import yok; dış stil yüklenmez")
    lisans = KOK / "fonts" / "OFL.txt"
    denetle(lisans.is_file() and "SIL OPEN FONT LICENSE" in lisans.read_text(encoding="utf-8"),
            "fonts/OFL.txt: yazı tipinin lisans metni (SIL OFL) dosyanın yanında olmalı")
    for ad in ("index.html", "gizlilik.html"):
        metin = (KOK / ad).read_text(encoding="utf-8")
        dis = re.findall(r'<link[^>]*rel="(?:stylesheet|preload|preconnect)"[^>]*href="(https?:[^"]+|//[^"]+)', metin)
        denetle(not dis, f"{ad}: dış stil/yazı tipi bağlantısı: {dis[:3]}")


def kacislari_coz(satir, css=False):
    """Kaçışla yazılmış karakterleri açar: HTML varlıkları (&#x1F389; &#127881;
    &check;), JS \\u{1F389} ve \\uD83C\\uDF89, CSS'te \\1F389."""
    def kod(m):
        n = int(m.group(1), 16)
        return chr(n) if n <= 0x10FFFF else m.group(0)
    satir = html.unescape(satir)
    satir = re.sub(r"\\u\{([0-9a-fA-F]+)\}", kod, satir)
    satir = re.sub(r"\\u([0-9a-fA-F]{4})", kod, satir)
    if css:
        satir = re.sub(r"\\([0-9a-fA-F]{1,6})", kod, satir)
    # \uD83C\uDF89 gibi vekil çiftlerini birleştir; eşsiz vekil U+FFFD (So) olur, o da yakalanır
    return satir.encode("utf-16", "surrogatepass").decode("utf-16", "replace")


def emoji_testleri():
    """Arayüzde emoji ve simge karakteri yok; ikonlar satır içi SVG'dir
    (ekip/tasarim-sistemi.md → İkonlar). İstisna: paylaşım ızgarası."""
    for ad in EMOJI_DOSYALARI:
        izinli = IZINLI_SIMGELER | (PAYLASIM_IZGARASI if ad == "app.js" else set())
        metin = (KOK / ad).read_text(encoding="utf-8")
        for satir_no, satir in enumerate(metin.splitlines(), 1):
            satir = kacislari_coz(satir, css=ad.endswith(".css"))
            # So: emoji ve piktogramlar; Sm ≥ U+2190: oklar; FE0F/200D: emoji birleştiricileri
            yasak = sorted({h for h in satir if h not in izinli and (
                unicodedata.category(h) == "So"
                or (unicodedata.category(h) == "Sm" and h >= "\u2190")
                or h in "\ufe0f\u200d")})
            denetle(not yasak, f"{ad}:{satir_no}: emoji/simge karakteri: "
                    + " ".join(f"{h} (U+{ord(h):04X})" for h in yasak) + " — satır içi SVG kullanın")


def main():
    veri_testleri()
    emoji_testleri()
    site_testleri()
    guvenlik_testleri()
    tasarim_testleri()
    yazi_ve_kontrast_testleri()
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
