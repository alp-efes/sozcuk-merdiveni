"use strict";

/* =========================================================
 * Sözcük Merdiveni (iOS) — uygulama arayüzü
 * ---------------------------------------------------------
 * Site (app.js, style.css) değiştirilmeden paketlenir ve web'de bugünkü gibi
 * kalır. Uygulamaya özgü deneyim buradadır:
 *   - açılış ekranı → ana ekran (Günün Bulmacası / Serbest Oyun) ⇄ oyun
 *   - sitenin ekran klavyesi yerine telefonun klavyesi + Türkçe harf şeridi
 *   - oyun ekranı kaymaz; klavye açılınca görünen alana sığar
 *   - "Nasıl oynanır?" oyunun üstünde açılır, ilk oyunda bir kez kendiliğinden
 * İşaretleme araclar/web-esitle.mjs'te eklenir, görünüm uygulama.css'tedir.
 * app.js'e yalnızca aşağıdaki metotlar sarılarak bağlanılır; her biri
 * testler/paket.test.mjs içinde aranır (site değişirse test kırılır).
 * Capacitor köprüsü gerekmez: tarayıcı testinde de aynı çalışır.
 * ========================================================= */
(() => {
  if (typeof WordLadder === "undefined") return;   // app.js yüklenmediyse bağlanacak bir şey yok
  const P = WordLadder.prototype;
  const kok = document.documentElement;
  const govde = document.body;
  const al = (id) => document.getElementById(id);
  const giris = al("giris");
  const pencereler = [al("modal"), al("offer")];
  const KAYIT = (mod) => "sm_mod_" + mod;          // her modun canlı oyunu (sm_state'in kopyası)
  let oyun = null;
  let ekran = "acilis";

  const oku = (anahtar) => { try { return localStorage.getItem(anahtar); } catch (_) { return null; } };
  const yaz = (anahtar, deger) => { try { localStorage.setItem(anahtar, deger); } catch (_) { /* kayıt tutulamadı */ } };
  const yardimAcik = () => govde.classList.contains("yardim");

  /* ---------- Giriş: telefonun klavyesi ---------- */

  // Metin alanına odaklanır; telefonun klavyesini açar. iOS klavyeyi yalnızca
  // dokunuşla başlayan çağrıda açar: dokunma işleyicilerinden çağrılır.
  const odakla = () => {
    if (!oyun || ekran !== "oyun" || oyun.over || yardimAcik()) return;
    if (pencereler.some((p) => !p.classList.contains("hidden"))) return;
    giris.focus({ preventScroll: true });
  };

  // Metin alanı her zaman app.js'teki buffer'ın aynısını tutar: silme tuşu her
  // klavyede çalışır, ekran okuyucu yazılanı okur. Bitmiş oyunda klavye açılmaz.
  const asilRenderInput = P.renderInput;
  P.renderInput = function (...arg) {
    if (giris.value !== this.buffer) giris.value = this.buffer;
    giris.maxLength = this.len;
    giris.disabled = this.over;
    return asilRenderInput.apply(this, arg);
  };

  // Çözülünce klavye kapanır: merdivenin tamamı ve sonuç penceresi görünür
  const asilWin = P.win;
  P.win = function (...arg) {
    giris.disabled = true;
    giris.blur();
    return asilWin.apply(this, arg);
  };

  // Harfler Türkçe yereliyle büyütülür (i → İ, ı → I), harf dışı her şey süzülür
  giris.addEventListener("input", () => {
    if (!oyun) return;
    const once = oyun.buffer.length;
    const yeni = oyun.over ? "" : [...giris.value.toLocaleUpperCase("tr-TR")]
      .filter((h) => WordLadder.TR_LETTER.test(h)).slice(0, oyun.len).join("");
    // Yeni harf app.js'in kendi yolundan geçer (ses, animasyon); silme ve yapıştırma doğrudan yazılır
    if (yeni.length === once + 1 && yeni.startsWith(oyun.buffer)) oyun.pressKey(yeni[once]);
    else { oyun.buffer = yeni; oyun.renderInput(); }
  });
  // Odak metin alanındayken harf ve silme tuşlarını alan kendisi işler; app.js'in
  // belge düzeyindeki dinleyicisi aynı tuşu ikinci kez yazmasın. Enter ona ulaşır.
  giris.addEventListener("keydown", (e) => { if (e.key !== "Enter") e.stopPropagation(); });
  // İmleç hep sonda: kutular yalnızca sondan yazıp silmeyi gösterir
  giris.addEventListener("focus", () => giris.setSelectionRange(giris.value.length, giris.value.length));

  // Türkçe harf şeridi
  al("harfler").addEventListener("click", (e) => {
    const dugme = e.target.closest(".harf");
    if (dugme && oyun) oyun.pressKey(dugme.dataset.key);
  });
  // Oyun ekranındaki düğmeler odağı metin alanından almaz: dokunmak klavyeyi kapatmaz
  al("oyun").addEventListener("mousedown", (e) => { if (e.target.closest("button, a")) e.preventDefault(); });
  // Oyun ekranında ya da pencerelerde her dokunuştan sonra (tahta, şerit, ipucu,
  // yeni oyun, pencereyi kapat) klavye yeniden açılır; koşullar odakla()'da
  for (const kap of [al("oyun"), ...pencereler]) kap.addEventListener("click", () => odakla());
  // Reklamdan sonra başlayan tekrar: dokunuş zinciri kopmuş olabilir, yine de dene
  const asilBeginRetry = P.beginRetry;
  P.beginRetry = function (...arg) { const s = asilBeginRetry.apply(this, arg); odakla(); return s; };

  // Oyun ekranı görünen alanı tam kaplar: klavye açılınca tarayıcı görünen alanı
  // küçültür, iOS sayfayı da kaydırır; kabuğun boyu ve üstü ona eşitlenir.
  const vv = window.visualViewport;
  const gorunumYaz = () => {
    const boy = vv ? vv.height : window.innerHeight;
    kok.style.setProperty("--vvh", boy + "px");
    kok.style.setProperty("--vv-top", (vv ? vv.offsetTop : 0) + "px");
    if (oyun && ekran === "oyun" && !oyun.over) oyun.el.input.scrollIntoView({ block: "nearest" });
  };
  gorunumYaz();
  (vv || window).addEventListener("resize", gorunumYaz);
  if (vv) vv.addEventListener("scroll", gorunumYaz);

  /* ---------- Her modun oyunu ayrı saklanır ---------- */

  // app.js tek bir canlı oyun tutar (sm_state). Ana ekranla iki mod arasında gidip
  // gelmek kolaylaştığı için her kayıt moduna göre kopyalanır; öteki moda geçmek
  // kalınan yeri silmez.
  const asilSaveState = P.saveState;
  P.saveState = function (...arg) {
    const s = asilSaveState.apply(this, arg);
    const ham = oku("sm_state");
    if (ham) yaz(KAYIT(this.mode), ham);
    return s;
  };

  // O modun sürdürülebilir kaydı (ham metin) ya da null
  const kayitli = (mod) => {
    const ham = oku(KAYIT(mod));
    let s;
    try { s = JSON.parse(ham); } catch (_) { return null; }
    if (!s || s.over || !Array.isArray(s.chain) || typeof s.start !== "string") return null;
    if (mod === "daily" ? (s.mode !== "daily" || s.day !== oyun.dayNumber())
      : (s.mode !== "free" || s.start.length !== oyun.lenPref || s.puzzleDiff !== oyun.diffPref)) return null;
    return { ham, s };
  };
  // Ekrandaki oyun bu modun sürdürülebilir oyunu mu
  const suruyor = (mod) => oyun.mode === mod && (mod === "daily"
    ? oyun.gosterilenGun === oyun.dayNumber()
    : !oyun.over && oyun.len === oyun.lenPref && oyun.puzzleDiff === oyun.diffPref);

  /* ---------- Ekranlar: açılış → ana ekran ⇄ oyun ---------- */

  const ekranAc = (ad) => { ekran = ad; govde.dataset.ekran = ad; };

  // Üst üste çözülen gün sayısı (TRT). Bugün çözülmediyse dünden geriye sayılır:
  // seri, gün bitene kadar bozulmuş sayılmaz.
  const seriSay = () => {
    const cozuldu = (geri) => {
      const d = new Date(Date.now() + WordLadder.TRT_OFFSET_MS - geri * 86400000);
      const gun = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      try { return JSON.parse(oku("sm_gunluk_" + gun))?.steps >= 1; } catch (_) { return false; }
    };
    let n = 0;
    for (let geri = cozuldu(0) ? 0 : 1; cozuldu(geri); geri++) n++;
    return n;
  };

  let anaGun = 0;
  const anaCiz = () => {
    anaGun = oyun.dayNumber();
    const [bas, hedef, enAz = 0] = oyun.dailyPuzzle();
    const kayit = oyun.dailyRecord();
    const tekrar = Array.isArray(kayit?.deneme);
    const adim = tekrar ? kayit.deneme.length - 1
      : suruyor("daily") ? oyun.chain.length - 1 : (kayitli("daily")?.s.chain.length || 1) - 1;
    const enAzYazi = enAz ? ` · en az ${enAz}` : "";
    al("gunlukTarih").textContent = new Intl.DateTimeFormat("tr-TR",
      { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" }).format(new Date());
    al("gunlukBulmaca").textContent = `${bas} → ${hedef}`;
    const seri = seriSay();
    al("seri").textContent = `Seri: ${seri} gün`;
    al("seri").hidden = seri < 1;
    const cozuldu = !!kayit && !tekrar;
    if (cozuldu) {
      const enIyi = kayit.enIyi || kayit.steps;
      al("gunlukDurum").textContent = `Çözüldü · ${kayit.steps} adım` + (enIyi < kayit.steps ? ` · en iyi ${enIyi}` : "") + enAzYazi;
    } else {
      al("gunlukDurum").textContent = tekrar ? `Tekrar deniyorsun · ${adim} adım` + enAzYazi
        : adim > 0 ? `${adim} adım attın` + enAzYazi
        : "Herkese aynı bulmaca" + (enAz ? ` · en az ${enAz} adım` : "");
    }
    al("btnGunluk").textContent = cozuldu ? "Sonucu gör" : tekrar || adim > 0 ? "Devam et" : "Oyna";
    al("gunlukSonraki").hidden = !cozuldu;

    const s = suruyor("free") ? { start: oyun.startWord, target: oyun.targetWord, chain: oyun.chain } : kayitli("free")?.s;
    al("serbestDurum").textContent = s
      ? `Kaldığın bulmaca: ${s.start} → ${s.target} · ${s.chain.length - 1} adım`
      : "İstediğin kadar oyna. Zorluğu ve uzunluğu sen seç.";
    al("btnSerbest").textContent = s ? "Devam et" : "Oyna";
  };

  const yardimAc = (ac) => {
    govde.classList.toggle("yardim", ac);
    if (ac) { giris.blur(); al("nasil-oynanir").scrollTop = 0; al("btnYardimKapat").focus({ preventScroll: true }); }
    else odakla();
  };

  const anaAc = () => {
    ekranAc("ana");
    giris.blur();
    oyun.hideModal();
    oyun.showOffer(false);
    anaCiz();
    al("ana").scrollTop = 0;
  };

  // Ana ekrandan oyuna: o modda kalınan oyun sürer, yoksa yenisi açılır
  const oyna = (mod) => {
    if (!suruyor(mod)) {
      // Çözülmüş ya da tekrarı süren günlüğü newGame günün kaydından kurar
      const k = mod === "daily" && oyun.dailyRecord() ? null : kayitli(mod);
      if (k) yaz("sm_state", k.ham);
      if (!k || !oyun.restoreState()) oyun.newGame(mod);
    }
    ekranAc("oyun");
    // İlk oyunda kurallar bir kez kendiliğinden açılır
    if (!oku("sm_yardim")) { yaz("sm_yardim", "1"); yardimAc(true); }
    else odakla();
  };

  // Mod adı başlıkta yazar (sekmelerin yerine); app.js her mod değişiminde updateTabs çağırır
  const asilUpdateTabs = P.updateTabs;
  P.updateTabs = function (...arg) {
    al("modAdi").textContent = this.mode === "daily" ? "Günün Bulmacası" : "Serbest Oyun";
    al("btnRestart").setAttribute("aria-label", this.mode === "daily" ? "Baştan başla" : "Yeni bulmaca");
    return asilUpdateTabs.apply(this, arg);
  };

  // Ana ekrandaki geri sayım; gün değişince kart yeni bulmacayı gösterir
  const asilTick = P.tickCountdown;
  P.tickCountdown = function (...arg) {
    const s = asilTick.apply(this, arg);
    al("anaGeriSayim").textContent = this.el.countdown.textContent;
    if (oyun && ekran === "ana" && anaGun !== this.dayNumber()) anaCiz();
    return s;
  };

  al("btnGunluk").addEventListener("click", () => oyna("daily"));
  al("btnSerbest").addEventListener("click", () => oyna("free"));
  al("btnAna").addEventListener("click", anaAc);
  al("btnAnaYardim").addEventListener("click", () => yardimAc(true));
  al("btnYardimKapat").addEventListener("click", () => yardimAc(false));
  // Sitedeki bağlantılar sayfayı kaydırır; uygulamada sayfa kaymaz, yardım açılıp kapanır
  al("btnHelp").addEventListener("click", (e) => { e.preventDefault(); yardimAc(true); });
  document.querySelector('#nasil-oynanir a[href="#oyun"]').addEventListener("click", (e) => { e.preventDefault(); yardimAc(false); });

  // Serbest oyun ayarları ana ekranda: seçim kaydedilir, bulmaca "Oyna" ile gelir
  al("anaAyar").addEventListener("click", (e) => {
    const d = e.target.closest(".pick-btn");
    if (!d || !oyun) return;
    if ("len" in d.dataset) { oyun.lenPref = Number(d.dataset.len); oyun.savePref("sm_uzunluk", oyun.lenPref); }
    else { oyun.diffPref = d.dataset.diff; oyun.savePref("sm_zorluk", oyun.diffPref); }
    oyun.updateTabs();
    anaCiz();
  });

  // Ses düğmesi ana ekrana taşınır (oyun başlığında mod adına yer açılır); seçim hatırlanır
  al("anaUst").append(al("btnMute"));
  al("btnMute").addEventListener("click", () => {
    try { al("btnMute").classList.contains("muted") ? localStorage.setItem("sm_ses", "0") : localStorage.removeItem("sm_ses"); }
    catch (_) { /* kayıt tutulamadı */ }
  });
  if (oku("sm_ses") === "0") muteGame(true);
  // Gizlilik ve lisans bağlantıları ana ekranın altında
  al("ana").append(document.querySelector(".site-footer"));

  // Ana ekran ya da yardım açıkken fiziksel klavye (ve Enter) alttaki tahtaya yazmaz
  document.addEventListener("keydown", (e) => {
    if (yardimAcik()) { e.stopPropagation(); if (e.key === "Escape") yardimAc(false); }
    else if (ekran !== "oyun") e.stopPropagation();
  }, true);

  // Açılış ekranı sözlük yüklenene dek durur (bekletme yok), sonra ana ekran gelir
  const asilInit = P.init;
  P.init = async function (...arg) {
    await asilInit.apply(this, arg);
    oyun = this;
    anaAc();
  };
})();
