# Sözcük Merdiveni 🪜

Her adımda tek harf değiştirerek başlangıç kelimesinden hedef kelimeye ulaşılan,
Vanilla JavaScript ile yazılmış Türkçe kelime oyunu (SPA). Harici kütüphane yok,
derleme adımı yok — statik barındırma yeterli.

## Dosya Yapısı

| Dosya | Görev |
|---|---|
| `index.html` | Oyun sayfası (SEO etiketleri + AdSense yerleşim şablonları hazır) |
| `style.css` | Koyu tema, mobil öncelikli düzen, animasyonlar |
| `app.js` | Oyun mantığı, sanal klavye, ses, `showInterstitialAd()` / `muteGame()` |
| `words.json` | Sözlük + çözülebilirliği garanti bulmacalar (üretilen dosya — elle düzenlemeyin) |
| `tools/kelimeler.txt` | Ana kelime listesi (elle düzenlenen kaynak) |
| `tools/bulmaca_uret.py` | `kelimeler.txt` → `words.json` üretici |
| `hakkinda.html`, `gizlilik.html` | AdSense onayı için zorunlu içerik sayfaları |
| `ads.txt`, `robots.txt`, `sitemap.xml` | Reklam yetkilendirme + arama motoru dosyaları |

## Yerelde Çalıştırma

```bash
python3 -m http.server 8765
# → http://localhost:8765
```

(`words.json` Fetch ile çekildiği için yerel sunucu gerekir; `file://` ile
açılırsa oyun `app.js` içindeki küçük yedek sözlükle çalışır.)

## Sözlüğü Büyütme

1. `tools/kelimeler.txt` dosyasına yeni kelimeleri ekleyin (BÜYÜK harf, 3/4/5 harfli).
2. `python3 tools/bulmaca_uret.py` komutunu çalıştırın.
3. Betik, kelimeler arasında "1 harf farkı" grafiği kurup **BFS ile çözülebilir**
   bulmaca çiftleri üretir ve `words.json`'ı yeniden yazar. Çözümü olmayan
   bulmaca üretilmez; her bulmacaya en kısa çözüm adımı da eklenir.

> Not: TDK'nın resmî, ücretsiz dağıtılan bir kelime listesi API'si yoktur;
> sozluk.gov.tr uç noktaları resmî olmayan kullanımlar için güvenilir/lisanslı
> değildir. Bu yüzden proje, elle derlenen ve `tools/kelimeler.txt` üzerinden
> büyütülebilen kendi sözlüğünü kullanır.

## Yayına Alma (adım adım)

1. **Alan adı alın** (~10–15 $/yıl): Cloudflare Registrar, Namecheap, GoDaddy vb.
   AdSense, `github.io` gibi paylaşımlı alt alan adlarını kabul etmediği için
   kendi alan adınız şarttır.
2. **Ücretsiz statik barındırma seçin** ve bu klasörü yayınlayın:
   - **Cloudflare Pages** (önerilen): GitHub deposunu bağlayın, "framework: none",
     çıktı dizini `/`. Alan adınızı da Cloudflare'a taşırsanız SSL/DNS tek yerden yönetilir.
   - **GitHub Pages**: Depo > Settings > Pages > "Deploy from branch".
   - **Netlify / Vercel**: klasörü sürükle-bırak da yeterli.
3. **Alan adını bağlayın** ve HTTPS'in aktif olduğunu doğrulayın (bu barındırıcılarda otomatik).
4. **Yer tutucuları değiştirin**: `index.html`, `gizlilik.html`, `hakkinda.html`,
   `robots.txt`, `sitemap.xml` içindeki `ALANADINIZ.com` ifadelerini gerçek alan
   adınızla değiştirin.
5. **Google Search Console**'a siteyi ekleyin, `sitemap.xml`'i gönderin.

## AdSense ile Gelir Elde Etme

1. Site yayında ve birkaç hafta gerçek trafiği varken
   [adsense.google.com](https://adsense.google.com) üzerinden başvurun
   (Google hesabı + 18 yaş + banka bilgisi gerekir).
2. Başvuruda verilen doğrulama `<script>` etiketini `index.html`'in `<head>`
   bölümüne ekleyin (hazır şablon yorum satırı olarak duruyor).
3. Onay geldiğinde:
   - `ads.txt` içindeki satırın `#` işaretini kaldırıp kendi
     `pub-XXXXXXXXXXXXXXXX` kimliğinizi yazın.
   - AdSense panelinden iki adet "Görüntülü reklam" birimi oluşturun;
     `index.html`'deki üst/alt `ad-container` şablonlarının yorumunu açıp
     `data-ad-client` ve `data-ad-slot` değerlerini girin,
     `data-placeholder` özniteliklerini silin.
   - AdSense > **Gizlilik ve mesajlaşma** bölümünden Avrupa (GDPR) rıza
     mesajını etkinleştirin — AB/BK trafiği için zorunludur.
4. **Geçiş reklamları (oyun aralarında)**: AdSense'in
   [H5 Games Ads](https://adsense.google.com/start/h5-games-ads/) programına
   ayrıca başvurun. Kabul edilince `app.js` içindeki `showInterstitialAd()`
   fonksiyonunda hazır bekleyen `adBreak({...})` bloğunun yorumunu açmanız
   yeterli — ses kapatma (`muteGame`) entegrasyonu hazır.
5. Ödeme için AdSense'te vergi bilgilerinizi ve banka hesabınızı tanımlayın;
   ödeme eşiği 100 $'dır.

### Onay şansını artıran şeyler

- Gizlilik politikası ve hakkında sayfaları görünür bağlantılı olmalı (footer'da hazır).
- Site birkaç haftadır yayında olmalı ve az da olsa organik trafik almalı.
- İçerik zenginliği: zamanla "günün bulmacası", ipucu/blog sayfaları eklemek onayı
  ve tıklama gelirini belirgin biçimde artırır.

## Oyun İçi Hazır Entegrasyon Noktaları

- `showInterstitialAd(onAdDone)` — kazanma ve "Yeni Oyun" akışlarında çağrılır;
  H5 Games Ads `adBreak` şablonu içinde yorumlu olarak hazır.
- `muteGame(mute)` — reklam sırasında oyun seslerini otomatik susturur.
