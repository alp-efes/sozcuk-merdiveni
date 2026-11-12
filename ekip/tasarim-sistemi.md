# Tasarım sistemi

Site ve iOS uygulaması aynı `style.css` dosyasını kullanır (uygulama siteyi
olduğu gibi paketler). Bu yüzden tek kaynak `style.css` içindeki `:root`
bloğudur; burada yazanlar o bloğun özeti ve kullanım kurallarıdır. Değer
değişirse önce `style.css`, sonra bu tablo güncellenir.

## Kurallar

1. **Sabit renk yasak.** `:root` dışında `#hex`, renk işlevi (`rgb()`,
   `hsl()`, `oklch()`…) ya da renk adı (`white`, `red`…) yazılmaz;
   `transparent` ve `currentColor` serbesttir. `tools/test_veri.py` bunu,
   `var(--x, red)` gibi yedek değerleri ve tanımsız `var(--…)` kullanımını
   yakalar.
2. **Önce var olan belirteç.** Yeni renk/boyut eklemeden önce tablodakilerden
   biri işi görüyor mu diye bak. Gerçekten yenisi gerekiyorsa `:root` içine
   anlamıyla adlandırarak ekle (`--uyari` gibi; `--sari-2` değil), kontrastını
   hesapla, bu tabloya yaz.
3. **Yazı boyutu, boşluk, köşe, süre** ölçekten seçilir. Ara değer uydurulmaz.
4. **Serbest kalanlar:** kenarlık kalınlığı (1–2 px), tek bileşene özgü
   yerleşim genişlikleri (`max-width`), animasyon kare ofsetleri.
5. Koyu tema, mobil öncelikli. Kütüphane, yazı tipi dosyası, dış kaynak yok.

## Renk

| Belirteç | Değer | Kullanım |
|---|---|---|
| `--bg` | `#121213` | Sayfa zemini, açılış ekranı, `theme-color` |
| `--surface` | `#1e1e20` | Kart, pencere, reklam alanı |
| `--surface-2` | `#2c2c2e` | Dolu kutu, ikincil düğme, basılı durum |
| `--border` | `#3a3a3c` | Boş kutu ve düğme kenarlığı |
| `--border-strong` | `#565658` | Dolu kutu, seçili sekme kenarlığı |
| `--text` | `#f5f5f7` | Ana metin |
| `--text-dim` | `#9a9aa0` | İkincil metin, etiket |
| `--link` | `#7aa7ff` | Bağlantı |
| `--on-accent` | `#ffffff` | Yeşil/kırmızı/tuş dolgusu üstündeki metin |
| `--green` | `#3f8245` | Doğru harf, birincil düğme, başarı bildirimi (dolgu) |
| `--green-text` | `#5aa85f` | Koyu zeminde yeşil metin |
| `--amber` | `#c9a94a` | Hedef kelime, marka vurgusu, odak halkası |
| `--red` | `#cf3f3f` | Hata bildirimi (dolgu) |
| `--red-text` | `#ef6b6b` | Geçersiz girişte harf ve kenarlık |
| `--cream` | `#e9e7e0` | Marka işaretinin orta kutusu |
| `--key-bg` | `#6e6f71` | Ekran klavyesi tuşu |
| `--overlay` | `rgba(0,0,0,.65)` | Pencere arkası karartma |

**Dolgu ile metin tonu ayrıdır.** Aynı yeşil hem beyaz metnin zemini hem koyu
zeminde metin olamaz (ikisi birden AA vermez). Dolguda `--green` / `--red`,
üstünde `--on-accent`; koyu zeminde renkli yazı gerekiyorsa `-text` tonu.

### Kontrast (WCAG 2.1; metin AA ≥ 4,5:1, büyük metin ≥ 3:1)

| Metin | Zemin | Oran |
|---|---|---|
| `--text` | `--bg` / `--surface` / `--surface-2` | 17,2 / 15,3 / 12,8 |
| `--text-dim` | `--bg` / `--surface` / `--surface-2` | 6,7 / 6,0 / 5,0 |
| `--on-accent` | `--green` | 4,7 |
| `--on-accent` | `--red` | 4,7 |
| `--on-accent` | `--key-bg` | 5,0 |
| `--green-text` | `--bg` / `--surface` | 6,4 / 5,7 |
| `--amber` | `--bg` / `--surface` | 8,3 / 7,3 |
| `--red-text` | `--bg` / `--surface-2` | 6,2 / 4,6 |
| `--link` | `--bg` | 7,8 |

Dikkat: `--green` üstüne `--text` (`#f5f5f7`) yazma, 4,3 kalır; `--on-accent`
kullan. Metne `opacity` verme; oran hesabı bozulur. Bilinen açık: `--border`
zemine karşı 1,7:1 — boş giriş kutularının çerçevesi 3:1'in altında
(görünüm kararı; değiştirmek için `[tasarim]` issue'su).

## Yazı

Aile `--font` (sistem yazı tipi; dosya yüklenmez).

| Belirteç | Değer | Kullanım |
|---|---|---|
| `--fs-2xs` | 11 px | Etiket, dipnot — en küçük boyut, altına inilmez |
| `--fs-xs` | 12 px | Küçük düğme, sayaç metni |
| `--fs-sm` | 14 px | Sekme, bildirim |
| `--fs-md` | 16 px | Gövde, düğme, tuş |
| `--fs-lg` | 18 px | Alt başlık |
| `--fs-xl` | 22 px | Bölüm ve pencere başlığı |
| `--fs-2xl` | 24 px | Sayfa başlığı |

Kalınlık `--fw-bold` (700), `--fw-heavy` (800). Satır yüksekliği `--lh-tight`
(1,1), `--lh-body` (1,5), `--lh-loose` (1,7). Harf aralığı `--track-sm/md/lg`
(0,5 / 1 / 3 px). Harf kutusundaki yazı kutu boyutunun yarısıdır.

## Boşluk, ölçü, köşe, gölge, hareket

| Grup | Belirteçler |
|---|---|
| Boşluk (4 px tabanlı) | `--space-1` 4 · `-1h` 6 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-14` 56 |
| Ölçü | `--tap-min` 44 (dokunma alanı) · görünür boy `--ctl-md` 40 · `--ctl-sm` 34 · `--ctl-xs` 28 · `--btn-height` 48 · `--key-height` 52 (geniş ekranda 58) · `--tile-size` · `--gap` |
| Köşe | `--radius` 6 · `--radius-md` 8 · `--radius-lg` 12 |
| Gölge | `--shadow-md` (bildirim ve pencere; başka yerde gölge yok) |
| Süre | `--dur-fast` 0,1 s · `--dur-base` 0,2 s · `--dur-slow` 0,5 s · `--ease` |
| Katman | `--z-toast` 30 · `--z-modal` 40 |

## Erişilebilirlik

- Metin/zemin çifti AA tutmadan yayına girmez; yeni çifti yukarıdaki tabloya ekle.
- Dokunma alanı en az 44×44 px (`--tap-min`). Görünür boy daha küçük
  olabilir: oyun kabuğu `100dvh` sabit olduğundan üstteki her piksel küçük
  telefonda oyun alanından gider (360×560'ta HEDEF satırı ekrandan çıkıyordu).
  Bu yüzden ikon düğmesi, sekme, zorluk/uzunluk, "Sonucu paylaş" ve
  "Nasıl oynanır?" `--ctl-*` boyunda görünür; dokunma alanı `style.css`
  "Dokunma alanı" bölümündeki görünmez `::before` katmanıyla 44 px'e
  tamamlanır. Katman komşu denetimle örtüşmeyecek yöne uzar ve kaydırılan
  alanın (`.game`) içine girmez: tahta kayınca harf kutuları katmanın altına
  gelir, dokunuş düğmeye gider. `.game`'in üst boşluğu bu yüzden dolgu değil
  saydam kenarlıktır. Kabuğa yeni denetim eklerken aynı yolu izle; yerleşimi
  büyütme.
- `tools/test_tarayici.js` (10. adım) dokunmatik ekranda şunları ölçer:
  360×560 ve 375×548 serbest oyunda HEDEF ve giriş satırı, 320×460 serbest
  oyunda giriş satırı, 360×560 ve 375×548 çözülmüş günlükte HEDEF satırı
  ilk ekranda; denetimlerin gerçek dokunma alanı (komşunun örttüğü kısım
  hariç) 44×44; tahta kaydırılınca üst kenarındaki dokunuş ayar düğmesine
  gitmiyor.
- Tek istisna ekran klavyesi tuşları: yükseklik 52 px, genişlik dar ekranda
  ~35 px; dokunmatik cihazda bu klavye gizlenir, telefonun kendi klavyesi açılır.
- Odak halkası (`:focus-visible`, amber) kaldırılmaz.
- Animasyon bilgi taşımaz; `prefers-reduced-motion` açıkken süreler sıfırlanır.
- Renk tek başına anlam taşımaz: hata hem kırmızı hem yazılı bildirimdir.
- 390 px genişlikte yatay taşma olmaz (duman testi denetler).

## Simgeler ve uygulama görselleri

Hepsi üretilir, elle düzenlenmez:

```bash
python3 tools/ikon_uret.py
```

Renkleri `style.css` `:root` bloğundan okur. Marka işareti: zemin gradyanı
(`--surface` → `--bg`) üstünde köşegen üç kutu — `--green`, `--cream`,
`--amber`. `favicon.svg` ve `tools/og-image.svg` aynı değerlerin elle tutulan
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
Yazı tipi: macOS'ta Arial, Linux'ta Liberation Sans (aynı ölçüler), yoksa DejaVu.

## Mağaza ekran görüntüleri

```bash
node tools/magaza_gorsel.js [YYYY-AA-GG]
```

Gerçek oyunu dokunmatik telefon düzeninde açar, oynar, her ekranın üstüne
başlık bandı koyar. Çıktı `tools/uygulama/magaza/NN-ad.png`, 1320×2868
(App Store 6,9"). Tarih günün bulmacasını belirler; aynı tarih aynı görseli
verir.

- Ekran sahte çizilmez; reklam yer tutucuları gizlenir.
- Başlık kısa, sade Türkçe ve doğru: oyunun yapmadığı şey, sayı, ödül,
  "en iyi" gibi iddia yazılmaz. Başlıklar betikteki `EKRANLAR` listesindedir.
- Mağazaya gidecek son görseller macOS'ta üretilir (yazı tipi ve emojiler
  iPhone'dakiyle aynı çıkar). Depodaki Linux çıktısı yerleşim örneğidir.

## Site ve uygulama ortak dili

- Aynı `style.css`, aynı belirteçler; uygulamaya özel renk ya da yazı yok.
- Uygulama kabuğunun yerel renkleri (durum çubuğu, açılış zemini, web
  görünümü arka planı) `--bg` = `#121213`.
- Marka işareti her yerde aynı üç kutu; üstüne yazı ya da efekt eklenmez.
