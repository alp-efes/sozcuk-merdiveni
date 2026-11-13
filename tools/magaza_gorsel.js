#!/usr/bin/env node
/* =========================================================
 * Sözcük Merdiveni — App Store ekran görüntüsü üretici
 * ---------------------------------------------------------
 * Gerçek oyunu telefon boyutunda (dokunmatik düzen) açar, oynar ve her
 * ekranın üstüne kısa bir başlık bandı koyar. Sahte ekran çizilmez: görünen
 * her şey sitenin kendi index.html / app.js / style.css dosyalarıdır.
 * Bant da renk ve yazıyı style.css belirteçlerinden alır.
 *
 * Çıktı: tools/uygulama/magaza/NN-ad.png — 1320×2868 (App Store 6,9").
 * Reklam yer tutucuları gizlenir. Saat sabitlenir; aynı tarih aynı görseli
 * verir. Playwright depoya değil, çalıştıran makineye kuruludur
 * (tools/test_tarayici.js ile aynı düzen).
 *
 * Kullanım:  node tools/magaza_gorsel.js [YYYY-AA-GG]
 *
 * Mağazaya gidecek son görselleri macOS'ta üretin: yazı tipi
 * iPhone'dakiyle aynı çıkar. Linux çıktısı yerleşim denetimi içindir.
 * ========================================================= */
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const KOK = path.resolve(__dirname, "..");
const CIKTI = path.join(__dirname, "uygulama", "magaza");
const PORT = 8767;                       // 8765 önizleme, 8766 duman testi
const ADRES = `http://127.0.0.1:${PORT}/`;
const TARIH = process.argv[2] || "2026-11-12";

// 440×956 CSS px × 3 = 1320×2868
const OLCEK = 3;
const TUVAL = { width: 440, height: 956 };
const OYUN = { width: 380, height: 730 };   // bandın altına gömülen oyun ekranı

// Başlıklar yalnızca oyunun gerçekten yaptığını söyler; abartı, sayı, ödül yok.
const EKRANLAR = [
  ["01-gunun-bulmacasi", "Her gün yeni bir bulmaca"],
  ["02-hamle", "Her adımda tek harf değiştir"],
  ["03-cozum", "Hedefe ulaş, sonucunu paylaş"],
  ["04-serbest-oyun", "Zorluğu ve uzunluğu sen seç"],
];

function sunucuBekle(kalan = 50) {
  return new Promise((coz, reddet) => {
    http.get(ADRES + "words.json", (yanit) => { yanit.resume(); coz(); })
      .on("error", () => kalan ? setTimeout(() => sunucuBekle(kalan - 1).then(coz, reddet), 100)
                               : reddet(new Error("yerel sunucu açılmadı")));
  });
}

const disAgiKapat = (baglam) => baglam.route("**/*", (istek) =>
  istek.request().url().startsWith(ADRES) ? istek.continue() : istek.abort());

/* Oyunu oynar; her ekran için PNG tamponu döndürür. */
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
  await sayfa.addStyleTag({ content: ".ad-container { display: none !important; }" });

  // Geçiş animasyonları gerçek saatle, oyunun zamanlayıcıları sahte saatle ilerler
  const cek = async () => { await sayfa.clock.runFor(1000); await sayfa.waitForTimeout(500); return sayfa.screenshot(); };
  const yaz = (metin) => sayfa.keyboard.type(metin.toLocaleLowerCase("tr"));

  // En kısa çözüm — oyunun kendi sözlüğüyle (genişlik öncelikli arama)
  const yol = await sayfa.evaluate(() => {
    const sozluk = new Set(oyun.db[String(oyun.startWord.length)].words);
    const ALFABE = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ";
    const once = new Map([[oyun.startWord, null]]);
    const kuyruk = [oyun.startWord];
    while (kuyruk.length) {
      const u = kuyruk.shift();
      if (u === oyun.targetWord) break;
      for (let i = 0; i < u.length; i++) for (const h of ALFABE) {
        const v = u.slice(0, i) + h + u.slice(i + 1);
        if (sozluk.has(v) && !once.has(v)) { once.set(v, u); kuyruk.push(v); }
      }
    }
    const adimlar = [];
    for (let k = oyun.targetWord; k !== oyun.startWord; k = once.get(k)) adimlar.unshift(k);
    return adimlar;
  });
  if (yol.length < 2) throw new Error(`${TARIH} bulmacası ${yol.length} adımlı; "hamle" ekranı için başka tarih verin`);

  const goruntuler = [];
  goruntuler.push(await cek());                          // 1: günün bulmacası

  await sayfa.tap("#game");                              // 2: ilk hamle + yarım kelime
  await yaz(yol[0]); await sayfa.keyboard.press("Enter");
  await yaz(yol[1].slice(0, -1));
  goruntuler.push(await cek());

  await yaz(yol[1].slice(-1)); await sayfa.keyboard.press("Enter");   // 3: çözüm
  for (const kelime of yol.slice(2)) { await yaz(kelime); await sayfa.keyboard.press("Enter"); }
  await sayfa.clock.runFor(1000);
  await sayfa.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 });
  goruntuler.push(await cek());

  await sayfa.tap("#btnCloseModal");                     // 4: serbest oyun
  await sayfa.tap("#tabFree");
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
         background: linear-gradient(var(--surface), var(--bg)); }
  .bant { height: ${TUVAL.height - OYUN.height - 26}px; padding: 0 var(--space-6);
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: var(--space-3); text-align: center; }
  .marka { color: var(--amber); font-size: var(--fs-sm); font-weight: var(--fw-bold);
           letter-spacing: var(--track-lg); }
  h1 { font-size: 2.125rem; font-weight: var(--fw-heavy); line-height: var(--lh-tight); }
  img { display: block; width: ${OYUN.width}px; height: ${OYUN.height}px; margin: 0 auto;
        border: 1px solid var(--border); border-radius: var(--space-6); box-shadow: var(--shadow-md); }
</style></head><body>
<div class="bant"><span class="marka">SÖZCÜK MERDİVENİ</span><h1></h1></div>
<img alt="" src="data:image/png;base64,${png.toString("base64")}">
<script>document.querySelector("h1").textContent = ${JSON.stringify(baslik)};</script>
</body></html>`;
}

async function main() {
  const sunucu = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"],
                       { cwd: KOK, stdio: "ignore" });
  let tarayici;
  try {
    await sunucuBekle();
    tarayici = await chromium.launch();
    const goruntuler = await oyunEkranlari(tarayici);

    const baglam = await tarayici.newContext({ viewport: TUVAL, deviceScaleFactor: OLCEK });
    await disAgiKapat(baglam);
    const sayfa = await baglam.newPage();
    fs.mkdirSync(CIKTI, { recursive: true });
    for (const [i, [ad, baslik]] of EKRANLAR.entries()) {
      // Belge yerel sunucudan açılır ki style.css aynı kaynaktan yüklensin
      await sayfa.route(ADRES + "magaza-sablon", (istek) =>
        istek.fulfill({ contentType: "text/html; charset=utf-8", body: sablon(baslik, goruntuler[i]) }));
      await sayfa.goto(ADRES + "magaza-sablon", { waitUntil: "load" });
      await sayfa.unroute(ADRES + "magaza-sablon");
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
    sunucu.kill();
  }
}

main().catch((e) => { console.error("Görseller üretilemedi:", e.message); process.exit(1); });
