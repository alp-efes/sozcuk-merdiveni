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
| `tools/kelimeler.txt` | Elle onaylı yaygın kelimeler — **bulmaca uçları yalnızca buradan seçilir** |
| `tools/otomatik_kelimeler.txt` | Zemberek sözlüğünden süzülen geniş doğrulama sözlüğü (üretilen dosya) |
| `tools/yasakli.txt` | Oyuna alınmayacak kaba/argo kelimeler (AdSense aile dostu içerik) |
| `tools/sozluk_indir.py` | Zemberek sözlüğünü indirip filtreler → `otomatik_kelimeler.txt` |
| `tools/bulmaca_uret.py` | Kaynak listeler → `words.json` üretici (BFS ile çözülebilirlik garantisi) |
| `hakkinda.html`, `gizlilik.html` | AdSense onayı için zorunlu içerik sayfaları |
| `ads.txt`, `robots.txt`, `sitemap.xml` | Reklam yetkilendirme + arama motoru dosyaları |

## Yerelde Çalıştırma

```bash
python3 -m http.server 8765
# → http://localhost:8765
```

(`words.json` Fetch ile çekildiği için yerel sunucu gerekir; `file://` ile
açılırsa oyun `app.js` içindeki küçük yedek sözlükle çalışır.)

## Sözlük Mimarisi (iki katman)

Oyun, Wordle'ın "cevap listesi ⊂ tahmin listesi" tasarımını kullanır:

- **Doğrulama sözlüğü** (~7.100 kelime): oyuncunun yazabileceği kelimeler.
  `tools/kelimeler.txt` (elle) ∪ `tools/otomatik_kelimeler.txt` (Zemberek)
  − `tools/yasakli.txt`.
- **Bulmaca uçları** (~750 kelime): başlangıç/hedef kelimeleri yalnızca elle
  onaylı yaygın kelimelerden seçilir — oyuncudan bilmediği bir kelimeye
  "ulaşması" istenmez, ama çözüm yolunda sözlükteki her kelime kullanılabilir.

Otomatik katmanın kaynağı, [Zemberek-NLP](https://github.com/ahmetaa/zemberek-nlp)
projesinin TDK temelli ana sözlüğüdür (Apache 2.0 lisansı; ~29.000 madde).
İçe aktarma filtresi: 3/4/5 harf, 29 harfli alfabe (â/î/û elenir), özel ad /
kısaltma / noktalama / ikileme kökleri elenir.

### Güncelleme akışı

```bash
python3 tools/sozluk_indir.py    # Zemberek sözlüğünü indir + filtrele (tek seferlik / güncellemede)
python3 tools/bulmaca_uret.py    # words.json'ı yeniden üret
```

- Yeni yaygın kelime (bulmaca ucu adayı) eklemek için: `tools/kelimeler.txt`
- Uygunsuz kelime engellemek için: `tools/yasakli.txt`
- Her iki durumda da sonra `bulmaca_uret.py` çalıştırılır. Betik "1 harf farkı"
  grafiği kurup **BFS ile çözülebilirliği garanti** bulmaca çiftleri üretir;
  her bulmacaya en kısa çözüm adımı da eklenir.

> Neden canlı TDK sorgusu değil? TDK'nın resmî bir API'si yok; sozluk.gov.tr'nin
> belgesiz uç noktası tarayıcıdan CORS nedeniyle çağrılamaz, her an
> değişebilir/engellenebilir ve toplu kelime listesi vermez (bulmaca üretimi ve
> çözülebilirlik garantisi tam listeyi gerektirir). Statik, üretim anında
> derlenen sözlük hem hızlı hem çevrimdışı çalışır — Wordle dahil tüm ciddi
> kelime oyunlarının kullandığı yöntem budur.

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
