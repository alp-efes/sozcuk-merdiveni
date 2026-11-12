# Zamanlanmış görevler

Takımları uyandıran bulut görevleri. Kurmak, açmak, durdurmak için CEO'ya
söylenir ("ekipleri başlat"); CEO kurduktan sonra "Durum" sütununu günceller. Her görev **yeni bir oturum** başlatır;
oturum `main`'i klonlar, bu yüzden buradaki dosyalar `main`'de olmadan görev
kurulmaz. Saatler TRT. Görevi durdurmak için: `ekip/durum.md` → `ANAHTAR: KAPALI`
ya da görevi zamanlanmış görevler listesinden kapat.

| Görev | Takım | Zaman (TRT) | Model | Durum |
|---|---|---|---|---|
| Günlük operasyon | operasyon | Her gün 00:20 | Haiku | Kuruldu, çalışmıyor: depo bağlı değil |
| Haftalık plan | yonetim | Pazartesi 10:13 | Opus | Kuruldu, çalışmıyor: depo bağlı değil |
| Oyun geliştirme | oyun-gelistirme | Salı 10:17 | Sonnet | Kuruldu, çalışmıyor: depo bağlı değil |
| Tasarım | tasarim | Çarşamba 10:11 | Opus | Sırada |
| Büyüme | buyume | Perşembe 10:19 | Sonnet | Sırada |
| Aylık uyum denetimi | hukuk-uyum | Ayın 1'i 11:07 | Opus | Sırada |
| Aylık güvenlik denetimi | guvenlik | Ayın 2'si 11:13 | Opus | Kuruldu, çalışmıyor: depo bağlı değil |
| Reklam ve gelir | reklam-gelir | Cuma 10:23 | Sonnet | Reklam yayına girince |

## Görev metni

Her görev aynı kalıbı kullanır; yalnızca takım adı değişir:

> Sözcük Merdiveni'nin `<takım>` takımı olarak çalışıyorsun. Çalışma
> dizininde `ekip/KURALLAR.md` yoksa depo bu oturuma bağlanmamıştır: tek
> satırla "depo erişimi yok" yaz ve bitir. Önce `ekip/KURALLAR.md` ve
> `ekip/durum.md` dosyalarını, sonra `.claude/agents/<takım>.md` dosyasındaki
> görev tanımını oku ve o tanıma göre bu çalıştırmayı yap. Anahtar kapalıysa ya da iş yoksa tek satır rapor yazıp
> bitir. Site sahibine yalnızca karar gerektiren ya da bozuk bir şey varsa
> bildirim gönder.

Aylık uyum denetimi için ek: "Bu çalıştırma tam denetimdir: görev tanımındaki
yedi başlığın hepsine bak ve bulguları `[hukuk]` issue'ları olarak aç."

Aylık güvenlik denetimi için ek: "Bu çalıştırma tam denetimdir: görev
tanımındaki 'Aylık tam denetim' bölümünü uygula ve bulguları `[guvenlik]`
issue'ları olarak aç."

## Ortam gereksinimleri

- **Depo:** Görev, claude.ai'daki zamanlanmış görevler ekranından
  `alp-efes/sozcuk-merdiveni` deposu seçilerek kurulmalı. CEO oturumundan
  (`create_trigger`) kurulan görevin kaynağı boş gelir; açılan oturumda depo
  da `add_repo` aracı da yoktur (2026-11-12 ilk deneme "depo erişimi yok" ile
  bitti).
- **Ağ:** operasyon takımı canlı siteye erişebilmeli (`xn--szckyolu-n4a6d.com`,
  `xn--szckmerdiveni-imb6g.com`). Varsayılan ortam şu an sınırsız ağda; ortam
  "Limited"e alınırsa bu iki adres izinli adreslere eklenmeli.
- **Anahtarlar** (sahip ekler, ortam ayarlarından; depoya yazılmaz):
  analitik, Search Console, App Store Connect, reklam raporu. Olmayan sayı
  raporda "erişim yok" diye geçer.
