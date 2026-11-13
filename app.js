"use strict";

/* =========================================================
 * SÖZCÜK MERDİVENİ — app.js
 * Vanilla JS, sınıf tabanlı izolasyon (global kirliliği yok).
 * Katmanlar:
 *   1) AudioFX  : Web Audio ile küçük ses efektleri (IIFE)
 *   2) AdSense  : muteGame() + showInterstitialAd() hazırlığı
 *   3) WordLadder: oyun durumu, kurallar, render, klavye
 * ========================================================= */

/* ---------------- 1) SES KATMANI (IIFE) ---------------- */
const AudioFX = (() => {
  let ctx = null;
  let muted = false;

  // Tek osilatörlü kısa bip: harici ses dosyası gerektirmez
  function tone(freq, dur = 0.08, type = "square", vol = 0.04) {
    if (muted) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = vol;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.stop(ctx.currentTime + dur);
    } catch (_) { /* Ses desteklenmiyorsa sessizce devam et */ }
  }

  return {
    key:   () => tone(520, 0.05),
    error: () => tone(160, 0.2, "sawtooth"),
    win:   () => { tone(523, 0.12); setTimeout(() => tone(659, 0.12), 130); setTimeout(() => tone(784, 0.25), 260); },
    setMuted: (v) => { muted = v; },
    isMuted:  () => muted,
  };
})();

/* ---------------- 2) ADSENSE H5 API HAZIRLIĞI ---------------- */

// Oyun içi tüm sesleri kapatır/açar; reklam gösterimi sırasında da çağrılır
function muteGame(mute) {
  AudioFX.setMuted(mute);
  const btn = document.getElementById("btnMute");
  if (!btn) return;
  btn.classList.toggle("muted", mute); // ikon değişimi: style.css .icon-sound-*
  btn.setAttribute("aria-pressed", String(mute));
}

// "Yeni Oyun"da tetiklenir. Çözüm sonrası geçiş reklamı yerel kancadan gelir:
// WordLadder.win() -> SozcukGelir.gecisReklami("cozum").
// onAdDone: reklam kapandıktan sonra çalışacak devam fonksiyonu.
function showInterstitialAd(onAdDone) {
  const wasMuted = AudioFX.isMuted();
  muteGame(true); // AdSense politikası: reklam sırasında oyun sesleri sussun

  // TODO: Google Ad Placement API kodu buraya gelecek
  // Örnek şablon:
  // adBreak({
  //   type: "next",
  //   name: "yeni_oyun_gecisi",
  //   beforeAd:    () => muteGame(true),
  //   afterAd:     () => muteGame(wasMuted),
  //   adBreakDone: () => onAdDone && onAdDone()
  // });

  // API henüz bağlı olmadığı için doğrudan devam ediyoruz:
  muteGame(wasMuted);
  if (typeof onAdDone === "function") onAdDone();
}

/* ---------------- 3) OYUN SINIFI ---------------- */
class WordLadder {

  // Fetch başarısız olursa (ör. file:// ile açıldıysa) kullanılacak mock sözlük.
  // Gerçek veri words.json'dan gelir; yapı birebir aynıdır.
  static MOCK_DB = {
    "3": {
      words: ["KÖY", "KOY", "KOL", "KEL", "KAL", "KAŞ", "KIL", "KUL",
              "GÜL", "GÖL", "GÖZ", "GEL", "BAL", "BAT", "BAŞ", "TAŞ",
              "TAT", "KAR", "KIR"],
      puzzles: [["KÖY", "KEL"], ["GÖZ", "GEL"], ["BAŞ", "KEL"], ["TAŞ", "BAL"]]
    },
    "4": {
      words: ["KURT", "YURT", "KART", "KORT", "KORK", "KIRK"],
      puzzles: [["KURT", "KORK"], ["YURT", "KART"]]
    }
  };

  // Türkçe karakter uyumlu klavye dizilimi (Q/W/X alfabede yok, çıkarıldı).
  // Telefonda da bu klavye kullanılır; cihazın klavyesi açılmaz.
  static LAYOUT = [
    ["E", "R", "T", "Y", "U", "I", "O", "P", "Ğ", "Ü"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ş", "İ"],
    ["ENTER", "Z", "C", "V", "B", "N", "M", "Ö", "Ç", "BACK"]
  ];

  // Türk alfabesindeki 29 büyük harf
  static TR_LETTER = /^[ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ]$/;

  // Günün bulmacası Türkiye saatine (TRT) sabitlenmiştir: gün, dünyanın her
  // yerinde aynı anda — TRT gece yarısında — değişir. Cihazın saat dilimi
  // kullanılsaydı farklı ülkelerdeki oyuncular aynı anda farklı bulmaca görür,
  // paylaşılan sonuçlar anlamsızlaşırdı.
  // TRT = UTC+3 ve sabittir (Türkiye 2016'dan beri yaz saati uygulamıyor).
  static TRT_OFFSET_MS = 3 * 3600 * 1000;

  // Takvimin 1. günü: 15 Temmuz 2026 (TRT). Ay 0 tabanlıdır.
  static GUN_BASLANGIC_UTC = Date.UTC(2026, 6, 15);

  // Kanca sözü bu sürede çözülmezse "olumsuz" sayılır (iOS kancasının kendi
  // sınırı 3 dakika; bu ondan biraz uzun). Test kısaltabilir.
  static KANCA_ZAMAN_ASIMI_MS = 200000;

  // Reklam gösterilemedi ya da yarıda kaldı: oyuncuyu suçlamayan ortak ileti
  static REKLAM_YOK = "Reklam gösterilemedi ya da yarıda kaldı. Biraz sonra yeniden dene.";

  // Desteklenen kelime boyları (words.json ile aynı olmalı)
  static UZUNLUKLAR = [3, 4, 5];

  // Zorluk seviyeleri (words.json'daki puzzle[3] etiketleriyle aynı)
  static ZORLUKLAR = ["kolay", "orta", "zor"];

  // "Şimdi"nin TRT karşılığı. Dönen Date'in UTC alanları (getUTCFullYear vb.)
  // TRT takvim değerlerini verir — yerel saat alanları KULLANILMAMALI.
  static trtNow() {
    return new Date(Date.now() + WordLadder.TRT_OFFSET_MS);
  }

  constructor() {
    // DOM referansları tek noktada toplanır
    this.el = {
      start:   document.getElementById("startWord"),
      target:  document.getElementById("targetWord"),
      ladder:  document.getElementById("ladder"),
      input:   document.getElementById("inputRow"),
      toast:   document.getElementById("toast"),
      steps:   document.getElementById("steps"),
      inputLabel: document.getElementById("inputLabel"),
      stepInfo: document.getElementById("stepInfo"),
      parInfo: document.getElementById("parInfo"),
      modalKicker: document.getElementById("modalKicker"),
      modalSteps: document.getElementById("modalSteps"),
      modalOptimal: document.getElementById("modalOptimal"),
      modalOptimalBox: document.getElementById("modalOptimalBox"),
      modalGrid: document.getElementById("modalGrid"),
      modalNext: document.getElementById("modalNext"),
      modalCountdown: document.getElementById("modalCountdown"),
      modalTitle: document.getElementById("modalTitle"),
      keyboard: document.getElementById("keyboard"),
      modal:    document.getElementById("modal"),
      modalText: document.getElementById("modalText"),
      btnNewGame: document.getElementById("btnNewGame"),
      btnRestart: document.getElementById("btnRestart"),
      btnMute:    document.getElementById("btnMute"),
      btnShare:   document.getElementById("btnShare"),
      btnCloseModal: document.getElementById("btnCloseModal"),
      tabDaily:   document.getElementById("tabDaily"),
      tabFree:    document.getElementById("tabFree"),
      game:       document.getElementById("game"),
      freeSettings: document.getElementById("freeSettings"),
      lenBtns:    [...document.querySelectorAll("[data-len]")],
      diffBtns:   [...document.querySelectorAll("[data-diff]")],
      dailyTimer: document.getElementById("dailyTimer"),
      countdown:  document.getElementById("dailyCountdown"),
      dailySolved: document.getElementById("dailySolved"),
      btnDailyShare: document.getElementById("btnDailyShare"),
      btnHint:    document.getElementById("btnHint"),
      hintClue:   document.getElementById("hintClue"),
      btnUndo:    document.getElementById("btnUndo"),
      btnShowResult: document.getElementById("btnShowResult"),
      pes:        document.getElementById("pes"),
      pesText:    document.getElementById("pesText"),
      btnPesEvet: document.getElementById("btnPesEvet"),
      btnPesVazgec: document.getElementById("btnPesVazgec"),
      btnClosePes: document.getElementById("btnClosePes"),
      btnDailyRetry: document.getElementById("btnDailyRetry"),
      btnRetry:   document.getElementById("btnRetry"),
      offer:      document.getElementById("offer"),
      btnOfferAd: document.getElementById("btnOfferAd"),
      btnOfferPlus: document.getElementById("btnOfferPlus"),
      btnCloseOffer: document.getElementById("btnCloseOffer"),
      plusBox:    document.getElementById("plusBox"),
      plusText:   document.getElementById("plusText"),
      plusNot:    document.getElementById("plusNot"),
      btnPlusBuy: document.getElementById("btnPlusBuy"),
      btnPlusRestore: document.getElementById("btnPlusRestore"),
    };

    // Serbest oyun tercihleri (kalıcı): kelime uzunluğu ve zorluk
    this.lenPref = this.loadPref("sm_uzunluk", WordLadder.UZUNLUKLAR, 4);
    this.diffPref = this.loadPref("sm_zorluk", WordLadder.ZORLUKLAR, "orta");

    // Oyun durumu
    this.db = null;       // { "3": {words, puzzles}, ... }
    this.dict = null;     // Aktif uzunluğun Set sözlüğü (O(1) arama)
    this.len = 0;         // Aktif kelime uzunluğu
    this.startWord = "";
    this.targetWord = "";
    this.chain = [];      // [başlangıç, ...kabul edilen kelimeler]
    this.buffer = "";     // O an yazılan kelime
    this.over = false;    // Oyun bitti mi?
    this.shown = false;   // Bitiş "çözüm gösterildi" mi? (chain o zaman bir en kısa yoldur)
    this.mode = "daily";  // "daily" (günün bulmacası) | "free" (serbest)
    this.lastResult = null; // Son kazanılan oyunun {steps, grid} paylaşım verisi
    this.toastTimer = null;
    this.hint = null;     // Açık ipucu: { pos, letter }
    this.ipuclari = null; // İpucu cümleleri: { KELİME: "anlamı" } (ipuclari.json)
    this.busy = false;    // Reklam/satın alma sürerken çift dokunuşu engeller
  }

  /* ---------- Kurulum ---------- */

  async init() {
    this.db = await this.loadWords();
    this.loadIpuclari();    // beklenmez: gelmese de oyun ve ipucu çalışır
    this.buildKeyboard();
    this.bindEvents();
    // Yenilemede son bırakılan oyunu geri yükle; yoksa günün bulmacasını başlat
    if (!this.restoreState()) this.newGame("daily");

    // Geri sayım: hemen bir kez yaz, sonra saniyede bir güncelle
    this.renderPlus();
    this.tickCountdown();
    setInterval(() => this.tickCountdown(), 1000);

    // Konsoldan hata ayıklama/durum inceleme için tutamak (zararsız)
    window.oyun = this;
  }

  // Harici sözlüğü Fetch API ile çeker; başarısız olursa mock'a düşer
  async loadWords() {
    try {
      const res = await fetch("words.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data || !Object.keys(data).length) throw new Error("Boş sözlük");
      return data;
    } catch (err) {
      console.warn("words.json yüklenemedi, mock sözlük devrede:", err.message);
      return WordLadder.MOCK_DB;
    }
  }

  // İpucu cümleleri (sonraki kelimenin anlamı). Yüklenemezse ipucu yalnızca
  // harfi gösterir; hata oyunu etkilemez.
  async loadIpuclari() {
    try {
      const res = await fetch("ipuclari.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data && typeof data === "object") {
        this.ipuclari = data;
        if (this.hint) this.yazIpucuCumlesi();   // ipucu cümleler gelmeden açıldıysa şimdi yaz
      }
    } catch (err) {
      console.warn("ipuclari.json yüklenemedi, ipucu yalnızca harfi gösterecek:", err.message);
    }
  }

  /* ---------- Yeni oyun ---------- */

  newGame(mode = this.mode) {
    this.mode = mode;
    this.updateTabs();

    // Günlük modda herkese aynı bulmaca; serbest modda seçilen uzunluk+zorlukta
    let puzzle;
    if (mode === "daily") {
      puzzle = this.dailyPuzzle();
      this.gosterilenGun = this.dayNumber();   // sayaç gün değişimini buradan anlar
    } else {
      puzzle = this.pick(this.freePool());
    }
    // Bulmaca formatı: [başlangıç, hedef, enAzAdım, zorluk] — son ikisi opsiyonel
    const [start, target, optimal = 0, puzzleDiff = ""] = puzzle;

    this.len = start.length;
    this.optimal = optimal;
    this.puzzleDiff = puzzleDiff;
    this.dict = new Set(this.db[String(this.len)].words);
    this.startWord = start;
    this.targetWord = target;
    this.chain = [start];
    this.buffer = "";
    this.over = false;
    this.shown = false;

    // Günün bulmacası bu cihazda bugün zaten çözülmüşse bitmiş say ve
    // gerçek çözüm zincirini kayıttan geri kur (varsa) — böylece merdiven ve
    // adım sayısı doğru görünür, boş zincirden "0 adım" çıkmaz.
    let cozuldu = null;
    if (mode === "daily") {
      cozuldu = this.dailyRecord();          // steps<1 kayıtları zaten null döner
      if (cozuldu) {
        this.over = true;
        this.lastResult = cozuldu;
        if (Array.isArray(cozuldu.chain) && cozuldu.chain[0] === start &&
            cozuldu.chain[cozuldu.chain.length - 1] === target) {
          this.chain = cozuldu.chain.slice();
        }
        // Sürmekte olan (ödemesi yapılmış) tekrar: restart ya da sekme değişimi
        // kaybettirmez, kaldığı yerden devam eder
        const d = cozuldu.deneme;
        if (Array.isArray(d) && d[0] === start && d.every(w => typeof w === "string" && w.length === start.length) &&
            d[d.length - 1] !== target) {
          this.over = false;
          this.chain = d.slice();
        }
      }
    }

    // Bugün "sonucu göster" ile bitirilmişse (çözüm kaydı yok) bulmaca öyle kalır
    if (mode === "daily" && !cozuldu) {
      const yol = this.dailyShown() && this.shortestPath();
      if (yol) { this.over = true; this.shown = true; this.chain = yol; }
    }

    this.render();          // over=true ise "bitti" sınıfını + çözüldü göstergesini uygular
    this.saveState();       // doğru "over" ve zincirle kaydeder

    // Not: Zaten çözülmüş günlük bulmacaya dönüldüğünde modal açılmaz;
    // cevaplar tahtada görünür kalır (üstteki "çözüldü + paylaş" satırı bilgilendirir).
  }

  // Serbest oyunda tercih edilen (uzunluk, zorluk) havuzu; boşsa esnek geri düşer
  freePool() {
    const havuz = this.db[String(this.lenPref)]?.puzzles || [];
    const filt = havuz.filter(p => p[3] === this.diffPref);
    if (filt.length) return filt;
    if (havuz.length) return havuz;                    // zorluk yoksa o uzunluğun tümü
    // O uzunlukta hiç yoksa (bozuk sözlük) ilk dolu uzunluğa düş
    const k = Object.keys(this.db).find(x => this.db[x].puzzles?.length);
    return this.db[k].puzzles;
  }

  // Mevcut duruma göre tahtayı çizer (yeni oyun + durum geri yükleme ortak)
  render() {
    this.clearHint();
    this.el.ladder.innerHTML = "";
    this.el.game.classList.toggle("bitti", this.over);
    this.el.game.dataset.boy = this.len;      // style.css blok boyunu buna göre seçer
    this.renderWord(this.el.start, this.startWord, { compare: true, filled: true });
    this.renderWord(this.el.target, this.targetWord, { targetStyle: true });
    // Zincirdeki ara kelimeleri (varsa) merdivene bas
    for (let n = 1; n < this.chain.length; n++) this.addRung(n);
    this.renderStatus();
    this.renderInput();
    this.hideModal();
  }

  // Zincirin n. kelimesini son basamak olarak ekler (giriş satırı onun hemen
  // altındadır) ve merdiveni sona kaydırır: eski basamaklar yukarı çıkar
  addRung(n) {
    const rung = document.createElement("div");
    rung.className = "rung";
    const row = document.createElement("div");
    row.className = "word-row";
    const label = document.createElement("span");
    label.className = "step-label";
    label.textContent = `${n}. adım`;
    rung.append(row, label);
    this.el.ladder.appendChild(rung);
    this.renderWord(row, this.chain[n], { compare: true, filled: true, prev: this.chain[n - 1] });
    this.el.steps.scrollTop = this.el.steps.scrollHeight;
  }

  // Durum satırı: atılan adım ve bulmacanın en az adım sayısı
  renderStatus() {
    // Çözülmüş günlüğün zinciri kayıtta yoksa adım sayısı kayıttan okunur
    const adim = `${this.over && this.lastResult ? this.lastResult.steps : this.chain.length - 1} adım`;
    this.el.stepInfo.textContent = this.shown ? "Çözüm gösterildi" : this.over ? "Çözüldü" : adim;
    const enIyi = this.dailyBest();
    const gosterilen = this.over && this.lastResult ? this.lastResult.steps : this.chain.length - 1;
    this.el.parInfo.textContent = this.shown
      ? (this.optimal ? ` · en az ${this.optimal}` : "")
      : this.over
      ? ` · ${adim}` + (this.mode === "daily" && enIyi && enIyi < gosterilen ? ` · en iyi ${enIyi}` : "")
      : this.optimal ? ` · en az ${this.optimal}` : "";
    // Günlük çözüldüyse "paylaş" düğmesi burada durur (pencere kapansa da erişilir)
    this.el.dailySolved.classList.toggle("hidden", !(this.mode === "daily" && this.over && (!this.shown || this.dailyRecord())));   // gösterilen yol çözüm değilse, ilk çözüm kaydı varsa yine paylaşılır
    this.el.btnDailyRetry.classList.toggle("hidden", !this.canRetry());
    this.el.btnHint.classList.toggle("hidden", this.over);
    // Geri al: yalnızca kabul edilmiş basamak varken ve oyun sürerken
    this.el.btnUndo.disabled = this.over || this.chain.length < 2;
    // Sonucu göster: atılan adım en az adımı geçince
    this.el.btnShowResult.classList.toggle("hidden", !this.canShowResult());
  }

  canShowResult() {
    return !this.over && this.optimal > 0 && this.chain.length - 1 > this.optimal;
  }

  pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ---------- Günün bulmacası ---------- */

  // TRT gününe göre YYYY-AA-GG anahtarı (kayıt için)
  todayKey() {
    const d = WordLadder.trtNow();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  // Yayın başlangıcından bu yana kaçıncı TRT günü (1 tabanlı)
  dayNumber() {
    const d = WordLadder.trtNow();
    const bugunUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.round((bugunUTC - WordLadder.GUN_BASLANGIC_UTC) / 86400000) + 1;
  }

  // Sonraki TRT gece yarısına kalan milisaniye
  msUntilTrtMidnight() {
    const d = WordLadder.trtNow();
    const sonrakiGeceYarisi = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    return sonrakiGeceYarisi - d.getTime();
  }

  // Tüm bulmacaları sabit sırayla birleştirip gün numarasına göre seçer.
  // Not: words.json yeniden üretilirse sıralama —dolayısıyla o günün
  // bulmacası— değişir; sözlük güncellemelerini gün içinde yayına almayın.
  dailyPuzzle() {
    const hepsi = [];
    for (const boy of Object.keys(this.db).sort()) hepsi.push(...this.db[boy].puzzles);
    const i = ((this.dayNumber() % hepsi.length) + hepsi.length) % hepsi.length;
    return hepsi[i];
  }

  // localStorage erişimi try/catch içinde: gizli sekmede kayıt tutulamasa
  // bile oyun çalışmaya devam eder. Yalnızca GEÇERLİ kaydı döndürür:
  // gerçek bir çözümde en az 1 adım vardır; steps<1 olan bozuk kayıtları
  // (eski sürümlerden kalan) yok sayar — böylece "0 adımda çözüldü" hatası
  // kendiliğinden temizlenir.
  dailyRecord() {
    try {
      const r = JSON.parse(localStorage.getItem("sm_gunluk_" + this.todayKey()));
      return (r && r.steps >= 1) ? r : null;
    } catch (_) { return null; }
  }

  saveDailyRecord(sonuc) {
    try { localStorage.setItem("sm_gunluk_" + this.todayKey(), JSON.stringify(sonuc)); }
    catch (_) { /* kayıt tutulamadı — önemli değil */ }
  }

  // Bugün "sonucu göster" ile bitirildi mi? Günün kaydına steps:0 yazılır:
  // dailyRecord() bunu çözüm saymaz (seri ve paylaşım görmez). Gösterilen yol
  // saklanmaz, şimdiki sözlükten yeniden hesaplanır (en kısa yol değişmez).
  dailyShown() {
    try { return JSON.parse(localStorage.getItem("sm_gunluk_" + this.todayKey()))?.gosterildi === true; }
    catch (_) { return false; }
  }

  // Günün en iyi sonucu: ilk çözüm ya da daha iyi bir tekrar (yoksa 0).
  // İlk çözüm sm_gunluk_*.steps'te kalır (seri ve paylaşım onunla); tekrar
  // yalnızca daha iyiyse aynı kayda enIyi olarak yazılır.
  dailyBest() {
    const r = this.dailyRecord();
    return r ? (r.enIyi || r.steps) : 0;
  }

  // Tekrar: yalnızca çözülmüş günlükte ve en azın üstünde kalındıysa
  canRetry() {
    return this.mode === "daily" && this.over && this.optimal > 0 && this.dailyBest() > this.optimal;
  }

  updateTabs() {
    this.el.tabDaily.classList.toggle("active", this.mode === "daily");
    this.el.tabFree.classList.toggle("active", this.mode !== "daily");
    // Seçim ekran okuyucuya da bildirilir (yalnızca renkle anlatılmaz)
    this.el.tabDaily.setAttribute("aria-pressed", String(this.mode === "daily"));
    this.el.tabFree.setAttribute("aria-pressed", String(this.mode !== "daily"));
    // Serbest oyunda zorluk+uzunluk menüsü, günlükte geri sayım
    this.el.freeSettings.classList.toggle("hidden", this.mode === "daily");
    this.el.dailyTimer.classList.toggle("hidden", this.mode !== "daily");
    for (const b of this.el.lenBtns) {
      b.classList.toggle("active", Number(b.dataset.len) === this.lenPref);
      b.setAttribute("aria-pressed", String(Number(b.dataset.len) === this.lenPref));
    }
    for (const b of this.el.diffBtns) {
      b.classList.toggle("active", b.dataset.diff === this.diffPref);
      b.setAttribute("aria-pressed", String(b.dataset.diff === this.diffPref));
    }
  }

  /* ---------- Serbest oyun tercihleri (uzunluk + zorluk) ---------- */

  // localStorage erişimi gizli sekmede hata verebilir; oyun yine çalışsın.
  // Sayısal tercih (uzunluk) için Number'a çevirir, string (zorluk) için değil.
  loadPref(anahtar, gecerliler, varsayilan) {
    try {
      const ham = localStorage.getItem(anahtar);
      const v = typeof varsayilan === "number" ? Number(ham) : ham;
      if (gecerliler.includes(v)) return v;
    } catch (_) { /* kayıt okunamadı */ }
    return varsayilan;
  }

  savePref(anahtar, deger) {
    try { localStorage.setItem(anahtar, String(deger)); } catch (_) { /* önemli değil */ }
  }

  /* ---------- Günlük bulmaca sayacı ---------- */

  // Kalan süreyi insan diliyle ("3 saat 12 dakika") verir — modal metni için
  kalanSureMetni() {
    const dk = Math.max(1, Math.round(this.msUntilTrtMidnight() / 60000));
    const saat = Math.floor(dk / 60);
    const kalanDk = dk % 60;
    if (!saat) return `${kalanDk} dakika`;
    return kalanDk ? `${saat} saat ${kalanDk} dakika` : `${saat} saat`;
  }

  // Her saniye çalışır: kalan süreyi yazar ve TRT gece yarısı geçilince
  // günlük bulmacayı kendiliğinden yeniler (sayfa açık kalsa bile).
  tickCountdown() {
    if (this.mode === "daily" && this.gosterilenGun !== this.dayNumber()) {
      this.newGame("daily");   // gün değişti
      return;
    }
    const s = Math.max(0, Math.floor(this.msUntilTrtMidnight() / 1000));
    const ss = String(Math.floor(s / 3600)).padStart(2, "0");
    const dd = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sn = String(s % 60).padStart(2, "0");
    this.el.countdown.textContent = this.el.modalCountdown.textContent = `${ss}:${dd}:${sn}`;
  }

  /* ---------- Render ---------- */

  // Bir kelimeyi harf kutuları halinde verilen kapsayıcıya basar.
  // compare: true ise hedefle aynı konumdaki harfler yeşil boyanır.
  // prev: bir önceki kelime; ona göre değişen harf işaretlenir.
  renderWord(container, word, { compare = false, filled = false, targetStyle = false, prev = "" } = {}) {
    container.innerHTML = "";
    for (let i = 0; i < word.length; i++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      if (filled) tile.classList.add("filled");
      if (targetStyle) tile.classList.add("target");
      if (compare && word[i] === this.targetWord[i]) tile.classList.add("green");
      if (prev && word[i] !== prev[i]) tile.classList.add("changed");
      tile.textContent = word[i];
      container.appendChild(tile);
    }
  }

  // Aktif giriş satırı: buffer'daki harfler + boş kutular
  renderInput(popLast = false) {
    this.el.input.innerHTML = "";
    this.el.inputLabel.textContent = `${this.chain.length}. adım`;
    for (let i = 0; i < this.len; i++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      if (i < this.buffer.length) {
        tile.classList.add("filled");
        tile.textContent = this.buffer[i];
        if (popLast && i === this.buffer.length - 1) tile.classList.add("pop");
      } else if (i === this.buffer.length) {
        tile.classList.add("cursor");          // sıradaki harfin yeri
      }
      // İpucu: değişecek konumda önerilen harf silik görünür (yazılınca üstüne biner)
      if (this.hint && i === this.hint.pos && i >= this.buffer.length) {
        tile.classList.add("hint-letter");
        tile.textContent = this.hint.letter;
      }
      this.el.input.appendChild(tile);
    }
  }

  /* ---------- Girdi işleme ---------- */

  pressKey(key) {
    if (this.over) return;

    if (key === "ENTER") { this.submit(); return; }
    if (key === "BACK") {
      this.buffer = this.buffer.slice(0, -1);
      this.renderInput();
      return;
    }
    if (WordLadder.TR_LETTER.test(key) && this.buffer.length < this.len) {
      this.buffer += key;
      AudioFX.key();
      this.renderInput(true);
    }
  }

  // Son kabul edilen kelime (zincirin ucu)
  get currentWord() {
    return this.chain[this.chain.length - 1];
  }

  // İki eşit uzunluktaki kelime arasındaki farklı harf sayısı
  diffCount(a, b) {
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d;
  }

  submit() {
    const word = this.buffer;

    // Kural 1: Hedef uzunlukta olmalı
    if (word.length < this.len) {
      return this.reject("Harf eksik");
    }
    // Kural 2: Geçerli sözlükte bulunmalı
    if (!this.dict.has(word)) {
      return this.reject("Sözlükte yok: " + word);
    }
    // Kural 3: Bir önceki kelimeden tam olarak 1 harf farklı olmalı
    const diff = this.diffCount(word, this.currentWord);
    if (diff === 0) {
      return this.reject("Bir harf değiştir");
    }
    if (diff > 1) {
      return this.reject("Yalnızca bir harf değişebilir");
    }
    // Not: Daha önce kullanılan bir kelimeye geri dönmek serbesttir; oyuncu
    // istediği zaman bir adım geri gidip başka yol deneyebilir.

    this.accept(word);
  }

  accept(word) {
    this.clearHint();
    this.chain.push(word);

    // Kabul edilen kelimeyi merdivene ekle (hedefle eşleşen harfler yeşil)
    this.addRung(this.chain.length - 1);
    // Çok kısa ekranda .game de kayar; giriş satırı görünür kalsın
    this.el.input.scrollIntoView({ block: "nearest" });

    this.buffer = "";
    this.renderStatus();
    this.renderInput();
    this.saveState();               // ilerleme kaydedilsin (yenilemede geri gelir)

    if (word === this.targetWord) this.win();
  }

  // Son kabul edilen kelimeyi zincirden çıkarır. Başlangıç kelimesi kalır;
  // yazılmakta olan harfler silinir (onlar için ayrıca sil tuşu var).
  undo() {
    if (this.over || this.chain.length < 2) return;
    this.clearHint();
    this.chain.pop();
    this.el.ladder.lastElementChild.remove();
    this.buffer = "";
    this.renderStatus();
    this.renderInput();
    this.saveState();               // zincir (ve sürmekte olan günlük tekrar) kaydedilsin
  }

  // Sonucu göster: önce onay penceresi
  askShowResult() {
    if (!this.canShowResult() || this.busy) return;
    const daily = this.mode === "daily";
    this.el.pesText.textContent = !daily
      ? "Bir en kısa yol gösterilir ve bu oyun biter."
      : this.dailyRecord()
        ? "Bir en kısa yol gösterilir ve bu deneme biter. Bugünkü çözüm kaydın değişmez."
        : "Bir en kısa yol gösterilir ve bugünün bulmacası burada biter. Çözüm kaydı oluşmaz, sonucu paylaşamazsın.";
    this.showPes(true);
  }

  showPes(open) {
    this.el.pes.classList.toggle("hidden", !open);
    this.el.pes.setAttribute("aria-hidden", String(!open));
  }

  // Onaydan sonra: bir en kısa yolu merdivene basar, bulmaca "çözüm gösterildi"
  // olarak biter. Günlükte çözüm kaydı (sm_gunluk_*) yazılmaz; ilk çözüm varsa
  // olduğu gibi kalır, yalnızca sürmekte olan tekrar bırakılır.
  showResult() {
    this.showPes(false);
    if (!this.canShowResult()) return;
    const yol = this.shortestPath();
    if (!yol) return this.showToast("Bu bulmacanın yolu bulunamadı");
    if (this.mode === "daily") {
      const k = this.dailyRecord();
      if (!k) {
        this.saveDailyRecord({ steps: 0, gosterildi: true });
      } else if (k.deneme) {
        const { deneme, ...temiz } = k;
        this.saveDailyRecord(temiz);
      }
    }
    this.chain = yol;
    this.buffer = "";
    this.over = true;
    this.shown = true;
    this.lastResult = (this.mode === "daily" && this.dailyRecord()) || null;   // ilk çözüm varsa o
    this.render();
    this.saveState();
    this.showToast("Bir en kısa yol gösterildi", true);
  }

  // Geçersiz hamle: shake animasyonu + kırmızı vurgu + toast + hata sesi
  reject(message) {
    AudioFX.error();
    this.showToast(message);

    const row = this.el.input;
    row.classList.remove("shake");
    void row.offsetWidth;            // Reflow: animasyonu yeniden tetikler
    row.classList.add("shake", "invalid");
    setTimeout(() => row.classList.remove("invalid"), 600);
  }

  showToast(message, ok = false) {
    const t = this.el.toast;
    t.textContent = message;
    t.classList.toggle("ok", ok); // ok=true → yeşil bilgi, değilse kırmızı hata
    t.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  /* ---------- Durum koruma (yenilemede ilerleme kaybolmasın) ---------- */

  // Wordle tarzı emoji ızgarası + adım sayısı (paylaşım ve modal için)
  computeResult() {
    const steps = this.chain.length - 1;
    const grid = this.chain.slice(1).map(w =>
      [...w].map((h, i) => (h === this.targetWord[i] ? "🟩" : "⬜")).join("")
    ).join("\n");
    return { steps, grid };
  }

  // Canlı oyunu localStorage'a yazar. Her hamlede ve yeni oyunda çağrılır.
  saveState() {
    // Günlük tekrar sürerken zinciri günün kaydında da tut (sm_state serbest
    // oyunla ezilse bile tekrar kaybolmaz)
    if (this.mode === "daily" && !this.over) {
      const k = this.dailyRecord();
      if (k && k.deneme && this.chain.length !== k.deneme.length) this.saveDailyRecord({ ...k, deneme: this.chain.slice() });
    }
    try {
      localStorage.setItem("sm_state", JSON.stringify({
        v: 1,
        mode: this.mode,
        day: this.mode === "daily" ? this.dayNumber() : null,
        start: this.startWord,
        target: this.targetWord,
        optimal: this.optimal,
        puzzleDiff: this.puzzleDiff,
        chain: this.chain,
        over: this.over,
        shown: this.shown,
      }));
    } catch (_) { /* kayıt tutulamadı — oyun yine çalışır */ }
  }

  // Kayıtlı oyunu geri yükler; başarılıysa true döner. Günlük bulmaca dünden
  // kalmışsa geri yüklemez (bugünün bulmacası gelsin diye).
  restoreState() {
    let s;
    try { s = JSON.parse(localStorage.getItem("sm_state")); } catch (_) { return false; }
    if (!s || s.v !== 1 || !s.start || !s.target) return false;

    const len = s.start.length;
    if (!this.db[String(len)]) return false;                 // sözlük değişmiş
    if (s.mode === "daily" && s.day !== this.dayNumber()) return false; // yeni gün

    this.mode = s.mode === "free" ? "free" : "daily";
    this.len = len;
    this.optimal = s.optimal || 0;
    this.puzzleDiff = s.puzzleDiff || "";
    this.dict = new Set(this.db[String(len)].words);
    this.startWord = s.start;
    this.targetWord = s.target;
    this.chain = Array.isArray(s.chain) && s.chain[0] === s.start ? s.chain : [s.start];
    this.buffer = "";
    this.over = !!s.over;
    // Bozuk durum güvenliği: "bitti" işaretli ama gerçek hamle yoksa (zincirde
    // yalnızca başlangıç) çözülmemiş say. Bu, eski bir hatadan kalan
    // "0 adımda çözüldü" durumunu kendiliğinden temizler.
    if (this.over && this.chain.length < 2) this.over = false;
    this.shown = this.over && !!s.shown;
    if (this.mode === "daily") this.gosterilenGun = this.dayNumber();

    this.updateTabs();
    this.render();
    this.saveState();       // düzeltilmiş durumu (ör. over=false) geri yaz

    // Yenilemede çözülmüş oyun: cevaplar tahtada görünür; modal AÇILMAZ
    // (kullanıcı "cevaplar görünür kalsın" istedi). Paylaşım için lastResult
    // hazırlanır; günlükte üstteki "çözüldü + paylaş" satırı erişim sağlar.
    if (this.over) this.lastResult = this.shown ? (this.mode === "daily" && this.dailyRecord()) || null : this.computeResult();
    return true;
  }

  /* ---------- Kazanma ---------- */

  win() {
    this.over = true;
    AudioFX.win();
    // Hedefe ulaşıldı: boş giriş satırı artık gereksiz
    this.el.game.classList.add("bitti");
    this.renderStatus();

    this.lastResult = this.computeResult();
    const steps = this.lastResult.steps;
    this.saveState();               // "bitti" durumu da kaydedilsin

    // Günün bulmacasında ilk çözüm kaydedilir (tekrar oynayış üzerine yazmaz).
    // Zinciri de saklıyoruz ki modda tekrar açıldığında gerçek merdiven ve
    // adım sayısı yeniden kurulabilsin (boş zincirden "0 adım" çıkmasın).
    // Kayıt varken biten günlük oyun bir tekrardır: ilk sonuç yerinde kalır,
    // yalnızca daha iyiyse enIyi güncellenir.
    if (this.mode === "daily") {
      const kayit = this.dailyRecord();
      if (!kayit) this.saveDailyRecord({ ...this.lastResult, chain: this.chain.slice() });
      else {
        const { deneme, ...temiz } = kayit;      // tekrar bitti
        this.saveDailyRecord(steps < (kayit.enIyi || kayit.steps) ? { ...temiz, enIyi: steps } : temiz);
      }
    }
    this.renderStatus();            // kayıt güncellendi: "en iyi" ve Tekrar dene durumu

    // Geçiş reklamı fırsatı: yerel kanca yoksa (web) hiçbir şey olmaz. Cevabı
    // beklenmez; kazanma penceresi hiçbir koşulda reklama takılmaz.
    // Plus'ta reklam yok.
    try { if (!this.plusMu()) Promise.resolve(window.SozcukGelir?.gecisReklami("cozum")).catch(() => {}); }
    catch (_) { /* reklam hatası oyunu etkilemez */ }

    // Küçük bir gecikme: son satırın yeşile dönüşü görülsün, sonra başarı modalı
    setTimeout(() => this.showModal(), 650);
  }

  showModal({ oncedenCozuldu = false } = {}) {
    const steps = this.lastResult ? this.lastResult.steps : this.chain.length - 1;
    // En kısa çözüme eşit sürede bitirene özel başlık
    const perfect = this.optimal && steps === this.optimal;

    if (oncedenCozuldu) {
      this.el.modalTitle.textContent = "Bugünkü bulmaca çözüldü";
      this.el.modalText.textContent =
        `${this.startWord} → ${this.targetWord} merdivenini ${steps} adımda tamamladın. ` +
        `Yeni bulmaca ${this.kalanSureMetni()} sonra!`;
    } else {
      this.el.modalTitle.textContent = perfect ? "Mükemmel!" : "Tebrikler!";
      this.el.modalText.textContent = `${this.startWord} → ${this.targetWord} merdivenini ` +
        (perfect ? "en kısa yoldan tamamladın." : `${steps} adımda tamamladın.`);
      // Tekrarda günün kaydı ilk çözümdür; en iyiyi ayrıca söyle
      const enIyi = this.mode === "daily" ? this.dailyBest() : 0;
      if (enIyi && enIyi < steps) this.el.modalText.textContent += ` En iyin ${enIyi} adım.`;
    }
    // Tekrar teklifi; uygulamada Plus değilse bir reklam izlemeyi gerektirir
    this.el.btnRetry.textContent = this.retryEtiketi();
    this.el.btnRetry.classList.toggle("hidden", !this.canRetry());

    // Üst yazı (günlükte TRT tarihi), sayılar ve adım adım sonuç ızgarası
    const gunluk = this.mode === "daily";
    this.el.modalKicker.textContent = gunluk
      ? "Günün Bulmacası · " + new Intl.DateTimeFormat("tr-TR",
          { day: "numeric", month: "long", timeZone: "Europe/Istanbul" }).format(new Date())
      : "Serbest Oyun";
    this.el.modalSteps.textContent = steps;
    this.el.modalOptimal.textContent = this.optimal;
    this.el.modalOptimalBox.classList.toggle("hidden", !this.optimal);
    this.el.modalNext.classList.toggle("hidden", !gunluk);
    this.el.modalGrid.innerHTML = "";
    for (const w of this.chain.slice(1)) {
      const satir = document.createElement("div");
      for (let i = 0; i < w.length; i++) {
        const kare = document.createElement("i");
        if (w[i] === this.targetWord[i]) kare.className = "green";
        satir.appendChild(kare);
      }
      this.el.modalGrid.appendChild(satir);
    }

    // Günlük bulmaca günde bir tane: "sonraki" oyun serbest moddur
    this.el.btnNewGame.textContent = this.mode === "daily" ? "Serbest Oyun" : "Yeni Oyun";
    this.el.modal.classList.remove("hidden");
    this.el.modal.setAttribute("aria-hidden", "false");
  }

  /* ---------- Sonuç paylaşımı ---------- */

  async share() {
    if (!this.lastResult) return;
    // Günlükte paylaşılan hep ilk çözümdür (tekrar sonucu seriyi ve paylaşımı bozmaz)
    const { steps, grid } = (this.mode === "daily" && this.dailyRecord()) || this.lastResult;

    const baslik = this.mode === "daily"
      ? `Sözcük Merdiveni #${this.dayNumber()}`
      : "Sözcük Merdiveni";
    const adres = location.href.split(/[?#]/)[0]; // Yayında alan adınız görünür

    const metin = [
      baslik,
      `${this.startWord} → ${this.targetWord} · ${steps} adım` +
        (this.optimal ? ` (en az ${this.optimal})` : ""),
      "",
      grid,
      "",
      adres,
    ].join("\n");

    // Dokunmatik cihazda sistem paylaşım menüsü, masaüstünde panoya kopyala
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ text: metin }); }
      catch (_) { /* kullanıcı paylaşımı iptal etti */ }
    } else {
      const ok = await this.copyToClipboard(metin);
      this.showToast(ok ? "Panoya kopyalandı!" : "Kopyalanamadı!", ok);
    }
  }

  // Pano API'si izin vermezse (eski tarayıcı, kısıtlı ortam) seçme+kopyalama
  // yedeğine düşer; başarı durumunu döndürür
  async copyToClipboard(metin) {
    try {
      await navigator.clipboard.writeText(metin);
      return true;
    } catch (_) {
      const alan = document.createElement("textarea");
      alan.value = metin;
      alan.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(alan);
      alan.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (_) { /* desteklenmiyor */ }
      alan.remove();
      return ok;
    }
  }

  /* ---------- Gelir kancası (yerel uygulama tanımlar; web'de yok) ---------- */

  // Kanca app.js'ten sonra yüklenir: her çağrıda window'dan aranır.
  // Kanca hata verirse ya da reddederse "olumsuz" sayılır; oyun takılmaz.
  plusMu() {
    try { return !!window.SozcukGelir?.plusMu(); } catch (_) { return false; }
  }

  // Kanca çağrısı: hata, ret ve zaman aşımı "olumsuz"dur. Söz hiç sonuçlanmazsa
  // (kanca takılırsa) oyun kilitli kalmasın diye zaman aşımı yarışır.
  async kancaya(ad, ...arg) {
    let zamanlayici;
    const asim = new Promise(coz => { zamanlayici = setTimeout(() => coz(false), WordLadder.KANCA_ZAMAN_ASIMI_MS); });
    try { return !!(await Promise.race([Promise.resolve().then(() => window.SozcukGelir?.[ad](...arg)), asim])); }
    catch (_) { return false; }
    finally { clearTimeout(zamanlayici); }
  }

  // İsteğe bağlı: yerel fiyat metni ("₺49,99"); yoksa boş
  plusFiyat() {
    try { const f = window.SozcukGelir?.plusFiyat?.(); return typeof f === "string" ? f : ""; } catch (_) { return ""; }
  }

  plusEtiketi() {
    const f = this.plusFiyat();
    return f ? `Plus'a geç (${f})` : "Plus'a geç";
  }

  retryEtiketi() {
    return window.SozcukGelir && !this.plusMu() ? "Reklam izle, tekrar dene" : "Tekrar dene";
  }

  /* ---------- İpucu ---------- */

  // Günlük ücretsiz ipucu (TRT günü; iki mod toplamı): sm_ipucu_<YYYY-AA-GG>.
  // Kayıt yazılamazsa (gizli sekme, dolu depo) hak yine oturum boyunca bellekte
  // düşer; sınırsız ücretsiz ipucuna dönüşmez.
  freeHintLeft() {
    const gun = this.todayKey();
    if (this.hintGunu === gun) return false;
    try { return !localStorage.getItem("sm_ipucu_" + gun); } catch (_) { return true; }
  }

  useFreeHint() {
    const gun = this.todayKey();
    this.hintGunu = gun;
    try { localStorage.setItem("sm_ipucu_" + gun, "1"); } catch (_) { /* bellekteki bayrak yeter */ }
  }

  // Hedeften BFS: her kelimenin hedefe uzaklığı (`uzak`) ve komşuları.
  // Komşuluk oyunun kuralıyla aynıdır: sözlükte, tek harfi farklı.
  hedefeUzaklik() {
    const kova = new Map();
    for (const w of this.dict) {
      for (let i = 0; i < w.length; i++) {
        const k = w.slice(0, i) + "_" + w.slice(i + 1);
        if (!kova.has(k)) kova.set(k, []);
        kova.get(k).push(w);
      }
    }
    const komsular = (w) => [...w].flatMap((_, i) => kova.get(w.slice(0, i) + "_" + w.slice(i + 1)) || []);
    const uzak = new Map([[this.targetWord, 0]]);
    const kuyruk = [this.targetWord];
    for (let n = 0; n < kuyruk.length; n++) {
      for (const v of komsular(kuyruk[n])) {
        if (!uzak.has(v)) { uzak.set(v, uzak.get(kuyruk[n]) + 1); kuyruk.push(v); }
      }
    }
    return { uzak, komsular };
  }

  // Bu kelimeden hedefe giden en kısa yolun sonraki kelimesi ve hedefe kalan
  // adım. Oyuncu en kısa yoldan sapmışsa da şimdiki kelimeden yeniden
  // hesaplanır. Yol yoksa null. Aynı uzaklıktaki adaylar arasında zincirde
  // olmayan tercih edilir (gereksiz geri dönüş önerilmez).
  nextOnPath() {
    const { uzak, komsular } = this.hedefeUzaklik();
    const simdi = this.currentWord;
    if (!uzak.has(simdi)) return null;
    const adaylar = komsular(simdi).filter(v => uzak.get(v) === uzak.get(simdi) - 1);
    const sonraki = adaylar.find(v => !this.chain.includes(v)) || adaylar[0];
    return sonraki ? { sonraki, kalan: uzak.get(simdi) } : null;
  }

  // Başlangıçtan hedefe bir en kısa yol (ikisi de dahil); yol yoksa null.
  shortestPath() {
    const { uzak, komsular } = this.hedefeUzaklik();
    if (!uzak.has(this.startWord)) return null;
    const yol = [this.startWord];
    while (yol[yol.length - 1] !== this.targetWord) {
      const w = yol[yol.length - 1];
      yol.push(komsular(w).find(v => uzak.get(v) === uzak.get(w) - 1));
    }
    return yol;
  }

  // İpucu planı (ücret alınmadan önce hesaplanır): değişecek konum, harf,
  // zincire geri dönüş mü, hedefe kalan adım. Yol yoksa null.
  planHint() {
    const yol = this.nextOnPath();
    if (!yol) return null;
    const pos = [...yol.sonraki].findIndex((h, i) => h !== this.currentWord[i]);
    return { pos, letter: yol.sonraki[pos], word: yol.sonraki, kalan: yol.kalan, geri: this.chain.includes(yol.sonraki) };
  }

  hintMetni(h) {
    return (h.geri ? `${h.word} kelimesine geri dön` : `${h.pos + 1}. harfi ${h.letter} yap`) + ` · hedefe ${h.kalan} adım`;
  }

  // İpucunu gösterir: şimdiki kelimede değişecek harf çerçevelenir, giriş
  // satırında yeni harf silik görünür, bildirim de yazıyla söyler. Sonraki
  // kelimenin cümlesi varsa ipucu açık kaldıkça tahtanın altında durur.
  showHint(plan) {
    this.clearHint();
    this.hint = plan;
    const satir = this.chain.length > 1 ? this.el.ladder.lastElementChild.querySelector(".word-row") : this.el.start;
    satir.children[plan.pos].classList.add("hint");
    this.renderInput();
    this.showToast(this.hintMetni(plan), true);
    this.yazIpucuCumlesi();
  }

  // Açık ipucunun gösterdiği kelimenin cümlesi (yoksa boş)
  yazIpucuCumlesi() {
    const cumle = this.ipuclari?.[this.hint?.word];
    this.el.hintClue.textContent = typeof cumle === "string" ? "Sonraki kelime: " + cumle : "";
  }

  clearHint() {
    this.hint = null;
    this.el.hintClue.textContent = "";
    document.querySelector(".tile.hint")?.classList.remove("hint");
  }

  async requestHint() {
    if (this.over || this.busy) return;
    if (this.hint) return this.showToast(this.hintMetni(this.hint), true);
    // Önce hesapla: yol yoksa oyuncudan hak ya da reklam alınmaz
    const plan = this.planHint();
    if (!plan) return this.showToast("Bu kelimeden hedefe yol bulunamadı");
    if (this.plusMu()) return this.showHint(plan);
    if (this.freeHintLeft()) { this.useFreeHint(); return this.showHint(plan); }
    // Ücretsiz hak bitti: uygulamada reklam ya da Plus, webde yarın
    if (window.SozcukGelir?.odulluReklam) {
      this.showOffer(true);
    } else {
      this.showToast("Bugünkü ipucun bitti. Yarın yeni bir ipucu seni bekliyor.");
    }
  }

  showOffer(open) {
    this.el.btnOfferPlus.classList.toggle("hidden", !window.SozcukGelir?.plusSatinAl);
    this.el.btnOfferPlus.textContent = this.plusEtiketi();
    this.el.offer.classList.toggle("hidden", !open);
    this.el.offer.setAttribute("aria-hidden", String(!open));
  }

  async offerAd() {
    if (this.busy) return;
    // Reklamdan önce yeniden doğrula: ipucu verilemeyecekse reklam gösterilmez
    if (!this.planHint()) return this.showToast("Bu kelimeden hedefe yol bulunamadı");
    this.busy = true;
    const ok = await this.kancaya("odulluReklam", "ipucu");
    this.busy = false;
    if (!ok) return this.showToast(WordLadder.REKLAM_YOK);
    const plan = this.planHint();
    this.showOffer(false);
    if (plan) this.showHint(plan);
  }

  async buyPlus() {
    if (this.busy) return;
    this.busy = true;
    const ok = await this.kancaya("plusSatinAl");
    this.busy = false;
    this.renderPlus();
    if (!ok) return this.showToast("Satın alma tamamlanmadı ya da onay bekliyor.");
    this.showOffer(false);
    this.showToast("Plus açıldı. Teşekkürler!", true);
  }

  async restorePlus() {
    if (this.busy) return;
    this.busy = true;
    const ok = await this.kancaya("plusGeriYukle");
    this.busy = false;
    this.renderPlus();
    this.showToast(ok ? "Satın alımın geri yüklendi." : "Geri yüklenecek satın alım bulunamadı.", ok);
  }

  // "Nasıl oynanır" altındaki Plus bölümü: yalnızca kanca varsa görünür
  renderPlus() {
    const G = window.SozcukGelir;
    const plus = this.plusMu();
    this.el.plusBox.classList.toggle("hidden", !G);
    this.el.plusText.textContent = plus
      ? "Plus etkin. Reklamsız ve sınırsız ipucu keyfini çıkar."
      : "Reklamsız + sınırsız ipucu. Tek seferlik satın alma.";
    this.el.btnPlusBuy.textContent = this.plusEtiketi();
    this.el.btnPlusBuy.classList.toggle("hidden", plus);
    this.el.btnPlusRestore.classList.toggle("hidden", plus);
    this.el.plusNot.classList.toggle("hidden", plus);
  }

  // Yerel taraf Plus'ı sonradan verir ya da geri alırsa ("sozcukgelir" olayı)
  gelirDegisti() {
    this.renderPlus();
    this.el.btnRetry.textContent = this.retryEtiketi();
    this.el.btnOfferPlus.textContent = this.plusEtiketi();
    if (this.plusMu()) this.showOffer(false);
    this.renderStatus();
  }

  /* ---------- Tekrar dene (yalnızca günlük) ---------- */

  async retry() {
    if (this.busy || !this.canRetry()) return;
    // Uygulamada Plus değilse tekrar bir ödüllü reklama bağlıdır; web'de serbest
    if (window.SozcukGelir && !this.plusMu()) {
      this.busy = true;
      const ok = await this.kancaya("odulluReklam", "tekrar");
      this.busy = false;
      if (!ok) return this.showToast(WordLadder.REKLAM_YOK);
    }
    this.beginRetry();
  }

  // Aynı bulmacayı baştan açar. İlk çözüm alanları değişmez; zincir günün
  // kaydında `deneme` olarak durur (yenileme, restart ve sekme değişimi sürdürür).
  beginRetry() {
    this.saveDailyRecord({ ...this.dailyRecord(), deneme: [this.startWord] });
    this.chain = [this.startWord];
    this.buffer = "";
    this.over = false;
    this.render();          // pencereyi kapatır, tahtayı ve durumu yeniler
    this.saveState();
  }

  hideModal() {
    this.el.modal.classList.add("hidden");
    this.el.modal.setAttribute("aria-hidden", "true");
  }

  /* ---------- Klavye ve olaylar ---------- */

  // Sanal klavyeyi LAYOUT dizisinden üretir
  buildKeyboard() {
    WordLadder.LAYOUT.forEach(rowKeys => {
      const row = document.createElement("div");
      row.className = "kb-row";
      rowKeys.forEach(k => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "key";
        btn.dataset.key = k;
        // Tuşun kendisi dokunma alanıdır; görünen kapak içindeki .cap'tir
        const cap = document.createElement("span");
        cap.className = "cap";
        if (k === "ENTER") { btn.classList.add("wide"); cap.textContent = "GİR"; }
        else if (k === "BACK") { btn.classList.add("wide"); cap.append(document.getElementById("iconBackspace").content.cloneNode(true)); btn.setAttribute("aria-label", "Sil"); }
        else cap.textContent = k;
        btn.appendChild(cap);
        row.appendChild(btn);
      });
      this.el.keyboard.appendChild(row);
    });
  }

  bindEvents() {
    // Sanal klavye: tek dinleyici ile olay delegasyonu
    this.el.keyboard.addEventListener("click", (e) => {
      const btn = e.target.closest(".key");
      if (!btn) return;
      btn.blur(); // Odak tuşta kalırsa sonraki Enter/Space tuşu onu yeniden tetikler
      this.pressKey(btn.dataset.key);
    });

    // Fiziksel klavye dinleyicisi (Türkçe karakter uyumlu)
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // İpucu teklifi ya da sonucu göster onayı açıkken tahtaya yazılmaz; Escape kapatır
      if (!this.el.offer.classList.contains("hidden")) {
        if (e.key === "Escape") this.showOffer(false);
        return;
      }
      if (!this.el.pes.classList.contains("hidden")) {
        if (e.key === "Escape") this.showPes(false);
        return;
      }

      if (e.key === "Enter") {
        // Odaktaki bağlantıda Enter bağlantıyı açar (Nasıl oynanır, Anladım, Gizlilik)
        if (e.target.closest("a[href]")) return;
        // preventDefault: odakta buton kaldıysa Enter'ın onu tetiklemesini
        // engeller — aksi halde "Sözlükte yok" hatasıyla birlikte yanlışlıkla
        // yeni oyun başlıyordu
        e.preventDefault();
        // Oyun bittiyse Enter "Yeni Oyun" kısayoludur
        if (this.over) { this.el.btnNewGame.click(); return; }
        this.pressKey("ENTER");
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        this.pressKey("BACK");
        return;
      }
      if (e.key.length === 1) {
        // 'i' → 'İ', 'ı' → 'I' dönüşümü için Türkçe yerel ayarı şart
        this.pressKey(e.key.toLocaleUpperCase("tr-TR"));
      }
    });

    // Modal ana butonu: günlükte "Serbest Oyun"a geçirir, serbestte yeni
    // rastgele bulmaca açar. blur(): buton odakta kalırsa oyun sırasındaki
    // her Enter/Space yanlışlıkla yeni oyun başlatır.
    this.el.btnNewGame.addEventListener("click", (e) => {
      e.currentTarget.blur();
      showInterstitialAd(() => this.newGame("free"));
    });

    // Başlıktaki yenile düğmesi: aktif modu sıfırlar (günlükte aynı bulmacayı baştan açar)
    this.el.btnRestart.addEventListener("click", (e) => {
      e.currentTarget.blur();
      // Sürmekte olan günlük tekrarda restart tekrarı baştan açar (reklamsız, kaybolmaz)
      if (this.mode === "daily" && !this.over && this.dailyRecord()) return this.beginRetry();
      showInterstitialAd(() => this.newGame(this.mode));
    });

    // Mod sekmeleri
    this.el.tabDaily.addEventListener("click", (e) => {
      e.currentTarget.blur();
      if (this.mode !== "daily") this.newGame("daily");
    });
    this.el.tabFree.addEventListener("click", (e) => {
      e.currentTarget.blur();
      if (this.mode !== "free") this.newGame("free");
    });

    // Serbest oyun ayarları (zorluk + uzunluk): tıklayınca tercih kaydedilir
    // ve hemen o ayarda yeni bulmaca gelir.
    this.el.freeSettings.addEventListener("click", (e) => {
      const btn = e.target.closest(".pick-btn");
      if (!btn) return;
      btn.blur();
      if ("len" in btn.dataset) {
        const n = Number(btn.dataset.len);
        if (n === this.lenPref && this.mode === "free") return;  // zaten seçili
        this.lenPref = n;
        this.savePref("sm_uzunluk", n);
      } else if ("diff" in btn.dataset) {
        const d = btn.dataset.diff;
        if (d === this.diffPref && this.mode === "free") return;
        this.diffPref = d;
        this.savePref("sm_zorluk", d);
      } else return;
      this.newGame("free");
    });

    // Sonucu paylaş (modaldaki ve çözüldü satırındaki butonlar)
    this.el.btnShare.addEventListener("click", (e) => {
      e.currentTarget.blur();
      this.share();
    });
    this.el.btnDailyShare.addEventListener("click", (e) => {
      e.currentTarget.blur();
      this.share();
    });
    this.el.btnCloseModal.addEventListener("click", () => this.hideModal());
    window.addEventListener("sozcukgelir", () => this.gelirDegisti());

    // İpucu, tekrar, ipucu teklifi ve Plus
    const dokun = (el, fn) => el.addEventListener("click", (e) => { e.currentTarget.blur(); fn(); });
    dokun(this.el.btnHint, () => this.requestHint());
    dokun(this.el.btnUndo, () => this.undo());
    dokun(this.el.btnShowResult, () => this.askShowResult());
    dokun(this.el.btnPesEvet, () => this.showResult());
    dokun(this.el.btnPesVazgec, () => this.showPes(false));
    dokun(this.el.btnClosePes, () => this.showPes(false));
    // Reklam gerektiriyorsa düğme reklamı kendisi başlatmaz: neyin olacağını yazan pencereyi açar
    dokun(this.el.btnDailyRetry, () => this.retryEtiketi() === "Tekrar dene" ? this.retry() : this.showModal({ oncedenCozuldu: true }));
    dokun(this.el.btnRetry, () => this.retry());
    dokun(this.el.btnOfferAd, () => this.offerAd());
    dokun(this.el.btnOfferPlus, () => this.buyPlus());
    dokun(this.el.btnCloseOffer, () => this.showOffer(false));
    dokun(this.el.btnPlusBuy, () => this.buyPlus());
    dokun(this.el.btnPlusRestore, () => this.restorePlus());

    // Ses aç/kapat
    this.el.btnMute.addEventListener("click", (e) => {
      e.currentTarget.blur();
      muteGame(!AudioFX.isMuted());
    });

    // Sekme arka plandayken tarayıcılar zamanlayıcıları kısıtlar (Chrome'da
    // dakikada bire kadar düşer). Kullanıcı geri döndüğünde sayaç bayat
    // görünmesin ve gece yarısı arka planda geçtiyse bulmaca anında
    // yenilensin diye görünür olur olmaz güncelliyoruz.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.tickCountdown();
    });
  }
}

/* ---------------- BAŞLAT ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  new WordLadder().init();
});
