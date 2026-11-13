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
 *  11. Analitik izni: kabulden önce Firebase/Google isteği yok, sonra var;
 *      bildirim tahtayı örtmüyor; Reddet/Kabul eşit; tercih değiştirilebiliyor
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
    const disIstekler = [];
    // Firebase SDK'sı gerçekten indirilmez: istek kaydedilir, yerine sahte modül
    // verilir (logEvent çağrıları window.__olaylar'a yazılır). Diğer dış istekler düşer.
    const SAHTE_SDK = {
      "firebase-app.js": "export const initializeApp = () => ({});",
      "firebase-analytics.js": "export const getAnalytics = () => ({}); export const isSupported = async () => true;" +
        " export const logEvent = (a, ad) => { (window.__olaylar = window.__olaylar || []).push(ad); };",
    };
    const disAgiKapat = (b) => b.route("**/*", (istek) => {
      const url = istek.request().url();
      if (url.startsWith(ADRES)) return istek.continue();
      disIstekler.push(url);
      const sahte = SAHTE_SDK[url.split("/").pop()];
      return sahte && /gstatic\.com\/firebasejs\//.test(url)
        ? istek.fulfill({ contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: sahte })
        : istek.abort();
    });
    // Oyun testlerinde izin kararı verilmiş sayılır (bildirim yer kaplamasın);
    // bildirimin kendisi 11. adımda ayrıca denenir.
    const izinVerilmis = (b) => b.addInitScript(() => {
      try { if (!localStorage.getItem("sm_izin")) localStorage.setItem("sm_izin", "hayir"); } catch (_) {}
    });
    // Dar ekran + fare: ekran klavyesi görünür (dokunmatikte gizlenir, bkz. 8. adım)
    const baglam = await tarayici.newContext({ viewport: { width: 390, height: 844 } });
    await disAgiKapat(baglam);
    await izinVerilmis(baglam);

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
      ["#btnMute", "#btnRestart", "#keyboard .key[data-key=BACK]"].map((sec) => {
        const d = document.querySelector(sec);
        const g = [...d.querySelectorAll("svg")].filter((s) => s.getBoundingClientRect().width > 0);
        return { sec, ad: d.getAttribute("aria-label"), sinif: g.map((s) => s.getAttribute("class")).join("|") };
      }));
    const ikonlar = await gorunurIkon();
    for (const i of ikonlar) denetle(!!i.ad && i.sinif.startsWith("icon") && !i.sinif.includes("|"), `${i.sec}: tek görünür SVG ikon ve aria-label olmalı (${i.sinif})`);
    await sayfa.click("#btnMute");
    const sessiz = (await gorunurIkon())[0].sinif;
    denetle(sessiz.includes("icon-sound-off") && sessiz !== ikonlar[0].sinif, `ses kapatılınca ikon değişmedi (${sessiz})`);
    await sayfa.click("#btnMute");
    denetle((await gorunurIkon())[0].sinif === ikonlar[0].sinif, "ses açılınca ikon geri dönmedi");

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
    await izinVerilmis(dokunmatik);
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
      await izinVerilmis(b);
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
          : ".icon-btn, .mode-tab, .pick-btn, .scroll-cue, .site-footer a";   // alt bilgi: Gizlilik + Çerez Tercihleri
        for (const a of await dokunmaAlani(s, secici)) {
          denetle(a.en >= 44 && a.boy >= 44, `${ad}: '${a.ad}' dokunma alanı ${a.en}×${a.boy}, en az 44×44 olmalı`);
        }
      }
      if (en === 360 && !cozulmus) {
        // Görünmez dokunma alanı kaydırılan tahtaya taşmamalı: tahta kayınca
        // harf kutuları oraya gelir ve dokunuş ayar düğmesine gidip oyunu sıfırlar.
        await s.tap('[data-diff="zor"]');                // uzun yol: tahta kaysın
        const [zb, zh] = await s.evaluate(() => [oyun.startWord, oyun.targetWord]);
        await s.tap("#game");
        for (const k of (enKisaYol(zb, zh) || []).slice(0, -1)) {
          await s.keyboard.type(k.toLocaleLowerCase("tr"));
          await s.keyboard.press("Enter");
        }
        const tahta = await s.evaluate(() => {
          const g = document.getElementById("game");
          g.scrollTop = g.scrollHeight;
          const r = g.getBoundingClientRect(), ust = r.top + g.clientTop;   // kutuların çizilebildiği ilk satır
          const ayar = [];
          for (let y = ust; y < ust + 10; y++) for (let x = r.left + 2; x < r.right - 2; x += 4) {
            const e = document.elementFromPoint(x, y);
            if (e && e.closest(".free-settings, .mode-tabs, .header")) ayar.push(e.textContent.trim());
          }
          return { kaydi: g.scrollTop > 0, ayar: [...new Set(ayar)] };
        });
        denetle(tahta.kaydi, `${ad}: tahta kaydırılamadı, örtüşme denetimi yapılamadı`);
        denetle(!tahta.ayar.length, `${ad}: kayan tahtanın üst kenarına dokunuş ayar düğmesine gidiyor: ${tahta.ayar.join(", ")}`);
      }
      await b.close();
    }

    /* 11) Analitik izni: kabulden önce Firebase/Google'a istek ve olay yok, sonra var */
    console.log("11. Analitik izni");
    const firebaseMi = (u) => /gstatic\.com|googletagmanager|google-analytics|firebase/i.test(u);
    const olaylar = (s) => s.evaluate(() => window.__olaylar || []);
    async function izinBaglami(en, boy) {
      const b = await tarayici.newContext({ viewport: { width: en, height: boy }, hasTouch: true, isMobile: true });
      await disAgiKapat(b);                 // dış istekler kaydedilir; SDK yerine sahte modül gelir
      return b;
    }
    // a) Bildirim varken küçük telefonlarda başlangıç, HEDEF (ve serbest oyunda giriş) ilk ekranda
    for (const [en, boy, serbest] of [[375, 667, false], [375, 548, false], [375, 548, true],
                                       [360, 560, false], [360, 560, true]]) {
      const ad = `izin bildirimi açık, ${en}×${boy} ${serbest ? "serbest oyun" : "günlük"}`;
      const kb = await izinBaglami(en, boy);
      const ks = await kb.newPage();
      ks.on("pageerror", (e) => sayfaHatalari.push(e.message));
      await ks.goto(ADRES); await oyunHazir(ks);
      if (serbest) await ks.tap("#tabFree");
      const g = await ks.evaluate(() => {
        const oyunKutu = document.getElementById("game").getBoundingClientRect();
        const k = document.getElementById("izin").getBoundingClientRect();
        const icinde = (id) => { const r = document.getElementById(id).getBoundingClientRect();
          return r.height > 0 && r.top >= Math.max(0, oyunKutu.top) - 0.5 && r.bottom <= Math.min(innerHeight, oyunKutu.bottom) + 0.5; };
        return { yuk: Math.round(k.height), oyunYuk: Math.round(oyunKutu.height), banner: !document.getElementById("izin").hidden && k.height > 0, sigiyor: k.bottom <= innerHeight + 0.5,
                 ortusme: k.top < oyunKutu.bottom - 0.5 && k.bottom > oyunKutu.top + 0.5,
                 basla: icinde("startWord"), hedef: icinde("targetWord"), giris: icinde("inputRow") };
      });
      denetle(g.banner && g.sigiyor, `${ad}: bildirim görünmüyor ya da ekrana sığmıyor`);
      denetle(!g.ortusme, `${ad}: bildirim tahtayı örtüyor`);
      denetle(g.basla, `${ad}: BAŞLANGIÇ satırı ilk ekranda değil`);
      denetle(g.hedef, `${ad}: HEDEF satırı ilk ekranda değil`);
      if (serbest) denetle(g.giris, `${ad}: giriş satırı ilk ekranda değil`);
      await kb.close();
    }
    // b) İlk ziyaret 375×667: eşit düğmeler; oyun başlangıcı kabulden önce olay göndermez
    disIstekler.length = 0;
    const ib = await izinBaglami(375, 667);
    const is = await ib.newPage();
    is.on("pageerror", (e) => sayfaHatalari.push(e.message));
    await is.goto(ADRES);
    await oyunHazir(is);
    await is.waitForTimeout(500);
    const bildirim = await is.evaluate(() => {
      const boyut = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
      const stil = (id) => getComputedStyle(document.getElementById(id));
      return { evet: boyut("izinEvet"), hayir: boyut("izinHayir"),
               stilAyni: stil("izinEvet").backgroundColor === stil("izinHayir").backgroundColor
                 && stil("izinEvet").color === stil("izinHayir").color,
               secim: localStorage.getItem("sm_izin") };
    });
    denetle(bildirim.evet[0] === bildirim.hayir[0] && bildirim.evet[1] === bildirim.hayir[1] && bildirim.stilAyni,
            `Kabul/Reddet düğmeleri aynı boy ve stilde değil: ${bildirim.evet} / ${bildirim.hayir}`);
    denetle(bildirim.evet[1] >= 44, `düğme yüksekliği ${bildirim.evet[1]}, en az 44 olmalı`);
    denetle(bildirim.secim === null, "kullanıcı seçmeden sm_izin yazıldı");
    denetle(!disIstekler.some(firebaseMi), "kabulden ÖNCE Firebase/Google isteği yapıldı: " + disIstekler.filter(firebaseMi).join(", "));
    // c) Kabul: sm_izin=evet, SDK istenir; kabulden önceki game_start sonradan gönderilmez
    await is.tap("#izinEvet");
    await is.waitForFunction(() => document.getElementById("izin").hidden);
    await is.waitForTimeout(500);
    denetle(await is.evaluate(() => localStorage.getItem("sm_izin")) === "evet", "kabulden sonra sm_izin 'evet' değil");
    denetle(disIstekler.some(firebaseMi), "kabulden sonra Firebase SDK istenmedi");
    denetle(!(await olaylar(is)).includes("game_start"), "kabulden ÖNCEKİ game_start kabulden sonra gönderildi");
    await is.tap("#btnRestart");           // yeni oyun: game_start artık gönderilmeli
    await is.waitForFunction(() => (window.__olaylar || []).includes("game_start"), null, { timeout: 5000 })
      .then(() => { gecen++; }, () => denetle(false, "kabulden sonra game_start olayı gönderilmedi"));
    // d) Yenileyince bildirim çıkmaz, seçim hatırlanır, olaylar gönderilir
    await is.evaluate(() => localStorage.removeItem("sm_state"));   // devam eden oyun game_start göndermez
    await is.reload(); await oyunHazir(is);
    denetle(await is.evaluate(() => document.getElementById("izin").hidden), "kabul edilmiş seçim sonrası bildirim yine çıktı");
    await is.waitForFunction(() => (window.__olaylar || []).includes("game_start"), null, { timeout: 5000 })
      .then(() => { gecen++; }, () => denetle(false, "izinli ziyaretçide yükleme sırasındaki game_start kuyruktan gönderilmedi"));
    // e) Tercihi değiştir (sayfa aşağıda kaydırılmışken): yenilenir, bildirim ilk ekranda, Google isteği yok
    await is.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    disIstekler.length = 0;
    await is.tap('.site-footer a[href="#cerez-tercihi"]');
    await is.waitForFunction(() => !document.getElementById("izin").hidden && (window.scrollY || 0) < 5, null, { timeout: 5000 })
      .then(() => { gecen++; }, () => denetle(false, "Çerez Tercihleri sonrası bildirim ilk ekranda görünmüyor"));
    await is.waitForTimeout(400);
    const geriAlinmis = await is.evaluate(() => {
      const r = document.getElementById("izin").getBoundingClientRect();
      return { secim: localStorage.getItem("sm_izin"), ekranda: r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.height > 0,
               olay: (window.__olaylar || []).length };
    });
    denetle(geriAlinmis.secim === null, "Çerez Tercihleri sm_izin'i silmedi");
    denetle(geriAlinmis.ekranda, "Çerez Tercihleri sonrası bildirim ekranın dışında");
    denetle(geriAlinmis.olay === 0, "geri alınan rıza sonrası yeni sayfada olay gönderildi");
    denetle(!disIstekler.some(firebaseMi), "rıza geri alındıktan sonra Firebase/Google isteği yapıldı: " + disIstekler.filter(firebaseMi).join(", "));
    await ib.close();
    // f) Gizlilik sayfasından geri alma: izinli ziyaretçi, SDK başlatılmadan bildirim gelir
    disIstekler.length = 0;
    const gb = await izinBaglami(375, 667);
    await gb.addInitScript(() => { try { if (!localStorage.getItem("sm_izin")) localStorage.setItem("sm_izin", "evet"); } catch (_) {} });
    const gs = await gb.newPage();
    gs.on("pageerror", (e) => sayfaHatalari.push(e.message));
    await gs.goto(ADRES + "gizlilik.html");
    await gs.tap('a[href="index.html#cerez-tercihi"]');
    await gs.waitForURL(ADRES + "index.html");
    await gs.waitForFunction(() => document.getElementById("izin") && !document.getElementById("izin").hidden, null, { timeout: 5000 })
      .then(() => { gecen++; }, () => denetle(false, "gizlilik sayfasından geri alınca bildirim görünmedi"));
    await gs.waitForTimeout(500);
    denetle(await gs.evaluate(() => localStorage.getItem("sm_izin")) === null, "gizlilik sayfasından geri alma sm_izin'i silmedi");
    denetle(!disIstekler.some(firebaseMi), "gizlilik sayfasından geri alırken Firebase/Google isteği yapıldı: " + disIstekler.filter(firebaseMi).join(", "));
    await gb.close();
    // g) Reddet: seçim saklanır, Firebase hiç istenmez, olay yok
    disIstekler.length = 0;
    const rb = await izinBaglami(375, 667);
    const rs = await rb.newPage();
    rs.on("pageerror", (e) => sayfaHatalari.push(e.message));
    await rs.goto(ADRES); await oyunHazir(rs);
    await rs.tap("#izinHayir");
    await rs.reload(); await oyunHazir(rs);
    await rs.tap("#btnRestart");
    await rs.waitForTimeout(500);
    denetle(await rs.evaluate(() => localStorage.getItem("sm_izin")) === "hayir", "reddetme sm_izin='hayir' yazmadı");
    denetle(await rs.evaluate(() => document.getElementById("izin").hidden), "reddedilmiş seçim sonrası bildirim yine çıktı");
    denetle(!disIstekler.some(firebaseMi), "reddedildi ama Firebase/Google isteği yapıldı");
    denetle((await olaylar(rs)).length === 0, "reddedildi ama analitik olayı gönderildi");
    await rb.close();

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
