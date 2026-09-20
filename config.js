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
