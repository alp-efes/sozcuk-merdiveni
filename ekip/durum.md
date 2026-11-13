# Durum

Bu dosyayı site sahibi yönetir. Takımlar okur, değiştirmez.

**ANAHTAR: AÇIK**

`KAPALI` yapılıp `main`'e alınırsa bütün takımlar bir sonraki çalıştırmada
hiçbir şey yapmadan çıkar.

## Aşama

**2 — Otomatik birleştirme.** Takımlar PR açar ve denetimlerden geçen PR'ı
kendileri birleştirir (`ekip/KURALLAR.md` 8. bölüm). İstisnalar sahibe kalır.

**OTOMATİK BİRLEŞTİRME: AÇIK**

`KAPALI` yapılırsa takımlar PR açar ama birleştirmez; 1. aşamaya dönülür.
Günlük üst sınır: **5 birleştirme** (bütün takımlar toplamı, TRT günü).

## Aktif takımlar

- yonetim
- operasyon
- oyun-gelistirme

Sırada (henüz zamanlanmadı): `buyume`, `tasarim`. Reklam yayına girince:
`reklam-gelir`. `kod-inceleme`, `guvenlik` ve `hukuk-uyum` denetçidir; diğer
takımlar PR öncesinde çağırır. `guvenlik` ve `hukuk-uyum` ayrıca ayda bir tam
denetim yapar.

## İlk kurulum

Bu işler Fable ile yapılır; sonrası Opus/Sonnet. Biten işi CEO işaretler.

- [ ] iOS uygulaması iskeleti (`alp-efes/Sozcuk-merdiveni-ios`: Capacitor projesi,
      yerel özellikler, Xcode ayarları, ilk TestFlight derlemesi)
- [x] Tasarım sistemi (renk, yazı, boşluk belirteçleri; uygulama simgesi;
      site ve uygulamada ortak görsel dil; mağaza görsellerinin şablonu)

## Sahip kararları

Gizlilik ve mağaza (13 Kasım 2026, issue #9):

- **Analitik kalır, yalnızca izinle.** Firebase Analytics kabul edilmeden
  yüklenmez; seçim `sm_izin` anahtarında (`evet`/`hayir`), alt bilgiden
  geri alınabilir.
- **Metinlerde kişisel ad yok.** Veri sorumlusu "Sözcük Yolu (sözcükyolu.com)",
  iletişim `iletisim@`.
- **App Store:** paket kimliği `com.sozcukyolu.wordladder` (önceki `com.sozcukyolu.app` kararından değişti; Apple Developer üyeliği başvurusu sahipte bekliyor, kimlik henüz kayıtlı değil). İlk sürüm **AB
  hariç** bütün ülkelerde yayınlanır: AB için DSA "trader" beyanı ad, adres ve
  telefonu herkese açar; AB, sahibin sonradan açabileceği bir kapıdır.
- **Reklam istenir:** sitede AdSense planlandığı gibi; uygulama 1.0 reklamsız,
  AdMob sahibin AdMob hesabını açmasından sonraki bir sürümde. Reklam gelince
  AEA, Birleşik Krallık ve İsviçre için Google onaylı bir CMP gerekir; bu basit bildirimin yerini alır.
  Reklamdan önce gizlilik sayfası ve App Store gizlilik etiketi güncellenir.

## Bütçe

Harcama yetkisi: **0 TL.** Para gerektiren her şey `[sahip]` issue'su olur.

## Öncelikler

1. iOS uygulaması (Capacitor kabuğu) — ayrı depoda, tek seferlik proje.
2. Trafik: Search Console kaydı, `sitemap.xml` gönderimi.
3. Bulmaca uçlarını ~750 kelimenin ötesine genişletme.
