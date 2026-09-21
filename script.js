/* ==========================================================================
   Smashh — link-in-bio behaviour
   Plain script (no modules): safe to run from file://
   Sections: 1 helpers · 2 adaptive theme · 3 views counter · 4 player · 5 socials
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ 1. helpers */
  var USER = window.SITE_CONFIG || {};
  var DATA = window.SITE_DATA || {};

  var CFG = {
    views: Object.assign(
      { enabled: true, host: "https://abacus.jasoncameron.dev", namespace: "smashh-bio", key: "views",
        countEveryHours: 24, countLocalPreview: false },
      USER.views
    ),
    hearts: Object.assign({ enabled: true, key: "hearts" }, USER.hearts),
    status: Object.assign({ enabled: true, text: "" }, USER.status),
    time: Object.assign({ enabled: true, utcOffsetHours: 3 }, USER.time),
    preloader: Object.assign(
      { enabled: true, mode: "session", line: "[system]: Initializing bio...", hello: "Hello!", holdMs: 2000 },
      USER.preloader
    ),
    activity: Object.assign({ enabled: true, userId: "", hideWhenOffline: false }, USER.activity),
    terminal: Object.assign(
      { enabled: true, user: "smashh", host: "localhost", trigger: "whoami", showHint: true,
        whoami: [], links: [], chips: ["help", "whoami", "links", "clear", "exit"], secretSpeed: 1 },
      USER.terminal
    ),
    discord: Object.assign({ username: "", userId: "" }, USER.discord),
    wallpaper: Object.assign({ position: "center", blur: 0 }, USER.wallpaper)
  };
  // Hearts share the service address of the view counter unless configured otherwise
  CFG.hearts.host = CFG.hearts.host || CFG.views.host;
  CFG.hearts.namespace = CFG.hearts.namespace || CFG.views.namespace;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function pad(n) { return n < 10 ? "0" + n : String(n); }

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, String(v)); } catch (e) { /* private mode */ } }
  };

  var toastEl = $("toast");
  var toastTimer = null;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-visible"); }, 2400);
  }

  /* ------------------------------------------------------------ 2. adaptive theme */
  // Defaults match the placeholder wallpaper (amber + magenta on ink blue).
  var DEFAULT_PALETTE = {
    accent: [234, 164, 113], accent2: [213, 90, 226],
    tint: [28, 23, 27], base: [14, 12, 13], overlay: 0.555
  };

  var WALLPAPER_CANDIDATES = ["wallpaper.jpg", "wallpaper.jpeg", "wallpaper.png", "wallpaper.webp", "wallpaper.avif"]
    .map(function (n) { return "./assets/" + n; });

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min, l = (max + min) / 2, h = 0, s = 0;
    if (d > 0) {
      var den = 1 - Math.abs(2 * l - 1);
      s = den > 0 ? d / den : 0;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
      if (h < 0) h += 1;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var hp = h * 6;
    var x = c * (1 - Math.abs(hp % 2 - 1));
    var r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    var m = l - c / 2;
    return [r + m, g + m, b + m].map(function (v) { return Math.round(clamp(v, 0, 1) * 255); });
  }

  /* Turns RGBA pixels into a palette. The same algorithm lives in build.py
     (used on file:// where the browser blocks reading pixels of local images). */
  var BINS = 24;
  function paletteFromPixels(data) {
    var wS = [], xS = [], yS = [], sS = [], i;
    for (i = 0; i < BINS; i++) { wS.push(0); xS.push(0); yS.push(0); sS.push(0); }
    var n = 0, R = 0, G = 0, B = 0, luma = 0, colorW = 0;

    for (i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      var r = data[i], g = data[i + 1], b = data[i + 2];
      n++; R += r; G += g; B += b;
      luma += 0.2126 * r + 0.7152 * g + 0.0722 * b;

      var hsl = rgbToHsl(r, g, b), h = hsl[0], s = hsl[1], l = hsl[2];
      if (l < 0.10 || l > 0.92 || s < 0.15) continue;     // ignore near-black / near-white / grey
      var w = s * (1 - Math.abs(2 * l - 1));               // "vividness"
      var bi = Math.min(BINS - 1, Math.floor(h * BINS));
      wS[bi] += w; xS[bi] += Math.cos(h * 2 * Math.PI) * w; yS[bi] += Math.sin(h * 2 * Math.PI) * w; sS[bi] += s * w;
      colorW += w;
    }
    if (!n) return null;

    var avg = rgbToHsl(R / n, G / n, B / n);
    var tint = hslToRgb(avg[0], Math.min(avg[1] * 0.6, 0.4), 0.10);
    var base = hslToRgb(avg[0], Math.min(avg[1] * 0.5, 0.35), 0.05);
    var overlay = Math.round(clamp(0.40 + (luma / (n * 255)) * 0.45, 0.40, 0.80) * 1000) / 1000;

    function sm(k) { return wS[k] + 0.5 * (wS[(k + 1) % BINS] + wS[(k + BINS - 1) % BINS]); }
    function agg(k) {
      var a = (k + BINS - 1) % BINS, c = (k + 1) % BINS;
      return { w: wS[a] + wS[k] + wS[c], x: xS[a] + xS[k] + xS[c], y: yS[a] + yS[k] + yS[c], s: sS[a] + sS[k] + sS[c] };
    }
    function hueOf(a) { var h = Math.atan2(a.y, a.x) / (2 * Math.PI); return h < 0 ? h + 1 : h; }

    var top = 0;
    for (i = 1; i < BINS; i++) if (sm(i) > sm(top)) top = i;

    // (Nearly) monochrome wallpaper: use a soft neutral accent tinted by the average hue
    if (sm(top) <= 0 || colorW < 0.02 * n) {
      return { accent: hslToRgb(avg[0], 0.1, 0.82), accent2: hslToRgb(avg[0], 0.1, 0.68),
               tint: tint, base: base, overlay: overlay };
    }

    var a1 = agg(top), h1 = hueOf(a1), s1 = a1.s / a1.w;

    // Second accent: the strongest hue that is clearly different from the first
    var second = -1, secondV = 0;
    for (i = 0; i < BINS; i++) {
      var hd = Math.abs((i + 0.5) / BINS - h1);
      hd = Math.min(hd, 1 - hd);
      if (hd >= 0.14 && sm(i) >= 0.25 * sm(top) && sm(i) > secondV) { second = i; secondV = sm(i); }
    }
    var h2, s2;
    if (second >= 0) { var a2 = agg(second); h2 = hueOf(a2); s2 = a2.s / a2.w; }
    else { h2 = (h1 + 0.08) % 1; s2 = s1; }

    return {
      accent: hslToRgb(h1, clamp(0.5 + s1 * 0.8, 0.62, 0.92), 0.68),
      accent2: hslToRgb(h2, clamp(0.45 + s2 * 0.8, 0.55, 0.88), 0.62),
      tint: tint, base: base, overlay: overlay
    };
  }

  function extractPalette(img) {
    var max = 64, w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error("empty image");
    var k = max / Math.max(w, h);
    var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    var canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cw, ch);
    // Throws a SecurityError when the image is a local file (file://) — caught by the caller
    return paletteFromPixels(ctx.getImageData(0, 0, cw, ch).data);
  }

  function validPalette(p) {
    if (!p) return null;
    var ok = ["accent", "accent2", "tint", "base"].every(function (k) {
      return Array.isArray(p[k]) && p[k].length === 3 && p[k].every(function (v) { return typeof v === "number"; });
    });
    return ok && typeof p.overlay === "number" ? p : null;
  }

  function applyPalette(p, source) {
    var st = document.documentElement.style;
    st.setProperty("--accent-rgb", p.accent.join(" "));
    st.setProperty("--accent-2-rgb", p.accent2.join(" "));
    st.setProperty("--tint-rgb", p.tint.join(" "));
    st.setProperty("--base-rgb", p.base.join(" "));
    st.setProperty("--overlay", String(p.overlay));
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "rgb(" + p.base.join(",") + ")");
    // Handy when debugging: "runtime" (read from the image), "build" (from build.py) or "default"
    document.documentElement.setAttribute("data-theme-source", source);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = "async";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("cannot load " + src)); };
      img.src = src;
    });
  }

  async function findWallpaper() {
    var list = [];
    if (DATA.wallpaper) list.push(DATA.wallpaper);
    WALLPAPER_CANDIDATES.forEach(function (s) { if (list.indexOf(s) === -1) list.push(s); });
    for (var i = 0; i < list.length; i++) {
      try { return { src: list[i], img: await loadImage(list[i]) }; } catch (e) { /* try next */ }
    }
    return null;
  }

  async function initTheme() {
    var rootStyle = document.documentElement.style;
    rootStyle.setProperty("--bg-pos", CFG.wallpaper.position);
    rootStyle.setProperty("--bg-blur", (Number(CFG.wallpaper.blur) || 0) + "px");

    var found = await findWallpaper();
    var palette = null, source = "default";

    if (found) {
      var bg = $("bg-img");
      bg.style.backgroundImage = 'url("' + found.src + '")';
      requestAnimationFrame(function () { bg.classList.add("is-ready"); });

      try {
        palette = extractPalette(found.img);
        if (palette) source = "runtime";
      } catch (e) {
        palette = null;   // file:// → canvas is tainted, fall back to the palette baked by build.py
      }
      if (!palette && DATA.wallpaper === found.src) {
        palette = validPalette(DATA.palette);
        if (palette) source = "build";
      }
    }
    applyPalette(palette || DEFAULT_PALETTE, palette ? source : "default");
  }

  /* ------------------------------------------------------------- 3. counters */
  var LOCAL = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
  var BOT = !!navigator.webdriver || /bot|crawl|spider|preview|headless/i.test(navigator.userAgent);
  // Local previews only READ counters (so testing on your own phone/PC does not inflate them)
  var COUNT_HERE = !LOCAL || !!CFG.views.countLocalPreview;

  /* 999 -> "999", 1000 -> "1k", 1599 -> "1.5k", 1600 -> "1.6k", 1000000 -> "1M" (rounded down: never overstates) */
  function formatCount(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    if (n < 1000) return String(n);
    var units = [[1e9, "B"], [1e6, "M"], [1e3, "k"]];
    for (var i = 0; i < units.length; i++) {
      if (n >= units[i][0]) return String(Math.floor(n / (units[i][0] / 10)) / 10) + units[i][1];
    }
    return String(n);
  }

  // mode: "get" (read) or "hit" (+1, creates the counter when missing). c = { host, namespace, key }
  async function counterRequest(mode, c) {
    var url = c.host.replace(/\/+$/, "") + "/" + mode + "/" +
      encodeURIComponent(c.namespace) + "/" + encodeURIComponent(c.key) + "?t=" + Date.now();
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 7000);
    try {
      var res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) { var err = new Error("HTTP " + res.status); err.status = res.status; throw err; }
      var json = await res.json();
      var n = Number(json && (json.value !== undefined ? json.value : json.count));
      if (!isFinite(n)) throw new Error("Unexpected counter response");
      return n;
    } finally { clearTimeout(timer); }
  }

  /* --- views --- */
  function initViews() {
    var pill = $("views"), out = $("views-count");
    var v = CFG.views;
    if (!pill || !out) return;
    if (!v.enabled) { pill.hidden = true; return; }

    var ID = v.namespace + "/" + v.key;
    var CACHE_KEY = "smashh:views:" + ID;
    var LAST_KEY = "smashh:lastHit:" + ID;
    var shown = null;

    function render(n) {
      var from = shown === null ? 0 : shown;
      shown = n;
      if (reduceMotion || from === n) { out.textContent = formatCount(n); return; }
      var start = performance.now(), dur = 700;
      (function step(now) {
        var t = Math.min(1, (now - start) / dur);
        out.textContent = formatCount(Math.round(from + (n - from) * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(step);
      })(start);
    }

    // Show the last known number instantly, then refresh it
    var cached = parseInt(store.get(CACHE_KEY), 10);
    if (isFinite(cached)) { out.textContent = formatCount(cached); shown = cached; }

    var last = Number(store.get(LAST_KEY)) || 0;
    var due = Date.now() - last > v.countEveryHours * 3600 * 1000;
    var mode = (!BOT && due && COUNT_HERE) ? "hit" : "get";

    (async function load() {
      try {
        var n;
        try {
          n = await counterRequest(mode, v);
          if (mode === "hit") store.set(LAST_KEY, Date.now());
        } catch (e) {
          if (mode === "get" && e.status === 404) n = 0;            // counter not created yet
          else if (mode === "hit") n = await counterRequest("get", v);   // couldn't count, at least show the number
          else throw e;
        }
        store.set(CACHE_KEY, n);
        render(n);
      } catch (e) {
        if (shown === null) out.textContent = "\u2014";
        if (window.console) console.warn("[views] counter unavailable:", e && e.message);
      }
    })();
  }

  /* --- hearts: one-way, per-browser --- */
  function initHearts() {
    var btn = $("heart"), out = $("heart-count");
    var h = CFG.hearts;
    if (!btn || !out) return null;
    if (!h.enabled) { btn.hidden = true; return null; }

    var ID = h.namespace + "/" + h.key;
    var CACHE_KEY = "smashh:hearts:" + ID;
    var LIKED_KEY = "smashh:liked:" + ID;
    var count = null, liked = store.get(LIKED_KEY) === "1", busy = false;

    var cached = parseInt(store.get(CACHE_KEY), 10);
    if (isFinite(cached)) count = cached;

    function paint() {
      out.textContent = count === null ? "\u2014" : formatCount(count);
      btn.classList.toggle("is-liked", liked);
      btn.setAttribute("aria-pressed", liked ? "true" : "false");
      btn.setAttribute("aria-label", (liked ? "Heart sent" : "Send a heart") +
        (count === null ? "" : ", " + formatCount(count) + " in total"));
    }
    paint();

    (async function load() {
      try {
        var n;
        try { n = await counterRequest("get", h); }
        catch (e) { if (e.status === 404) n = 0; else throw e; }   // not created until the first heart
        count = n;
        store.set(CACHE_KEY, n);
        paint();
      } catch (e) {
        if (window.console) console.warn("[hearts] counter unavailable:", e && e.message);
      }
    })();

    function pop() {
      btn.classList.remove("is-pop");
      void btn.offsetWidth;                // restart the CSS animation
      btn.classList.add("is-pop");
      if (reduceMotion) return;
      var box = btn.querySelector(".heart__burst");
      if (!box) return;
      for (var i = 0; i < 8; i++) {
        var a = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
        var d = 24 + Math.random() * 12;
        var el = document.createElement("i");
        el.style.setProperty("--dx", (Math.cos(a) * d).toFixed(1) + "px");
        el.style.setProperty("--dy", (Math.sin(a) * d).toFixed(1) + "px");
        box.appendChild(el);
        setTimeout((function (node) { return function () { if (node.parentNode) node.parentNode.removeChild(node); }; })(el), 800);
      }
    }

    // Resolves to "sent" | "already" | "preview" | "busy" | "error"
    async function like(quiet) {
      if (liked) {
        pop();
        if (!quiet) toast("Heart already sent, thank you");
        return "already";
      }
      if (busy) return "busy";
      busy = true;
      var prev = count;
      liked = true;
      count = (count === null ? 0 : count) + 1;   // optimistic: feels instant
      paint();
      pop();

      if (!COUNT_HERE) {                            // local preview: show it working, don't touch the shared counter
        liked = false;
        setTimeout(function () { count = prev; paint(); }, 1600);
        if (!quiet) toast("Preview mode: this heart is not counted");
        busy = false;
        return "preview";
      }
      try {
        var n = await counterRequest("hit", h);
        count = n;
        store.set(CACHE_KEY, n);
        store.set(LIKED_KEY, "1");
        paint();
        busy = false;
        return "sent";
      } catch (e) {
        liked = false;
        count = prev;
        paint();
        busy = false;
        if (!quiet) toast("Couldn't send the heart, try again");
        if (window.console) console.warn("[hearts] failed:", e && e.message);
        return "error";
      }
    }

    btn.addEventListener("click", function () { like(false); });
    return { like: like };
  }

  /* ---------------------------------------------- 3b. status line + local time */
  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function offsetLabel(h) {
    var sign = h < 0 ? "-" : "+", a = Math.abs(h);
    var hh = Math.floor(a), mm = Math.round((a - hh) * 60);
    return "UTC" + sign + hh + (mm ? ":" + pad2(mm) : "");
  }

  function ownerTime() {
    var off = Number(CFG.time.utcOffsetHours);
    if (!isFinite(off)) off = 0;
    var d = new Date(Date.now() + off * 3600 * 1000);   // shift, then read the UTC fields
    return { hm: pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()), tz: offsetLabel(off) };
  }

  function initStatus() {
    var root = $("status");
    if (!root) return;
    var s = CFG.status, t = CFG.time;
    var textEl = $("status-text"), clock = $("status-clock"), timeEl = $("local-time"), tzEl = $("local-tz");
    var dot = root.querySelector(".status__dot");

    if (!s.enabled && !t.enabled) { root.hidden = true; return; }

    if (s.enabled) { if (s.text) textEl.textContent = s.text; }
    else { textEl.hidden = true; if (dot) dot.hidden = true; }

    if (!t.enabled) { clock.hidden = true; return; }

    (function tick() {
      var now = ownerTime();
      timeEl.textContent = now.hm;
      timeEl.setAttribute("datetime", now.hm);
      tzEl.textContent = now.tz;
      setTimeout(tick, 60000 - (Date.now() % 60000) + 50);   // re-sync to the next minute
    })();
  }

  /* --------------------------------------------------------------- 4. player */
  function initPlayer() {
    var root = $("player");
    var tracks = (DATA.tracks || []).filter(function (t) { return t && t.src; });

    var titleBox = $("track-title"), titleIn = $("track-title-inner");
    var nav = $("track-nav"), prev = $("prev"), next = $("next");
    var cur = $("t-cur"), dur = $("t-dur"), seek = $("seek"), play = $("play"), hint = $("player-hint");
    if (!root) return;

    // Scroll long titles instead of cutting them
    function fitTitle() {
      titleBox.classList.remove("is-marquee");
      titleBox.style.removeProperty("--shift");
      // getBoundingClientRect works for the inline <span>; its scrollWidth is always 0
      var overflow = Math.ceil(titleIn.getBoundingClientRect().width) - titleBox.clientWidth;
      if (overflow > 2 && !reduceMotion) {
        titleBox.style.setProperty("--shift", -(overflow + 24) + "px");
        titleBox.style.setProperty("--dur", Math.max(8, overflow / 16) + "s");
        titleBox.classList.add("is-marquee");
      }
    }
    var resizeTimer = null;
    window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitTitle, 150); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);

    if (!tracks.length) {
      titleIn.textContent = "No music yet";
      hint.textContent = "Put audio files into assets/music/ and run build.py";
      hint.hidden = false;
      fitTitle();
      return null;
    }

    var audio = new Audio();
    audio.preload = "metadata";
    var idx = 0, pointerDown = false;

    function fmt(t) {
      if (!isFinite(t) || t < 0) return "--:--";
      return pad(Math.floor(t / 60)) + ":" + pad(Math.floor(t % 60));
    }
    function setFill(pct) { seek.style.setProperty("--p", pct + "%"); }
    function ratio() { return isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0; }

    function syncTime() {
      cur.textContent = fmt(audio.currentTime);
      if (!pointerDown) { seek.value = Math.round(ratio() * 1000); setFill(ratio() * 100); }
    }

    function mediaSession() {
      if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: tracks[idx].title || "" });
        navigator.mediaSession.setActionHandler("play", function () { audio.play(); });
        navigator.mediaSession.setActionHandler("pause", function () { audio.pause(); });
        navigator.mediaSession.setActionHandler("previoustrack", tracks.length > 1 ? function () { load(idx - 1, true); } : null);
        navigator.mediaSession.setActionHandler("nexttrack", tracks.length > 1 ? function () { load(idx + 1, true); } : null);
      } catch (e) { /* unsupported action */ }
    }

    function load(i, autoplay) {
      idx = (i + tracks.length) % tracks.length;
      var t = tracks[idx];
      audio.src = t.src;
      titleIn.textContent = t.title || "Track " + (idx + 1);
      fitTitle();
      cur.textContent = "00:00";
      dur.textContent = "--:--";
      seek.value = 0;
      setFill(0);
      mediaSession();
      if (autoplay) {
        var p = audio.play();
        if (p && p.catch) p.catch(function () { /* needs a user gesture */ });
      }
    }

    audio.addEventListener("loadedmetadata", function () {
      dur.textContent = fmt(audio.duration);
      seek.disabled = false;
      play.disabled = false;
    });
    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("durationchange", function () { dur.textContent = fmt(audio.duration); });
    audio.addEventListener("play", function () { root.classList.add("is-playing"); play.setAttribute("aria-label", "Pause"); });
    audio.addEventListener("pause", function () { root.classList.remove("is-playing"); play.setAttribute("aria-label", "Play"); });
    audio.addEventListener("ended", function () {
      if (tracks.length > 1) load(idx + 1, true);
      else { audio.currentTime = 0; syncTime(); }
    });
    audio.addEventListener("error", function () {
      toast("Can't play " + (tracks[idx].title || "this file"));
      play.disabled = true;
      seek.disabled = true;
    });

    play.addEventListener("click", function () {
      if (audio.paused) {
        var p = audio.play();
        if (p && p.catch) p.catch(function () { toast("Can't start playback"); });
      } else { audio.pause(); }
    });

    seek.addEventListener("pointerdown", function () { pointerDown = true; });
    ["pointerup", "pointercancel", "blur"].forEach(function (ev) {
      seek.addEventListener(ev, function () { pointerDown = false; });
    });
    seek.addEventListener("input", function () {
      if (!isFinite(audio.duration)) return;
      audio.currentTime = (seek.value / 1000) * audio.duration;
      cur.textContent = fmt(audio.currentTime);
      setFill(seek.value / 10);
    });

    if (tracks.length > 1) {
      nav.hidden = false;
      prev.addEventListener("click", function () { load(idx - 1, !audio.paused); });
      next.addEventListener("click", function () { load(idx + 1, !audio.paused); });
    }

    load(0, false);

    return {
      play: function () {
        var p = audio.play();
        var title = tracks[idx].title || "";
        return p && p.then ? p.then(function () { return title; }) : Promise.resolve(title);
      },
      pause: function () { audio.pause(); }
    };
  }

  /* -------------------------------------------------------------- 5. socials */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));   // file:// is not a secure context
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function initSocials() {
    var btn = $("discord");
    if (!btn) return;
    var user = CFG.discord.username || btn.getAttribute("data-copy") || "";
    var id = String(CFG.discord.userId || "").replace(/\D/g, "");
    btn.setAttribute("aria-label", id ? "Discord profile" : "Discord: " + user + " (tap to copy)");
    btn.addEventListener("click", function () {
      if (id) { window.open("https://discord.com/users/" + id, "_blank", "noopener,noreferrer"); return; }
      copyText(user).then(function (ok) {
        toast(ok ? "Discord username copied: " + user : "Discord: " + user);
      });
    });
  }

  /* ----------------------------------------------------------- 6. preloader */
  function initPreloader() {
    var root = $("preload");
    if (!root) return;
    if (!document.documentElement.classList.contains("preload-on")) {   // decided in <head>
      if (root.parentNode) root.parentNode.removeChild(root);
      return;
    }
    var P = CFG.preloader;
    var textEl = $("preload-text"), hello = $("preload-hello"), skip = $("preload-skip");
    $("preload-hello-text").textContent = P.hello || "Hello!";

    var line = String(P.line || ""), i = 0, done = false, timers = [];
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }

    function finish() {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      document.removeEventListener("keydown", onKey);
      root.classList.add("is-leaving");                       // fade-out (opacity 0)
      setTimeout(function () {                                // then display: none
        document.documentElement.classList.remove("preload-on");
        if (root.parentNode) root.parentNode.removeChild(root);
      }, 650);
    }
    function onKey(e) { if (e.key === "Escape" || e.key === "Enter") finish(); }

    var step = Math.max(18, Math.min(45, 1000 / Math.max(1, line.length)));
    (function type() {
      if (done) return;
      if (i < line.length) {
        i++;
        textEl.textContent = line.slice(0, i);
        later(type, step + Math.random() * 20);
      } else {
        hello.classList.add("is-on");
      }
    })();

    later(finish, clamp(Number(P.holdMs) || 2000, 800, 8000));
    skip.addEventListener("click", finish);
    document.addEventListener("keydown", onKey);
  }

  /* ---------------------------------------------- 7. Discord activity (Lanyard) */
  function initActivity() {
    var root = $("activity");
    if (!root) return;
    var A = CFG.activity;
    var uid = String(A.userId || CFG.discord.userId || "").replace(/\D/g, "");
    if (!A.enabled || !uid) { root.hidden = true; return; }

    var E = {
      avatar: $("act-avatar"), dot: $("act-dot"), name: $("act-name"), state: $("act-state"), custom: $("act-custom"),
      main: $("act-main"), art: $("act-art-img"), artFb: $("act-art-fb"), kind: $("act-kind"), title: $("act-title"),
      sub: $("act-sub"), time: $("act-time"), bar: $("act-bar"), fill: $("act-bar-fill")
    };
    var presence = null, ws = null, wsFails = 0, hbTimer = null, pollTimer = null, stopped = false;

    function defaultAvatar() {
      var idx = 0;
      try { if (window.BigInt) idx = Number((window.BigInt(uid) / window.BigInt(4194304)) % window.BigInt(6)); } catch (e) { idx = 0; }
      return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
    }
    function avatarUrl(u) {
      if (u && u.avatar) {
        var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
        return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=128";
      }
      return defaultAvatar();
    }
    function assetUrl(a) {
      var as = (a && a.assets) || {};
      var img = String(as.large_image || as.small_image || "");
      if (!img) return "";
      if (img.indexOf("mp:external/") === 0) return "https://media.discordapp.net/external/" + img.slice(12);
      if (img.indexOf("mp:") === 0) return "https://media.discordapp.net/" + img.slice(3);
      if (img.indexOf("spotify:") === 0) return "https://i.scdn.co/image/" + img.slice(8);
      if (img.indexOf("youtube:") === 0) return "https://i.ytimg.com/vi/" + img.slice(8) + "/hqdefault.jpg";
      if (/^\d+$/.test(img) && a.application_id) return "https://cdn.discordapp.com/app-assets/" + a.application_id + "/" + img + ".png";
      return "";
    }
    function stateLabel(s) { return { online: "online", idle: "idle", dnd: "do not disturb" }[s] || "offline"; }
    function elapsedText(ms) {
      var m = Math.floor(ms / 60000);
      if (m < 1) return "just started";
      if (m < 60) return "for " + m + " min";
      var h = Math.floor(m / 60), r = m % 60;
      return "for " + h + (h === 1 ? " hour" : " hours") + (r && h < 5 ? " " + r + " min" : "");
    }
    function setArt(url) {
      if (url && /^https:\/\//.test(url)) {
        E.art.onerror = function () { E.art.hidden = true; E.artFb.style.display = ""; };
        E.art.onload = function () { E.art.hidden = false; E.artFb.style.display = "none"; };
        E.art.src = url;
      } else {
        E.art.hidden = true; E.art.removeAttribute("src"); E.artFb.style.display = "";
      }
    }

    function pickMain(d) {
      if (d.listening_to_spotify && d.spotify) return { spotify: d.spotify };
      var acts = Array.isArray(d.activities) ? d.activities : [];
      for (var i = 0; i < acts.length; i++) if (acts[i].type !== 4) return { activity: acts[i] };
      return null;
    }
    function customOf(d) {
      var acts = Array.isArray(d.activities) ? d.activities : [];
      for (var i = 0; i < acts.length; i++) {
        if (acts[i].type === 4) {
          var em = acts[i].emoji && !acts[i].emoji.id ? acts[i].emoji.name : "";   // unicode emoji only
          var txt = ((em ? em + " " : "") + (acts[i].state || "")).trim();
          return txt;
        }
      }
      return "";
    }

    function render() {
      var d = presence;
      if (!d || !d.discord_user) { root.hidden = true; return; }
      var status = d.discord_status || "offline";
      var main = pickMain(d);
      if (A.hideWhenOffline && status === "offline" && !main) { root.hidden = true; return; }
      root.hidden = false;

      var u = d.discord_user;
      E.avatar.src = avatarUrl(u);
      E.dot.setAttribute("data-status", status);
      E.name.textContent = u.global_name || u.display_name || u.username || "Discord";
      E.state.textContent = stateLabel(status);

      var custom = customOf(d);
      E.custom.hidden = !custom;
      E.custom.textContent = custom;

      if (!main) { E.main.hidden = true; return; }
      E.main.hidden = false;

      if (main.spotify) {
        var sp = main.spotify;
        E.kind.textContent = "Listening to Spotify";
        E.title.textContent = sp.song || "";
        E.sub.textContent = sp.artist ? String(sp.artist).replace(/;\s*/g, ", ") : "";
        E.sub.hidden = !E.sub.textContent;
        E.time.hidden = true;
        E.bar.hidden = false;
        setArt(sp.album_art_url);
      } else {
        var a = main.activity;
        E.kind.textContent = { 0: "Playing", 1: "Streaming", 2: "Listening to", 3: "Watching", 5: "Competing in" }[a.type] || "Activity";
        E.title.textContent = a.name || "";
        var sub = [a.details, a.state].filter(Boolean).join(" \u00b7 ");
        E.sub.textContent = sub;
        E.sub.hidden = !sub;
        E.bar.hidden = true;
        E.time.hidden = !(a.timestamps && a.timestamps.start);
        setArt(assetUrl(a));
      }
      tick();
    }

    // Live counters: elapsed play time and the Spotify progress bar
    function tick() {
      if (!presence || root.hidden || document.hidden) return;
      var main = pickMain(presence);
      if (!main) return;
      if (main.spotify) {
        var t = main.spotify.timestamps || {};
        if (t.start && t.end && t.end > t.start) {
          E.fill.style.width = clamp((Date.now() - t.start) / (t.end - t.start) * 100, 0, 100).toFixed(1) + "%";
        }
      } else if (main.activity && main.activity.timestamps && main.activity.timestamps.start) {
        E.time.textContent = elapsedText(Date.now() - main.activity.timestamps.start);
      }
    }
    setInterval(tick, 1000);

    function setPresence(d) {
      if (!d || !d.discord_user) {
        if (window.console) console.warn("[activity] Lanyard is not monitoring this ID: join discord.gg/lanyard with that account");
        presence = null; root.hidden = true;
        return;
      }
      presence = d;
      render();
    }

    async function fetchOnce() {
      var res = await fetch("https://api.lanyard.rest/v1/users/" + uid);
      if (res.status === 404) return null;
      var json = await res.json();
      return json && json.success ? json.data : null;
    }
    function startPolling() {
      if (pollTimer || stopped) return;
      pollTimer = setInterval(function () {
        if (document.hidden) return;
        fetchOnce().then(function (d) { if (d) setPresence(d); }, function () { /* keep the last state */ });
      }, 30000);
    }
    function connect() {
      if (stopped) return;
      try { ws = new WebSocket("wss://api.lanyard.rest/socket"); } catch (e) { startPolling(); return; }
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.op === 1) {
          var iv = (m.d && m.d.heartbeat_interval) || 30000;
          ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: uid } }));
          clearInterval(hbTimer);
          hbTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ op: 3 })); }, iv);
        } else if (m.op === 0 && (m.t === "INIT_STATE" || m.t === "PRESENCE_UPDATE")) {
          wsFails = 0;
          setPresence(m.d);
        }
      };
      ws.onclose = function () {
        clearInterval(hbTimer);
        wsFails++;
        if (wsFails >= 3) startPolling();
        else setTimeout(connect, Math.min(30000, 2000 * wsFails));
      };
      ws.onerror = function () { try { ws.close(); } catch (e) { /* already closed */ } };
    }

    (async function boot() {
      try {
        var d = await fetchOnce();                 // instant first paint over plain HTTPS
        if (!d) { setPresence(null); stopped = true; return; }
        setPresence(d);
      } catch (e) {
        if (window.console) console.warn("[activity] Lanyard unreachable:", e && e.message);
      }
      connect();                                   // then live updates over WebSocket
    })();
  }

  /* -------------------------------------------- 8. fullscreen terminal + secret */
  var BANNER_LARGE = ["  ____  __  __     _     ____  _   _ _   _ ", " / ___||  \\/  |   / \\   / ___|| | | | | | |", " \\___ \\| |\\/| |  / _ \\  \\___ \\| |_| | |_| |", "  ___) | |  | | / ___ \\  ___) |  _  |  _  |", " |____/|_|  |_|/_/   \\_\\|____/|_| |_|_| |_|"];
  var BANNER_SMALL = [" ___ __  __  _   ___ _  _ _  _ ", "/ __|  \\/  |/_\\ / __| || | || |", "\\__ \\ |\\/| / _ \\\\__ \\ __ | __ |", "|___/_|  _/_/ \\_\\___/_||_|_||_|"];

  function initTerminal(api) {
    var trigger = $("term-open"), tfs = $("tfs"), frame = $("tfs-frame");
    if (!trigger || !tfs || !frame) return;
    var T = CFG.terminal;
    if (!T.enabled) { trigger.hidden = true; return; }

    var out = $("term-out"), form = $("term-form"), input = $("term-input");
    var promptEl = $("term-prompt"), chipsEl = $("term-chips"), closeBtn = $("tfs-close"), fx = $("tfs-fx");
    var pageEl = document.querySelector(".page");
    var PROMPT = "[" + T.user + "@" + T.host + " ~]$";
    var MAX_ROWS = 120;
    var isOpen = false, welcomed = false, history = [], hIdx = 0;
    var closeTimer = null, openRect = null, openW = 0, openH = 0;
    var COARSE = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    var fxRunning = false, fxAbort = false;

    $("trigger-prompt").textContent = PROMPT;
    $("trigger-cmd").textContent = T.trigger || "whoami";
    $("trigger-hint").hidden = !T.showHint;
    promptEl.textContent = PROMPT;
    $("tfs-title").textContent = T.user + "@" + T.host + ": ~";
    trigger.setAttribute("aria-expanded", "false");

    /* ---- output helpers: DOM nodes + textContent only, nothing typed is ever parsed as HTML ---- */
    function add(el) {
      out.appendChild(el);
      while (out.childNodes.length > MAX_ROWS) out.removeChild(out.firstChild);
      out.scrollTop = out.scrollHeight;
      return el;
    }
    function row(cls, text) {
      var d = document.createElement("div");
      d.className = "term__row" + (cls ? " " + cls : "");
      if (text !== undefined) d.textContent = text;
      return d;
    }
    function print(text, cls) { return add(row("term__res" + (cls ? " " + cls : ""), text)); }
    function echo(text) {
      var d = row();
      var p = document.createElement("span"); p.className = "term__prompt"; p.textContent = PROMPT;
      var c = document.createElement("span"); c.textContent = " " + text;
      d.appendChild(p); d.appendChild(c);
      add(d);
    }
    function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }
    function toLines(v) { return Array.isArray(v) ? v.map(String) : (v ? [String(v)] : []); }

    function table(rows) {
      rows.forEach(function (r) {
        var url = safeUrl(r[2]);
        var el = document.createElement(url ? "a" : "div");
        el.className = "term__row term__kv" + (url ? " term__link" : "");
        if (url) { el.href = url; el.target = "_blank"; el.rel = "noopener noreferrer"; }
        var k = document.createElement("span"); k.className = "term__key"; k.textContent = r[0];
        var v = document.createElement("span"); v.textContent = r[1];
        el.appendChild(k); el.appendChild(v);
        add(el);
      });
    }

    function pulseSocials() {
      var s = document.querySelector(".socials");
      if (!s) return;
      s.classList.remove("is-pulsing");
      void s.offsetWidth;
      s.classList.add("is-pulsing");
      setTimeout(function () { s.classList.remove("is-pulsing"); }, 4200);
    }

    function linksCmd() {
      var list = Array.isArray(T.links) ? T.links : [];
      if (!list.length) { print("nothing here yet"); return; }
      table(list.map(function (l) { return [String(l.name || ""), String(l.label || l.url || ""), l.url]; }));

      // The site's own icons sit behind the terminal, so the pulsing icon row is also printed here
      var icons = document.createElement("div");
      icons.className = "term__icons";
      var sources = document.querySelectorAll("[data-social]");
      list.forEach(function (l, i) {
        var url = safeUrl(l.url), name = String(l.name || "").toLowerCase(), glyph = null;
        for (var k = 0; k < sources.length; k++) {
          if (sources[k].getAttribute("data-social") === name) {
            glyph = sources[k].querySelector("svg") || sources[k].querySelector(".wordmark");
            break;
          }
        }
        if (!url || !glyph) return;
        var a = document.createElement("a");
        a.className = "term__icon";
        a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
        a.setAttribute("aria-label", name);
        a.style.animationDelay = (i * 0.12) + "s";
        a.appendChild(glyph.cloneNode(true));           // static markup from this very page
        icons.appendChild(a);
      });
      if (icons.childNodes.length) add(icons);
      pulseSocials();                                    // and the real ones, visible again after `exit`
    }

    /* ---------------------------------------------------------------- open / close */
    function updateViewport() {
      var vv = window.visualViewport;
      if (!vv) return;
      tfs.style.setProperty("--vv-h", vv.height + "px");     // keeps the input above the on-screen keyboard
      tfs.style.setProperty("--vv-top", vv.offsetTop + "px");
      out.scrollTop = out.scrollHeight;
    }
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () { if (isOpen) updateViewport(); });
      window.visualViewport.addEventListener("scroll", function () { if (isOpen) updateViewport(); });
    }

    // The collapsed box sits 1px inside the trigger, so the trigger's own border stays visible as a rim.
    // No clamping: the target must be exact, otherwise the terminal folds into the wrong rectangle.
    function clipFor(r) {
      var tr = tfs.getBoundingClientRect();
      var top = r.top + 1 - tr.top, left = r.left + 1 - tr.left;
      var right = tr.right - r.right + 1, bottom = tr.bottom - r.bottom + 1;
      return "inset(" + top.toFixed(1) + "px " + right.toFixed(1) + "px " + bottom.toFixed(1) + "px " + left.toFixed(1) + "px round 15px)";
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      clearTimeout(closeTimer);
      tfs.classList.remove("is-closing", "is-fast", "is-folding");
      frame.style.opacity = "";
      updateViewport();
      openRect = trigger.getBoundingClientRect();           // measured at rest, before the page dissolves
      openW = window.innerWidth;
      openH = window.innerHeight;                           // full height, keyboard not up yet
      tfs.hidden = false;

      if (reduceMotion) {
        frame.style.clipPath = "none";
        frame.style.opacity = "0";
        void frame.offsetWidth;
        frame.style.opacity = "1";
      } else {
        frame.style.transition = "none";
        frame.style.clipPath = clipFor(openRect);           // start exactly on top of the trigger line
        void frame.offsetWidth;
        frame.style.transition = "";
      }

      document.body.classList.add("is-terminal");           // every other block: opacity 0 + scale
      document.documentElement.classList.add("term-open");
      if (pageEl) pageEl.setAttribute("inert", "");
      trigger.setAttribute("aria-expanded", "true");

      requestAnimationFrame(function () {
        tfs.classList.add("is-open");
        if (!reduceMotion) frame.style.clipPath = "inset(0px 0px 0px 0px round 0px)";   // grow to 100%
      });

      input.focus({ preventScroll: true });                 // inside the tap: opens the keyboard on phones
      if (!welcomed) { welcomed = true; run(T.trigger || "whoami"); }
    }

    function finishClose() {
      tfs.hidden = true;
      tfs.classList.remove("is-open", "is-closing", "is-fast", "is-folding");
      frame.style.opacity = "";
      frame.style.clipPath = "";
      document.documentElement.classList.remove("term-open");
      trigger.focus({ preventScroll: true });
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      if (fxRunning) fxAbort = true;
      input.blur();                                          // hides the on-screen keyboard
      // Back to the full-size box at once: the collapse target is measured against it
      tfs.style.removeProperty("--vv-h");
      tfs.style.removeProperty("--vv-top");
      clearTimeout(closeTimer);

      var canShrink = !reduceMotion && !!openRect && Math.abs(window.innerWidth - openW) < 3;
      tfs.classList.add("is-closing");
      tfs.classList.toggle("is-fast", !canShrink);
      tfs.classList.remove("is-open");                       // the text fades out first
      document.body.classList.remove("is-terminal");         // the site comes back underneath
      if (pageEl) pageEl.removeAttribute("inert");
      trigger.setAttribute("aria-expanded", "false");

      function shrink() {
        if (isOpen) return;                                  // reopened in the meantime
        if (canShrink) {
          tfs.classList.add("is-folding");
          frame.style.clipPath = clipFor(openRect);          // the terminal folds back into its line...
          closeTimer = setTimeout(finishClose, 760);         // ...and cross-fades into the identical trigger
        } else {
          closeTimer = setTimeout(finishClose, 300);         // plain fade (reduced motion / rotated screen)
        }
      }
      // Some browsers shrink the whole layout while the keyboard is up: wait until it is gone
      if (canShrink && window.innerHeight < openH - 80) {
        var tries = 0;
        (function wait() {
          if (isOpen) return;
          if (window.innerHeight >= openH - 40 || ++tries > 12) shrink();
          else closeTimer = setTimeout(wait, 40);
        })();
      } else {
        shrink();
      }
    }

    /* ---------------------------------------------------------------- commands */
    var commands = {
      help: function () {
        table([
          ["help", "list commands"], ["whoami", "a few words about me"], ["links", "where to find me (also: socials)"],
          ["time", "my local time"], ["heart", "send a heart"], ["play", "play the music"], ["pause", "pause the music"],
          ["clear", "clean the screen"], ["exit", "back to the site (also: close)"]
        ]);
      },
      whoami: function () {
        var l = toLines(T.whoami);
        if (!l.length) l = [T.user];
        l.forEach(function (x) { print(x); });
      },
      links: linksCmd,
      time: function () { var t = ownerTime(); print(t.hm + " (" + t.tz + ")"); },
      heart: function () {
        if (!api.hearts) { print("hearts are switched off", "term__err"); return; }
        return api.hearts.like(true).then(function (r) {
          var msg = { sent: "heart sent, thank you", already: "already sent, thank you",
                      preview: "preview mode: not counted", busy: "one moment...", error: "could not send the heart" }[r];
          print(msg, r === "error" ? "term__err" : "");
        });
      },
      play: function () {
        if (!api.player) { print("no music loaded", "term__err"); return; }
        return api.player.play().then(
          function (title) { print("playing: " + (title || "track")); },
          function () { print("the browser blocked playback, use the play button", "term__err"); }
        );
      },
      pause: function () {
        if (!api.player) { print("no music loaded", "term__err"); return; }
        api.player.pause();
        print("paused");
      },
      clear: function () { out.textContent = ""; },          // back to the bare prompt line
      exit: close,
      secret: function () { return runSecret(); },
      sudo: function () { print(T.user + " is not in the sudoers file. This incident will be reported.", "term__err"); }
    };
    commands.about = commands.whoami;
    commands.socials = commands.links;
    commands.close = commands.exit;

    function exec(name) {
      if (Object.prototype.hasOwnProperty.call(commands, name)) return commands[name]();
      print("bash: " + name.slice(0, 40) + ": command not found", "term__err");
    }

    function run(raw) {
      if (fxRunning) return;
      var text = String(raw), clean = text.trim();
      echo(text);
      if (!clean) return;
      if (history[history.length - 1] !== clean) history.push(clean);
      hIdx = history.length;
      return exec(clean.split(/\s+/)[0].toLowerCase());
    }

    /* ---------------------------------------------------- secret: ASCII glitch + explosion
       A port of smashh.py. Same particles, same six stages, same timings (ms = seconds * 1000). */
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    async function wait(ms) {
      var end = performance.now() + ms / (Number(T.secretSpeed) || 1);
      while (performance.now() < end) {
        if (fxAbort) throw new Error("abort");
        await sleep(Math.min(60, Math.max(1, end - performance.now())));
      }
      if (fxAbort) throw new Error("abort");
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function glyphFits(ch, cellW, cs) {                      // fallback fonts can break the grid: check first
      try {
        var ctx = document.createElement("canvas").getContext("2d");
        ctx.font = cs.fontSize + " " + cs.fontFamily;
        return Math.abs(ctx.measureText(ch).width - cellW) < cellW * 0.06;
      } catch (e) { return false; }
    }

    async function playExplosion() {
      var GREEN = "#00ff00", BRIGHT = "#5fff87", DARK = "#005f00";   // 256-color 46 / 84 / 22 from the script
      fx.hidden = false;
      fx.textContent = "";
      var W = fx.clientWidth, H = fx.clientHeight;
      fx.style.fontSize = (W < 420 ? 13 : 15) + "px";
      var cs = getComputedStyle(fx);
      var probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
      probe.textContent = "MMMMMMMMMM";
      fx.appendChild(probe);
      var cellW = probe.getBoundingClientRect().width / 10;
      fx.removeChild(probe);
      var cellH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;

      var cols = Math.max(20, Math.floor(W / cellW));
      var lines = Math.max(10, Math.floor(H / cellH));
      fx.style.paddingLeft = Math.max(0, (W - cols * cellW) / 2) + "px";
      var DOT = glyphFits("\u2022", cellW, cs) ? "\u2022" : "o";
      var BLOCK = glyphFits("\u2588", cellW, cs) ? "\u2588" : "#";

      function newGrid() {                                    // Python: lines_count - 1 rows
        var g = [];
        for (var y = 0; y < lines - 1; y++) { var r = []; for (var x = 0; x < cols; x++) r.push(" "); g.push(r); }
        return g;
      }
      function inside(g, x, y) { return y >= 0 && y < g.length && x >= 0 && x < g[0].length; }
      function draw(g, color) {
        fx.style.color = color;
        fx.textContent = g.map(function (r) { return r.join(""); }).join("\n");
      }

      var banner = cols >= 48 ? BANNER_LARGE : BANNER_SMALL;   // same font switch as the script
      var bw = 0; banner.forEach(function (l) { bw = Math.max(bw, l.length); });
      var bh = banner.length;
      var cx = Math.floor(cols / 2), cy = Math.floor(lines / 2);
      var offX = cx - Math.floor(bw / 2);
      var offY = Math.max(1, cy - Math.floor(bh / 2) - 1);

      var parts = [];
      banner.forEach(function (line, y) {
        for (var x = 0; x < line.length; x++) {
          if (line.charAt(x) !== " ") {
            parts.push({ ch: line.charAt(x), x: offX + x, y: offY + y, dropY: offY + y - Math.floor(rnd(3, 7)) });
          }
        }
      });

      var g, step, t;
      // 1. crystallization out of falling fog
      var dust = ["*", "#", "+", "1", "0", "."];
      for (step = 0; step < 22; step++) {
        g = newGrid();
        t = step / 22;
        parts.forEach(function (p) {
          var y = Math.round(p.dropY + (p.y - p.dropY) * t), x = Math.round(p.x);
          if (inside(g, x, y)) {
            if (Math.random() < t * 1.2) g[y][x] = p.ch;
            else if (Math.random() < 0.2) g[y][x] = pick(dust);
          }
        });
        draw(g, GREEN);
        await wait(40 + step * 2);
      }

      // clean title
      g = newGrid();
      parts.forEach(function (p) { var x = Math.round(p.x), y = Math.round(p.y); if (inside(g, x, y)) g[y][x] = p.ch; });
      draw(g, BRIGHT);
      await wait(1400);

      // 2. disintegration (with a glitch: RGB-split shadow)
      var noise = ["*", ".", "x", "0", "1", "#", "@"];
      fx.classList.add("is-glitch");
      for (step = 0; step < 12; step++) {
        g = newGrid();
        parts.forEach(function (p) {
          p.x += rnd(-0.9, 0.9);
          p.y += rnd(-0.4, 0.4);
          var x = Math.round(p.x), y = Math.round(p.y);
          if (inside(g, x, y)) g[y][x] = pick(noise);
        });
        draw(g, GREEN);
        await wait(40);
      }
      fx.classList.remove("is-glitch");

      // 3. collapse into the center
      for (step = 0; step < 15; step++) {
        g = newGrid();
        t = step / 15;
        parts.forEach(function (p) {
          p.x = p.x + (cx - p.x) * (t * 0.55);
          p.y = p.y + (cy - p.y) * (t * 0.55);
          var x = Math.round(p.x), y = Math.round(p.y);
          if (inside(g, x, y)) g[y][x] = DOT;
        });
        draw(g, BRIGHT);
        await wait(50 - step * 2);
      }

      // 4. dramatic single dot
      g = newGrid();
      if (inside(g, cx, cy)) g[cy][cx] = BLOCK;
      draw(g, BRIGHT);
      await wait(750);

      // 5. explosion rings
      var maxR = Math.min(Math.floor(cx / 2), cy, 9);
      var radius, angle, rad, ex, ey, ch, color;
      for (radius = 1; radius <= maxR; radius++) {
        g = newGrid();
        if (radius < Math.floor(maxR / 3)) { ch = "@"; color = BRIGHT; }
        else if (radius < Math.floor((maxR * 2) / 3)) { ch = "+"; color = GREEN; }
        else { ch = "."; color = DARK; }
        for (angle = 0; angle < 360; angle += 10) {
          rad = angle * Math.PI / 180;
          ex = Math.trunc(cx + Math.round(radius * 2.3 * Math.cos(rad)));
          ey = Math.trunc(cy + Math.round(radius * Math.sin(rad)));
          if (inside(g, ex, ey)) g[ey][ex] = ch;
        }
        draw(g, color);
        await wait(30 + radius * 18);
      }

      // 6. slowly melting sparks
      for (var melt = 0; melt < 3; melt++) {
        g = newGrid();
        for (angle = 0; angle < 360; angle += 24) {
          rad = angle * Math.PI / 180;
          ex = Math.trunc(cx + Math.round((maxR + melt) * 2.3 * Math.cos(rad)));
          ey = Math.trunc(cy + Math.round((maxR + melt) * Math.sin(rad)));
          if (inside(g, ex, ey) && Math.random() < 0.25) g[ey][ex] = ".";
        }
        draw(g, DARK);
        await wait(500);
      }
    }

    // Drops focus (which hides the on-screen keyboard) and waits until the window has its full height back
    async function hideKeyboard() {
      input.blur();
      var vv = window.visualViewport;
      function keyboardUp() {
        var visual = vv ? window.innerHeight - vv.height > 80 : false;      // keyboard overlays the page
        var layout = openH > 0 && window.innerHeight < openH - 80;          // keyboard resized the page
        return visual || layout;
      }
      var t0 = performance.now();
      while (keyboardUp() && performance.now() - t0 < 900) {
        await sleep(40);
        if (fxAbort) return;
      }
      await sleep(60);                                       // let the last resize event land
      updateViewport();
    }

    async function runSecret() {
      if (reduceMotion) {                                     // no flashing for people who asked for calm
        BANNER_LARGE.forEach(function (l) { print(l, "term__key"); });
        print("(animation skipped: reduced motion is on)");
        return;
      }
      fxRunning = true;
      fxAbort = false;
      input.disabled = true;
      try {
        await hideKeyboard();
        if (fxAbort) throw new Error("abort");
        // The effect plays inside the terminal window: below the title bar, over the text and buttons
        var bar = tfs.querySelector(".tfs__bar");
        tfs.style.setProperty("--bar-h", (bar ? bar.offsetHeight : 0) + "px");
        await playExplosion();
      } catch (e) { /* aborted by tap / Esc / exit */ }
      fx.hidden = true;
      fx.classList.remove("is-glitch");
      fx.textContent = "";
      fxRunning = false;
      input.disabled = false;
      out.textContent = "";                                   // after the blast the terminal is clean
      if (isOpen && !COARSE) input.focus({ preventScroll: true });   // phones: keep the keyboard down until a tap
    }
    fx.addEventListener("pointerdown", function () { fxAbort = true; });

    /* ---------------------------------------------------------------- wiring */
    (T.chips || []).forEach(function (c) {
      var name = String(c).toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(commands, name)) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "cmd-chip";
      b.textContent = name;
      b.setAttribute("data-cmd", name);
      b.addEventListener("click", function () { run(name); if (isOpen && name !== "exit") input.focus({ preventScroll: true }); });
      chipsEl.appendChild(b);
    });
    if (!chipsEl.childNodes.length) chipsEl.hidden = true;

    function syncText() { form.classList.toggle("has-text", input.value.length > 0); }
    input.addEventListener("input", syncText);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (fxRunning) return;
      var v = input.value;
      input.value = "";
      syncText();
      run(v);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowUp") {
        if (!history.length) return;
        e.preventDefault();
        hIdx = Math.max(0, hIdx - 1);
        input.value = history[hIdx];
        syncText();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        hIdx = Math.min(history.length, hIdx + 1);
        input.value = hIdx < history.length ? history[hIdx] : "";
        syncText();
      } else if (e.ctrlKey && String(e.key).toLowerCase() === "l") {
        e.preventDefault();
        commands.clear();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen) { if (fxRunning) fxAbort = true; else close(); }
    });

    trigger.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    $("tfs-body").addEventListener("click", function (e) {           // tap anywhere in the body: focus the input
      if (e.target.closest("a, button")) return;
      var sel = window.getSelection && window.getSelection();
      if (sel && String(sel).length) return;                         // don't fight text selection
      input.focus({ preventScroll: true });
    });
  }

  /* ------------------------------------------------------------------- boot */
  initPreloader();
  initTheme();
  initViews();
  var hearts = initHearts();
  initStatus();
  var player = initPlayer();
  initSocials();
  initActivity();
  initTerminal({ hearts: hearts, player: player });
})();
