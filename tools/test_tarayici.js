#!/usr/bin/env node
/* =========================================================
 * Sözcük Merdiveni — tarayıcı duman testi
 * ---------------------------------------------------------
 * Oyunu gerçek bir tarayıcıda (telefon boyutunda) açar ve bir oyuncunun
 * yapacağı şeyleri yapar. Depoya bağımlılık eklemez: Playwright yalnızca
 * testi çalıştıran makinede kurulu olmalıdır (bulut oturumlarında hazır
 * gelir; CI'da iş akışı kurar). Site dosyalarına dokunmaz.
 *
 * Denetlenenler:
 *   1. Sayfa hatasız açılıyor, words.json yükleniyor (mock'a düşmüyor)
 *   2. Günün bulmacası TRT gününe göre beklenen bulmaca
 *   3. Geçersiz hamle reddediliyor
 *   4. Bulmaca ekran klavyesiyle en kısa yoldan çözülebiliyor
 *   5. Çözüm kaydediliyor ve sayfa yenilenince geri geliyor
 *   6. Telefon genişliğinde yatay taşma yok
 *   7. Serbest oyun seçilen uzunlukta bulmaca veriyor
 *   8. Dokunmatikte de ekran klavyesi kullanılıyor (cihaz klavyesi açılmaz);
 *      fiziksel klavye çalışıyor
 *   9. TRT gece yarısında bulmaca kendiliğinden değişiyor
 *  10. Küçük telefonda HEDEF/giriş satırı ilk ekranda; dokunma alanları ≥ 44 px;
 *      uzun merdivende eski basamaklar kayıyor, giriş ve HEDEF görünür kalıyor
 *  11. Site Google/gstatic'e hiç istek yapmıyor; eski analitikten kalan
 *      çerez/anahtar bir kez temizleniyor
 *
 * Dış ağ engellenir ve kaydedilir; test internetsiz de aynı sonucu verir.
 *
 * Kullanım:  node tools/test_tarayici.js
 * ========================================================= */
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const KOK = path.resolve(__dirname, "..");
const PORT = 8766;                       // 8765 yerel önizlemeye ayrılmış
const ADRES = `http://127.0.0.1:${PORT}/`;
const TRT_MS = 3 * 3600 * 1000;
const GUN_BASLANGIC_UTC = Date.UTC(2026, 6, 15);   // app.js ile aynı olmalı

const hatalar = [];
let gecen = 0;
function denetle(kosul, mesaj) {
  if (kosul) gecen++;
  else { hatalar.push(mesaj); console.log("  ✗ " + mesaj); }
}

/* ---- app.js'teki günlük seçim kuralının bağımsız kopyası ---- */
const db = JSON.parse(fs.readFileSync(path.join(KOK, "words.json"), "utf8"));
const tumBulmacalar = Object.keys(db).sort().flatMap(boy => db[boy].puzzles);

function gunNo(anMs) {
  const d = new Date(anMs + TRT_MS);
  const gun = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((gun - GUN_BASLANGIC_UTC) / 86400000) + 1;
}
function beklenenBulmaca(anMs) {
  const n = tumBulmacalar.length;
  return tumBulmacalar[((gunNo(anMs) % n) + n) % n];
}

/* ---- En kısa çözüm yolu (BFS) ---- */
function enKisaYol(bas, hedef) {
  const kelimeler = db[String(bas.length)].words;
  const kova = new Map();
  for (const k of kelimeler) {
    for (let i = 0; i < k.length; i++) {
      const desen = k.slice(0, i) + "_" + k.slice(i + 1);
      if (!kova.has(desen)) kova.set(desen, []);
      kova.get(desen).push(k);
    }
  }
  const once = new Map([[bas, null]]);
  const kuyruk = [bas];
  while (kuyruk.length) {
    const u = kuyruk.shift();
    if (u === hedef) break;
    for (let i = 0; i < u.length; i++) {
      for (const v of kova.get(u.slice(0, i) + "_" + u.slice(i + 1)) || []) {
        if (!once.has(v)) { once.set(v, u); kuyruk.push(v); }
      }
    }
  }
  if (!once.has(hedef)) return null;
  const yol = [];
  for (let k = hedef; k !== bas; k = once.get(k)) yol.unshift(k);
  return yol;                              // başlangıç hariç, hedef dahil
}

/* ---- Yerel sunucu ---- */
function sunucuBekle(deneme = 50) {
  return new Promise((coz, reddet) => {
    const dene = (kalan) => {
      http.get(ADRES + "words.json", (yanit) => { yanit.resume(); coz(); })
        .on("error", () => kalan ? setTimeout(() => dene(kalan - 1), 100)
                                 : reddet(new Error("yerel sunucu açılmadı")));
    };
    dene(deneme);
  });
}

async function kelimeYaz(sayfa, kelime) {
  for (const harf of kelime) await sayfa.click(`#keyboard .key[data-key="${harf}"]`);
  await sayfa.click('#keyboard .key[data-key="ENTER"]');
}

// Telefonda oyuncunun yaptığı gibi: ekran klavyesine dokunarak
async function kelimeDokun(sayfa, kelime) {
  for (const harf of kelime) await sayfa.tap(`#keyboard .key[data-key="${harf}"]`);
  await sayfa.tap('#keyboard .key[data-key="ENTER"]');
}

async function oyunHazir(sayfa) {
  await sayfa.waitForFunction(() => window.oyun && window.oyun.db && window.oyun.startWord, null, { timeout: 10000 });
}

async function main() {
  const sunucu = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"],
                       { cwd: KOK, stdio: "ignore" });
  let tarayici;
  try {
    await sunucuBekle();
    tarayici = await chromium.launch();
    // Dış ağı kapat: reklam/analitik betikleri testin sonucunu etkilemesin
    const disIstekler = [];
    const disAgiKapat = (b) => b.route("**/*", (istek) => {
      const url = istek.request().url();
      if (url.startsWith(ADRES)) return istek.continue();
      disIstekler.push(url);
      return istek.abort();
    });
    // Dar ekran + fare: ekran klavyesi görünür (dokunmatikte gizlenir, bkz. 8. adım)
    const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 } });
    await disAgiKapat(baglam);

    const sayfa = await baglam.newPage();
    const sayfaHatalari = [];
    const uyarilar = [];
    sayfa.on("pageerror", (e) => sayfaHatalari.push(e.message));
    sayfa.on("console", (m) => { if (m.type() === "warning") uyarilar.push(m.text()); });

    /* 1) Açılış */
    console.log("1. Açılış");
    await sayfa.goto(ADRES);
    await oyunHazir(sayfa);
    denetle(!uyarilar.some(u => u.includes("mock sözlük")), "words.json yüklenmedi, mock sözlüğe düşüldü");
    const tusSayisi = await sayfa.locator("#keyboard .key").count();
    denetle(tusSayisi === 31, `ekran klavyesinde ${tusSayisi} tuş var, 31 olmalı (29 harf + GİR + sil)`);
    // İkonlar satır içi SVG: her ikon düğmesinde tam bir görünür ikon ve erişilebilir ad
    const gorunurIkon = () => sayfa.evaluate(() =>
      ["#btnMute", "#btnRestart", "#keyboard .key[data-key=BACK]", "#btnCloseModal", "#btnHelp"].map((sec) => {
        const d = document.querySelector(sec);
        // Kapalı pencerenin düğmesi ölçülemez: görünürlük ikonun kendi display değerinden okunur
        const g = [...d.querySelectorAll("svg")].filter((s) => getComputedStyle(s).display !== "none");
        return { sec, ad: d.getAttribute("aria-label"), basili: d.getAttribute("aria-pressed"), sinif: g.map((s) => s.getAttribute("class")).join("|") };
      }));
    const ikonlar = await gorunurIkon();
    for (const i of ikonlar) denetle(!!i.ad && i.sinif.startsWith("icon") && !i.sinif.includes("|"), `${i.sec}: tek görünür SVG ikon ve aria-label olmalı (${i.sinif})`);
    await sayfa.click("#btnMute");
    denetle(ikonlar[0].basili === "false", `ses düğmesi açılışta aria-pressed=${ikonlar[0].basili}, "false" olmalı`);
    const sessiz = (await gorunurIkon())[0];
    denetle(sessiz.sinif.includes("icon-sound-off") && sessiz.sinif !== ikonlar[0].sinif, `ses kapatılınca ikon değişmedi (${sessiz.sinif})`);
    denetle(sessiz.basili === "true", `ses kapatılınca aria-pressed=${sessiz.basili}, "true" olmalı`);
    await sayfa.click("#btnMute");
    const sesli = (await gorunurIkon())[0];
    denetle(sesli.sinif === ikonlar[0].sinif && sesli.basili === "false", "ses açılınca ikon ya da aria-pressed geri dönmedi");

    // Başlık ve harfler depodaki yazı tipiyle çiziliyor (dış sunucu yok)
    denetle(await sayfa.evaluate(() => document.fonts.load('700 20px "Fraunces"', "ĞŞİ").then((f) => f.length > 0, () => false)),
            "Fraunces yazı tipi yerel dosyadan yüklenmedi");

    /* 2) Günün bulmacası */
    console.log("2. Günün bulmacası");
    const [bas, hedef, adim] = beklenenBulmaca(Date.now());
    const durum = await sayfa.evaluate(() => ({
      mod: oyun.mode, bas: oyun.startWord, hedef: oyun.targetWord, en: oyun.optimal,
      basYazi: document.getElementById("startWord").textContent,
      hedefYazi: document.getElementById("targetWord").textContent,
    }));
    denetle(durum.mod === "daily", `açılış modu '${durum.mod}', 'daily' olmalı`);
    denetle(durum.bas === bas && durum.hedef === hedef,
            `günün bulmacası ${durum.bas}→${durum.hedef}, beklenen ${bas}→${hedef}`);
    denetle(durum.basYazi === bas && durum.hedefYazi === hedef, "başlangıç/hedef kelimesi ekranda yanlış");

    /* 3) Geçersiz hamle */
    console.log("3. Geçersiz hamle");
    await kelimeYaz(sayfa, bas);           // kelimeyi değiştirmeden gönder
    const red = await sayfa.evaluate(() => ({
      zincir: oyun.chain.length,
      toast: document.getElementById("toast").textContent,
      gorunur: document.getElementById("toast").classList.contains("show"),
    }));
    denetle(red.zincir === 1, "değişmeyen kelime kabul edildi");
    denetle(red.gorunur && red.toast.length > 0, "geçersiz hamlede uyarı gösterilmedi");
    for (let i = 0; i < bas.length; i++) await sayfa.click('#keyboard .key[data-key="BACK"]');

    /* 4) Çözüm */
    console.log("4. Çözüm");
    const yol = enKisaYol(bas, hedef);
    denetle(!!yol, `${bas}→${hedef} çözülemiyor`);
    denetle(yol && yol.length === adim, `en kısa yol ${yol && yol.length} adım, words.json ${adim} diyor`);
    // İlk adım: merdiven yukarıdan aşağı okunur — BAŞLANGIÇ, adım, giriş, boş basamaklar, HEDEF
    if (yol) await kelimeYaz(sayfa, yol[0]);
    await sayfa.waitForTimeout(400);         // basamağın iniş animasyonu bitsin
    const duzen = await sayfa.evaluate(() => {
      const ust = (sec) => document.querySelector(sec).getBoundingClientRect().top;
      const basamak = document.querySelector("#ladder .rung");
      return {
        sira: [ust("#startWord"), ust("#ladder .rung"), ust("#inputRow"), ust("#targetWord")],
        // Giriş satırı son yazılan kelimenin hemen altındaki basamakta
        aralik: ust("#inputRow") - basamak.querySelector(".word-row").getBoundingClientRect().bottom,
        hedefeUzaklik: ust("#targetWord") - document.getElementById("inputRow").getBoundingClientRect().bottom,
        etiket: basamak.querySelector(".step-label").textContent,
        degisen: basamak.querySelectorAll(".tile.changed").length,
        imlec: document.querySelectorAll("#inputRow .tile.cursor").length,
        durum: document.getElementById("stepInfo").textContent,
        boy: document.getElementById("game").dataset.boy,
      };
    });
    denetle(duzen.sira.every((y, i) => i === 0 || y > duzen.sira[i - 1]),
            `merdiven sırası BAŞLANGIÇ → adım → giriş → HEDEF değil (${duzen.sira.map(Math.round)})`);
    denetle(duzen.aralik >= 0 && duzen.aralik <= 16, `giriş satırı son kelimenin hemen altında değil (aralık ${Math.round(duzen.aralik)} px)`);
    denetle(duzen.hedefeUzaklik > 40, `390×844'te giriş satırı ile HEDEF arasında boş basamak kalmalı (${Math.round(duzen.hedefeUzaklik)} px)`);
    denetle(duzen.etiket === "1. adım" && duzen.durum === "1 adım", `adım etiketi '${duzen.etiket}', durum satırı '${duzen.durum}'`);
    denetle(duzen.degisen === 1, `ilk adımda ${duzen.degisen} harf "değişen" işaretli, 1 olmalı`);
    denetle(duzen.imlec === 1, "giriş satırında sıradaki harfin yeri (imleç) tek kutu olmalı");
    denetle(duzen.boy === String(bas.length), `#game data-boy=${duzen.boy}, kelime ${bas.length} harfli`);
    for (const kelime of (yol || []).slice(1)) await kelimeYaz(sayfa, kelime);
    const son = await sayfa.evaluate(() => ({
      bitti: oyun.over, zincir: oyun.chain.slice(),
      sinif: document.getElementById("game").classList.contains("bitti"),
    }));
    denetle(son.bitti && son.sinif, "hedefe ulaşıldı ama oyun bitmedi");
    denetle(son.zincir.length === (yol ? yol.length : 0) + 1, "merdivendeki kelime sayısı yanlış");
    await sayfa.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"),
                                null, { timeout: 5000 })
      .then(() => { gecen++; }, () => denetle(false, "kazanınca tebrik penceresi açılmadı"));
    const pencere = await sayfa.evaluate(() => ({
      adim: document.getElementById("modalSteps").textContent,
      enAz: document.getElementById("modalOptimal").textContent,
      satir: document.querySelectorAll("#modalGrid > div").length,
      sonYesil: document.querySelectorAll("#modalGrid > div:last-child .green").length,
      paylasIkon: document.querySelectorAll("#btnShare svg.icon").length,
      cozuldu: document.getElementById("stepInfo").textContent,
    }));
    denetle(pencere.adim === String(adim) && pencere.enAz === String(adim), `pencerede adım ${pencere.adim}, en az ${pencere.enAz}; ${adim} olmalı`);
    denetle(pencere.satir === adim && pencere.sonYesil === bas.length, "pencere sonuç ızgarası adımlarla uyuşmuyor");
    denetle(pencere.paylasIkon === 1, "Sonucu Paylaş düğmesinde tek SVG ikon olmalı");
    denetle(pencere.cozuldu === "Çözüldü", `durum satırı çözülünce '${pencere.cozuldu}'`);

    /* 5) Kayıt ve yenileme */
    console.log("5. Kayıt ve yenileme");
    const kayit = await sayfa.evaluate(() => JSON.parse(localStorage.getItem("sm_gunluk_" + oyun.todayKey())));
    denetle(kayit && kayit.steps === adim, `günlük kayıt yanlış: ${JSON.stringify(kayit)}`);
    await sayfa.reload();
    await oyunHazir(sayfa);
    const yenilenmis = await sayfa.evaluate(() => ({
      bitti: oyun.over, zincir: oyun.chain.length,
      cozulduGorunur: !document.getElementById("dailySolved").classList.contains("hidden"),
    }));
    denetle(yenilenmis.bitti, "yenilemeden sonra çözülmüş bulmaca yeniden açıldı");
    denetle(yenilenmis.zincir === adim + 1, "yenilemeden sonra çözüm merdiveni kayboldu");
    denetle(yenilenmis.cozulduGorunur, "yenilemeden sonra 'çözüldü' satırı görünmüyor");

    /* 6) Taşma */
    console.log("6. Telefon düzeni");
    const tasma = await sayfa.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    denetle(tasma <= 0, `sayfa yatayda ${tasma}px taşıyor`);

    /* 7) Serbest oyun */
    console.log("7. Serbest oyun");
    await sayfa.click("#tabFree");
    const serbest = await sayfa.evaluate(() => ({
      mod: oyun.mode, boy: oyun.startWord.length, tercih: oyun.lenPref, bitti: oyun.over,
    }));
    denetle(serbest.mod === "free" && !serbest.bitti, "serbest oyun başlamadı");
    denetle(serbest.boy === serbest.tercih, `serbest oyun ${serbest.boy} harfli, seçili uzunluk ${serbest.tercih}`);

    // Fiziksel klavye (masaüstü ve iPad'in tek yazma yolu): küçük harf Türkçe
    // kurala göre büyür (i → İ, ı → I), Backspace siler, Enter kelimeyi gönderir.
    const tusla = (k) => sayfa.evaluate((key) => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })), k);
    await sayfa.keyboard.type("i");
    await tusla("ı");                       // Türkçe klavyedeki tuş; Playwright'ın tuş listesinde yok
    denetle(await sayfa.evaluate(() => oyun.buffer) === "İI", `fiziksel klavyede 'i', 'ı' yazıldı; tampon '${await sayfa.evaluate(() => oyun.buffer)}', 'İI' olmalı`);
    await sayfa.keyboard.press("Backspace"); await sayfa.keyboard.press("Backspace");
    denetle(await sayfa.evaluate(() => oyun.buffer) === "", "Backspace tamponu boşaltmadı");
    // İlk adımı yalnızca ABD düzeninde yazılabilen harflerden oluşan bir bulmaca bul
    let ilkAdim = "";
    for (let i = 0; i < 80 && !ilkAdim; i++) {
      const [fb, fh] = await sayfa.evaluate(() => [oyun.startWord, oyun.targetWord]);
      const aday = (enKisaYol(fb, fh) || [""])[0];
      if (/^[A-HJ-Zİ]+$/.test(aday)) ilkAdim = aday; else await sayfa.click("#btnRestart");
    }
    denetle(!!ilkAdim, "fiziksel klavye denemesi için uygun bulmaca bulunamadı");
    await sayfa.keyboard.type(ilkAdim.toLocaleLowerCase("tr"));
    await sayfa.keyboard.press("Enter");
    const fiziksel = await sayfa.evaluate(() => oyun.chain.slice());
    denetle(fiziksel.length === 2 && fiziksel[1] === ilkAdim, `fiziksel klavyeyle '${ilkAdim}' yazılıp Enter'a basıldı; zincir ${JSON.stringify(fiziksel)}`);
    // Odaktaki bağlantıda Enter bağlantıyı açar, kelime göndermez
    await sayfa.keyboard.type("a");
    await sayfa.focus("#btnHelp");
    await sayfa.keyboard.press("Enter");
    const baglanti = await sayfa.evaluate(() => ({ hash: location.hash, toast: document.getElementById("toast").classList.contains("show"), zincir: oyun.chain.length }));
    denetle(baglanti.hash === "#nasil-oynanir" && baglanti.zincir === 2, `yardım bağlantısında Enter: adres '${baglanti.hash}', zincir ${baglanti.zincir}`);
    denetle(await sayfa.evaluate(() => document.getElementById("inputRow").getAttribute("aria-live")) === "polite",
            "giriş satırı ekran okuyucuya duyurulmuyor (aria-live)");

    /* Dokunmatik: telefonda da ekran klavyesi kullanılır; cihaz klavyesini
       açacak bir giriş alanı yoktur. Fiziksel klavye (ör. iPad) yine çalışır. */
    console.log("8. Dokunmatik giriş");
    const dokunmatik = await tarayici.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await disAgiKapat(dokunmatik);
    const sayfa2 = await dokunmatik.newPage();
    sayfa2.on("pageerror", (e) => sayfaHatalari.push(e.message));
    const d = new Date(Date.now() + TRT_MS);
    const yarinGeceYarisi = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 2) - TRT_MS;
    await sayfa2.clock.install({ time: new Date(yarinGeceYarisi - 5000) });   // gece yarısına 5 sn
    await sayfa2.goto(ADRES);
    await oyunHazir(sayfa2);
    denetle(await sayfa2.locator("#keyboard").isVisible(), "dokunmatik ekranda ekran klavyesi görünmüyor");
    await sayfa2.tap("#game");
    denetle(await sayfa2.evaluate(() => !document.querySelector("input, textarea") && document.activeElement === document.body),
            "tahtaya dokununca cihaz klavyesini açacak bir giriş alanı odaklandı");
    await sayfa2.tap('#keyboard .key[data-key="K"]');
    await sayfa2.tap('#keyboard .key[data-key="A"]');
    await sayfa2.tap('#keyboard .key[data-key="BACK"]');
    // Türkçe fiziksel klavyedeki "ı" tuşu (Playwright'ın tuş listesinde yok)
    await sayfa2.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ı", bubbles: true })));
    const tampon = await sayfa2.evaluate(() => oyun.buffer);
    denetle(tampon === "KI", `ekran klavyesiyle K, A, Sil; fiziksel klavyeyle 'ı' yazıldı, tampon '${tampon}'`);
    const tasma2 = await sayfa2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    denetle(tasma2 <= 0, `dokunmatik düzende sayfa yatayda ${tasma2}px taşıyor`);

    /* Gece yarısı geçişi — sahte saatle */
    console.log("9. TRT gece yarısı");
    const onceki = await sayfa2.evaluate(() => [oyun.startWord, oyun.targetWord].join("→"));
    const beklenenOnce = beklenenBulmaca(yarinGeceYarisi - 5000);
    denetle(onceki === `${beklenenOnce[0]}→${beklenenOnce[1]}`, `gece yarısından önce ${onceki}`);
    await sayfa2.clock.runFor(8000);
    const sonraki = await sayfa2.evaluate(() => [oyun.startWord, oyun.targetWord].join("→"));
    const beklenenSonra = beklenenBulmaca(yarinGeceYarisi + 3000);
    denetle(sonraki === `${beklenenSonra[0]}→${beklenenSonra[1]}`,
            `gece yarısından sonra ${sonraki}, beklenen ${beklenenSonra[0]}→${beklenenSonra[1]}`);
    denetle(onceki !== sonraki, "gece yarısında bulmaca değişmedi");

    /* Küçük telefon: kabuk 100dvh sabit, üstteki her piksel oyun alanından
       gider. Beklentiler main'deki düzenin sağladığı kadardır (ölçüldü). */
    console.log("10. Küçük telefonda ilk görünüm ve dokunma alanı");
    const t = new Date(Date.now() + TRT_MS);
    const oglen = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 12) - TRT_MS;
    let kisaGun = oglen;                     // önümüzdeki en az adımlı günlük bulmaca
    for (let g = 1; g < 400; g++) {
      if (beklenenBulmaca(oglen + g * 86400000)[2] < beklenenBulmaca(kisaGun)[2]) kisaGun = oglen + g * 86400000;
    }
    async function kucukEkran(en, boy, cozulmus) {
      const b = await tarayici.newContext({ viewport: { width: en, height: boy }, hasTouch: true, isMobile: true });
      await disAgiKapat(b);
      const s = await b.newPage();
      s.on("pageerror", (e) => sayfaHatalari.push(e.message));
      await s.clock.install({ time: new Date(kisaGun) });
      await s.goto(ADRES);
      await oyunHazir(s);
      if (cozulmus) {
        const [kb, kh] = beklenenBulmaca(kisaGun);
        for (const k of enKisaYol(kb, kh) || []) await kelimeDokun(s, k);
        await s.reload();                    // çözülmüş bulmacaya geri dönen oyuncunun ilk ekranı
        await oyunHazir(s);
      } else {
        await s.tap("#tabFree");
      }
      // Satır, oyun alanının ve ekranın görünen kısmında mı (kaydırmadan)
      const gorunen = await s.evaluate(() => {
        const g = document.getElementById("game").getBoundingClientRect();
        const icinde = (id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return r.height > 0 && r.top >= Math.max(0, g.top) - 0.5 && r.bottom <= Math.min(innerHeight, g.bottom) + 0.5;
        };
        return { bitti: oyun.over, hedef: icinde("targetWord"), giris: icinde("inputRow") };
      });
      return { b, s, gorunen };
    }
    // Gerçek dokunma alanı: merkezden dört yöne elementFromPoint ile yürünür.
    // Komşu denetimin örttüğü kısım sayılmaz; görünmez genişletme de ölçülür.
    const dokunmaAlani = (s, secici) => s.evaluate((sec) => [...document.querySelectorAll(sec)].map((el) => {
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const vurur = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && el.contains(e); };
      const uzunluk = (nokta) => {
        let n = 1;
        for (const yon of [-1, 1]) for (let k = 1; k < 60 && vurur(...nokta(yon * k)); k++) n++;
        return n;
      };
      return { ad: (el.textContent.trim() || el.getAttribute("aria-label")).slice(0, 20),
               en: uzunluk((k) => [cx + k, cy]), boy: uzunluk((k) => [cx, cy + k]) };
    }), secici);

    const durumlar = [
      [360, 560, false, ["hedef", "giris"]],
      [375, 548, false, ["hedef", "giris"]],
      [320, 460, false, ["giris"]],
      [360, 560, true, ["hedef"]],
      [375, 548, true, ["hedef"]],
    ];
    for (const [en, boy, cozulmus, beklenen] of durumlar) {
      const { b, s, gorunen } = await kucukEkran(en, boy, cozulmus);
      const ad = `${en}×${boy} ${cozulmus ? "çözülmüş günlük" : "serbest oyun"}`;
      denetle(gorunen.bitti === cozulmus, `${ad}: oyun durumu beklenen değil`);
      for (const satir of beklenen) {
        denetle(gorunen[satir], `${ad}: ${satir === "hedef" ? "HEDEF" : "giriş"} satırı ilk ekranda görünmüyor`);
      }
      if (en === 360) {
        const secici = cozulmus ? ".mini-btn"
          : ".icon-btn, .mode-tab, .pick-btn, .site-footer a";   // alt bilgi: Gizlilik
        for (const a of await dokunmaAlani(s, secici)) {
          denetle(a.en >= 44 && a.boy >= 44, `${ad}: '${a.ad}' dokunma alanı ${a.en}×${a.boy}, en az 44×44 olmalı`);
        }
      }
      if (!cozulmus) {
        // Klavye tuşu: boy en az 44. En, sıradaki 11 tuşla sınırlıdır (bilinen
        // istisna, ekip/tasarim-sistemi.md); tuşlar aralıksız olduğundan alan
        // tuşun tamamıdır. Alt sınır 320 px ekrandaki harf tuşu genişliğidir.
        const tuslar = await dokunmaAlani(s, "#keyboard .key");
        denetle(tuslar.length === 31, `${ad}: ${tuslar.length} tuş ölçüldü, 31 olmalı`);
        for (const a of tuslar) {
          denetle(a.boy >= 44 && a.en >= 28, `${ad}: '${a.ad}' tuşu ${a.en}×${a.boy}; boy en az 44, en en az 28 olmalı`);
        }
      }
      if (en === 360 && !cozulmus) {
        // Uzun merdiven: eski basamaklar yukarı kayar, giriş satırı ve HEDEF
        // yerinde kalır. Görünmez dokunma alanı kayan bölüme taşmamalı: harf
        // blokları oraya gelir ve dokunuş ayar düğmesine gidip oyunu sıfırlar.
        await s.tap('[data-diff="zor"]');                // uzun yol: merdiven kaysın
        const [zb, zh] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
        for (const k of (enKisaYol(zb, zh) || []).slice(0, -1)) await kelimeDokun(s, k);
        const tahta = await s.evaluate(() => {
          const g = document.getElementById("game").getBoundingClientRect();
          const b = document.getElementById("steps");
          const r = b.getBoundingClientRect();
          const icinde = (el) => { const k = el.getBoundingClientRect(); return k.top >= g.top - 0.5 && k.bottom <= Math.min(innerHeight, g.bottom) + 0.5; };
          const ayar = [];
          for (let y = r.top; y < r.top + 10; y++) for (let x = r.left + 2; x < r.right - 2; x += 4) {
            const e = document.elementFromPoint(x, y);
            if (e && e.closest(".free-settings, .mode-tabs, .header, .status")) ayar.push(e.textContent.trim());
          }
          const sonBasamak = document.querySelector("#ladder .rung:last-child").getBoundingClientRect();
          return { kaydi: b.scrollTop > 0, sonda: b.scrollTop + b.clientHeight >= b.scrollHeight - 1,
                   sonGorunur: sonBasamak.bottom <= r.bottom + 0.5 && sonBasamak.top >= r.top - 0.5,
                   giris: icinde(document.getElementById("inputRow")), hedef: icinde(document.getElementById("targetWord")),
                   ayar: [...new Set(ayar)] };
        });
        denetle(tahta.kaydi && tahta.sonda, `${ad}: uzun merdiven sona kaymadı (eski basamaklar yukarı çıkmalı)`);
        denetle(tahta.sonGorunur, `${ad}: uzun merdivende son girilen kelime görünmüyor`);
        denetle(tahta.giris && tahta.hedef, `${ad}: uzun merdivende giriş satırı ya da HEDEF ekrandan çıktı`);
        denetle(!tahta.ayar.length, `${ad}: kayan bölümün üst kenarına dokunuş ayar düğmesine gidiyor: ${tahta.ayar.join(", ")}`);
      }
      await b.close();
    }

    // Çok kısa ekranlar: son kelime görünür kalır, merdiven klavyeye taşmaz
    {
      const b = await tarayici.newContext({ viewport: { width: 320, height: 460 }, hasTouch: true, isMobile: true });
      await disAgiKapat(b);
      const s = await b.newPage();
      s.on("pageerror", (e) => sayfaHatalari.push(e.message));
      await s.goto(ADRES); await oyunHazir(s);
      const gunlukBas = await s.evaluate(() => {
        const k = document.getElementById("startWord").getBoundingClientRect(), g = document.getElementById("inputRow").getBoundingClientRect();
        return k.bottom <= g.top + 0.5;
      });
      denetle(gunlukBas, "320×460 günlük: başlangıç kelimesi giriş satırının altında kalıyor");
      await s.tap("#tabFree"); await s.tap('[data-len="4"]');
      const [kb, kh] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
      await kelimeDokun(s, enKisaYol(kb, kh)[0]);
      await s.waitForTimeout(400);           // basamağın iniş animasyonu bitsin
      const son = await s.evaluate(() => {
        const r = document.querySelector("#ladder .rung:last-child .word-row").getBoundingClientRect();
        const k = document.getElementById("steps").getBoundingClientRect(), g = document.getElementById("game").getBoundingClientRect();
        const giris = document.getElementById("inputRow").getBoundingClientRect();
        return { icinde: r.top >= k.top - 0.5 && r.bottom <= k.bottom + 0.5,
                 ekranda: r.top >= g.top - 0.5 && r.bottom <= Math.min(innerHeight, g.bottom) + 0.5,
                 ustte: r.bottom <= giris.top + 0.5,
                 giris: giris.top >= g.top - 0.5 && giris.bottom <= Math.min(innerHeight, g.bottom) + 0.5 };
      });
      denetle(son.icinde && son.ekranda && son.ustte && son.giris, `320×460 serbest 4 harf: son girilen kelime ya da giriş satırı görünmüyor (${JSON.stringify(son)})`);
      await b.close();

      const y = await tarayici.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });
      await disAgiKapat(y);
      const ys = await y.newPage();
      ys.on("pageerror", (e) => sayfaHatalari.push(e.message));
      await ys.goto(ADRES); await oyunHazir(ys);
      const ortulu = await ys.evaluate(() => [...document.querySelectorAll("#keyboard .key")].filter((t) => {
        const r = t.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !e || !t.contains(e);
      }).map((t) => t.dataset.key));
      denetle(!ortulu.length, `667×375 yatay: tuşların üstü örtülü, dokunuş tuşa gitmiyor: ${ortulu.join(" ")}`);
      await kelimeDokun(ys, enKisaYol(...(await ys.evaluate(() => [oyun.startWord, oyun.targetWord])))[0]);
      denetle(await ys.evaluate(() => oyun.chain.length) === 2, "667×375 yatay: ekran klavyesiyle kelime girilemedi");
      await y.close();
    }

    /* 11) Analitik yok: Google/gstatic isteği yapılmaz, eski izler temizlenir */
    console.log("11. Dış istek yok, eski izler temizleniyor");
    disIstekler.length = 0;
    const tb = await tarayici.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
    await disAgiKapat(tb);
    await tb.addInitScript(() => { try { localStorage.setItem("sm_izin", "evet"); } catch (_) {} });
    await tb.addCookies([{ name: "_ga", value: "GA1.1.1.1", url: ADRES }]);
    const ts = await tb.newPage();
    ts.on("pageerror", (e) => sayfaHatalari.push(e.message));
    await ts.goto(ADRES); await oyunHazir(ts);
    await ts.tap("#btnRestart");
    await ts.waitForTimeout(500);
    denetle(disIstekler.length === 0, "site dış adrese istek yaptı: " + disIstekler.join(", "));
    denetle(await ts.evaluate(() => localStorage.getItem("sm_izin")) === null, "eski sm_izin anahtarı temizlenmedi");
    denetle(await ts.evaluate(() => !document.getElementById("izin") && !document.querySelector('a[href="#cerez-tercihi"]')),
            "izin bildirimi ya da Çerez Tercihleri bağlantısı hâlâ sayfada");
    denetle(!(await tb.cookies(ADRES)).some((c) => c.name.startsWith("_ga")), "eski _ga çerezi temizlenmedi");
    disIstekler.length = 0;   // index.html'den sızan istek gizlilik sayfasına yazılmasın
    await ts.goto(ADRES + "gizlilik.html");
    await ts.waitForTimeout(300);
    denetle(disIstekler.length === 0, "gizlilik sayfası dış adrese istek yaptı: " + disIstekler.join(", "));
    await tb.close();

    denetle(sayfaHatalari.length === 0, "sayfada yakalanmamış hata: " + sayfaHatalari.join(" | "));
  } finally {
    if (tarayici) await tarayici.close();
    sunucu.kill();
  }

  if (hatalar.length) {
    console.log(`\nBAŞARISIZ — ${hatalar.length} hata, ${gecen} denetim geçti`);
    process.exit(1);
  }
  console.log(`\nGEÇTİ — ${gecen} denetim`);
}

main().catch((e) => { console.error("Test çalışamadı:", e); process.exit(2); });
