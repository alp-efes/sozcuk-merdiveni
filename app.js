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
  if (btn) btn.textContent = mute ? "🔇" : "🔊";
}

// Oyun kazanıldığında ve "Yeni Oyun"da tetiklenir.
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

  // Türkçe karakter uyumlu klavye dizilimi (Q/W/X alfabede yok, çıkarıldı)
  static LAYOUT = [
    ["E", "R", "T", "Y", "U", "I", "O", "P", "Ğ", "Ü"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ş", "İ"],
    ["ENTER", "Z", "C", "V", "B", "N", "M", "Ö", "Ç", "BACK"]
  ];

  // Türk alfabesindeki 29 büyük harf
  static TR_LETTER = /^[ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ]$/;

  // Günün bulmacası takvimi: 1. gün = 15 Temmuz 2026 (ay 0 tabanlıdır)
  static GUN_BASLANGIC = new Date(2026, 6, 15);

  constructor() {
    // DOM referansları tek noktada toplanır
    this.el = {
      start:   document.getElementById("startWord"),
      target:  document.getElementById("targetWord"),
      ladder:  document.getElementById("ladder"),
      input:   document.getElementById("inputRow"),
      toast:   document.getElementById("toast"),
      parInfo: document.getElementById("parInfo"),
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
      nativeInput: document.getElementById("nativeInput"),
      game:       document.getElementById("game"),
    };

    // Dokunmatik cihazda kendi klavyemiz yerine cihazınki kullanılır
    this.touch = matchMedia("(pointer: coarse)").matches;

    // Oyun durumu
    this.db = null;       // { "3": {words, puzzles}, ... }
    this.dict = null;     // Aktif uzunluğun Set sözlüğü (O(1) arama)
    this.len = 0;         // Aktif kelime uzunluğu
    this.startWord = "";
    this.targetWord = "";
    this.chain = [];      // [başlangıç, ...kabul edilen kelimeler]
    this.buffer = "";     // O an yazılan kelime
    this.over = false;    // Oyun bitti mi?
    this.mode = "daily";  // "daily" (günün bulmacası) | "free" (serbest)
    this.lastResult = null; // Son kazanılan oyunun {steps, grid} paylaşım verisi
    this.toastTimer = null;
  }

  /* ---------- Kurulum ---------- */

  async init() {
    this.db = await this.loadWords();
    this.buildKeyboard();
    this.bindEvents();
    this.newGame("daily"); // Açılışta günün bulmacası
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

  /* ---------- Yeni oyun ---------- */

  newGame(mode = this.mode) {
    this.mode = mode;
    this.updateTabs();

    // Günlük modda herkese aynı bulmaca; serbest modda rastgele
    let puzzle;
    if (mode === "daily") {
      puzzle = this.dailyPuzzle();
    } else {
      const lengths = Object.keys(this.db).filter(k => this.db[k].puzzles?.length);
      puzzle = this.pick(this.db[this.pick(lengths)].puzzles);
    }
    // Bulmaca formatı: [başlangıç, hedef, enAzAdım] — üçüncü alan opsiyonel
    const [start, target, optimal = 0] = puzzle;

    this.len = start.length;
    this.optimal = optimal;
    this.dict = new Set(this.db[String(this.len)].words);
    this.startWord = start;
    this.targetWord = target;
    this.chain = [start];
    this.buffer = "";
    this.over = false;

    // Ekranı sıfırla
    this.el.ladder.innerHTML = "";
    this.renderWord(this.el.start, start, { compare: true, filled: true });
    this.renderWord(this.el.target, target, { targetStyle: true });
    this.el.parInfo.textContent = optimal ? `En az ${optimal} adımda çözülebilir` : "";
    this.renderInput();
    this.hideModal();

    // Analitik: oyun başlangıcı (window.trackEvent Firebase köprüsüdür)
    window.trackEvent?.("game_start", { mode, length: this.len });

    // Günün bulmacası bu cihazda zaten çözülmüşse paylaşım ekranıyla karşıla
    if (mode === "daily") {
      const kayit = this.dailyRecord();
      if (kayit) {
        this.lastResult = kayit;
        this.showModal({ oncedenCozuldu: true });
      }
    }
  }

  pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ---------- Günün bulmacası ---------- */

  // Yerel saate göre YYYY-AA-GG anahtarı (kayıt için)
  todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Yayın başlangıcından bu yana kaçıncı gün (1 tabanlı)
  dayNumber() {
    const simdi = new Date();
    const bugun = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
    return Math.round((bugun - WordLadder.GUN_BASLANGIC) / 86400000) + 1;
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
  // bile oyun çalışmaya devam eder
  dailyRecord() {
    try { return JSON.parse(localStorage.getItem("sm_gunluk_" + this.todayKey())); }
    catch (_) { return null; }
  }

  saveDailyRecord(sonuc) {
    try { localStorage.setItem("sm_gunluk_" + this.todayKey(), JSON.stringify(sonuc)); }
    catch (_) { /* kayıt tutulamadı — önemli değil */ }
  }

  updateTabs() {
    this.el.tabDaily.classList.toggle("active", this.mode === "daily");
    this.el.tabFree.classList.toggle("active", this.mode !== "daily");
  }

  /* ---------- Render ---------- */

  // Bir kelimeyi harf kutuları halinde verilen kapsayıcıya basar.
  // compare: true ise hedefle aynı konumdaki harfler yeşil boyanır.
  renderWord(container, word, { compare = false, filled = false, targetStyle = false } = {}) {
    container.innerHTML = "";
    for (let i = 0; i < word.length; i++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      if (filled) tile.classList.add("filled");
      if (targetStyle) tile.classList.add("target");
      if (compare && word[i] === this.targetWord[i]) tile.classList.add("green");
      tile.textContent = word[i];
      container.appendChild(tile);
    }
  }

  // Aktif giriş satırı: buffer'daki harfler + boş kutular
  renderInput(popLast = false) {
    // Mobil giriş alanını tampon ile senkron tut (gönderim/yeni oyun sonrası temizler)
    if (this.el.nativeInput && this.el.nativeInput.value !== this.buffer) {
      this.el.nativeInput.value = this.buffer;
    }
    this.el.input.innerHTML = "";
    for (let i = 0; i < this.len; i++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      if (i < this.buffer.length) {
        tile.classList.add("filled");
        tile.textContent = this.buffer[i];
        if (popLast && i === this.buffer.length - 1) tile.classList.add("pop");
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
      return this.reject("Yetersiz harf!");
    }
    // Kural 2: Geçerli sözlükte bulunmalı
    if (!this.dict.has(word)) {
      return this.reject("Sözlükte yok: " + word);
    }
    // Kural 3: Bir önceki kelimeden tam olarak 1 harf farklı olmalı
    const diff = this.diffCount(word, this.currentWord);
    if (diff === 0) {
      return this.reject("Kelimeyi değiştirmedin!");
    }
    if (diff > 1) {
      return this.reject("Sadece 1 harf değişebilir!");
    }
    // Kural 4: Aynı kelime zincirde tekrar kullanılamaz (döngüyü engeller)
    if (this.chain.includes(word)) {
      return this.reject("Bu kelimeyi zaten kullandın!");
    }

    this.accept(word);
  }

  accept(word) {
    this.chain.push(word);

    // Kabul edilen kelimeyi merdivene ekle (hedefle eşleşen harfler yeşil)
    const row = document.createElement("div");
    row.className = "word-row";
    this.el.ladder.appendChild(row);
    this.renderWord(row, word, { compare: true, filled: true });
    // Dar ekranda .game kayabilir; aktif giriş satırı görünür kalsın
    this.el.input.scrollIntoView({ block: "nearest" });

    this.buffer = "";
    this.renderInput();

    if (word === this.targetWord) this.win();
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

  /* ---------- Kazanma ---------- */

  win() {
    this.over = true;
    AudioFX.win();
    this.el.nativeInput?.blur();   // Mobilde cihaz klavyesi kapansın, modal görünsün

    // Paylaşım ızgarası: her basamakta hedefle eşleşen konumlar 🟩 olur;
    // kelimelerin kendisi gizli kalır (Wordle usulü)
    const steps = this.chain.length - 1;
    const grid = this.chain.slice(1).map(w =>
      [...w].map((h, i) => (h === this.targetWord[i] ? "🟩" : "⬜")).join("")
    ).join("\n");
    this.lastResult = { steps, grid };

    // Günün bulmacasında ilk çözüm kaydedilir (tekrar oynayış üzerine yazmaz)
    if (this.mode === "daily" && !this.dailyRecord()) this.saveDailyRecord(this.lastResult);

    // Analitik: kazanma (adım sayısı ve mükemmellik dağılımını görmek için)
    window.trackEvent?.("game_won", {
      mode: this.mode,
      length: this.len,
      steps,
      optimal: this.optimal,
      perfect: this.optimal ? (steps === this.optimal ? 1 : 0) : 0,
    });

    // Küçük bir gecikme: son satırın yeşile dönüşü görülsün,
    // ardından geçiş reklamı ve başarı modalı
    setTimeout(() => showInterstitialAd(() => this.showModal()), 650);
  }

  showModal({ oncedenCozuldu = false } = {}) {
    const steps = this.lastResult ? this.lastResult.steps : this.chain.length - 1;
    // En kısa çözüme eşit sürede bitirene özel başlık
    const perfect = this.optimal && steps === this.optimal;

    if (oncedenCozuldu) {
      this.el.modalTitle.textContent = "Bugünkü bulmaca çözüldü ✅";
      this.el.modalText.textContent =
        `${this.startWord} → ${this.targetWord} merdivenini ${steps} adımda tamamladın. ` +
        `Yarın yeni bulmaca seni bekliyor!`;
    } else {
      this.el.modalTitle.textContent = perfect ? "Mükemmel! 🏆" : "Tebrikler! 🎉";
      this.el.modalText.textContent =
        `${this.startWord} → ${this.targetWord} merdivenini ${steps} adımda tamamladın!` +
        (this.optimal && !perfect ? ` (En iyisi: ${this.optimal} adım)` : "");
    }

    // Günlük bulmaca günde bir tane: "sonraki" oyun serbest moddur
    this.el.btnNewGame.textContent = this.mode === "daily" ? "Serbest Oyun" : "Yeni Oyun";
    this.el.modal.classList.remove("hidden");
    this.el.modal.setAttribute("aria-hidden", "false");
  }

  /* ---------- Sonuç paylaşımı ---------- */

  async share() {
    if (!this.lastResult) return;
    const { steps, grid } = this.lastResult;
    const perfect = this.optimal && steps === this.optimal;

    // Analitik: paylaşım (viral büyümenin en önemli sinyali)
    window.trackEvent?.("result_shared", { mode: this.mode, length: this.len, steps });

    const baslik = this.mode === "daily"
      ? `Sözcük Merdiveni #${this.dayNumber()} 📅`
      : "Sözcük Merdiveni 🪜";
    const adres = location.href.split(/[?#]/)[0]; // Yayında alan adınız görünür

    const metin = [
      baslik,
      `${this.startWord} → ${this.targetWord} · ${steps} adım` +
        (this.optimal ? ` (en az ${this.optimal})` : "") + (perfect ? " 🏆" : ""),
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
      this.showToast(ok ? "Panoya kopyalandı! 📋" : "Kopyalanamadı!", ok);
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
        if (k === "ENTER") { btn.classList.add("wide"); btn.textContent = "GİR"; }
        else if (k === "BACK") { btn.classList.add("wide"); btn.textContent = "⌫"; btn.setAttribute("aria-label", "Sil"); }
        else btn.textContent = k;
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

    /* --- Mobil: cihazın kendi klavyesi --- */
    const ni = this.el.nativeInput;

    // Yumuşak klavyelerde keydown güvenilmezdir (çoğu zaman "Unidentified"
    // veya keyCode 229 verir), bu yüzden yazılanı input olayından okuyoruz.
    ni.addEventListener("input", () => {
      const temiz = [...ni.value.toLocaleUpperCase("tr-TR")]
        .filter(h => WordLadder.TR_LETTER.test(h))   // boşluk/otomatik düzeltme artığını at
        .slice(0, this.len)
        .join("");
      const harfEklendi = temiz.length > this.buffer.length;
      this.buffer = temiz;
      ni.value = temiz;                              // geçersizleri input'tan da temizle
      if (harfEklendi) AudioFX.key();
      this.renderInput(harfEklendi);
    });

    // Cihaz klavyesindeki "Git/Enter" tuşu
    ni.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (this.over) { this.el.btnNewGame.click(); return; }
      this.submit();
    });

    ni.addEventListener("focus", () => document.body.classList.add("kb-open"));
    ni.addEventListener("blur", () => document.body.classList.remove("kb-open"));

    // iOS klavyeyi yalnızca kullanıcı hareketiyle açar; tahtaya dokunmak yeter
    if (this.touch) {
      this.el.game.addEventListener("click", () => { if (!this.over) ni.focus(); });
    }

    // Fiziksel klavye dinleyicisi (Türkçe karakter uyumlu)
    document.addEventListener("keydown", (e) => {
      if (e.target === this.el.nativeInput) return;  // mobil giriş kendi işler
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Enter") {
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

    // Başlıktaki ↻: aktif modu sıfırlar (günlükte aynı bulmacayı baştan açar)
    this.el.btnRestart.addEventListener("click", (e) => {
      e.currentTarget.blur();
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

    // Sonucu paylaş + modalı kapat
    this.el.btnShare.addEventListener("click", (e) => {
      e.currentTarget.blur();
      this.share();
    });
    this.el.btnCloseModal.addEventListener("click", () => this.hideModal());

    // Ses aç/kapat
    this.el.btnMute.addEventListener("click", (e) => {
      e.currentTarget.blur();
      muteGame(!AudioFX.isMuted());
    });
  }
}

/* ---------------- BAŞLAT ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  new WordLadder().init();
});
