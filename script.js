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
    discord: Object.assign({ username: "", userId: "" }, USER.discord),
    wallpaper: Object.assign({ position: "center", blur: 0 }, USER.wallpaper)
  };

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

  /* ----------------------------------------------------------- 3. views counter */
  function initViews() {
    var pill = $("views"), out = $("views-count");
    var v = CFG.views;
    if (!pill || !out) return;
    if (!v.enabled) { pill.hidden = true; return; }

    var ID = v.namespace + "/" + v.key;
    var CACHE_KEY = "smashh:views:" + ID;
    var LAST_KEY = "smashh:lastHit:" + ID;
    var shown = null;

    function fmt(n) { return Number(n).toLocaleString("en-US"); }

    function render(n) {
      var from = shown === null ? 0 : shown;
      shown = n;
      if (reduceMotion || from === n) { out.textContent = fmt(n); return; }
      var start = performance.now(), dur = 700;
      (function step(now) {
        var t = Math.min(1, (now - start) / dur);
        out.textContent = fmt(Math.round(from + (n - from) * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(step);
      })(start);
    }

    // Show the last known number instantly, then refresh it
    var cached = parseInt(store.get(CACHE_KEY), 10);
    if (isFinite(cached)) { out.textContent = fmt(cached); shown = cached; }

    async function request(mode) {
      var url = v.host.replace(/\/+$/, "") + "/" + mode + "/" +
        encodeURIComponent(v.namespace) + "/" + encodeURIComponent(v.key) + "?t=" + Date.now();
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

    var local = location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
    var bot = navigator.webdriver || /bot|crawl|spider|preview|headless/i.test(navigator.userAgent);
    var last = Number(store.get(LAST_KEY)) || 0;
    var due = Date.now() - last > v.countEveryHours * 3600 * 1000;
    var mode = (!bot && due && (!local || v.countLocalPreview)) ? "hit" : "get";

    (async function load() {
      try {
        var n;
        try {
          n = await request(mode);
          if (mode === "hit") store.set(LAST_KEY, Date.now());
        } catch (e) {
          if (mode === "get" && e.status === 404) n = 0;          // counter not created yet
          else if (mode === "hit") n = await request("get");      // couldn't count, at least show the number
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
      return;
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

  /* ------------------------------------------------------------------- boot */
  initTheme();
  initViews();
  initPlayer();
  initSocials();
})();
