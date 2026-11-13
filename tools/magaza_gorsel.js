#!/usr/bin/env node
/* =========================================================
 * Sözcük Merdiveni — App Store ekran görüntüsü üretici
 * ---------------------------------------------------------
 * UYGULAMA paketini (iOS deposunun www/ klasörü: site + uygulama arayüzü)
 * telefon boyutunda açar, oyuncunun yolundan oynar ve her ekranın üstüne kısa
 * bir başlık bandı koyar. Sahte ekran çizilmez: görünen her şey paketin kendi
 * dosyalarıdır. Uygulama arayüzü (ana ekran, telefonun klavyesi, harf şeridi)
 * siteden farklı olduğu için site değil paket kullanılır.
 * Bant renk ve yazıyı style.css belirteçlerinden alır.
 *
 * Paketi önce iOS deposunda üretin:
 *   cd ../sozcuk-merdiveni-ios && SITE_DEPOSU=<bu depo> npm run esitle
 * Paket başka yerdeyse: UYGULAMA_WWW=/yol/www node tools/magaza_gorsel.js
 *
 * Çıktı: tools/uygulama/magaza/NN-ad.png — 1320×2868 (App Store 6,9").
 * Klasördeki eski PNG'ler silinir. Saat sabitlenir; aynı tarih aynı görseli
 * verir. Capacitor köprüsü yoktur: Plus kartı ve reklam görünmez, iOS
 * klavyesi çizilmez (oyun ekranları klavye kapalıyken alınır).
 * Playwright depoya değil, çalıştıran makineye kuruludur
 * (tools/test_tarayici.js ile aynı düzen).
 *
 * Kullanım:  node tools/magaza_gorsel.js [YYYY-AA-GG]
 *
 * Mağazaya gidecek son görselleri macOS'ta üretin: yazı tipi
 * iPhone'dakiyle aynı çıkar. Linux çıktısı yerleşim denetimi içindir.
 * ========================================================= */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const KOK = path.resolve(__dirname, "..");
const WWW = path.resolve(process.env.UYGULAMA_WWW || path.join(KOK, "..", "sozcuk-merdiveni-ios", "www"));
const CIKTI = path.join(__dirname, "uygulama", "magaza");
const TARIH = process.argv[2] || "2026-11-13";
const TUR = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
              ".json": "application/json", ".woff2": "font/woff2" };
let ADRES;                               // yerel sunucu açılınca dolar

// 440×956 CSS px × 3 = 1320×2868
const OLCEK = 3;
const TUVAL = { width: 440, height: 956 };
// Oyun 6,9" iPhone'un içerik alanında (440×956 eksi durum çubuğu ve ana ekran çubuğu)
// oynanır, banda sığsın diye küçültülerek gömülür
const OYUN = { width: 440, height: 845 };
const GOMME = { width: 380, height: 730 };

// Başlıklar yalnızca uygulamanın gerçekten yaptığını söyler; abartı, sayı, ödül yok.
const EKRANLAR = [
  ["01-ana-ekran", "Günün bulmacası ya da serbest oyun"],
  ["02-hamle", "Her adımda tek harf değiştir"],
  ["03-cozum", "Hedefe ulaş, sonucunu paylaş"],
  ["04-geri-al", "Takılırsan geri al ya da yolu gör"],
  ["05-nasil-oynanir", "Kurallar tek ekranda"],
];

/* Paketi sunan yerel sunucu; klasör dışına çıkmaz. Mağaza şablonu da buradan verilir. */
function sunucuAc(sablonlar) {
  const sunucu = http.createServer((istek, yanit) => {
    const ad = decodeURIComponent(new URL(istek.url, "http://x").pathname);
    if (sablonlar.has(ad)) return yanit.writeHead(200, { "Content-Type": TUR[".html"] }).end(sablonlar.get(ad));
    const yol = path.resolve(WWW, "." + ad.replace(/\/$/, "/index.html"));
    try {
      if (!yol.startsWith(WWW + path.sep)) throw new Error("dışarı çıkma");
      yanit.writeHead(200, { "Content-Type": TUR[path.extname(yol)] || "application/octet-stream" }).end(fs.readFileSync(yol));
    } catch (_) { yanit.writeHead(404).end(); }
  });
  return new Promise((coz) => sunucu.listen(0, "127.0.0.1", () => {
    ADRES = `http://127.0.0.1:${sunucu.address().port}/`;
    coz(sunucu);
  }));
}

const disAgiKapat = (baglam) => baglam.route("**/*", (istek) =>
  istek.request().url().startsWith(ADRES) ? istek.continue() : istek.abort());

/* Oyunun kendi sözlüğüyle hedefe uzaklıklar (genişlik öncelikli arama, hedeften geriye). */
const uzakliklar = (sayfa) => sayfa.evaluate(() => {
  const sozluk = new Set(oyun.db[String(oyun.startWord.length)].words);
  const ALFABE = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ";
  const uzak = { [oyun.targetWord]: 0 };
  const kuyruk = [oyun.targetWord];
  while (kuyruk.length) {
    const u = kuyruk.shift();
    for (let i = 0; i < u.length; i++) for (const h of ALFABE) {
      const v = u.slice(0, i) + h + u.slice(i + 1);
      if (sozluk.has(v) && !(v in uzak)) { uzak[v] = uzak[u] + 1; kuyruk.push(v); }
    }
  }
  return uzak;
});
// Elle onaylı yaygın kelimeler önce gelir: görselde oyuncunun tanıdığı basamaklar görünsün
const YAYGIN = new Set(fs.readFileSync(path.join(__dirname, "kelimeler.txt"), "utf8")
  .split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#")));
const komsular = (k, uzak) => Object.keys(uzak)
  .filter((v) => [...v].filter((h, i) => h !== k[i]).length === 1)
  .sort((a, b) => YAYGIN.has(b) - YAYGIN.has(a));

/* Paketi oynar; her ekran için PNG tamponu döndürür. */
async function oyunEkranlari(tarayici) {
  const baglam = await tarayici.newContext({
    viewport: OYUN, deviceScaleFactor: OLCEK, hasTouch: true, isMobile: true, locale: "tr-TR",
  });
  await disAgiKapat(baglam);
  // Serbest oyunun rastgele bulmacası her çalıştırmada aynı çıksın
  await baglam.addInitScript(() => {
    let tohum = 20261112;
    Math.random = () => (tohum = (tohum * 1664525 + 1013904223) % 4294967296) / 4294967296;
  });
  const sayfa = await baglam.newPage();
  const sayfaHatalari = [];
  sayfa.on("pageerror", (e) => sayfaHatalari.push(e.message));
  await sayfa.clock.install({ time: new Date(`${TARIH}T09:00:00Z`) });   // TRT 12:00
  await sayfa.goto(ADRES);
  await sayfa.waitForFunction(() => window.oyun && window.oyun.db && window.oyun.startWord, null, { timeout: 10000 });

  // Geçiş animasyonları gerçek saatle, oyunun zamanlayıcıları sahte saatle ilerler
  const ilerle = async () => { await sayfa.clock.runFor(1500); await sayfa.waitForTimeout(500); };
  const cek = async () => { await ilerle(); return sayfa.screenshot(); };
  const ekranBekle = (ad) => sayfa.waitForFunction((a) => document.body.dataset.ekran === a, ad, { timeout: 5000 });
  // Oyuncu telefonun klavyesiyle küçük harf yazar; uygulama Türkçe kuralla büyütür
  const yaz = (metin) => sayfa.keyboard.type(metin.toLocaleLowerCase("tr-TR"));
  const gonder = async (kelime) => { await yaz(kelime); await sayfa.keyboard.press("Enter"); await ilerle(); };
  const zincir = () => sayfa.evaluate(() => oyun.chain.slice());

  const goruntuler = [];
  await sayfa.clock.runFor(1500);                         // açılış ekranı geçer
  await ekranBekle("ana");
  goruntuler.push(await cek());                          // 1: ana ekran

  await sayfa.tap("#btnGunluk");                          // 2: günün bulmacası, ilk hamle + yarım kelime
  await ekranBekle("oyun");
  let uzak = await uzakliklar(sayfa);
  const sonraki = (k) => komsular(k, uzak).find((v) => uzak[v] === uzak[k] - 1);
  let k = (await zincir()).at(-1);
  if (uzak[k] < 3) throw new Error(`${TARIH} bulmacası ${uzak[k]} adımlı; "hamle" ekranı için başka tarih verin`);
  await gonder((k = sonraki(k)));
  await yaz(sonraki(k).slice(0, -1));
  goruntuler.push(await cek());

  await yaz(sonraki(k).slice(-1)); await sayfa.keyboard.press("Enter"); await ilerle();   // 3: çözüm
  for (k = sonraki(k); uzak[k] > 0;) await gonder((k = sonraki(k)));
  await sayfa.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 });
  goruntuler.push(await cek());

  // 4: serbest oyun; hedefe yaklaşmayan hamlelerle en kısa yolu aşınca "Sonucu göster" belirir
  await sayfa.tap("#btnCloseModal");
  await ilerle();
  await sayfa.tap("#btnAna");
  await ekranBekle("ana");
  await sayfa.tap("#btnSerbest");
  await ekranBekle("oyun");
  uzak = await uzakliklar(sayfa);
  const enAz = await sayfa.evaluate(() => oyun.optimal);
  for (let i = 0; i <= enAz; i++) {
    const z = await zincir();
    const son = z.at(-1);
    const v = komsular(son, uzak).find((w) => !z.includes(w) && uzak[w] >= uzak[son] && uzak[w] > 0);
    if (!v) throw new Error("serbest oyunda dolambaçlı yol bulunamadı; başka tarih verin");
    await gonder(v);
  }
  if (!(await sayfa.isVisible("#btnShowResult"))) throw new Error("Sonucu göster düğmesi görünmedi");
  await sayfa.tap("#btnShowResult");
  await sayfa.waitForFunction(() => !document.getElementById("pes").classList.contains("hidden"), null, { timeout: 5000 });
  goruntuler.push(await cek());

  await sayfa.tap("#btnPesVazgec");                       // 5: nasıl oynanır (ana ekrandan)
  await ilerle();
  await sayfa.tap("#btnAna");
  await ekranBekle("ana");
  await sayfa.tap("#btnAnaYardim");
  await sayfa.waitForFunction(() => document.body.classList.contains("yardim"), null, { timeout: 5000 });
  goruntuler.push(await cek());

  if (sayfaHatalari.length) throw new Error("sayfada hata: " + sayfaHatalari.join(" | "));
  await baglam.close();
  return goruntuler;
}

/* Başlık bandı + oyun ekranı. Renk ve yazı style.css belirteçlerinden gelir. */
function sablon(baslik, png) {
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8">
<link rel="stylesheet" href="${ADRES}style.css">
<style>
  body { width: ${TUVAL.width}px; height: ${TUVAL.height}px; overflow: hidden;
         background: var(--surface-2); }
  .bant { height: ${TUVAL.height - GOMME.height - 26}px; padding: 0 var(--space-6);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: var(--space-3); text-align: center; }
  .marka { color: var(--accent); font-size: var(--fs-sm); font-weight: var(--fw-bold);
           letter-spacing: var(--track-lg); }
  h1 { font-family: var(--font-display); font-size: var(--fs-3xl); font-weight: var(--fw-heavy); line-height: var(--lh-tight); }
  img { display: block; width: ${GOMME.width}px; height: ${GOMME.height}px; margin: 0 auto;
        border: 1.5px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); }
</style></head><body>
<div class="bant"><span class="marka">SÖZCÜK MERDİVENİ</span><h1></h1></div>
<img alt="" src="data:image/png;base64,${png.toString("base64")}">
<script>document.querySelector("h1").textContent = ${JSON.stringify(baslik)};</script>
</body></html>`;
}

async function main() {
  // Uygulama paketi mi? (sitenin index.html'i uygulama.js yüklemez)
  const html = fs.existsSync(path.join(WWW, "index.html")) ? fs.readFileSync(path.join(WWW, "index.html"), "utf8") : "";
  if (!html.includes('src="uygulama.js"')) {
    throw new Error(`${WWW} uygulama paketi değil. iOS deposunda: SITE_DEPOSU=${KOK} npm run esitle`);
  }
  const sablonlar = new Map();
  const sunucu = await sunucuAc(sablonlar);
  let tarayici;
  try {
    tarayici = await chromium.launch();
    const goruntuler = await oyunEkranlari(tarayici);

    const baglam = await tarayici.newContext({ viewport: TUVAL, deviceScaleFactor: OLCEK });
    await disAgiKapat(baglam);
    const sayfa = await baglam.newPage();
    fs.mkdirSync(CIKTI, { recursive: true });
    for (const eski of fs.readdirSync(CIKTI)) if (eski.endsWith(".png")) fs.unlinkSync(path.join(CIKTI, eski));
    for (const [i, [ad, baslik]] of EKRANLAR.entries()) {
      // Şablon yerel sunucudan açılır ki style.css aynı kaynaktan yüklensin
      sablonlar.set("/magaza-sablon", sablon(baslik, goruntuler[i]));
      await sayfa.goto(ADRES + "magaza-sablon", { waitUntil: "load" });
      await sayfa.evaluate(() => document.fonts.ready);
      const dosya = path.join(CIKTI, ad + ".png");
      await sayfa.screenshot({ path: dosya });
      // Öz denetim: PNG başlığındaki ölçü mağazanın istediği ölçü mü
      const bas = fs.readFileSync(dosya).subarray(16, 24);
      const [en, boy] = [bas.readUInt32BE(0), bas.readUInt32BE(4)];
      if (en !== TUVAL.width * OLCEK || boy !== TUVAL.height * OLCEK) {
        throw new Error(`${ad}.png ${en}×${boy}; ${TUVAL.width * OLCEK}×${TUVAL.height * OLCEK} olmalı`);
      }
      console.log(`  ${path.relative(KOK, dosya)}  ${en}×${boy}  "${baslik}"`);
    }
  } finally {
    if (tarayici) await tarayici.close();
    sunucu.close();
  }
}

main().catch((e) => { console.error("Görseller üretilemedi:", e.message); process.exit(1); });
