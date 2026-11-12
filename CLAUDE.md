# Sözcük Merdiveni

Türkçe kelime merdiveni oyunu. Her adımda tek harf değiştirerek başlangıç
kelimesinden hedef kelimeye ulaşılır.

**Saf HTML/CSS/JS. Derleme adımı yok, npm yok, framework yok.** Bu bilinçli bir
karar: Cloudflare'da statik olarak yayınlanıyor. Kütüphane eklemeyin; gerekirse
CDN'den ES modülü olarak alın (Firebase'de olduğu gibi).

Kod içi yorumlar ve kullanıcıya görünen her metin **Türkçe**.

## Adresler ve altyapı

| Ne | Değer |
|---|---|
| Asıl adres | `sözcükyolu.com` → punycode `xn--szckyolu-n4a6d.com` |
| Yönlendiren | `sözcükmerdiveni.com` → `xn--szckmerdiveni-imb6g.com` (301 → asıl) |
| Worker | `sozcuk-merdiveni` · `sozcuk-merdiveni.alpefes.workers.dev` |
| GitHub | `alp-efes/sozcuk-merdiveni` (main'e push → otomatik deploy) |
| Cloudflare hesap | `009041ed5ca6eefdd57978e9a1f5e5fb` |
| Zone: sözcükyolu | `538b144079a7238cbda218735c0a827d` |
| Zone: sözcükmerdiveni | `f324d6c464b9b6b78ef6458c43ee9b3c` |
| Firebase | proje `sozcukyolu`, ölçüm `G-T13CV0JKZQ` |
| İletişim | `iletisim@sözcükyolu.com` → Cloudflare Email Routing |

## Komutlar

```bash
python3 tools/sozluk_indir.py     # Zemberek'ten sözlüğü indir + süz
python3 tools/bulmaca_uret.py     # words.json üret (sözlük + bulmacalar)
python3 tools/ikon_uret.py        # favicon + sosyal kart PNG'leri (Pillow)
bash tools/test.sh                # tüm testler — PR açmadan önce geçmeli
```

Testler iki parçadır: `tools/test_veri.py` (sözlük, bulmacalar, site dosyaları,
güvenlik: izinli dış betikler, tehlikeli DOM kalıpları, gizli anahtar taraması;
bağımlılıksız) ve `tools/test_tarayici.js` (oyunu telefon boyutunda gerçek
tarayıcıda oynar; Playwright depoya değil, çalıştıran makineye kuruludur).
GitHub'da her PR'da `.github/workflows/test.yml` ikisini de çalıştırır.

Yerel sunucu: `preview_start` aracıyla `sozcuk-merdiveni` (port 8765).
`words.json` fetch ile çekildiği için `file://` ile açmak yetmez.

## Dosya yapısı

| Dosya | Görev |
|---|---|
| `index.html` | Tek sayfa: oyun + "Nasıl Oynanır" + SEO/AdSense/Firebase |
| `app.js` | `WordLadder` sınıfı; oyun mantığı, durum koruma, sayaç |
| `style.css` | Koyu tema, mobil öncelikli |
| `words.json` | **ÜRETİLİR — elle düzenlemeyin** |
| `tools/kelimeler.txt` | Elle onaylı ~750 kelime; **bulmaca uçları buradan** |
| `tools/otomatik_kelimeler.txt` | ÜRETİLİR. Zemberek'ten ~8.3k doğrulama sözlüğü |
| `tools/yasakli.txt` | Oyuna alınmayan kaba kelimeler |
| `gizlilik.html` | Tek ayrı sayfa (yasal gereklilik) |
| `wrangler.jsonc` + `.assetsignore` | Yalnızca statik site yayınlanır |
| `tools/test*.{py,js,sh}` | Testler (yayına çıkmaz) |
| `ekip/` + `.claude/agents/` | Otonom takımların kuralları ve görev tanımları |
| `.claude/commands/ceo.md` | CEO: sahiple konuşur, işi takımlara dağıtır |
| `.claude/skills/ponytail*` | Kod yazma ve inceleme becerileri (MIT, dışarıdan; sürümü `LICENSE`'ta) |

## Ekip (otonom işletim)

Oyunu zamanlanmış bulut oturumları olarak çalışan takımlar yürütür. Ortak
kurallar `ekip/KURALLAR.md`, açma/kapama anahtarı ve öncelikler
`ekip/durum.md`, zamanlamalar `ekip/gorevler.md`, takım görev tanımları
`.claude/agents/`. Takımlar PR açar ve denetimlerden geçeni kendileri
birleştirir (`ekip/KURALLAR.md` 8. bölüm); istisnaları site sahibi birleştirir. `ekip/`, `.github/` ve `CLAUDE.md` yayına çıkmaz
(`.assetsignore`).

**Site sahibiyle etkileşimli sohbette CEO'sun:** `.claude/commands/ceo.md`
dosyasını oku ve ona göre çalış (sahip `/ceo` yazmasa da). Zamanlanmış takım
çalıştırmalarında (görev metni "… takımı olarak çalışıyorsun" der) bu geçerli
değildir.

## Mimari kararlar

**Sözlük iki katmanlı.** Doğrulama sözlüğü geniş (~8.3k) — oyuncu bu kelimelerin
hepsini basamak olarak kullanabilir. Bulmaca uçları ise yalnızca elle onaylı
yaygın kelimelerden (~750) seçilir; kimseden bilmediği bir kelimeye ulaşması
istenmez. Wordle'ın "cevap listesi ⊂ tahmin listesi" tasarımı.

**Fiiller köke indirilir.** Zemberek fiilleri mastar halinde tutar ve P: etiketi
vermez (`gelmek [A:Aorist_I]`). `-mak/-mek` ile biten gerçek isim/sıfatlar ise
etiketlidir (`ekmek [P:Noun]`). Bu ayrımla mastar atılıp kök eklenir: GEL geçerli,
ETMEK değil. EKMEK/YEMEK korunur.

**Şapkalı harfler normalize edilir** (â→a, î→i, û→u). "kâse" sözlükte şapkalıydı
ve eleniyordu; artık KASE oynanabilir.

**Zorluk iki değişkenden hesaplanır:** en kısa adım sayısı ve en kısa yol sayısı
(esneklik). Az adım → kolay, çok adım/tek yol → zor. Puzzle biçimi:
`[başlangıç, hedef, adım, zorluk]`.

**Günlük bulmaca TRT'ye (UTC+3) sabit.** Cihaz saat diliminden bağımsız; herkes
aynı anda aynı bulmacayı görür. Gece yarısı kendiliğinden yenilenir.

**localStorage anahtarları:** `sm_state` (canlı oyun), `sm_gunluk_<YYYY-AA-GG>`
(günün çözümü + zincir), `sm_uzunluk`, `sm_zorluk`.

## Tuzaklar

**Tarayıcı önbelleği test sırasında yanıltır.** `app.js`/`style.css` bayat kalıp
"kod çalışmıyor" izlenimi verir. Sayfa URL'sine `?cb=` eklemek alt kaynakları
tazelemez. Doğrulama: `WordLadder.prototype.<yeniMetot>` var mı diye bak, ya da
`link.href = "style.css?v=" + Date.now()` ile CSS'i zorla yükle.

**Cloudflare MCP salt okunur.** Build/log/DNS okunur, ama zone/DNS/kural yazma
`Authentication error` verir. Yazma işlerini panoda kullanıcı yapar.

**`git push` ara sıra ağ hatası verir.** Aynı komutu tekrar deneyin.

**IDN:** makine alanlarında (canonical, sitemap, mailto, DNS) **punycode**;
kullanıcıya görünen metinde Unicode. iPhone Mail Unicode alan adına mail atamaz.

**`words.json` yeniden üretilirse günün bulmacası değişir** (sıra değişir).
Sözlük güncellemesini gün ortasında yayına almayın.

## Yayın

`git push` yeter — Cloudflare Workers otomatik derler. Build durumu panodan ya da
Workers Builds MCP'sinden okunur. Kullanıcıya "yayınlandı" demeden önce canlı
siteyi gerçekten test edin.

## Bekleyen işler

1. Google Search Console: siteyi ekle, `sitemap.xml` gönder.
2. AdSense: 3-4 hafta trafik sonrası başvur. Yer tutucular hazır — `index.html`
   içinde yorumlu şablonlar ve `ads.txt`.
3. Bulmaca uçlarını ~750 kelimenin ötesine genişletme (kullanıcı erteledi).
