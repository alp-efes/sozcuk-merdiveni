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
 *  12. İpucu ve gelir kancası; sayılı haklar (sm_haklar): başta 5 + 5, webde
 *      TRT gününde 1'e tamamlanır, uygulamada ödüllü reklam +1, Plus'ta sınırsız
 *  13. Geri al ve sonucu göster
 *  14. Hak bitince geri al (web: yarın, uygulama: teklif), yenile onayı
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
        const secici = cozulmus ? ".mini-btn:not(.hidden)"
          : ".icon-btn, .mode-tab, .pick-btn, .site-footer a, .hint-btn:not(.hidden)";
        // alt bilgi: Gizlilik; ampul: İpucu. Gizli düğme dokunulamaz: Sonucu göster
        // görününce 13. adımda ölçülür
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

    /* 12) Gelir: ipucu, günlük hak, tekrar, Plus ve geçiş reklamı */
    console.log("12. İpucu, tekrar ve gelir kancası");
    const uz = (k, h) => { const y = enKisaYol(k, h); return y ? y.length : Infinity; };
    const komsular = (k) => db[String(k.length)].words.filter((w) => [...w].filter((c, i) => c !== k[i]).length === 1);
    const kotuYol = (bas, hedef) => {         // en kısadan uzun, yine de çözen yol
      const en = uz(bas, hedef);
      for (const v of komsular(bas)) {
        const u = uz(v, hedef);
        if (v !== hedef && u >= en && u < Infinity) return [v, ...enKisaYol(v, hedef)];
      }
      return null;
    };
    // Yerel uygulamanın yaptığı gibi window.SozcukGelir tanımlanır (kanca null ise web)
    const gelirSayfasi = async (kanca, onYukleme) => {
      const b = await tarayici.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
      await disAgiKapat(b);
      if (onYukleme) await b.addInitScript(onYukleme);
      if (kanca) await b.addInitScript((k) => {
        window.__c = [];
        window.__k = k;
        const hata = (ad) => { window.__c.push(ad); throw new Error("kanca hatası"); };
        window.SozcukGelir = k.hata ? {      // bozuk kanca: hepsi fırlatır ya da reddeder
          plusMu: () => hata("plusMu"),
          odulluReklam: () => { window.__c.push("odul"); return Promise.reject(new Error("ret")); },
          gecisReklami: () => hata("gecis"),
          plusSatinAl: () => hata("satin"),
          plusGeriYukle: () => { window.__c.push("geri"); return Promise.reject(new Error("ret")); },
        } : k.takilir ? {                    // sözü hiç sonuçlanmayan kanca
          plusMu: () => false,
          odulluReklam: () => { window.__c.push("odul"); return new Promise(() => {}); },
          gecisReklami: () => new Promise(() => {}),
          plusSatinAl: () => new Promise(() => {}),
          plusGeriYukle: () => new Promise(() => {}),
        } : {
          plusFiyat: () => window.__k.fiyat || null,
          plusMu: () => window.__k.plus,
          odulluReklam: (neden) => { window.__c.push("odul:" + neden); return Promise.resolve(window.__k.odul); },
          // Hiç dönmeyen söz: kazanma penceresi buna takılırsa test yakalar
          gecisReklami: (an) => { window.__c.push("gecis:" + an); return new Promise(() => {}); },
          plusSatinAl: () => { window.__c.push("satin"); if (window.__k.satin) window.__k.plus = true; return Promise.resolve(window.__k.satin); },
          plusGeriYukle: () => { window.__c.push("geri"); if (window.__k.geri) window.__k.plus = true; return Promise.resolve(window.__k.geri); },
        };
      }, kanca);
      const s = await b.newPage();
      s.on("pageerror", (e) => sayfaHatalari.push(e.message));
      await s.goto(ADRES); await oyunHazir(s);
      return { b, s };
    };
    const cagrilar = (s) => s.evaluate(() => (window.__c || []).slice());
    const gorunur = (s, sec) => s.evaluate((x) => !document.querySelector(x).classList.contains("hidden"), sec);
    const toastMetni = (s) => s.evaluate(() => document.getElementById("toast").textContent);
    const ipucuDogru = async (s, ad) => {      // ipucu bir harflik, hedefe yaklaştıran bir hamle mi?
      const ip = await s.evaluate(() => ({ h: oyun.hint, cur: oyun.currentWord, hedef: oyun.targetWord,
        cerceve: document.querySelectorAll(".tile.hint").length,
        silik: (document.querySelector("#inputRow .tile.hint-letter") || {}).textContent }));
      if (!ip.h) return denetle(false, `${ad}: ipucu açılmadı`);
      const sonraki = ip.cur.slice(0, ip.h.pos) + ip.h.letter + ip.cur.slice(ip.h.pos + 1);
      denetle(sonraki !== ip.cur && db[String(ip.cur.length)].words.includes(sonraki), `${ad}: ipucu sözlükte olmayan ya da aynı kelimeyi öneriyor (${ip.cur}→${sonraki})`);
      denetle(uz(sonraki, ip.hedef) === uz(ip.cur, ip.hedef) - 1, `${ad}: ${ip.cur}→${sonraki} hedefe yaklaştırmıyor (${uz(ip.cur, ip.hedef)}→${uz(sonraki, ip.hedef)})`);
      denetle((await toastMetni(s)).endsWith(`hedefe ${uz(ip.cur, ip.hedef)} adım`), `${ad}: bildirim hedefe kalan adımı (${uz(ip.cur, ip.hedef)}) söylemeli: '${await toastMetni(s)}'`);
      denetle(ip.cerceve === 1 && ip.silik === ip.h.letter, `${ad}: ipucu ekranda gösterilmiyor (çerçeve ${ip.cerceve}, silik harf '${ip.silik}')`);
      return sonraki;
    };
    // Sayılı haklar (sm_haklar): kayıt, rozet ve aria-label
    const haklar = (s) => s.evaluate(() => {
      const r = (id) => document.querySelector(`#${id} .hak`);
      return { kayit: JSON.parse(localStorage.getItem("sm_haklar") || "null"),
        rozetGeri: r("btnUndo").classList.contains("hidden") ? null : r("btnUndo").textContent,
        rozetIpucu: r("btnHint").classList.contains("hidden") ? null : r("btnHint").textContent,
        etiketGeri: document.getElementById("btnUndo").getAttribute("aria-label"),
        etiketIpucu: document.getElementById("btnHint").getAttribute("aria-label") };
    });
    // Sayfa açılmadan önce kayıtlı hakları yazan betik (gun verilmezse bugün, TRT)
    const hakOnYukle = (geriAl, ipucu, gun) => `try { localStorage.setItem("sm_haklar", JSON.stringify({ geriAl: ${geriAl}, ipucu: ${ipucu}, ` +
      `gun: ${gun ? JSON.stringify(gun) : "new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)"} })); } catch (_) {}`;
    // Açık sayfada hakları sıfırlar (bellekteki kopya esastır)
    const hakSifirla = (s, tur) => s.evaluate((t) => { oyun.haklar()[t] = 0; oyun.renderHaklar(); }, tur);

    // 12a) Web: başta 5 + 5, ipucu hak harcar, rozet ve aria-label sayıyı söyler, kayıt sürer,
    // eski sm_ipucu_* kayıtları yok sayılıp silinir, hak bitince "yarın"; iki mod ortaktır
    {
      const eski = () => { try { localStorage.setItem("sm_ipucu_2000-01-01", "1");
        localStorage.setItem("sm_ipucu_" + new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), "1"); } catch (_) {} };
      const { b, s } = await gelirSayfasi(null, eski);   // eski sürümde bugünün ipucunu kullanmış oyuncu
      denetle(!(await gorunur(s, "#btnHint").then((g) => !g)), "web: ipucu düğmesi görünmüyor");
      denetle(!(await gorunur(s, "#plusBox")), "web: Plus bölümü görünmemeli");
      let h = await haklar(s);
      denetle(h.kayit && h.kayit.geriAl === 5 && h.kayit.ipucu === 5, `başlangıç hakları 5 + 5 olmalı: ${JSON.stringify(h.kayit)}`);
      denetle(h.rozetGeri === "5" && h.rozetIpucu === "5", `başlangıç rozetleri 5 / 5 olmalı: ${h.rozetGeri} / ${h.rozetIpucu}`);
      denetle(h.etiketGeri === "Geri al, 5 hak kaldı" && h.etiketIpucu === "İpucu, 5 hak kaldı", `aria-label sayıyı söylemeli: '${h.etiketGeri}' / '${h.etiketIpucu}'`);
      denetle(await s.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("sm_ipucu_")).length === 0), "eski sm_ipucu_* kayıtları silinmedi");
      await s.click("#btnHint");
      const sonraki = await ipucuDogru(s, "web ipucu");
      h = await haklar(s);
      denetle(h.kayit.ipucu === 4 && h.rozetIpucu === "4" && h.etiketIpucu === "İpucu, 4 hak kaldı" && h.kayit.geriAl === 5, `ipucu bir hak harcamalı: ${JSON.stringify(h)}`);
      denetle(/^\d\. harfi \S yap · hedefe \d+ adım$/.test(await toastMetni(s)), `ipucu bildirimi '${await toastMetni(s)}'`);
      await s.click("#btnHint");                // açık ipucuna tekrar bakmak hak harcamaz
      denetle(await s.evaluate(() => !!oyun.hint) && (await haklar(s)).kayit.ipucu === 4, "açık ipucuna tekrar bakılınca ipucu kapandı ya da hak harcandı");
      if (sonraki) await kelimeYaz(s, sonraki);  // ipucuna uy: ipucu kalkar
      denetle(await s.evaluate(() => oyun.hint === null && !document.querySelector(".tile.hint")), "hamleden sonra ipucu işareti kalkmadı");
      await s.reload(); await oyunHazir(s);     // haklar yenilemede korunur
      h = await haklar(s);
      denetle(h.kayit.ipucu === 4 && h.rozetIpucu === "4", `yenilemede ipucu hakkı korunmadı: ${JSON.stringify(h.kayit)}`);
      await hakSifirla(s, "ipucu");
      denetle((await haklar(s)).rozetIpucu === "0", "hak 0 iken rozet 0 göstermeli");
      await s.click("#btnHint");
      denetle(await s.evaluate(() => oyun.hint === null), "hak bittiği halde ipucu açıldı");
      denetle(/yarın/i.test(await toastMetni(s)) && !(await gorunur(s, "#offer")), `web: hak bitince 'yarın' iletisi bekleniyordu, '${await toastMetni(s)}'`);
      await s.click("#tabFree");                // haklar iki modda ortaktır
      await s.click("#btnHint");
      denetle(await s.evaluate(() => oyun.hint === null) && /yarın/i.test(await toastMetni(s)), "serbest oyunda ipucu hakkı yeniden verildi");
      await b.close();
    }

    // 12b) Yoldan çok adım sapılmışsa ipucu şimdiki kelimeden hesaplanır; geri dönüş söylenir; yol yoksa ücret alınmaz
    {
      const { b, s } = await gelirSayfasi(null);
      const [bas, hedef] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
      // Her adımda hedeften en çok uzaklaşan, zincirde olmayan komşuya git (3 adım)
      let simdi = bas; const gezi = [bas];
      for (let i = 0; i < 3; i++) {
        const adaylar = komsular(simdi).filter((w) => !gezi.includes(w) && uz(w, hedef) < Infinity && w !== hedef)
          .sort((x, y) => uz(y, hedef) - uz(x, hedef));
        if (!adaylar.length) break;
        simdi = adaylar[0]; gezi.push(simdi);
        await kelimeYaz(s, simdi);
      }
      denetle(gezi.length === 4, `12b: üç adım sapılamadı (${gezi.join(",")})`);
      denetle(gezi.length - 1 + uz(simdi, hedef) > uz(bas, hedef), `12b: üç adım sonra hâlâ en kısa yolda`);
      await s.click("#btnHint");
      await ipucuDogru(s, "üç adım sapınca ipucu");
      denetle(/hedefe \d+ adım/.test(await toastMetni(s)), "sapmış oyuncuya hedefe kalan adım söylenmeli");
      await b.close();
    }
    {
      // Zincirde tek aday geri dönüşse "… kelimesine geri dön": benzersiz sonraki kelimesi olan bir bulmaca ara
      let secim = null;
      for (const [bb, hh] of tumBulmacalar) {
        const y = enKisaYol(bb, hh);
        if (y && y.length > 1 && komsular(bb).filter((w) => uz(w, hh) === y.length - 1).length === 1) { secim = [bb, hh, y[0]]; break; }
      }
      denetle(!!secim, "12b: benzersiz ilk adımlı bulmaca bulunamadı");
      if (secim) {
        const { b, s } = await gelirSayfasi(null);
        const [bb, hh, y0] = secim;
        await s.evaluate(([a, c]) => { oyun.dailyPuzzle = () => [a, c, 0]; oyun.newGame("daily"); }, [bb, hh]);
        await kelimeYaz(s, y0); await kelimeYaz(s, bb);       // ileri git, başa dön: zincir [bb, y0, bb]
        await s.click("#btnHint");
        const t = await toastMetni(s);
        denetle(t === `${y0} kelimesine geri dön · hedefe ${uz(bb, hh)} adım`, `geri dönüş ipucu metni yanlış: '${t}'`);
        denetle(await s.evaluate(() => !!oyun.hint && oyun.hint.geri === true && document.querySelectorAll(".tile.hint").length === 1),
                "geri dönüş ipucunda konum yine işaretlenmeli");
        await b.close();
      }
    }
    {
      // Yol yoksa (ulaşılamayan hedef) ne ücretsiz hak ne reklam harcanır
      const { b, s } = await gelirSayfasi({ plus: false, odul: true, satin: true });
      await s.evaluate(() => { oyun.targetWord = "ÖÖÖ".slice(0, oyun.len); oyun.dict = new Set([oyun.startWord]); });   // hedef sözlükte yok: yol yok
      await s.click("#btnHint");
      denetle((await haklar(s)).kayit.ipucu === 5 && await s.evaluate(() => oyun.hint === null) && /yol bulunamadı/.test(await toastMetni(s)),
              "yol yokken ipucu hakkı harcandı ya da ipucu açıldı");
      await hakSifirla(s, "ipucu");             // hak bitti: teklif yolu
      await s.evaluate(() => { oyun.showOffer(true); return oyun.offerAd(); });
      denetle((await cagrilar(s)).length === 0 && /yol bulunamadı/.test(await toastMetni(s)), `yol yokken ödüllü reklam gösterildi: ${await cagrilar(s)}`);
      await b.close();
    }

    // 12c) Kancalı: Plus sınırsız ipucu verir, ödül/reklam/satın alma yolları
    {
      const { b, s } = await gelirSayfasi({ plus: true, odul: true, satin: true, geri: false });
      const [bas, hedef] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
      const yol = enKisaYol(bas, hedef);
      denetle(await gorunur(s, "#plusBox") && /etkin/.test(await s.textContent("#plusText")), "Plus açıkken Plus bölümü 'etkin' demeli");
      denetle(!(await gorunur(s, "#btnPlusBuy")) && !(await gorunur(s, "#btnPlusRestore")), "Plus açıkken satın alma düğmeleri görünmemeli");
      for (let i = 0; i < 2 && i < yol.length - 1; i++) {
        await s.click("#btnHint");
        const n = await ipucuDogru(s, "Plus ipucu " + (i + 1));
        await kelimeYaz(s, n);
      }
      const ph = await haklar(s);
      denetle((ph.kayit === null || ph.kayit.ipucu === 5) && ph.rozetIpucu === null && ph.rozetGeri === null && ph.etiketIpucu === "İpucu" && ph.etiketGeri === "Geri al",
              `Plus: ipucu hak harcamamalı, rozet görünmemeli, aria-label sayısız olmalı: ${JSON.stringify(ph)}`);
      denetle(!(await gorunur(s, "#offer")) && !(await cagrilar(s)).some((c) => c.startsWith("odul")), "Plus'ta reklam ya da teklif çıktı");
      denetle(!(await gorunur(s, "#plusNot")), "Plus açıkken satın alma notu görünmemeli");
      for (const k of enKisaYol(await s.evaluate(() => oyun.currentWord), hedef)) await kelimeYaz(s, k);
      await s.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 });
      denetle(!(await cagrilar(s)).some((c) => c.startsWith("gecis")), "Plus'ta çözümden sonra geçiş reklamı çağrılmamalı");
      await b.close();
    }
    {
      // Uygulamada haklar günlük yenilenmez: dünkü 0 bugün de 0
      const { b, s } = await gelirSayfasi({ plus: false, odul: false, satin: false, geri: false, fiyat: "₺49,99" }, hakOnYukle(0, 0, "2000-01-01"));
      denetle((await haklar(s)).kayit.ipucu === 0 && (await haklar(s)).rozetIpucu === "0", "uygulamada haklar yeni günde yenilenmemeli");
      await s.click("#btnHint");                // hak bitti: teklif açılır, ipucu açılmaz
      denetle(await gorunur(s, "#offer") && await s.evaluate(() => oyun.hint === null) && (await cagrilar(s)).length === 0,
              "hak bitince teklif açılmalı, kanca henüz çağrılmamalı");
      denetle(await gorunur(s, "#btnOfferPlus"), "teklifte 'Plus'a geç' görünmüyor");
      denetle((await s.textContent("#btnOfferPlus")) === "Plus'a geç (₺49,99)" && (await s.textContent("#btnPlusBuy")) === "Plus'a geç (₺49,99)", "fiyat varsa düğmeler 'Plus'a geç (₺…)' yazmalı");
      // Teklif açıkken fiziksel klavye tahtaya yazmaz; Escape kapatır
      await s.keyboard.type("a");
      denetle(await s.evaluate(() => oyun.buffer) === "", "teklif açıkken fiziksel klavye tahtaya yazdı");
      await s.keyboard.press("Escape");
      denetle(!(await gorunur(s, "#offer")), "Escape ipucu teklifini kapatmadı");
      await s.click("#btnHint");
      await s.click("#btnOfferAd");             // ödül kazanılmadı
      denetle(JSON.stringify(await cagrilar(s)) === '["odul:ipucu"]', `ödüllü reklam 'ipucu' nedeniyle çağrılmalı: ${await cagrilar(s)}`);
      denetle(await s.evaluate(() => oyun.hint === null) && await gorunur(s, "#offer") && /Reklam gösterilemedi/.test(await toastMetni(s)),
              "ödül yokken ipucu verildi ya da teklif kapandı");
      await s.evaluate(() => { window.__k.odul = true; });
      await s.click("#btnOfferAd");             // ödül kazanıldı: +1 hak, hemen kullanılır
      await ipucuDogru(s, "ödüllü ipucu");
      denetle(!(await gorunur(s, "#offer")), "ödül kazanılınca teklif kapanmalı");
      denetle((await haklar(s)).kayit.ipucu === 0 && (await haklar(s)).rozetIpucu === "0", "ödüllü ipucu +1 verip hemen kullanmalı (0 kalmalı)");
      const bir = await s.evaluate(() => oyun.hint && oyun.currentWord);
      await kelimeYaz(s, await s.evaluate(() => { const h = oyun.hint, c = oyun.currentWord; return c.slice(0, h.pos) + h.letter + c.slice(h.pos + 1); }));
      await s.click("#btnHint");                // her ipucu yeni bir ödül ister
      denetle(await gorunur(s, "#offer") && (await cagrilar(s)).length === 2, "ödüllü ipucundan sonra yeni ipucu yine teklif istemeli");
      await s.click("#btnOfferPlus");           // satın alma başarısız
      denetle(!(await s.evaluate(() => window.__k.plus)) && await gorunur(s, "#offer") && /tamamlanmadı ya da onay bekliyor/.test(await toastMetni(s)), "başarısız satın almada teklif kapanmamalı");
      await s.evaluate(() => { window.__k.satin = true; });
      await s.click("#btnOfferPlus");
      denetle(!(await gorunur(s, "#offer")) && (await cagrilar(s)).filter((c) => c === "satin").length === 2, "satın alma başarılı: teklif kapanmalı, plusSatinAl iki kez çağrılmış olmalı");
      await s.click("#btnHint");                // artık Plus: reklamsız
      denetle(await s.evaluate(() => !!oyun.hint) && (await cagrilar(s)).filter((c) => c === "odul:ipucu").length === 2, "Plus aldıktan sonra ipucu reklamsız gelmeli");
      denetle(/etkin/.test(await s.textContent("#plusText")), "satın alınca Plus bölümü güncellenmedi");
      await b.close();
    }
    {
      const { b, s } = await gelirSayfasi({ plus: false, odul: true, satin: false, geri: true });
      denetle(await gorunur(s, "#plusBox") && await gorunur(s, "#btnPlusBuy") && await gorunur(s, "#btnPlusRestore"), "kancalı: Plus satın al ve geri yükle düğmeleri görünmeli");
      denetle((await s.textContent("#plusText")) === "Plus: reklamsız; sınırsız ipucu, geri al ve günlük tekrar. Tek seferlik satın alma.",
              `Plus bölümü tek vaadi yazmalı: '${await s.textContent("#plusText")}'`);
      denetle((await s.textContent("#hakKurali")) === "Hak bitince reklam izleyerek 1 hak daha alabilirsin.", `uygulamada hak kuralı metni yanlış: '${await s.textContent("#hakKurali")}'`);
      denetle((await s.textContent("#btnPlusBuy")) === "Plus'a geç" && /m\.15\/1-ğ.*reportaproblem\.apple\.com/.test(await s.textContent("#plusNot")) && await gorunur(s, "#plusNot"),
              "fiyat yokken etiket 'Plus'a geç' kalmalı; satın alma notu görünmeli");
      await s.evaluate(() => { window.__k.geri = false; });
      await s.click("#btnPlusRestore");
      denetle(/bulunamadı/.test(await toastMetni(s)), "geri yüklenecek satın alım yokken bildirim yanlış");
      await s.evaluate(() => { window.__k.geri = true; });
      await s.click("#btnPlusRestore");
      denetle(JSON.stringify(await cagrilar(s)) === '["geri","geri"]' && await s.evaluate(() => window.__k.plus) && !(await gorunur(s, "#btnPlusRestore")),
              "geri yükleme plusGeriYukle'yi çağırıp Plus'ı açmalı");
      // Yerel taraf Plus'ı sonradan değiştirirse "sozcukgelir" olayı arayüzü tazeler
      await s.evaluate(() => { window.__k.plus = false; window.dispatchEvent(new Event("sozcukgelir")); });
      denetle(await gorunur(s, "#btnPlusBuy"), "Plus geri alınınca (olay) satın al düğmesi dönmeli");
      await s.evaluate(() => { window.__k.plus = true; window.dispatchEvent(new Event("sozcukgelir")); });
      denetle(/etkin/.test(await s.textContent("#plusText")) && !(await gorunur(s, "#btnPlusBuy")), "Plus verilince (olay) bölüm 'etkin' demeli");
      await b.close();
    }

    // 12d) Tekrar dene: web'de serbest; uygulamada ödül ister; ilk sonuç kayıtta kalır; geçiş reklamı çözüm başına bir kez
    {
      const { b, s } = await gelirSayfasi(null);
      const [bas, hedef] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
      const en = uz(bas, hedef), kotu = kotuYol(bas, hedef);
      denetle(!!kotu, "12d: en kısadan uzun yol bulunamadı");
      for (const k of kotu) await kelimeYaz(s, k);
      await s.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 });
      const ilk = await s.evaluate(() => JSON.parse(localStorage.getItem("sm_gunluk_" + oyun.todayKey())));
      denetle(ilk.steps === kotu.length && ilk.enIyi === undefined, `ilk çözüm kaydı yanlış: ${JSON.stringify(ilk)}`);
      denetle(await gorunur(s, "#btnRetry") && await gorunur(s, "#btnDailyRetry") && (await s.textContent("#btnRetry")) === "Tekrar dene",
              "web: en azın üstünde çözünce 'Tekrar dene' (pencerede ve durum satırında) görünmeli");
      await s.click("#btnCloseModal");          // pencere kapalıyken durum satırındaki düğme ölçülür
      await s.waitForTimeout(400);
      const a = (await dokunmaAlani(s, "#btnDailyRetry"))[0];
      denetle(a.en >= 44 && a.boy >= 44, `durum satırındaki 'Tekrar dene' dokunma alanı ${a.en}×${a.boy}`);
      await s.click("#btnDailyRetry");
      denetle(await s.evaluate(() => !oyun.over && oyun.chain.length === 1 && document.getElementById("modal").classList.contains("hidden")),
              "web: Tekrar dene bulmacayı baştan açmadı");
      await s.reload(); await oyunHazir(s);     // tekrar sürerken yenileme kaldığı yerden devam eder
      denetle(await s.evaluate(() => !oyun.over && oyun.chain.length === 1), "tekrar sırasında yenileme oyunu bozdu");
      for (const k of enKisaYol(bas, hedef)) await kelimeYaz(s, k);
      await s.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 });
      const son = await s.evaluate(() => ({ k: JSON.parse(localStorage.getItem("sm_gunluk_" + oyun.todayKey())), tekrar: !document.getElementById("btnRetry").classList.contains("hidden"),
        mini: !document.getElementById("btnDailyRetry").classList.contains("hidden") }));
      denetle(son.k.steps === kotu.length && son.k.enIyi === en && son.k.chain.length === kotu.length + 1,
              `tekrar ilk çözümü bozdu ya da en iyi yazılmadı: ${JSON.stringify(son.k)}`);
      denetle(!son.tekrar && !son.mini, "en aza inince 'Tekrar dene' kalkmalı");
      // Paylaşım ilk sonucu söyler (seri ve paylaşım dürüst kalır)
      await s.evaluate(() => { navigator.clipboard.writeText = async (t) => { window.__kopya = t; }; });
      await s.click("#btnShare");
      const metin = await s.evaluate(() => window.__kopya || "");
      denetle(metin.includes(`${kotu.length} adım (en az ${en})`), `paylaşım ilk çözümü yazmalı: ${metin.split("\n")[1]}`);
      await s.reload(); await oyunHazir(s);     // yenilemede de ilk çözüm kayıttan gelir
      denetle(await s.evaluate(() => oyun.over && oyun.lastResult.steps), "yenilemeden sonra çözülmüş günlük açılmadı");
      await b.close();
    }
    {
      const { b, s } = await gelirSayfasi({ plus: false, odul: false, satin: false, geri: false });
      const [bas, hedef] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
      const kotu = kotuYol(bas, hedef);
      for (const k of kotu) await kelimeYaz(s, k);
      await s.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 })
        .then(() => { gecen++; }, () => denetle(false, "geçiş reklamı beklenirken kazanma penceresi açılmadı (engellemesin)"));
      denetle(JSON.stringify(await cagrilar(s)) === '["gecis:cozum"]', `çözümde geçiş reklamı bir kez çağrılmalı: ${await cagrilar(s)}`);
      denetle((await s.textContent("#btnRetry")) === "Reklam izle, tekrar dene", "uygulamada Plus değilken tekrar düğmesi reklamı söylemeli");
      await s.click("#btnCloseModal"); await s.waitForTimeout(400);
      await s.click("#btnDailyRetry");          // durum satırındaki düğme reklamı kendisi başlatmaz: pencereyi açar
      denetle(await gorunur(s, "#modal") === true && !(await s.evaluate(() => document.getElementById("modal").classList.contains("hidden"))) && JSON.stringify(await cagrilar(s)) === '["gecis:cozum"]',
              "uygulamada durum satırı 'Tekrar dene' reklamı doğrudan başlattı; pencere açılmalıydı");
      await s.click("#btnRetry");               // ödül yok: tekrar başlamaz
      denetle(JSON.stringify((await cagrilar(s)).slice(1)) === '["odul:tekrar"]' && await s.evaluate(() => oyun.over), "ödülsüz tekrar başlamamalı, odulluReklam('tekrar') çağrılmalı");
      await s.evaluate(() => { window.__k.odul = true; });
      await s.click("#btnRetry");
      denetle(await s.evaluate(() => !oyun.over && oyun.chain.length === 1), "ödül kazanılınca tekrar başlamalı");
      for (const k of kotu) await kelimeYaz(s, k);      // yine uzun yoldan: ikinci çözüm
      await s.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 });
      denetle((await cagrilar(s)).filter((c) => c === "gecis:cozum").length === 2, "ikinci çözümde de geçiş reklamı bir kez çağrılmalı");
      await s.evaluate(() => { window.__k.plus = true; });
      await s.click("#btnRetry");               // Plus: reklamsız tekrar
      denetle(await s.evaluate(() => !oyun.over) && (await cagrilar(s)).filter((c) => c === "odul:tekrar").length === 2, "Plus'ta tekrar reklamsız olmalı");
      await b.close();
    }

    // 12e) Serbest oyunda 3, 4 ve 5 harfte ipucu doğruluğu (her çalıştırmada)
    {
      const { b, s } = await gelirSayfasi({ plus: true, odul: true, satin: true });
      await s.click("#tabFree");
      for (const n of [3, 4, 5]) {
        await s.click(`[data-len="${n}"]`);
        denetle(await s.evaluate(() => oyun.len) === n, `serbest ${n} harf seçilmedi`);
        await s.click("#btnHint");
        await ipucuDogru(s, `serbest ${n} harf ipucu`);
      }
      await b.close();
    }

    // 12f) Web, gerçek TRT gece yarısı (sahte saat): biten hak yeni günde 1'e tamamlanır;
    // biriken hak artmaz (birikmez)
    {
      const b = await tarayici.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
      await disAgiKapat(b);
      const s = await b.newPage();
      s.on("pageerror", (e) => sayfaHatalari.push(e.message));
      const tn = new Date(Date.now() + TRT_MS);
      const gece = Date.UTC(tn.getUTCFullYear(), tn.getUTCMonth(), tn.getUTCDate() + 1) - TRT_MS;
      await s.clock.install({ time: new Date(gece - 5000) });
      await b.addInitScript(hakOnYukle(0, 0));     // bugün (sahte saatle) iki hak da bitmiş
      await s.goto(ADRES); await oyunHazir(s);
      const eskiGun = await s.evaluate(() => oyun.todayKey());
      await s.click("#btnHint");
      denetle(await s.evaluate(() => oyun.hint === null) && /yarın/i.test(await toastMetni(s)), "gece yarısından önce hak 0 iken ipucu açıldı");
      await s.clock.runFor(8000);                  // TRT gece yarısı geçilir, bulmaca yenilenir
      denetle(await s.evaluate(() => oyun.todayKey()) !== eskiGun, "gece yarısından sonra gün değişmedi");
      let h = await haklar(s);
      denetle(h.rozetIpucu === "1" && h.rozetGeri === "1", `yeni günde rozetler 1 olmalı: ${h.rozetGeri} / ${h.rozetIpucu}`);
      await s.click("#btnHint");
      h = await haklar(s);
      denetle(await s.evaluate(() => !!oyun.hint) && h.kayit.ipucu === 0 && h.kayit.geriAl === 1 && h.kayit.gun !== eskiGun,
              `yeni günde ipucu hakkı yenilenmedi: ${JSON.stringify(h.kayit)}`);
      await b.close();
    }
    {
      // Webde hak birikmez: elde 3 / 2 varken yeni gün eklemez; 0 olan 1'e tamamlanır
      const { b, s } = await gelirSayfasi(null, hakOnYukle(3, 0, "2000-01-01"));
      const h = await haklar(s);
      denetle(h.kayit.geriAl === 3 && h.kayit.ipucu === 1 && h.rozetGeri === "3" && h.rozetIpucu === "1",
              `web yeni gün: 3 / 0 → 3 / 1 olmalı (${JSON.stringify(h.kayit)})`);
      await b.close();
    }

    // 12g) Bozuk kanca (fırlatır/reddeder) olumsuz sayılır; takılan kanca zaman aşımıyla çözülür
    {
      const { b, s } = await gelirSayfasi({ hata: true });
      const [bas, hedef] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
      denetle(await gorunur(s, "#plusBox") && await gorunur(s, "#btnPlusBuy"), "plusMu fırlatınca Plus olumsuz sayılmalı (satın al görünür)");
      await hakSifirla(s, "ipucu");
      await s.click("#btnHint");
      denetle(await gorunur(s, "#offer"), "plusMu fırlatınca hak bitmiş oyuncuya teklif açılmalı");
      await s.click("#btnOfferAd");
      denetle(await s.evaluate(() => oyun.hint === null && !oyun.busy) && /Reklam gösterilemedi/.test(await toastMetni(s)), "reddeden ödüllü reklam ipucu verdi ya da oyunu kilitledi");
      await s.click("#btnOfferPlus");
      denetle(/tamamlanmadı/.test(await toastMetni(s)) && await s.evaluate(() => !oyun.busy), "fırlatan plusSatinAl olumsuz sayılmalı");
      await s.keyboard.press("Escape");
      await s.click("#btnPlusRestore");
      denetle(/bulunamadı/.test(await toastMetni(s)) && await s.evaluate(() => !oyun.busy), "reddeden plusGeriYukle olumsuz sayılmalı");
      for (const k of enKisaYol(bas, hedef)) await kelimeYaz(s, k);
      await s.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 })
        .then(() => { gecen++; }, () => denetle(false, "fırlatan gecisReklami kazanma penceresini engelledi"));
      await b.close();
    }
    {
      const { b, s } = await gelirSayfasi({ takilir: true });
      await s.evaluate(() => { WordLadder.KANCA_ZAMAN_ASIMI_MS = 300; });
      await hakSifirla(s, "ipucu");
      await s.click("#btnHint");
      await s.click("#btnOfferAd");               // söz hiç sonuçlanmaz
      denetle(await s.evaluate(() => oyun.busy), "takılan kanca beklenirken oyun meşgul olmalı");
      await s.waitForFunction(() => !oyun.busy, null, { timeout: 3000 })
        .then(() => { gecen++; }, () => denetle(false, "takılan kanca oyunu kilitledi (zaman aşımı yok)"));
      denetle(await s.evaluate(() => oyun.hint === null) && /Reklam gösterilemedi/.test(await toastMetni(s)), "zaman aşımı olumsuz sayılmalı");
      await b.close();
    }

    // 12h) Kayıt yazılamasa da (gizli sekme, dolu depo) haklar bellekte düşer: 5 ipucu, sonra "yarın"
    {
      const { b, s } = await gelirSayfasi(null, () => { Storage.prototype.setItem = () => { throw new Error("depo dolu"); }; });
      let acilan = 0;
      for (let i = 0; i < 6; i++) {
        await s.click("#btnHint");
        if (await s.evaluate(() => !!oyun.hint)) acilan++;
        await s.evaluate(() => { oyun.clearHint(); oyun.renderInput(); });   // oyuncu ipucunu kullanmış gibi
      }
      denetle(acilan === 5, `depo yazılamazken ${acilan} ipucu açıldı, 5 olmalı`);
      denetle(/yarın/i.test(await toastMetni(s)) && (await haklar(s)).rozetIpucu === "0", "depo yazılamayınca haklar sınırsıza döndü");
      await b.close();
    }

    // 12i) Ödemesi yapılmış tekrar restart ve sekme değişiminde kaybolmaz
    {
      const { b, s } = await gelirSayfasi(null);
      const [bas, hedef] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
      const kotu = kotuYol(bas, hedef), y = enKisaYol(bas, hedef);
      for (const k of kotu) await kelimeYaz(s, k);
      await s.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 });
      await s.click("#btnRetry");
      await kelimeYaz(s, y[0]);
      await s.click("#btnRestart");               // ilerleme var: önce onay
      denetle(await gorunur(s, "#yenile"), "tekrar sırasında ilerleme varken yenile onay istemeli");
      await s.click("#btnYenileEvet");            // restart tekrarı baştan açar, günün kaydına dönmez
      denetle(await s.evaluate(() => !oyun.over && oyun.chain.length === 1), "tekrar sırasında restart tekrarı kaybettirdi");
      await kelimeYaz(s, y[0]); await kelimeYaz(s, y[1] || y[0]);
      const once = await s.evaluate(() => oyun.chain.slice());
      await s.click("#tabFree"); await s.click("#tabDaily");
      denetle(await s.evaluate((o) => !oyun.over && JSON.stringify(oyun.chain) === JSON.stringify(o), once), "tekrar sırasında sekme değişimi tekrarı kaybettirdi ya da sıfırladı");
      await s.reload(); await oyunHazir(s);
      denetle(await s.evaluate(() => !oyun.over && oyun.chain.length > 1), "sekme değişiminden sonra yenileme tekrarı bozdu");
      const kalan = enKisaYol(await s.evaluate(() => oyun.currentWord), hedef);
      for (const k of kalan) await kelimeYaz(s, k);
      await s.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 });
      const kayit = await s.evaluate(() => JSON.parse(localStorage.getItem("sm_gunluk_" + oyun.todayKey())));
      denetle(kayit.steps === kotu.length && kayit.deneme === undefined && kayit.enIyi >= 1, `tekrar bitince kayıt yanlış: ${JSON.stringify(kayit)}`);
      await b.close();
    }

    /* 13) Geri al ve Sonucu göster */
    console.log("13. Geri al ve sonucu göster");
    {
      const durumOku = (s) => s.evaluate(() => {
        const g = (id) => document.getElementById(id);
        const kay = (a) => { try { return localStorage.getItem(a); } catch (_) { return null; } };
        return {
          zincir: oyun.chain.slice(), bitti: oyun.over, gosterildi: oyun.shown,
          basamak: document.querySelectorAll("#ladder .rung").length,
          geriKapali: g("btnUndo").disabled, sonucGorunur: !g("btnShowResult").classList.contains("hidden"),
          durum: g("stepInfo").textContent,
          kayitliZincir: JSON.parse(kay("sm_state") || "{}").chain,
          gunluk: (() => { const r = JSON.parse(kay("sm_gunluk_" + oyun.todayKey()) || "null"); return r && r.steps >= 1 ? JSON.stringify(r) : null; })(), pes: (JSON.parse(kay("sm_gunluk_" + oyun.todayKey()) || "{}").gosterildi) ? "1" : null,
          paylasGorunur: !g("dailySolved").classList.contains("hidden"),
          ipucuGorunur: !g("btnHint").classList.contains("hidden"),
        };
      });
      const onayAcik = (s) => s.evaluate(() => !document.getElementById("pes").classList.contains("hidden"));
      // Başlangıç ile bir komşusu arasında gidip gelerek (geçerli hamleler) adım sayısını istenene çıkarır
      const gezin = async (s, bas, hedef, adimSayisi) => {
        const v = komsular(bas).find((k) => k !== hedef);
        while ((await s.evaluate(() => oyun.chain.length - 1)) < adimSayisi) {
          await kelimeYaz(s, (await s.evaluate(() => oyun.currentWord)) === bas ? v : bas);
        }
      };
      const gecerliYol = (yol, bas, hedef, sozluk) =>
        yol[0] === bas && yol[yol.length - 1] === hedef &&
        yol.every((w, i) => sozluk.includes(w) && (i === 0 || [...w].filter((c, j) => c !== yol[i - 1][j]).length === 1));

      // 13a) Geri al: zincir, durum, yenileme, bitince devre dışı
      {
        const { b, s } = await gelirSayfasi(null);
        const [bas, hedef] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
        const y = enKisaYol(bas, hedef);
        let d = await durumOku(s);
        denetle(d.geriKapali, "geri al: başlangıçta devre dışı olmalı");
        denetle(!d.sonucGorunur, "sonucu göster: başlangıçta görünmemeli");
        if (y.length > 1) {
          await kelimeYaz(s, y[0]); await kelimeYaz(s, y[1]);
          d = await durumOku(s);
          denetle(!d.geriKapali && d.zincir.length === 3, "geri al: iki adımdan sonra etkin olmalı");
          await s.click("#keyboard .key[data-key=\"A\"]"); await s.click("#keyboard .key[data-key=\"BACK\"]");   // yazılan harfi silmek
          denetle(await s.evaluate(() => oyun.buffer === "") && (await haklar(s)).kayit.geriAl === 5, "sil tuşu geri alma hakkı harcamamalı");
          await s.click("#keyboard .key[data-key=\"A\"]");                 // yazılmakta olan harf
          await s.click("#btnUndo");
          denetle((await haklar(s)).kayit.geriAl === 4 && (await haklar(s)).rozetGeri === "4", "geri al bir hak harcamalı");
          d = await durumOku(s);
          denetle(d.zincir.length === 2 && d.zincir[1] === y[0] && d.basamak === 1 && d.durum === "1 adım",
                  `geri al: son basamak çıkmadı (${d.zincir}, basamak ${d.basamak}, '${d.durum}')`);
          denetle(d.kayitliZincir && d.kayitliZincir.length === 2, "geri al: sm_state zinciri güncellenmedi");
          denetle(await s.evaluate(() => oyun.buffer === "" && document.querySelectorAll("#inputRow .tile.filled").length === 0), "geri al: yazılmakta olan harfler silinmedi");
          await s.reload(); await oyunHazir(s);
          d = await durumOku(s);
          denetle(d.zincir.length === 2 && d.basamak === 1, "geri al: yenilemede zincir korunmadı");
          await s.click("#btnUndo");                                        // başlangıca kadar
          d = await durumOku(s);
          denetle(d.zincir.length === 1 && d.zincir[0] === bas && d.geriKapali && d.basamak === 0, "geri al: başlangıç kelimesi kalmalı, düğme devre dışı olmalı");
          denetle(await s.evaluate(() => (oyun.undo(), oyun.chain.length === 1)), "geri al: başlangıç kelimesi geri alınabildi");
          denetle((await haklar(s)).kayit.geriAl === 3, "geri alınacak adım yokken hak harcandı");
        }
        for (const k of y) await kelimeYaz(s, k);                            // geri aldıktan sonra yine çözülür
        await s.waitForFunction(() => oyun.over, null, { timeout: 5000 });
        d = await durumOku(s);
        denetle(d.geriKapali, "geri al: oyun bitince devre dışı olmalı");
        denetle(JSON.parse(d.gunluk).steps === y.length, "geri al: sonra çözüm kaydı yanlış");
        await b.close();
      }

      // 13b) Geri al: sürmekte olan günlük tekrarda kayıt (deneme) güncellenir
      {
        const { b, s } = await gelirSayfasi(null);
        const [bas, hedef] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
        const kotu = kotuYol(bas, hedef);
        for (const k of kotu) await kelimeYaz(s, k);
        await s.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 });
        await s.click("#btnRetry");
        await kelimeYaz(s, kotu[0]);
        if (kotu.length > 2) await kelimeYaz(s, kotu[1]);
        await s.click("#btnUndo");
        const ilk = await s.evaluate(() => ({ z: oyun.chain.slice(), d: JSON.parse(localStorage.getItem("sm_gunluk_" + oyun.todayKey())).deneme }));
        denetle(JSON.stringify(ilk.z) === JSON.stringify(ilk.d), `geri al: tekrarın kaydı zincirle aynı olmalı (${ilk.z} / ${ilk.d})`);
        await s.click("#tabFree"); await s.click("#tabDaily");
        denetle(await s.evaluate((z) => !oyun.over && JSON.stringify(oyun.chain) === JSON.stringify(z), ilk.z), "geri al: sekme değişiminde tekrar zinciri korunmadı");
        await b.close();
      }

      // 13c) Sonucu göster: eşik, onay, geçerli en kısa yol, kayıt yok, yenilemede korunur
      {
        const { b, s } = await gelirSayfasi(null);
        const [bas, hedef, en] = await s.evaluate(() => [oyun.startWord, oyun.targetWord, oyun.optimal]);
        await gezin(s, bas, hedef, en);
        let d = await durumOku(s);
        denetle(d.zincir.length - 1 === en && !d.sonucGorunur, `sonucu göster: adım sayısı en az adıma eşitken görünmemeli (${d.zincir.length - 1}/${en})`);
        await gezin(s, bas, hedef, en + 1);
        d = await durumOku(s);
        denetle(d.zincir.length - 1 === en + 1 && d.sonucGorunur, "sonucu göster: en az adım aşılınca görünmeli");
        const kutu = await s.evaluate(() => { const r = document.getElementById("btnShowResult").getBoundingClientRect(); return [r.width, r.height]; });
        denetle(kutu[0] >= 44 && kutu[1] >= 28, `sonucu göster: düğme ${kutu} px, en az 44 x 28 (alan ::before ile 44'e tamamlanır)`);
        // Geri alınca eşiğin altına inerse yeniden gizlenir
        await s.click("#btnUndo");
        denetle(!(await durumOku(s)).sonucGorunur, "sonucu göster: geri alınıp eşiğe inince gizlenmeli");
        await kelimeYaz(s, (await s.evaluate(() => oyun.currentWord)) === bas ? komsular(bas).find((k) => k !== hedef) : bas);
        // Vazgeç: hiçbir şey değişmez
        const once = (await durumOku(s)).zincir;
        await s.click("#btnShowResult");
        denetle(await onayAcik(s), "sonucu göster: onay penceresi açılmadı");
        denetle((await durumOku(s)).bitti === false, "sonucu göster: onaydan önce oyun bitmemeli");
        await s.click("#btnPesVazgec");
        d = await durumOku(s);
        denetle(!(await onayAcik(s)) && !d.bitti && JSON.stringify(d.zincir) === JSON.stringify(once), "sonucu göster: vazgeçince durum değişti");
        // Evet
        await s.click("#btnShowResult"); await s.click("#btnPesEvet");
        d = await durumOku(s);
        const sozluk = db[String(bas.length)].words;
        denetle(d.bitti && d.gosterildi, "sonucu göster: oyun 'çözüm gösterildi' olarak bitmedi");
        denetle(d.zincir.length - 1 === en && gecerliYol(d.zincir, bas, hedef, sozluk), `sonucu göster: gösterilen yol geçerli ve ${en} adımlık en kısa yol değil (${d.zincir})`);
        denetle(d.basamak === en && d.durum === "Çözüm gösterildi", `sonucu göster: ekran yanlış (basamak ${d.basamak}, '${d.durum}')`);
        denetle(d.gunluk === null && d.pes !== null, "sonucu göster: günlükte çözüm kaydı (steps >= 1) oluşmamalı; yalnızca gosterildi işareti");
        denetle(!d.paylasGorunur && !d.ipucuGorunur && d.geriKapali && !d.sonucGorunur, "sonucu göster: bitişte Paylaş/İpucu/Geri al/Sonucu göster kapalı olmalı");
        denetle(await s.evaluate(() => document.getElementById("modal").classList.contains("hidden")), "sonucu göster: kazanma penceresi açılmamalı");
        const yolu = d.zincir;
        await s.reload(); await oyunHazir(s);
        d = await durumOku(s);
        denetle(d.bitti && d.gosterildi && JSON.stringify(d.zincir) === JSON.stringify(yolu) && d.gunluk === null, "sonucu göster: yenilemede korunmadı");
        // Serbest oyuna geçip dönünce de bulmaca öyle biter, yeniden çözülemez
        await s.click("#tabFree"); await s.click("#tabDaily");
        d = await durumOku(s);
        denetle(d.bitti && d.gosterildi && JSON.stringify(d.zincir) === JSON.stringify(yolu) && d.gunluk === null, "sonucu göster: sekme değişiminde günlük bulmaca yeniden açıldı");
        await b.close();
      }

      // 13d) Sonucu göster: serbest oyun ve sonra Yeni Oyun
      {
        const { b, s } = await gelirSayfasi(null);
        await s.click("#tabFree");
        const [bas, hedef, en] = await s.evaluate(() => [oyun.startWord, oyun.targetWord, oyun.optimal]);
        await gezin(s, bas, hedef, en + 1);
        await s.click("#btnShowResult"); await s.click("#btnPesEvet");
        const d = await durumOku(s);
        denetle(d.bitti && d.gosterildi && gecerliYol(d.zincir, bas, hedef, db[String(bas.length)].words) && d.zincir.length - 1 === en, "sonucu göster: serbest oyunda geçerli en kısa yol gösterilmedi");
        denetle(d.pes === null, "sonucu göster: serbest oyun günlüğe kayıt yazmamalı");
        await s.click("#btnRestart");
        denetle(await s.evaluate(() => !oyun.over && !oyun.shown && oyun.chain.length === 1), "sonucu göster: sonra yeni oyun açılmadı");
        await b.close();
      }

      // 13e) Sonucu göster: çözülmüş günlükte sürmekte olan tekrar — ilk çözüm kaydı değişmez
      {
        const { b, s } = await gelirSayfasi(null);
        const [bas, hedef, en] = await s.evaluate(() => [oyun.startWord, oyun.targetWord, oyun.optimal]);
        const kotu = kotuYol(bas, hedef);
        for (const k of kotu) await kelimeYaz(s, k);
        await s.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"), null, { timeout: 5000 });
        const kayit = () => s.evaluate(() => localStorage.getItem("sm_gunluk_" + oyun.todayKey()));
        const ilkKayit = JSON.parse(await kayit());
        await s.click("#btnRetry");
        await gezin(s, bas, hedef, en + 1);
        await s.click("#btnShowResult"); await s.click("#btnPesEvet");
        const son = JSON.parse(await kayit());
        denetle(son.steps === ilkKayit.steps && JSON.stringify(son.chain) === JSON.stringify(ilkKayit.chain) && son.deneme === undefined && son.enIyi === undefined,
                `sonucu göster: tekrarda ilk çözüm kaydı değişti ya da deneme kaldı (${JSON.stringify(son)})`);
        denetle(await s.evaluate(() => oyun.over && oyun.shown), "sonucu göster: tekrar 'çözüm gösterildi' olarak bitmedi");
        // İlk çözüm kaydı varken Paylaş / Tekrar dene hemen görünür (sekme değişimi beklenmez)
        denetle(await gorunur(s, "#dailySolved") && await gorunur(s, "#btnDailyShare"), "sonucu göster: ilk çözüm kaydı varken Paylaş hemen görünmeli");
        denetle(await s.evaluate((n) => oyun.lastResult && oyun.lastResult.steps === n, ilkKayit.steps), "sonucu göster: tekrarda lastResult ilk çözüm olmalı");
        await s.reload(); await oyunHazir(s);
        denetle(await gorunur(s, "#dailySolved") && await s.evaluate(() => oyun.shown), "sonucu göster: yenilemeden sonra Paylaş görünmeli, durum korunmalı");
        await s.click("#tabFree"); await s.click("#tabDaily");
        denetle(await s.evaluate((n) => oyun.over && !oyun.shown && oyun.lastResult.steps === n, ilkKayit.steps), "sonucu göster: günlüğe dönünce ilk çözüm geri gelmedi");
        await b.close();
      }

      // 13f) Sonucu göster hiçbir gelir kancasını çağırmaz (kancalı sayfa, Plus değil)
      {
        const { b, s } = await gelirSayfasi({ plus: false, odul: true, satin: false, geri: false });
        const [bas, hedef, en] = await s.evaluate(() => [oyun.startWord, oyun.targetWord, oyun.optimal]);
        await gezin(s, bas, hedef, en + 1);
        await s.click("#btnShowResult");
        denetle(await onayAcik(s), "kancalı sayfa: onay penceresi açılmadı");
        await s.click("#btnPesEvet");
        denetle(await s.evaluate(() => oyun.over && oyun.shown), "kancalı sayfa: sonuç gösterilmedi");
        denetle((await cagrilar(s)).length === 0, `sonucu göster gelir kancası çağırdı: ${await cagrilar(s)}`);
        await b.close();
      }
    }

    /* 14) Sayılı geri al ve yenile onayı */
    console.log("14. Sayılı geri al, yenile onayı");
    {
      // Başlangıçtan bir komşuya (hedef olmayan) gider: geri alınacak bir adım olur
      const birAdim = async (s) => {
        const [bas, hedef] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
        await kelimeYaz(s, komsular(bas).find((k) => k !== hedef));
      };
      const zincirBoyu = (s) => s.evaluate(() => oyun.chain.length);

      // 14a) Web: geri alma hakkı 0 iken geri al "yarın" der, adım geri alınmaz, teklif açılmaz
      {
        const { b, s } = await gelirSayfasi(null, hakOnYukle(0, 5));
        await birAdim(s);
        denetle(await s.evaluate(() => !document.getElementById("btnUndo").disabled), "hak 0 iken de geri al basılabilir olmalı (ne olacağını söyler)");
        await s.click("#btnUndo");
        denetle(await zincirBoyu(s) === 2 && /yarın/i.test(await toastMetni(s)) && !(await gorunur(s, "#offer")),
                `web: geri alma hakkı yokken '${await toastMetni(s)}', zincir ${await zincirBoyu(s)}`);
        await b.close();
      }

      // 14b) Uygulama: geri alma hakkı 0 → ödüllü reklam teklifi ("geriAl"); ödül yoksa bir şey olmaz,
      // ödül kazanılınca +1 hak verilir ve adım hemen geri alınır
      {
        const { b, s } = await gelirSayfasi({ plus: false, odul: false, satin: false, geri: false }, hakOnYukle(0, 5));
        await birAdim(s);
        await s.click("#btnUndo");
        denetle(await gorunur(s, "#offer") && await zincirBoyu(s) === 2 && (await cagrilar(s)).length === 0,
                "uygulama: geri alma hakkı yokken teklif açılmalı, kanca henüz çağrılmamalı");
        denetle((await s.textContent("#offerTitle")) === "Geri alma hakkın bitti" && (await s.textContent("#btnOfferAd")) === "Reklam izle, geri al",
                `geri al teklifi metni yanlış: '${await s.textContent("#offerTitle")}' / '${await s.textContent("#btnOfferAd")}'`);
        await s.click("#btnOfferAd");             // ödül yok
        denetle(JSON.stringify(await cagrilar(s)) === '["odul:geriAl"]' && await zincirBoyu(s) === 2 && await gorunur(s, "#offer") && /Reklam gösterilemedi/.test(await toastMetni(s)),
                `ödülsüz reklamda adım geri alındı ya da neden yanlış: ${await cagrilar(s)}`);
        await s.evaluate(() => { window.__k.odul = true; });
        await s.click("#btnOfferAd");             // ödül: +1 hak, hemen kullanılır
        const h = await haklar(s);
        denetle(await zincirBoyu(s) === 1 && !(await gorunur(s, "#offer")) && h.kayit.geriAl === 0 && h.rozetGeri === "0",
                `ödüllü geri al: zincir ${await zincirBoyu(s)}, hak ${JSON.stringify(h.kayit)}`);
        // İpucu teklifi açılınca metinler ipucuna döner
        await hakSifirla(s, "ipucu");
        await s.click("#btnHint");
        denetle((await s.textContent("#offerTitle")) === "İpucun bitti" && (await s.textContent("#btnOfferAd")) === "Reklam izle, ipucu al", "ipucu teklifi metni geri gelmedi");
        await b.close();
      }

      // 14c) Plus: haklar 0 olsa da geri al ve ipucu sınırsız; rozet yok, kayıt değişmez.
      // Plus sonradan verilirse ("sozcukgelir" olayı) rozetler kalkar
      {
        const { b, s } = await gelirSayfasi({ plus: true, odul: false, satin: false, geri: false }, hakOnYukle(0, 0));
        for (let i = 0; i < 3; i++) { await birAdim(s); await s.click("#btnUndo"); }
        await s.click("#btnHint");
        const h = await haklar(s);
        denetle(await zincirBoyu(s) === 1 && await s.evaluate(() => !!oyun.hint) && (await cagrilar(s)).every((c) => !c.startsWith("odul")),
                "Plus: hak 0 iken geri al ve ipucu reklamsız çalışmalı");
        denetle(h.kayit.geriAl === 0 && h.kayit.ipucu === 0 && h.rozetGeri === null && h.rozetIpucu === null, `Plus: rozet görünmemeli, hak harcanmamalı: ${JSON.stringify(h)}`);
        await s.evaluate(() => { window.__k.plus = false; window.dispatchEvent(new Event("sozcukgelir")); });
        denetle((await haklar(s)).rozetGeri === "0", "Plus geri alınınca rozet dönmeli");
        await s.evaluate(() => { window.__k.plus = true; window.dispatchEvent(new Event("sozcukgelir")); });
        denetle((await haklar(s)).rozetGeri === null, "Plus verilince (olay) rozet kalkmalı");
        await b.close();
      }

      // 14d) Bozuk sm_haklar kaydı oyunu bozmaz: 5 + 5'e döner
      {
        const { b, s } = await gelirSayfasi(null, `try { localStorage.setItem("sm_haklar", "{bozuk"); } catch (_) {}`);
        const h = await haklar(s);
        denetle(h.kayit && h.kayit.geriAl === 5 && h.kayit.ipucu === 5 && h.rozetGeri === "5", `bozuk kayıt 5 + 5'e dönmeli: ${JSON.stringify(h.kayit)}`);
        await b.close();
      }

      // 14e) Yenile: ilerleme yokken onaysız; varken onay ister (günlük ve serbest); Vazgeç, Kapat ve
      // Escape bir şey değiştirmez; onay açıkken klavye tahtaya yazmaz; hak harcanmaz
      {
        const { b, s } = await gelirSayfasi(null);
        const bas = await s.evaluate(() => oyun.startWord);
        await s.click("#btnRestart");             // ilerleme yok: onaysız
        denetle(!(await gorunur(s, "#yenile")) && await zincirBoyu(s) === 1, "ilerleme yokken yenile onay istememeli");
        await birAdim(s);
        await s.click("#btnRestart");
        denetle(await gorunur(s, "#yenile") && (await s.textContent("#yenileTitle")) === "Baştan başlansın mı?" && (await s.textContent("#btnYenileEvet")) === "Baştan başla",
                "günlükte ilerleme varken 'Baştan başlansın mı?' onayı açılmalı");
        await s.keyboard.type("a");
        denetle(await s.evaluate(() => oyun.buffer) === "", "yenile onayı açıkken fiziksel klavye tahtaya yazdı");
        await s.keyboard.press("Escape");
        denetle(!(await gorunur(s, "#yenile")) && await zincirBoyu(s) === 2, "Escape yenile onayını kapatmalı, ilerleme kalmalı");
        await s.click("#btnRestart"); await s.click("#btnYenileVazgec");
        denetle(!(await gorunur(s, "#yenile")) && await zincirBoyu(s) === 2, "Vazgeç ilerlemeyi silmemeli");
        await s.click("#btnRestart"); await s.click("#btnCloseYenile");
        denetle(!(await gorunur(s, "#yenile")) && await zincirBoyu(s) === 2, "Kapat ilerlemeyi silmemeli");
        await s.click("#btnRestart"); await s.click("#btnYenileEvet");
        denetle(!(await gorunur(s, "#yenile")) && await zincirBoyu(s) === 1 && await s.evaluate(() => oyun.startWord) === bas, "günlükte onaydan sonra aynı bulmaca baştan açılmalı");
        denetle((await haklar(s)).kayit.geriAl === 5, "yenile geri alma hakkı harcamamalı");
        await s.click("#tabFree");
        await birAdim(s);
        await s.click("#btnRestart");
        denetle(await gorunur(s, "#yenile") && (await s.textContent("#yenileTitle")) === "Yeni bulmaca açılsın mı?", "serbestte ilerleme varken 'Yeni bulmaca açılsın mı?' onayı açılmalı");
        await s.click("#btnYenileEvet");
        denetle(await zincirBoyu(s) === 1 && await s.evaluate(() => oyun.mode) === "free", "serbestte onaydan sonra yeni bulmaca açılmalı");
        await b.close();
      }
    }

    /* 15) Açık ipucu yenilemede kaybolmaz (hakkı harcandı); ileti ve kural metinleri */
    console.log("15. Açık ipucu korunur; hak bitince doğru ileti");
    {
      // 15a) Web: ipucu açıkken yenile → aynı ipucu sessizce geri gelir, hak yeniden harcanmaz
      {
        const { b, s } = await gelirSayfasi(null);
        denetle((await s.textContent("#hakKurali")) === "Biten hak her gün 1'e tamamlanır.", `webde hak kuralı metni yanlış: '${await s.textContent("#hakKurali")}'`);
        const [bas, hedef] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
        await kelimeYaz(s, komsular(bas).find((k) => k !== hedef && uz(k, hedef) < Infinity));
        await s.click("#btnHint");
        const once = await s.evaluate(() => JSON.stringify(oyun.hint));
        await s.reload(); await oyunHazir(s);
        const sonra = await s.evaluate(() => ({ h: JSON.stringify(oyun.hint), cerceve: document.querySelectorAll(".tile.hint").length,
          silik: document.querySelectorAll("#inputRow .tile.hint-letter").length, toast: document.getElementById("toast").classList.contains("show") }));
        denetle(sonra.h === once && sonra.cerceve === 1 && sonra.silik === 1, `yenilemede açık ipucu kayboldu: ${once} → ${sonra.h}`);
        denetle(!sonra.toast, "geri gelen ipucu bildirim göstermemeli");
        denetle((await haklar(s)).kayit.ipucu === 4, "yenilemede ipucu hakkı yeniden harcandı ya da iade edildi");
        await s.click("#btnHint");                // açık ipucuna bakmak hak harcamaz
        denetle((await haklar(s)).kayit.ipucu === 4, "geri gelen ipucuna bakmak hak harcadı");
        await b.close();
      }
      // 15b) Kayıttaki ipucu zincirin ucuna uymuyorsa (bozuk/eski) yok sayılır
      {
        const { b, s } = await gelirSayfasi(null);
        await s.evaluate(() => { const k = JSON.parse(localStorage.getItem("sm_state")); k.ipucu = { pos: 0, letter: "<", word: "<b>", kalan: 1 }; localStorage.setItem("sm_state", JSON.stringify(k)); });
        await s.reload(); await oyunHazir(s);
        denetle(await s.evaluate(() => oyun.hint === null && !document.querySelector(".tile.hint")), "bozuk kayıtlı ipucu gösterildi");
        await b.close();
      }
      // 15c) Kanca var ama ödüllü reklam yok: "yarın" denmez (uygulamada gün tamamlaması yok)
      {
        const b = await tarayici.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
        await disAgiKapat(b);
        await b.addInitScript(hakOnYukle(0, 0));
        await b.addInitScript(() => { window.SozcukGelir = { plusMu: () => false, plusSatinAl: () => Promise.resolve(false) }; });
        const s = await b.newPage();
        s.on("pageerror", (e) => sayfaHatalari.push(e.message));
        await s.goto(ADRES); await oyunHazir(s);
        await s.click("#btnHint");
        const t = await toastMetni(s);
        denetle(t === "İpucu hakkın bitti. Plus ile sınırsız kullanabilirsin." && !(await gorunur(s, "#offer")), `ödüllü reklamsız kancada ileti yanlış: '${t}'`);
        denetle((await s.textContent("#hakKurali")) === "", "ödüllü reklam yokken uygulamada hak kuralı boş olmalı");
        await b.close();
      }
    }

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
