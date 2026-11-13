"use strict";

/* =========================================================
 * Sözcük Merdiveni (iOS) — yerel bağlantılar
 * ---------------------------------------------------------
 * Site app.js'i değiştirilmeden paketlenir; yerel özellikler ona buradan
 * bağlanır. Bağlanılan her nokta testler/ içinde korunur: site değişirse
 * test kırılır, uygulama sessizce özellik kaybetmez.
 *
 * Capacitor yokken (tarayıcıda) hiçbir şey yapmaz.
 * Gelir kancası (window.SozcukGelir) oyuna reklam, Plus ve izin akışını verir;
 * ayrıntı aşağıda. Reklamlar ve satın alma yerel tarafta çalışır, web görünümüne
 * hiçbir şey yüklenmez (CSP değişmez). Tek izin istemi: App Tracking Transparency.
 * ========================================================= */
(() => {
  const eklenti = window.Capacitor?.Plugins;
  if (!eklenti || !window.Capacitor.isNativePlatform?.()) return;
  if (typeof WordLadder === "undefined") return;   // app.js yüklenmediyse bağlanacak bir şey yok

  // Paylaşılan sonuçtaki adres: uygulamada location "capacitor://localhost"
  // olduğu için sitenin adresi yazılır. Makine alanı olduğundan punycode.
  const SITE = "https://xn--szckyolu-n4a6d.com/";

  // Titreşim başarısız olursa (eski cihaz, eklenti yok) oyun etkilenmesin
  const titret = (type) => {
    try { eklenti.Haptics?.notification({ type }).catch(() => {}); } catch (_) { /* yok say */ }
  };

  // app.js metodunu, önüne titreşim ekleyerek sarar
  const sar = (ad, type) => {
    const asil = WordLadder.prototype[ad];
    if (typeof asil !== "function") return;
    WordLadder.prototype[ad] = function (...arg) { titret(type); return asil.apply(this, arg); };
  };
  sar("reject", "ERROR");    // geçersiz hamle
  sar("win", "SUCCESS");     // bulmaca çözüldü

  // app.js share() dokunmatik cihazda navigator.share({ text }) çağırır.
  // WKWebView'de bu API her sürümde güvenilir olmadığından yerel paylaşım
  // sayfasına yönlendirilir. İptal edilince eklenti reddeder; app.js bunu yutar.
  if (eklenti.Share) {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: ({ text = "" } = {}) =>
        eklenti.Share.share({ text: text.replace(location.href.split(/[?#]/)[0], SITE) }),
    });
  }

  /* ---------- Gelir: reklam (AdMob), izin (UMP + ATT), Plus (StoreKit) ---------- */

  // Kimlikler gelir.json'dadır (tek yer); web-esitle.mjs yer tutucuyu doldurur. Plus ürün kimliği
  // JS'ten GELMEZ: yerel tarafta sabittir (SatinAlma.swift)
  const AYAR = {"admobAppId":"ca-app-pub-4433947128004313~1039983331","oduluId":"ca-app-pub-4433947128004313/3266370621","gecisId":"ca-app-pub-4433947128004313/3538813307"};
  const { AdMob, SatinAlma } = eklenti;
  const uyu = (ms) => new Promise((coz) => setTimeout(coz, ms));

  const GECIS_ARALIK_MS = 3 * 60 * 1000;      // iki geçiş reklamı arası en az 3 dk
  const REKLAM_OMRU_MS = 55 * 60 * 1000;      // Google reklamları ~1 saatte eskir; 55 dk sonra yeniden yüklenir
  const PLUS_ANAHTAR = "sm_plus";             // Plus'ın yerel önbelleği; açılışta StoreKit yeniden doğrular
  const GECIS_ANAHTAR = "sm_gecis";           // son reklam zamanı (oturum boyunca; sayfa değişince sıfırlanmasın)
  const COZUM_ANAHTAR = "sm_cozum";           // oturumdaki çözüm sayısı

  // Simülatör ekran görüntüsü derlemesi (araclar/otomatik-oyna.js bayrağı koyar): sistem
  // pencereleri (ATT) ve reklamlar oynamayı bloklamasın diye reklam ve satın alma yok.
  const REKLAMSIZ_DERLEME = window.SM_OTOMATIK === true;

  // Plus ya da fiyat değişince sayfaya haber verilir; site bu olayı dinleyip Plus kutusunu
  // ve reklam durumunu yeniden çizer (uygulamayı yeniden açmak gerekmesin)
  const bildir = () => window.dispatchEvent(new Event("sozcukgelir"));

  let plus = false;
  try { plus = localStorage.getItem(PLUS_ANAHTAR) === "1"; } catch (_) { /* depolama yoksa Plus değil */ }
  const plusYaz = (deger) => {
    const eski = plus;
    plus = !!deger;
    try { plus ? localStorage.setItem(PLUS_ANAHTAR, "1") : localStorage.removeItem(PLUS_ANAHTAR); } catch (_) { /* yok say */ }
    if (plus !== eski) bildir();
  };
  // Doğrulayacak eklenti yoksa önbelleğe güvenilmez (elle yazılmış sm_plus Plus yapmaz)
  if (!SatinAlma) plusYaz(false);

  // Oturum belleği (sessionStorage): sayfa yenilenince ya da gizlilik sayfasına gidip dönünce de kalır
  const oturumOku = (anahtar) => { try { return Number(sessionStorage.getItem(anahtar)) || 0; } catch (_) { return 0; } };
  const oturumYaz = (anahtar, deger) => { try { sessionStorage.setItem(anahtar, String(deger)); } catch (_) { /* yok say */ } };
  let cozumSayisi = oturumOku(COZUM_ANAHTAR), sonGecis = oturumOku(GECIS_ANAHTAR);
  const sonGecisYaz = () => { sonGecis = Date.now(); oturumYaz(GECIS_ANAHTAR, sonGecis); };

  // Plus'ın yerelleştirilmiş fiyatı (StoreKit displayPrice); yüklenene dek null. Elle yazılmaz.
  let fiyat = null;
  const fiyatYukle = () => SatinAlma.fiyat().then((r) => {
    if (typeof r.fiyat === "string" && r.fiyat && r.fiyat !== fiyat) { fiyat = r.fiyat; bildir(); }
  }, () => {});

  // StoreKit'ten yeniden doğrula (iade, aile paylaşımı kaybı, başka cihazdaki alım). Hata olursa
  // önbellek kalır: çevrimdışı açılış Plus'ı silmez. 5 sn sonra beklemeyi bırakır (reklam akışı
  // takılmasın); cevap sonradan gelirse yine işlenir.
  const dogrula = () => SatinAlma.durum().then((r) => plusYaz(r.plus), () => {});
  const dogrulama = REKLAMSIZ_DERLEME || !SatinAlma ? Promise.resolve() : Promise.race([dogrula(), uyu(5000)]);
  if (SatinAlma && !REKLAMSIZ_DERLEME) {
    // Uygulama dışında biten işlem (ebeveyn onayı, başka cihaz, iade): yerel taraf bildirir
    SatinAlma.addListener("plus", (r) => plusYaz(r.plus)).catch(() => {});
    // Çevrimdışı açılırsa bir kez daha dene
    fiyatYukle().then(() => fiyat || uyu(30000).then(fiyatYukle));
  }

  // UMP gerektiriyorsa kullanıcı onayını sonradan değiştirebilmeli: alt bilgiye bağlantı
  const tercihBaglantisiEkle = () => {
    const alt = document.querySelector(".site-footer");
    if (!alt || [...alt.querySelectorAll("a")].some((a) => a.dataset.reklamTercihi)) return;
    const a = document.createElement("a");
    a.href = "#";
    a.dataset.reklamTercihi = "1";
    a.textContent = "Reklam Tercihleri";
    a.addEventListener("click", (e) => { e.preventDefault(); AdMob.showPrivacyOptionsForm().catch(() => {}); });
    alt.append(a);
  };

  // Reklam önyükleme: gösterilmeden hazır tutulur; yüklenemezse sonraki istekte yeniden denenir.
  // yuklu[tur] yüklenme zamanıdır (0 = yok); 55 dk'dan eski reklam yüklü sayılmaz ve yeniden yüklenir.
  const yuklu = { odul: 0, gecis: 0 };
  const yukleniyor = {};
  const hazirMi = (tur) => yuklu[tur] > 0 && Date.now() - yuklu[tur] < REKLAM_OMRU_MS;
  const hazirla = (tur) => {
    if (hazirMi(tur)) return Promise.resolve(true);
    yukleniyor[tur] ??= (tur === "odul"
      ? AdMob.prepareRewardVideoAd({ adId: AYAR.oduluId })
      : AdMob.prepareInterstitial({ adId: AYAR.gecisId }))
      .then(() => { yuklu[tur] = Date.now(); }, () => { yuklu[tur] = 0; })
      .then(() => { yukleniyor[tur] = null; return hazirMi(tur); });
    return yukleniyor[tur];
  };

  // Açılışta sırayla: UMP (AEA, Birleşik Krallık, İsviçre) → ATT → AdMob başlat. Çözümü
  // "reklam isteyebilir miyiz" (boolean). Plus sahibi reklam görmez, izin de sorulmaz.
  // ATT reddedilirse reklamlar yine gösterilir: Google SDK reklam kimliğini (IDFA) kullanmaz ve
  // diğer uygulama/sitelerdeki bilgiyle kişiselleştirme yapmaz.
  // Gerçek "onay yok" cevabı (canRequestAds=false) oturum boyunca saklanır; HATA (çevrimdışı
  // açılış, form hatası) saklanmaz: sonraki istek yeniden dener.
  let izinSozu = null;
  const izinAkisi = async () => {
    let bilgi = await AdMob.requestConsentInfo();
    if (bilgi.isConsentFormAvailable && bilgi.status === "REQUIRED") bilgi = await AdMob.showConsentForm();
    if (!bilgi.canRequestAds) return false;
    if (bilgi.privacyOptionsRequirementStatus === "REQUIRED") tercihBaglantisiEkle();
    // Form kapanırken sistem istemi bazen yutulur; kısa bekleme
    await uyu(500);
    if ((await AdMob.trackingAuthorizationStatus()).status === "notDetermined") await AdMob.requestTrackingAuthorization();
    // 4+ App Store sınıfıyla uyumlu: yalnızca genel kitleye uygun (G) reklamlar. Çocuklara
    // yönelik uygulama değil (Kids kategorisi yok), bu yüzden child-directed işareti konmaz.
    await AdMob.initialize({ maxAdContentRating: "General" });
    hazirla("odul"); hazirla("gecis");   // ilk istekte beklemesinler
    return true;
  };
  const reklamIzni = () => {
    if (plus || REKLAMSIZ_DERLEME || !AdMob) return Promise.resolve(false);   // Plus sonradan değişebilir: önbelleğe alınmaz
    const soz = (izinSozu ??= dogrulama.then(() => { if (plus) throw new Error("plus"); return izinAkisi(); }).catch(() => { if (izinSozu === soz) izinSozu = null; return false; }));
    return soz;
  };
  if (!REKLAMSIZ_DERLEME) dogrulama.then(reklamIzni);   // açılışta doğrulamadan SONRA (önbellekteki Plus yanlışsa akış yine başlar)

  const OLAY = {
    odul: { kapandi: "onRewardedVideoAdDismissed", hata: "onRewardedVideoAdFailedToShow", goster: () => AdMob.showRewardVideoAd() },
    gecis: { kapandi: "interstitialAdDismissed", hata: "interstitialAdFailedToShow", goster: () => AdMob.showInterstitial() },
  };

  // Hazır reklamı gösterir; reklam kapanınca çözülür. Ödüllü reklamda ödül kazanıldıysa true.
  // Ödül iki işaretten biriyle sayılır: ödül olayı ya da eklentinin showRewardVideoAd sözünün çözülmesi
  // (o yalnızca ödülde çözülür). Erken kapanış ya da gösterim hatası olaylardan anlaşılır; ödül
  // kapanıştan az sonra gelirse diye ödüllüde kapanış 300 ms beklenir. 3 dk güvenlik süresi oyunu kilitlemez.
  let reklamAcik = false;   // tam ekran reklam şu an ekranda
  const goster = (tur) => new Promise((coz) => {
    let kazandi = false, bitti = false;
    reklamAcik = true;
    const tutamaclar = [];
    const dinle = (ad, f) => tutamaclar.push(AdMob.addListener(ad, f));
    const zamanasimi = setTimeout(() => bit(), 3 * 60 * 1000);
    function bit() {
      if (bitti) return;
      bitti = true;
      reklamAcik = false;
      clearTimeout(zamanasimi);
      tutamaclar.forEach((t) => t.then((h) => h.remove()).catch(() => {}));
      yuklu[tur] = 0;
      hazirla(tur);                  // bir sonrakini şimdiden yükle
      coz(kazandi);
    }
    dinle(OLAY[tur].kapandi, () => (tur === "odul" ? setTimeout(bit, 300) : bit()));
    dinle(OLAY[tur].hata, bit);
    if (tur === "odul") dinle("onRewardedVideoAdReward", () => { kazandi = true; });
    OLAY[tur].goster().then(() => { if (tur === "odul") kazandi = true; }, bit);
  });

  // Çözüm penceresi (#modal) açılıp KAPANIR kapanmaz çözülür; yoklama yok, hemen. win() pencereyi
  // 650 ms sonra açar: önce açılmasını (en çok 2 sn), sonra kapanmasını (en çok 2 dk) bekler.
  // Yalnızca "oyuncu pencereyi kapattı, oyun hâlâ bitmiş durumda" ise true: yeni bulmaca çekildiyse
  // (Yeni Oyun, Tekrar dene) ya da oyuncu yazmaya başladıysa false → o çözümde reklam yok.
  const cozumPenceresiKapaninca = () => new Promise((coz) => {
    const pencere = document.getElementById("modal");
    const oyun = window.oyun;
    if (!pencere || !oyun?.chain) return coz(false);          // durum görülemiyorsa reklam yok
    const acik = () => !pencere.classList.contains("hidden");
    const bas = oyun.startWord, uzunluk = oyun.chain.length;
    let acildi = acik(), zaman;
    const gozlem = new MutationObserver(() => {
      if (!acildi) { if (acik()) { acildi = true; kur(2 * 60 * 1000); } return; }
      if (!acik()) bitir(oyun.over === true && oyun.startWord === bas && oyun.chain.length === uzunluk);
    });
    const bitir = (sonuc) => { gozlem.disconnect(); clearTimeout(zaman); coz(sonuc); };
    const kur = (ms) => { clearTimeout(zaman); zaman = setTimeout(() => bitir(false), ms); };
    gozlem.observe(pencere, { attributes: true, attributeFilter: ["class"] });
    kur(acildi ? 2 * 60 * 1000 : 2000);
  });

  const reklamlar = {
    plusFiyat: () => fiyat,   // string | null, eşzamanlı (önbellekten)
    plusMu: () => plus,   // DÜZ boolean, söz (Promise) değil: app.js !!plusMu() yazar, söz herkesi Plus yapardı

    async odulluReklam(_neden) {
      if (plus) return true;                                       // Plus: sınırsız ipucu/tekrar
      if (!(await reklamIzni())) return false;
      // Yüklenmesi uzun sürüyorsa oyuncuyu bekletme; yükleme arkada sürer
      if (!(await Promise.race([hazirla("odul"), uyu(8000).then(() => false)]))) return false;
      // Arka arkaya reklam yok: ödüllü reklam "son gösterilen reklam" sayılır; çözüm penceresinden
      // bekleyen geçiş reklamı (örn. "reklam izle, tekrar dene" sonrası) bu yüzden düşer
      sonGecisYaz();
      const kazandi = await goster("odul");
      sonGecisYaz();
      return kazandi;
    },

    // Çözümden sonra: oturumun ilk çözümünde yok, iki reklam arası en az 3 dk, hazır değilse yok.
    // Reklam, oyuncu çözüm penceresini kapatır kapatmaz gösterilir.
    async gecisReklami(an) {
      if (plus || an !== "cozum") return;
      oturumYaz(COZUM_ANAHTAR, ++cozumSayisi);
      if (cozumSayisi < 2 || Date.now() - sonGecis < GECIS_ARALIK_MS) return;
      if (!(await reklamIzni())) return;
      if (!hazirMi("gecis")) { hazirla("gecis"); return; }         // bir sonrakine hazır olsun
      if (!(await cozumPenceresiKapaninca())) return;
      // Beklerken durum değişmiş olabilir: Plus, ekrandaki reklam, ödüllü reklamla yenilenen sonGecis, eskiyen reklam
      if (plus || reklamAcik || Date.now() - sonGecis < GECIS_ARALIK_MS || !hazirMi("gecis")) return;
      sonGecisYaz();
      await goster("gecis");
    },

    async plusSatinAl() {
      if (plus) return true;
      try {
        const r = await SatinAlma.satinAl();
        if (r.sonuc === "tamam") plusYaz(true);
      } catch (_) { /* iptal ya da hata: Plus değil */ }
      return plus;
    },

    async plusGeriYukle() {
      try { plusYaz((await SatinAlma.geriYukle()).plus); } catch (_) { /* yok say */ }
      return plus;
    },
  };

  // Simülatör: reklam ve satın alma yok; oyunun akışı bloklanmasın diye ödül hep verilir
  const kanca = REKLAMSIZ_DERLEME
    ? { plusMu: () => false, plusFiyat: () => null, odulluReklam: async () => true, gecisReklami: async () => {}, plusSatinAl: async () => false, plusGeriYukle: async () => false }
    : reklamlar;
  // Donuk ve değiştirilemez: sayfadaki başka bir betik kancayı (ör. plusMu'yu) değiştiremesin
  Object.defineProperty(window, "SozcukGelir", { value: Object.freeze(kanca), writable: false, configurable: false });
})();
