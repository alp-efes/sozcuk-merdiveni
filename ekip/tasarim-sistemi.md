# Tasarım sistemi

Tema: **Ahşap** — kâğıt zemin, tahta merdiven, harf blokları (sahip kararı,
13 Kasım 2026; koyu temanın yerini aldı). Site ve iOS uygulaması aynı
`style.css` dosyasını kullanır (uygulama siteyi olduğu gibi paketler). Bu
yüzden tek kaynak `style.css` içindeki `:root` bloğudur; burada yazanlar o
bloğun özeti ve kullanım kurallarıdır. Değer değişirse önce `style.css`, sonra
bu tablo güncellenir.

## Kurallar

1. **Sabit renk yasak.** `:root` dışında `#hex`, renk işlevi (`rgb()`,
   `hsl()`, `oklch()`…) ya da renk adı (`white`, `red`…) yazılmaz;
   `transparent` ve `currentColor` serbesttir. `tools/test_veri.py` bunu,
   `var(--x, red)` gibi yedek değerleri ve tanımsız `var(--…)` kullanımını
   yakalar.
2. **Önce var olan belirteç.** Yeni renk/boyut eklemeden önce tablodakilerden
   biri işi görüyor mu diye bak. Gerçekten yenisi gerekiyorsa `:root` içine
   anlamıyla adlandırarak ekle (`--uyari` gibi; `--sari-2` değil), kontrastını
   hesapla, bu tabloya ve `tools/test_veri.py` → `KONTRAST_CIFTLERI`'ne yaz.
3. **Yazı boyutu, boşluk, köşe, süre** ölçekten seçilir. Ara değer uydurulmaz.
4. **Serbest kalanlar:** kenarlık kalınlığı (1–3 px), tek bileşene özgü
   yerleşim ölçüleri (`max-width`, çıta kalınlığı), animasyon kare ofsetleri.
5. Açık tema, mobil öncelikli. Kütüphane ve dış kaynak yok; tek yazı tipi
   dosyası depodaki Fraunces'tir.
6. **Emoji yok** (bkz. İkonlar).

## Renk

| Belirteç | Değer | Kullanım |
|---|---|---|
| `--bg` | `#f3eada` | Sayfa zemini, açılış ekranı, `theme-color` |
| `--bg-glow` | `#fbf4e6` | Zeminin üstündeki ışık, simge gradyanı |
| `--surface` | `#fbf6ec` | Kart, pencere, tuş, boş giriş kutusu, ikon düğmesi |
| `--surface-2` | `#e9dcc5` | Klavye tablası, reklam alanı, basılı durum |
| `--border` | `#cdb995` | İnce çizgi, kart ve tuş kenarı |
| `--border-strong` | `#9c8262` | Giriş kutusu ve ikincil düğme kenarı |
| `--text` | `#2a2018` | Ana metin (mürekkep), odak halkası |
| `--text-dim` | `#6a5846` | İkincil metin, etiket |
| `--on-accent` | `#ffffff` | Kiremit ve yeşil dolgu üstündeki metin |
| `--accent` | `#a8432b` | Kiremit: hedef kelime, birincil düğme, GİR, seçili sekme, imleç, değişen harf çizgisi, hata bildirimi, bağlantı |
| `--accent-top` / `--accent-shadow` | `#b9502f` / `#74291a` | Kiremit bloğun üst ışığı / alt yüzü |
| `--green` | `#2f6b3f` | Hedefteki yerine oturmuş harf, başarı bildirimi |
| `--green-top` / `--green-shadow` | `#3b7d4c` / `#1e4a2a` | Yeşil bloğun üst ışığı / alt yüzü |
| `--block` | `#ebd3a6` | Harf bloğu (düz dolgu: seçili ayar, sonuç ızgarası) |
| `--block-top` / `--block-bottom` / `--block-shadow` | `#f2deb6` / `#e6ca96` / `#b98f56` | Harf bloğunun gradyanı ve alt yüzü |
| `--wood-light` / `--wood-dark` | `#d9b07a` / `#b98a52` | Korkuluk ve çıta |
| `--key-shadow` | `#b9a27c` | Tuşun alt yüzü |

Saydam katmanlar (8 haneli hex; yalnızca gölge, parlama ve perde):
`--grain`, `--wood-edge`, `--rung-shadow`, `--rung-ghost`, `--tile-drop`,
`--shine`, `--shine-dim`, `--cursor-glow`, `--overlay`, `--card-ring`,
`--card-shadow`.

Renk tek başına anlam taşımaz: yeşil blok ayrıca "Nasıl oynanır?"da
açıklanır, değişen harfin altında çizgi vardır, hata hem kiremit hem yazılı
bildirimdir, seçili sekme ve ayar altı çizilidir ve `aria-pressed` taşır.

### Kontrast (WCAG 2.1; metin AA ≥ 4,5:1, metin dışı öğe ≥ 3:1)

| Metin | Zemin | Oran |
|---|---|---|
| `--text` | `--bg` / `--surface` / `--surface-2` | 13,4 / 14,8 / 11,8 |
| `--text` | `--block-top` / `--block-bottom` (harf bloğu) | 12,1 / 10,1 |
| `--text-dim` | `--bg` / `--surface` / `--surface-2` | 5,7 / 6,3 / 5,0 |
| `--on-accent` | `--accent` / `--accent-top` | 6,0 / 4,9 |
| `--on-accent` | `--green` / `--green-top` | 6,4 / 5,0 |
| `--accent` (metin, bağlantı) | `--bg` / `--surface` | 5,0 / 5,6 |
| `--border-strong` (giriş kutusu kenarı) | `--surface` / `--bg` | 3,4 / 3,0 |
| `--accent` (değişen harf çizgisi) | `--block-bottom` | 3,8 |

Metin satırlarını `tools/test_veri.py` (`KONTRAST_CIFTLERI`) her çalıştırmada
yeniden hesaplar; 4,5'in altına düşen palet testi kırar. Dikkat:
`--text-dim` `--block` üstünde 4,65'tir, daha koyu ahşap tonlarının üstüne
yazı yazma. `--accent` `--surface-2` üstünde metin olamaz (4,4). Metne
`opacity` verme; oran hesabı bozulur. `--border` zemine karşı 1,6:1'dir:
yalnızca süs çizgisidir, tek başına bir denetimin sınırını taşımaz.

## Yazı

| Belirteç | Aile | Kullanım |
|---|---|---|
| `--font-display` | Fraunces, yedek Georgia → Times New Roman → serif | Oyun adı, harf blokları, klavye harfleri, başlıklar, pencere sayıları |
| `--font` | Sistem yazı tipi | Gövde, etiket, düğme, sekme, GİR tuşu |

Fraunces depodadır: `fonts/fraunces-latin.woff2` ve
`fonts/fraunces-latin-ext.woff2` (değişken ağırlık, 100–900; kaynak
`@fontsource-variable/fraunces` 5.3.0). Türkçe için ikisi de gerekir: ç, ö, ü,
ı ilkinde; ğ, ş, İ ikincisinde. Lisans SIL OFL 1.1, metni `fonts/OFL.txt`
(yayına da çıkar). Dış yazı tipi sunucusu kullanılmaz; `tools/test_veri.py`
CSS'teki her `url()`'nin depoda olduğunu denetler. `font-display: swap`:
dosya gelene kadar yedek aile görünür.

| Belirteç | Değer | Kullanım |
|---|---|---|
| `--fs-2xs` | 11 px | Etiket (BAŞLANGIÇ, HEDEF) — en küçük boyut, altına inilmez |
| `--fs-xs` | 12 px | "N. adım", ayar düğmesi, küçük düğme |
| `--fs-sm` | 14 px | Durum satırı, bildirim, GİR |
| `--fs-md` | 16 px | Gövde, düğme, sekme |
| `--fs-lg` | 18 px | Klavye harfi, alt başlık, giriş cümlesi |
| `--fs-xl` | 22 px | Oyun adı, bölüm başlığı |
| `--fs-2xl` | 24 px | Sayfa başlığı |
| `--fs-3xl` | 34 px | Pencere sayıları, mağaza görseli başlığı |
| `--fs-4xl` | 40 px | Pencere başlığı |

Kalınlık `--fw-medium` (500), `--fw-semi` (600), `--fw-bold` (700),
`--fw-heavy` (800). Satır yüksekliği `--lh-tight` (1,1), `--lh-snug` (1,35),
`--lh-body` (1,5), `--lh-loose` (1,7). Harf aralığı `--track-sm/md/lg`
(0,3 / 0,5 / 1,2 px). Bloktaki harf blok boyunun 0,54'üdür.

## Boşluk, ölçü, köşe, gölge, hareket

| Grup | Belirteçler |
|---|---|
| Boşluk (4 px tabanlı) | `--space-1` 4 · `-1h` 6 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-14` 56 |
| Ölçü | `--tap-min` 44 (dokunma alanı) · `--ctl-sm` 36 · `--ctl-xs` 28 (görünür boy) · `--icon-size` 22 · `--btn-height` 52 · `--key-height` 44–52 (ekran boyuna göre) |
| Merdiven | `--tile-max` 38–54 (ekran boyuna göre) · `--gap` 6 · `--rung-gap` 10 · `--rail` 12 · `--rail-pad` 30 · `--len` · `--side` · `--label-pos` · `--step-show` |
| Türetilen | `--tile` · `--ladder-w` · `--pitch` (`style.css`'te `:root` bloğunun hemen altında) |
| Köşe | `--radius-sm` 4 · `--radius` 8 · `--radius-md` 14 · `--radius-lg` 22 |
| Gölge | `--shadow-md` (bildirim ve pencere). Blok ve tuş gölgeleri bileşenin parçasıdır |
| Süre | `--dur-fast` 0,1 s · `--dur-base` 0,2 s · `--dur-slow` 0,5 s · `--ease` |
| Katman | `--z-rail` 1 · `--z-toast` 30 · `--z-modal` 40 |

## Bileşenler

**Merdiven** (`.game` → `.frame`). Yukarıdan aşağı okunur: BAŞLANGIÇ en üstte,
her adım bir alt basamağa eklenir, HEDEF en altta (klavyenin hemen üstünde),
giriş satırı HEDEF'in hemen üstündedir. Yalnızca üst bölüm (`.steps`:
BAŞLANGIÇ + girilen kelimeler + boş basamaklar) kayar; giriş satırı ve HEDEF
sabittir. Her yeni adımda `.steps` sona kaydırılır: eski basamaklar yukarı
çıkar. Bulmaca çözülünce giriş satırı ve boş basamaklar kalkar.
Çok kısa ekranda (320×460, yatay telefon) `.steps` en az bir basamak boyunda
kalır (son kelime hep görünür) ve sığmayan merdiven `.game` içinde kayar:
önce son kelime ve giriş satırı görünür, HEDEF kaydırınca gelir. Merdiven
klavyenin üstüne taşmaz.

- **Basamak** (`.rung`): ortada kelime (`.word-row`), arkasında korkuluktan
  korkuluğa çıta, solda `.rung-label` (BAŞLANGIÇ / HEDEF), sağda `.step-label`
  ("N. adım").
- **Blok** (`.tile`): `.filled` ahşap blok, `.green` hedefteki yerinde,
  `.target` kiremit, `.changed` bir önceki kelimeye göre değişen harf (altında
  çizgi), `.cursor` sıradaki harfin yeri. Giriş satırındaki harf düz kutuda
  durur; kabul edilince bloğa döner.
- **Blok boyu** ekran boyundan (`--tile-max`) ve genişlikten hesaplanır;
  `app.js` kelime uzunluğunu `#game[data-boy]` ile bildirir (3, 4, 5).
- **Dar ekran:** yanlarda 80 px etiket payı kalmıyorsa (3 harf < 350 px,
  4 harf < 420 px, 5 harf < 480 px) BAŞLANGIÇ / HEDEF satırın üstüne çıkar,
  "N. adım" etiketleri gizlenir; adım sayısı durum satırında yazar.

**Kabuk.** Başlık (oyun adı + üç yuvarlak ikon düğmesi: nasıl oynanır, ses,
yeni oyun) → sekmeler → (Serbest Oyun'da) zorluk ve uzunluk → durum satırı
("2 adım · en az 5", günlükte geri sayım, çözülünce "Paylaş") → merdiven →
klavye. Kabuk `100dvh`'dir; "Nasıl oynanır?" onun altındadır.

**Klavye.** Türkçe Q, 22 sütunlu ızgara: harf 2, GİR ve Sil 3 sütun. Telefonda
da bu klavye kullanılır; cihazın klavyesini açan bir giriş alanı yoktur
(fiziksel klavye çalışır). Tuş (`.key`) dokunma alanıdır, görünen kapak
içindeki `.cap`'tir.

**Pencere** (kazanma). Üst yazı, başlık, cümle, iki sayı kutusu (adım / en az
adım), sonuç ızgarası, birincil "Sonucu Paylaş", ikincil "Serbest Oyun" ya da
"Yeni Oyun", günlükte geri sayım.

**Düğmeler.** `.btn-primary` kiremit dolgu (sayfada bir tane), `.btn-secondary`
çerçeveli, `.mini-btn` durum satırında, `.icon-btn` yuvarlak, `.pick-btn`
ayar parçası.

## Dil

Oyuncuya **"sen"** diye seslenilir: bildirim, pencere, "Nasıl oynanır?" ve
gizlilik sayfasının oyuncuya seslenen bölümleri. Yasal haklar bölümü resmî
kalır. Kısa, sade Türkçe; hata iletisi oyuncuyu suçlamaz, ne yapacağını
söyler ("Bir harf değiştir"). Bulmacaya özgü kelimeler: basamak, adım,
başlangıç, hedef.

## Erişilebilirlik

- Metin/zemin çifti AA tutmadan yayına girmez; yeni çifti kontrast tablosuna
  ve `KONTRAST_CIFTLERI`'ne ekle.
- Dokunma alanı en az 44×44 px (`--tap-min`). İkon düğmesi ve sekme gerçekten
  44 px'tir. Ayar düğmesi 44 px yüksek bir düğmedir, görünen parçası içindeki
  36 px'lik dolgudur. "Paylaş" 28 px görünür; alanı görünmez `::before`
  katmanıyla aşağı doğru 44 px'e tamamlanır (altı `.game`'in saydam üst kenarlığıdır;
  kayan içerik onun altında kırpılır). Kabuğa yeni denetim eklerken görünmez katmanı kayan
  bölüme (`.steps`) taşırma.
- **Tek istisna klavye tuşunun eni:** sırada 11 tuş olduğu için 320 px ekranda
  ~28 px, 393 px ekranda ~35 px. Boyu her zaman en az 44 px'tir ve tuşlar
  aralıksızdır (görünen aralık tuşun kendi dolgusudur).
- Kısa ekranda (boy ≤ 740 px) boş reklam yer tutucuları yer kaplamaz; gerçek
  reklam geldiğinde küçük telefondaki yerleşim yeniden ölçülmelidir.
- `tools/test_tarayici.js` şunları ölçer: merdiven sırası (BAŞLANGIÇ → adım →
  giriş → HEDEF); 360×560 ve 375×548 serbest oyunda HEDEF ve giriş satırı,
  320×460'ta giriş satırı, çözülmüş günlükte HEDEF ilk ekranda; denetimlerin
  gerçek dokunma alanı 44×44, tuş boyu 44; 320×460'ta son kelime ve giriş
  görünür, 667×375 yatayda hiçbir tuşun üstü örtülmez; fiziksel klavye
  (i → İ, ı → I, Backspace, Enter); uzun merdivende son kelime, giriş
  ve HEDEF görünür, kayan bölümün üst kenarındaki dokunuş ayar düğmesine
  gitmiyor; 390 px'te yatay taşma yok.
- Odak halkası (`:focus-visible`, mürekkep rengi) kaldırılmaz. Kapalı pencere
  `visibility: hidden`'dır: odak içine girmez.
- Animasyon bilgi taşımaz; `prefers-reduced-motion` açıkken süreler sıfırlanır.

## İkonlar

**Arayüzde emoji yok** — ne ikon ne süs olarak (sekme, düğme, başlık,
bildirim, paylaşım başlığı). ↻ ✕ ⌫ gibi simge karakterleri de ikon olarak
kullanılmaz: cihazdan cihaza farklı çizilir, rengi ve boyu denetlenemez.

- İkon satır içi SVG'dir: `class="icon"`, `viewBox="0 0 24 24"`,
  `stroke="currentColor"`, çizgi kalınlığı 2, `aria-hidden="true"`. Boyu
  `--icon-size`, rengi düğmenin metin rengi. Elle yazılır; ikon kütüphanesi,
  dış dosya ve `style=` yok (iOS paketinin CSP'si satır içi stili reddeder).
- Adı düğmenin `aria-label`'ı taşır. Durum değişimi sınıfla yapılır
  (ses düğmesi: `.muted`), metinle değil; aç/kapa düğmesi durumunu
  `aria-pressed` ile de bildirir.
- `app.js` içinde üretilen öğe ikonu `index.html`'deki `<template>`'ten
  kopyalar (Sil tuşu: `#iconBackspace`); `innerHTML` yazılmaz.
- **İstisnalar:** paylaşılan sonuç ızgarası (🟩⬜, yalnızca `app.js`) ve
  düzyazıdaki oklar (→ ← ↓).

`tools/test_veri.py` `index.html`, `gizlilik.html`, `app.js`, `style.css` ve
`tools/magaza_gorsel.js` içinde bunların dışındaki her emoji ve simge
karakterini yakalar; kaçışla yazılanları da (`&#x1F389;`, `\u{1F389}`,
`\uD83C\uDF89`, CSS `\1F389`).

## Simgeler ve uygulama görselleri

Hepsi üretilir, elle düzenlenmez:

```bash
python3 tools/ikon_uret.py
```

Renkleri `style.css` `:root` bloğundan okur. Marka işareti: kâğıt zemin
(`--bg-glow` → `--bg`) üstünde tahta merdiven (`--wood-dark`, `--wood-light`)
ve basamaklarından inen üç blok — `--block`, `--green`, `--accent`, her biri
kendi `-shadow` tonuyla. `favicon.svg` ve `tools/og-image.svg` aynı değerlerin elle tutulan
kopyasıdır; palet değişirse onları da güncelle (test eşleşmeyi denetler).
Her PNG, çiziminde kullandığı renkleri `palet` metin parçasında taşır; palet
değişip betik çalıştırılmazsa `tools/test_veri.py` bayat görseli yakalar.
(`favicon.ico` ve mağaza görselleri bu denetimin dışında.)

| Dosya | Ne |
|---|---|
| `favicon.ico`, `favicon-48.png`, `favicon-192.png`, `apple-touch-icon.png` | Site simgeleri (yuvarlak köşe, saydam) |
| `og-image.png` | 1200×630 sosyal kart |
| `tools/uygulama/simge-1024.png` | iOS simgesi: 1024×1024, opak RGB, köşesiz |
| `tools/uygulama/acilis-2732.png` | iOS açılış ekranı: `--bg` zemin, ortada 640 px işaret |

`tools/uygulama/` altındaki iki yol iOS deposuyla sözleşmedir; adlar değişmez.
Sosyal kartın başlığı depodaki Fraunces ile yazılır; diğer satırlar macOS'ta
Arial, Linux'ta Liberation Sans (aynı ölçüler), yoksa DejaVu.

## Mağaza ekran görüntüleri

```bash
node tools/magaza_gorsel.js [YYYY-AA-GG]
```

Gerçek oyunu telefon düzeninde açar, ekran klavyesine dokunarak oynar, her
ekranın üstüne başlık bandı koyar. Çıktı `tools/uygulama/magaza/NN-ad.png`, 1320×2868
(App Store 6,9"). Tarih günün bulmacasını belirler; aynı tarih aynı görseli
verir.

- Ekran sahte çizilmez; reklam yer tutucuları gizlenir.
- Başlık kısa, sade Türkçe ve doğru: oyunun yapmadığı şey, sayı, ödül,
  "en iyi" gibi iddia yazılmaz. Başlıklar betikteki `EKRANLAR` listesindedir.
- Mağazaya gidecek son görseller macOS'ta üretilir (gövde yazı tipi
  iPhone'dakiyle aynı çıkar; Fraunces her yerde aynıdır). Depodaki Linux
  çıktısı yerleşim örneğidir.

## Site ve uygulama ortak dili

- Aynı `style.css`, aynı belirteçler, aynı yazı tipi dosyaları; uygulamaya
  özel renk ya da yazı yok. Uygulama `fonts/` klasörünü de paketlemelidir.
- Uygulama kabuğunun yerel renkleri (açılış zemini, web görünümü arka planı)
  `--bg` = `#f3eada`; zemin açık olduğu için durum çubuğu yazısı koyu olmalıdır.
- Marka işareti her yerde aynı merdiven ve üç blok; üstüne yazı ya da efekt
  eklenmez.
