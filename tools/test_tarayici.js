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
 *   8. Dokunmatikte ekran klavyesi gizli, cihaz klavyesi çalışıyor
 *   9. TRT gece yarısında bulmaca kendiliğinden değişiyor
 *  10. Küçük telefonda HEDEF/giriş satırı ilk ekranda; dokunma alanları ≥ 44 px
 *
 * Dış ağ (reklam, analitik) engellenir; test internetsiz de aynı sonucu verir.
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
    const disAgiKapat = (b) => b.route("**/*", (istek) =>
      istek.request().url().startsWith(ADRES) ? istek.continue() : istek.abort());
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
    for (const kelime of yol || []) await kelimeYaz(sayfa, kelime);
    const son = await sayfa.evaluate(() => ({
      bitti: oyun.over, zincir: oyun.chain.slice(),
      sinif: document.getElementById("game").classList.contains("bitti"),
    }));
    denetle(son.bitti && son.sinif, "hedefe ulaşıldı ama oyun bitmedi");
    denetle(son.zincir.length === (yol ? yol.length : 0) + 1, "merdivendeki kelime sayısı yanlış");
    await sayfa.waitForFunction(() => !document.getElementById("modal").classList.contains("hidden"),
                                null, { timeout: 5000 })
      .then(() => { gecen++; }, () => denetle(false, "kazanınca tebrik penceresi açılmadı"));

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

    /* Dokunmatik: ekran klavyesi gizlenir, cihaz klavyesiyle yazılır */
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
    const klavyeGizli = await sayfa2.locator("#keyboard").isHidden();
    denetle(klavyeGizli, "dokunmatik ekranda ekran klavyesi gizlenmedi");
    await sayfa2.tap("#game");
    await sayfa2.keyboard.type("ka");
    const tampon = await sayfa2.evaluate(() => oyun.buffer);
    denetle(tampon === "KA", `cihaz klavyesiyle 'ka' yazıldı, tampon '${tampon}'`);
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
        await s.tap("#game");
        for (const k of enKisaYol(kb, kh) || []) {
          await s.keyboard.type(k.toLocaleLowerCase("tr"));
          await s.keyboard.press("Enter");
        }
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
      [375, 548, false, ["giris"]],
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
          : ".icon-btn, .mode-tab, .pick-btn, .scroll-cue, .site-footer a";
        for (const a of await dokunmaAlani(s, secici)) {
          denetle(a.en >= 44 && a.boy >= 44, `${ad}: '${a.ad}' dokunma alanı ${a.en}×${a.boy}, en az 44×44 olmalı`);
        }
      }
      await b.close();
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
