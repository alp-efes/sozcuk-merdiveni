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

- **Analitik sitede kaldırıldı** (13 Kasım 2026, önceki "izinle kalır"
  kararının yerine): Firebase betiği, izin bildirimi ve çerez tercihi yok;
  sitede analitik ve reklam/izleme çerezi yok (Cloudflare yalnızca kesinlikle
  gerekli `cf_clearance` güvenlik çerezini koyar). Firebase projesi (`sozcukyolu`) duruyor, kullanılmıyor.
  Reklam gelince gizlilik sayfası önce güncellenir.
- **Metinlerde kişisel ad yok.** Veri sorumlusu "Sözcük Yolu (sözcükyolu.com)",
  iletişim `iletisim@`.
- **App Store:** paket kimliği `com.sozcukyolu.sozcukmerdiveni` (önceki `com.sozcukyolu.wordladder` ve `com.sozcukyolu.app` kararlarının yerine; Apple Developer üyeliği başvurusu sahipte bekliyor, kimlik henüz kayıtlı değil). İlk sürüm **AB
  hariç** bütün ülkelerde yayınlanır: AB için DSA "trader" beyanı ad, adres ve
  telefonu herkese açar; AB, sahibin sonradan açabileceği bir kapıdır.
- **iOS deposu herkese açık** (sahip yaptı, 13 Kasım 2026).
- **Reklam istenir:** sitede AdSense planlandığı gibi; uygulama 1.0 reklamsız,
  AdMob sahibin AdMob hesabını açmasından sonraki bir sürümde. Reklam gelince
  AEA, Birleşik Krallık ve İsviçre için Google onaylı bir CMP gerekir.
  Reklamdan önce gizlilik sayfası ve App Store gizlilik etiketi güncellenir.
- **Türkiye'de ayrı reklam rıza ekranı yok** (13 Kasım 2026, sahip kararı, kabul edilmiş risk):
  kişiselleştirilmemiş reklam meşru menfaate (KVKK m.5/2-f) dayanır, kişiselleştirme
  iOS ATT'ye. Hukuk taslağı bunun KVKK Çerez Rehberi'yle çeliştiğini söyledi; sahip riski
  bilerek kabul etti. `hukuk-uyum` bunu bulgu olarak yazabilir ama "sahip kararı, kabul
  edilmiş risk" diye; yeni issue/engel olarak açılmaz.
- **Cloudflare Web Analytics (RUM) 13 Kasım 2026'da kapatıldı ve kapalı kalmalı.**
  Bölge düzeyindeki her enjeksiyon (RUM, Zaraz vb.) `hukuk-uyum` incelemesi ister;
  depo testleri bunları görmez.

## Bütçe

Harcama yetkisi: **0 TL.** Para gerektiren her şey `[sahip]` issue'su olur.

## Öncelikler

1. iOS uygulaması (Capacitor kabuğu) — ayrı depoda, tek seferlik proje.
2. Trafik: Search Console kaydı, `sitemap.xml` gönderimi.
3. Bulmaca uçlarını ~750 kelimenin ötesine genişletme.
