/* ==========================================================================
   Site settings. Plain script (no modules) so it works from file://.
   Text content (nick, tags, links) lives in index.html.
   ========================================================================== */
window.SITE_CONFIG = {

  /* ---- Shared view counter -------------------------------------------------
     Uses the free, key-less Abacus counting API (https://abacus.jasoncameron.dev).
     `namespace` + `key` identify YOUR counter. Anyone who knows them can bump it,
     so keep the random suffix in `key` (change it to any random string you like).
     The counter is created automatically on the first visit and starts from 1.
     If the service ever stops answering, its repository points to https://abacus.jsn.cam
     as a newer address: try putting that into `host`. */
  views: {
    enabled: true,
    host: "https://abacus.jasoncameron.dev",
    namespace: "smashh-bio",
    key: "views-k7q2m9xv",

    // A browser counts as one new view at most once per this many hours.
    countEveryHours: 24,

    // Opening the page from your own disk / localhost only READS the counter
    // (so your own previews don't inflate it). Set to true to count those too.
    countLocalPreview: false
  },

  /* ---- Heart button ------------------------------------------------------------
     Uses the same free Abacus service as the view counter (host + namespace are reused),
     with its own counter. Honest limits of a key-less counter:
       - a heart can only be ADDED, never taken back (decreasing needs a secret admin key,
         and a secret cannot live in a public web page);
       - "one heart per person" is enforced per browser only (other browser / cleared data
         = another heart), and anyone can add hearts by hand using the counter name.
     Numbers are shown as 999 / 1k / 1.6k / 1M (rounded down). */
  hearts: {
    enabled: true,
    key: "hearts-r5w8n3ty"
  },

  /* ---- Status line (under the tags) -------------------------------------------- */
  status: {
    enabled: true,
    text: "just vibecoding >_<"          // what you are doing right now, edit any time
  },

  /* ---- Your local time, shown on the right of the status line ------------------ */
  time: {
    enabled: true,
    utcOffsetHours: 3                    // 3 = UTC+3, 5.5 = UTC+5:30, -5 = UTC-5
  },

  /* ---- Preloader (black screen with a typewriter line, then fades out) ---------- */
  preloader: {
    enabled: true,
    // "session": once per browser tab/session (default) | "once": only the very first visit | "always"
    mode: "session",
    line: "[system]: Initializing bio...",
    hello: "Hello!",
    holdMs: 2000                         // when the fade-out starts, counted from the beginning
  },

  /* ---- Live Discord activity card (Lanyard) ------------------------------------
     Lanyard is a free service that republishes your Discord presence (game, Spotify,
     status). REQUIRED once: join the Lanyard Discord server (discord.gg/lanyard) with the
     account whose ID is below, otherwise the card stays hidden.
     PRIVACY: after that your presence is readable by anyone who knows your ID. */
  activity: {
    enabled: true,
    userId: "1063432384697090108",       // Discord numeric user ID
    hideWhenOffline: false               // true = hide the whole card while you are offline
  },

  /* ---- Fullscreen terminal (opens when you tap the prompt line) ----------------- */
  terminal: {
    enabled: true,
    user: "smashh",
    host: "localhost",
    trigger: "whoami",                   // text shown after the prompt on the site
    showHint: true,                      // small "tap to open terminal" caption
    whoami: [                            // what `whoami` prints, one string per line
      "Smashh, aka GhostSmash",
      "vibecoder: python + web (HTML/CSS/JS)",
      "into AI prompt engineering and LLM workflows"
    ],
    links: [                             // what `links` prints: name, shown text, url
      { name: "telegram", label: "t.me/xssmash",           url: "https://t.me/xssmash" },
      { name: "github",   label: "github.com/GhostSmash",   url: "https://github.com/GhostSmash" },
      { name: "4pda",     label: "4pda profile",            url: "https://4pda.to/forum/index.php?showuser=10297314" },
      { name: "discord",  label: "xssmash",                 url: "https://discord.com/users/1063432384697090108" }
    ],
    chips: ["help", "whoami", "links", "clear", "exit"]   // tap-buttons above the hint (handy on phones)
  },

  /* ---- Discord button --------------------------------------------------------
     Discord cannot link to a profile by username, only by numeric user ID.
     With `userId` set, the button opens discord.com/users/<userId>.
     Leave `userId` empty ("") and the button copies `username` to the clipboard instead. */
  discord: {
    username: "xssmash",
    userId: "1063432384697090108"
  },

  /* ---- Wallpaper (assets/wallpaper.jpg | .jpeg | .png | .webp) -------------------
     position: any CSS background-position, e.g. "center", "50% 30%", "left top".
     blur:     extra blur in px (0 = sharp). */
  wallpaper: {
    position: "center",
    blur: 0
  }
};
