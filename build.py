#!/usr/bin/env python3
"""
Regenerates assets/site-data.js  (run it after you change music or the wallpaper):

    python build.py

Why this script exists
  * A web page cannot list a folder, so the playlist has to be written down somewhere.
    This script scans assets/music/ and records every audio file (title = file name).
    The track LENGTH is read by the browser from the audio file itself.
  * Browsers refuse to read the pixels of local images when a page is opened from disk
    (file://), so the wallpaper colors cannot be measured there. This script measures
    them once and stores the palette. (On a real web host such as GitHub Pages the page
    measures the wallpaper itself, so this step is optional there.)

Only the standard library is required. Pillow (pip install pillow) is optional and is
used for the wallpaper palette and for shrinking oversized wallpapers.
"""
import datetime
import json
import math
import re
import sys
from pathlib import Path
from urllib.parse import quote

try:  # Windows consoles often can't print every character of a track name
    sys.stdout.reconfigure(errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
MUSIC = ASSETS / "music"
OUT = ASSETS / "site-data.js"

AUDIO_EXT = {".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wav", ".flac", ".weba"}
WALLPAPER_NAMES = ["wallpaper.jpg", "wallpaper.jpeg", "wallpaper.png", "wallpaper.webp", "wallpaper.avif"]
OPTIMIZED = ASSETS / "wallpaper.optimized.jpg"
MAX_SIDE = 2560            # longer side of an optimized wallpaper, px
MAX_BYTES = 1_500_000      # wallpapers bigger than this get an optimized copy


# ----------------------------------------------------------------------------- music
def natural_key(name: str):
    # re.split with a capture group alternates text / digits, so odd positions are always numbers
    return [int(p) if i % 2 else p.lower() for i, p in enumerate(re.split(r"(\d+)", name))]


def title_from_filename(path: Path) -> str:
    title = path.stem.replace("_", " ")
    return re.sub(r"\s+", " ", title).strip() or path.stem


def scan_music():
    if not MUSIC.is_dir():
        return []
    files = [p for p in MUSIC.iterdir()
             if p.is_file() and p.suffix.lower() in AUDIO_EXT and not p.name.startswith(".")]
    files.sort(key=lambda p: natural_key(p.name))
    return [{"src": "./assets/music/" + quote(p.name), "title": title_from_filename(p)} for p in files]


# ------------------------------------------------------------------------ wallpaper
def hsl_from_rgb(r, g, b):
    r, g, b = r / 255, g / 255, b / 255
    mx, mn = max(r, g, b), min(r, g, b)
    d, l = mx - mn, (mx + mn) / 2
    h = s = 0.0
    if d > 0:
        den = 1 - abs(2 * l - 1)
        s = d / den if den > 0 else 0.0
        if mx == r:
            h = ((g - b) / d) % 6
        elif mx == g:
            h = (b - r) / d + 2
        else:
            h = (r - g) / d + 4
        h /= 6
        if h < 0:
            h += 1
    return h, s, l


def rgb_from_hsl(h, s, l):
    c = (1 - abs(2 * l - 1)) * s
    hp = h * 6
    x = c * (1 - abs(hp % 2 - 1))
    if hp < 1:
        r, g, b = c, x, 0
    elif hp < 2:
        r, g, b = x, c, 0
    elif hp < 3:
        r, g, b = 0, c, x
    elif hp < 4:
        r, g, b = 0, x, c
    elif hp < 5:
        r, g, b = x, 0, c
    else:
        r, g, b = c, 0, x
    m = l - c / 2
    return [int(min(1, max(0, v + m)) * 255 + 0.5) for v in (r, g, b)]


BINS = 24


def palette_from_pixels(pixels):
    """Same algorithm as paletteFromPixels() in script.js."""
    w_s, x_s, y_s, s_s = ([0.0] * BINS for _ in range(4))
    n = R = G = B = 0
    luma = color_w = 0.0

    for r, g, b, a in pixels:
        if a < 128:
            continue
        n += 1
        R += r
        G += g
        B += b
        luma += 0.2126 * r + 0.7152 * g + 0.0722 * b
        h, s, l = hsl_from_rgb(r, g, b)
        if l < 0.10 or l > 0.92 or s < 0.15:
            continue
        w = s * (1 - abs(2 * l - 1))
        bi = min(BINS - 1, int(math.floor(h * BINS)))
        w_s[bi] += w
        x_s[bi] += math.cos(h * 2 * math.pi) * w
        y_s[bi] += math.sin(h * 2 * math.pi) * w
        s_s[bi] += s * w
        color_w += w
    if not n:
        return None

    ah, as_, _ = hsl_from_rgb(R / n, G / n, B / n)
    tint = rgb_from_hsl(ah, min(as_ * 0.6, 0.4), 0.10)
    base = rgb_from_hsl(ah, min(as_ * 0.5, 0.35), 0.05)
    overlay = round(min(0.80, max(0.40, 0.40 + (luma / (n * 255)) * 0.45)), 3)

    def sm(k):
        return w_s[k] + 0.5 * (w_s[(k + 1) % BINS] + w_s[(k - 1) % BINS])

    def agg(k):
        a, c = (k - 1) % BINS, (k + 1) % BINS
        return (w_s[a] + w_s[k] + w_s[c], x_s[a] + x_s[k] + x_s[c],
                y_s[a] + y_s[k] + y_s[c], s_s[a] + s_s[k] + s_s[c])

    def hue_of(x, y):
        h = math.atan2(y, x) / (2 * math.pi)
        return h + 1 if h < 0 else h

    top = max(range(BINS), key=lambda k: (sm(k), -k))
    if sm(top) <= 0 or color_w < 0.02 * n:
        return {"accent": rgb_from_hsl(ah, 0.1, 0.82), "accent2": rgb_from_hsl(ah, 0.1, 0.68),
                "tint": tint, "base": base, "overlay": overlay}

    w1, x1, y1, sv1 = agg(top)
    h1, s1 = hue_of(x1, y1), sv1 / w1

    second, second_v = -1, 0.0
    for i in range(BINS):
        hd = abs((i + 0.5) / BINS - h1)
        hd = min(hd, 1 - hd)
        if hd >= 0.14 and sm(i) >= 0.25 * sm(top) and sm(i) > second_v:
            second, second_v = i, sm(i)
    if second >= 0:
        w2, x2, y2, sv2 = agg(second)
        h2, s2 = hue_of(x2, y2), sv2 / w2
    else:
        h2, s2 = (h1 + 0.08) % 1, s1

    return {
        "accent": rgb_from_hsl(h1, min(0.92, max(0.62, 0.5 + s1 * 0.8)), 0.68),
        "accent2": rgb_from_hsl(h2, min(0.88, max(0.55, 0.45 + s2 * 0.8)), 0.62),
        "tint": tint, "base": base, "overlay": overlay,
    }


def find_wallpaper():
    """If several wallpaper.* files exist, the most recently modified one wins."""
    found = [ASSETS / n for n in WALLPAPER_NAMES if (ASSETS / n).is_file()]
    return max(found, key=lambda p: p.stat().st_mtime) if found else None


def prepare_wallpaper(path: Path):
    """Returns (web path of the file to use, palette or None). Needs Pillow for anything fancy."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        print("  ! Pillow is not installed (pip install pillow): wallpaper palette skipped.")
        print("    The page still works: on a web host it measures the wallpaper itself.")
        return "./assets/" + path.name, None

    try:
        im = ImageOps.exif_transpose(Image.open(path))
    except Exception as exc:  # unsupported format (e.g. avif without a plugin)
        print(f"  ! Could not open {path.name} with Pillow ({exc}).")
        return "./assets/" + path.name, None

    resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
    use_path = path

    # Shrink huge wallpapers: nobody needs a 12 MB background on a phone
    if max(im.size) > MAX_SIDE or path.stat().st_size > MAX_BYTES:
        big = im.convert("RGBA")
        flat = Image.new("RGB", big.size, (0, 0, 0))
        flat.paste(big, mask=big.getchannel("A"))
        flat.thumbnail((MAX_SIDE, MAX_SIDE), resample)
        flat.save(OPTIMIZED, quality=84, optimize=True, progressive=True)
        use_path = OPTIMIZED
        print(f"  ~ {path.name} ({path.stat().st_size // 1024} KB) -> {OPTIMIZED.name} "
              f"({OPTIMIZED.stat().st_size // 1024} KB), original left untouched")
    elif OPTIMIZED.exists():
        OPTIMIZED.unlink()   # stale copy from an older, bigger wallpaper

    small = im.convert("RGBA")
    small.thumbnail((64, 64), getattr(getattr(Image, "Resampling", Image), "BILINEAR"))
    flat_pixels = getattr(small, "get_flattened_data", small.getdata)()
    palette = palette_from_pixels(list(flat_pixels))
    return "./assets/" + use_path.name, palette


def hexcolor(rgb):
    return "#%02x%02x%02x" % tuple(rgb)


# ----------------------------------------------------------------------------- main
def main():
    ASSETS.mkdir(exist_ok=True)
    MUSIC.mkdir(exist_ok=True)

    print("Music (assets/music):")
    tracks = scan_music()
    if tracks:
        for i, t in enumerate(tracks, 1):
            print(f"  {i:>2}. {t['title']}")
    else:
        print("  (no audio files yet — drop .mp3 / .m4a / .ogg / .wav / .flac files there)")

    print("Wallpaper:")
    wallpaper, palette = None, None
    wp = find_wallpaper()
    if wp:
        wallpaper, palette = prepare_wallpaper(wp)
        print(f"  {wp.name}")
        if palette:
            print("  accent " + hexcolor(palette["accent"]) + " / " + hexcolor(palette["accent2"]) +
                  "   tint " + hexcolor(palette["tint"]) + "   shade " + str(palette["overlay"]))
    else:
        print("  (none — put assets/wallpaper.jpg|png|webp to get a themed background)")

    data = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "wallpaper": wallpaper,
        "palette": palette,
        "tracks": tracks,
    }
    body = json.dumps(data, ensure_ascii=True, indent=2)   # ASCII-only: safe for any file encoding
    OUT.write_text(
        "/* AUTO-GENERATED by build.py - do not edit by hand.\n"
        "   Re-run `python build.py` after changing assets/music or the wallpaper. */\n"
        "window.SITE_DATA = " + body + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
