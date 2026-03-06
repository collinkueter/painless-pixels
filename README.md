# Painless Pixels

**Free, browser-based App Store screenshot generator.** No signup. No watermarks. No build step.

Open `index.html` — that's it.

---

## What it does

1. **Drop** your raw screenshots (PNG/JPG, up to 10)
2. **Design** — pick a device, template, and edit text/colors in the live canvas
3. **Export** — downloads a ZIP with every required size for iOS and Android

---

## Export sizes

| Platform | File | Dimensions |
|----------|------|-----------|
| iOS | `iphone_1260x2736_N.png` | 1260×2736 (6.9" primary) |
| iOS | `iphone_1284x2778_N.png` | 1284×2778 (6.5" fallback) |
| iOS | `ipad_2064x2752_N.png` | 2064×2752 (13" primary) |
| iOS | `ipad_2048x2732_N.png` | 2048×2732 (12.9" fallback) |
| Android | `phone_1080x1920_N.png` | 1080×1920 (portrait) |
| Android | `phone_1920x1080_N.png` | 1920×1080 (landscape) |
| Android | `tablet7_1200x1920_N.png` | 1200×1920 (7" tablet) |
| Android | `tablet10_1800x2560_N.png` | 1800×2560 (10" tablet) |

---

## Templates

8 included: Bold Dark, Clean Light, Gradient Pop, Feature Callout, Split Color, Minimal, Neon Night, Warm Burst.

---

## Tech

Pure HTML/CSS/JS — no build tool required.

- [Fabric.js 5.3.1](https://github.com/fabricjs/fabric.js) — interactive canvas
- [JSZip 3.10](https://github.com/Stuk/jszip) — ZIP generation
- [FileSaver.js 2.0](https://github.com/eligrey/FileSaver.js) — download trigger
- Fonts: Syne + JetBrains Mono (Google Fonts CDN)

---

## File structure

```
index.html
css/    reset.css · main.css · editor.css
js/     utils · devices · upload · templates · editor · export · app
assets/frames/    iphone-16-pro.svg · ipad-13.svg · android-pixel.svg
```

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `⌘E` / `Ctrl+E` | Open export |
| `Esc` | Close export |
| `←` / `↑` | Previous slide |
| `→` / `↓` | Next slide |
