# Zamanlanmış görevler

Takımları uyandıran bulut görevleri. Kurmak, açmak, durdurmak için CEO'ya
söylenir ("ekipleri başlat"); CEO kurduktan sonra "Durum" sütununu günceller. Her görev **yeni bir oturum** başlatır;
oturum `main`'i klonlar, bu yüzden buradaki dosyalar `main`'de olmadan görev
kurulmaz. Saatler TRT. Görevi durdurmak için: `ekip/durum.md` → `ANAHTAR: KAPALI`
ya da görevi zamanlanmış görevler listesinden kapat.

| Görev | Takım | Zaman (TRT) | Model | Durum |
|---|---|---|---|---|
| Günlük operasyon | operasyon | Her gün 00:20 | Haiku | Kurulmadı |
| Haftalık plan | yonetim | Pazartesi 10:13 | Opus | Kurulmadı |
| Oyun geliştirme | oyun-gelistirme | Salı 10:17 | Sonnet | Kurulmadı |
| Tasarım | tasarim | Çarşamba 10:11 | Sonnet | Sırada |
| Büyüme | buyume | Perşembe 10:19 | Sonnet | Sırada |
| Aylık uyum denetimi | hukuk-uyum | Ayın 1'i 11:07 | Opus | Sırada |
| Reklam ve gelir | reklam-gelir | Cuma 10:23 | Sonnet | Reklam yayına girince |

## Görev metni

Her görev aynı kalıbı kullanır; yalnızca takım adı değişir:

> Sözcük Merdiveni'nin `<takım>` takımı olarak çalışıyorsun. Önce
> `ekip/KURALLAR.md` ve `ekip/durum.md` dosyalarını, sonra
> `.claude/agents/<takım>.md` dosyasındaki görev tanımını oku ve o tanıma göre
> bu çalıştırmayı yap. Anahtar kapalıysa ya da iş yoksa tek satır rapor yazıp
> bitir. Site sahibine yalnızca karar gerektiren ya da bozuk bir şey varsa
> bildirim gönder.

Aylık uyum denetimi için ek: "Bu çalıştırma tam denetimdir: görev tanımındaki
yedi başlığın hepsine bak ve bulguları `[hukuk]` issue'ları olarak aç."

## Ortam gereksinimleri

- **Ağ:** operasyon takımı canlı siteye erişebilmeli (`xn--szckyolu-n4a6d.com`,
  `xn--szckmerdiveni-imb6g.com`). Varsayılan ortam şu an sınırsız ağda; ortam
  "Limited"e alınırsa bu iki adres izinli adreslere eklenmeli.
- **Anahtarlar** (sahip ekler, ortam ayarlarından; depoya yazılmaz):
  analitik, Search Console, App Store Connect, reklam raporu. Olmayan sayı
  raporda "erişim yok" diye geçer.
