# Slide pages

Each slide is one web page in `<piece folder>/.carousel/slides/`, named `slide-01.html`, `slide-02.html` and so on, numbered
from 1 with no gap. `scripts/render_slides.mjs` opens each page in the headless Chrome at the size of each set (4:5 at
1080x1350, 9:16 at 1080x1920, 2:3 at 1000x1500) and saves the window as a PNG at device scale 1. The same page is rendered
for every set, so it is laid out against the window, not against one fixed size.

## The rules

- **Size from the window.** `html` and `body` take `width: 100vw; height: 100vh`, no margin, `overflow: hidden`. Set one unit,
  `--u: calc(100vw / 1080)`, and write every length as `calc(N * var(--u))`, so type and spacing scale together in each set.
  Do not scale the page with `transform`, `zoom` or a fixed pixel size.
- **Local files only.** Photos come from `../assets/<file>` (the copies `prep_assets.py` made, never the originals in
  the footage folder). The file name is the `asset` value of `prep_assets.py`'s JSON summary for that photo, because the
  copy's extension (and, in a subfolder, its path) can differ from the original's: a HEIC, WebP or `.JPG` photo is written as
  `.jpg`. Write it percent-encoded in the page's address: a name with a space, `#`, `?` or `%` in it breaks as written (`#` and
  `?` end the path, `%` starts an escape), so `a#b.jpg` is `../assets/a%23b.jpg`. Fonts are system fonts by name, or font files of the brand kit loaded with `@font-face` and a `file:///` address.
  Nothing from the network: no web fonts, no remote images, no stylesheet or script from a web address. The render refuses a
  page that names one, and Chrome cannot resolve a host name in any case.
- **Brand.** Colours, fonts and logo rules come from the kit at `brandKit` when it is set; `accent` is the colour for highlights;
  `channelName` goes on the first and last slides. Put them in CSS variables at the top of the page.
- **The words are the approved words**, exactly as in `copy.md`: no rewording, no added claim, no added number.
- **Type that reads on a phone.** A headline of about 80 to 110 units, supporting text no smaller than about 44. Keep type away
  from the edges (the platforms draw their own interface over them): about 64 units at the sides, more at the top and bottom of
  the tall sets. Text over a photo gets a shade or a panel behind it; the contrast between text and what is behind it is at
  least 4.5 to 1.
- **A photo fills its area** with `object-fit: cover`; it is placed and cropped, never retouched, recoloured or composed with
  anything made up. A slide with no suitable photo is type on a colour.
- **Static.** No script, no animation, no video. `<html lang="en">` (or the language of the words) and a `<title>`; the picture
  has no alt text of its own, so the alt text of each slide is the `Alt:` line of `copy.md`, which goes into the posting kit.

## A page

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Slide 1</title>
<style>
  :root { --accent: #3ddc84; --ink: #ffffff; --ground: #14213d; }
  html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; }
  body { --u: calc(100vw / 1080); background: var(--ground); color: var(--ink); font-family: "Helvetica Neue", Arial, sans-serif; position: relative; }
  .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0, 0, 0, .78), rgba(0, 0, 0, 0) 62%); }
  .channel { position: absolute; top: calc(72 * var(--u)); left: calc(64 * var(--u)); font-size: calc(44 * var(--u)); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
  h1 { position: absolute; left: calc(64 * var(--u)); right: calc(64 * var(--u)); bottom: calc(120 * var(--u)); margin: 0; font-size: calc(104 * var(--u)); line-height: 1.04; }
</style>
<body>
  <img class="photo" src="../assets/IMG_0412.jpg" alt="">
  <div class="shade"></div>
  <div class="channel">Example Channel</div>
  <h1>A 42 mm gap. A whole drawer saved.</h1>
</body>
</html>
```

A type-and-colour slide is the same page without the `img` and the shade. The page above comes out right at 1080x1350,
1080x1920 and 1000x1500: the photo fills the window, the headline sits at the bottom in each.

## When a render is wrong

The render fails when a picture is not the size of its set; nothing is resampled to hide it. If type runs off the edge or crowds
the photo, change the page (smaller type, another layout) and render again; the new picture is written as `slide-NN-V2.png`
beside the first. Do not shorten the approved words to make them fit: if they cannot fit, ask the user to change the copy.
