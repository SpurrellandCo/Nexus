#!/usr/bin/env node
// carousel skill: the render check (V2-83, D-030). Run it once on a machine, and again after Chrome or the scripts change:
//
//   node selftest.mjs [--keep]
//
// It builds a small fixture project in the system's temporary folder (three photos, one with a GPS tag in its Exif), copies the photos with
// prep_assets.py (needs uv and Pillow), writes three slide pages, and renders them with the real headless Chrome for the sets of Instagram,
// TikTok and Pinterest. Then it checks what the PRD says a render must do and prints one PASS or FAIL line for each:
//   sizes      every picture's size, read back from its PNG header, is its set's: 1080x1350 in Final/, 1080x1920 in Final/9x16/, 1000x1500 in Final/2x3/
//   sets       the 9x16 and 2x3 sets are absent when TikTok and Pinterest are not owed
//   gps        no photo copy and no slide holds a GPS tag (read with the scanner's own image reader)
//   originals  the original photos' sha256 are as they were
//   re-render  a second render writes slide-NN-V2.png and leaves the first set as it was
//   network    the offline rule is on Chrome's command line, a page that names a host is refused before Chrome runs, and a page that
//              names one still renders (an invented host never resolves, so this last part shows the render does not hang on one)
// It also records the Chrome version and the window-frame calibration. With CHROME_PATH naming nothing, or no Chrome installed, it stops
// at once with a plain message. Exit codes: 0 every check passed, 1 a check failed or Chrome or uv is missing, 2 bad arguments.
// It writes only in the temporary folder, which it removes at the end (--keep leaves it and says where).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { IMAGE_META_READ_BYTES, readImageMeta } from '../../content-backlog/scripts/lib/image-meta.mjs';
import { calibrate, chromeArgs, chromeVersion, findChrome, networkReferences, readPngSize, renderPiece, renderSlide } from './render_slides.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREP_ASSETS = path.join(HERE, 'prep_assets.py');
const DATA = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'references', 'platform-slides.json'), 'utf8'));
const OWED_ALL = ['instagram', 'tiktok', 'pinterest'];

/** Makes three photos: gps.jpg (Exif with a GPS position and a camera), p2.jpg and p3.jpg (plain). */
const FIXTURE_PY = `
import sys
from pathlib import Path
from PIL import Image
root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
def photo(size, colour):
    image = Image.new("RGB", size, colour)
    for x in range(0, size[0], 50):
        for y in range(0, size[1], 50):
            image.putpixel((x, y), (255 - colour[0], 255 - colour[1], 255 - colour[2]))
    return image
exif = Image.Exif()
exif[0x010F] = "ExampleCam"
gps = exif.get_ifd(0x8825)
gps[1] = "N"
gps[2] = (44.0, 30.0, 0.0)
gps[3] = "W"
gps[4] = (93.0, 10.0, 0.0)
photo((1600, 1200), (200, 110, 40)).save(root / "gps.jpg", "JPEG", quality=90, exif=exif.tobytes())
photo((1200, 1600), (40, 110, 200)).save(root / "p2.jpg", "JPEG", quality=90)
photo((1400, 1400), (60, 160, 90)).save(root / "p3.jpg", "JPEG", quality=90)
`;

/** A slide page that fills the window, so one page renders in every set. @param {{ photo: string | null, text: string, colour: string }} slide */
const page = ({ photo, text, colour }) => `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>${text}</title>
<style>
  html, body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; }
  body { --u: calc(100vw / 1080); background: ${colour}; color: #fff; font-family: "Helvetica Neue", Arial, sans-serif; position: relative; }
  .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0, 0, 0, .75), rgba(0, 0, 0, 0) 60%); }
  h1 { position: absolute; left: calc(64 * var(--u)); right: calc(64 * var(--u)); bottom: calc(96 * var(--u)); margin: 0; font-size: calc(96 * var(--u)); line-height: 1.05; }
</style>
<body>
${photo === null ? '' : `<img class="photo" src="../assets/${photo}" alt=""><div class="shade"></div>`}
<h1>${text}</h1>
</body></html>
`;

/** @param {string} file */
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
/** @param {string} file */
const hasGps = (file) => readImageMeta(fs.readFileSync(file).subarray(0, IMAGE_META_READ_BYTES)).hasGps;
/** Every file under a folder, relative and sorted. @param {string} dir @returns {string[]} */
const filesUnder = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).filter((rel) => fs.statSync(path.join(dir, rel)).isFile()).sort() : []);

const lines = [];
let passed = 0;
let failed = 0;
/** @param {string} label @param {boolean} ok @param {string} text @param {string[]} [detail] */
function check(label, ok, text, detail = []) {
  if (ok) passed += 1;
  else failed += 1;
  lines.push(`${ok ? 'PASS' : 'FAIL'} ${label}: ${text}`, ...detail.map((line) => `  ${line}`));
  process.stdout.write(`${lines.splice(0).join('\n')}\n`);
}

/** @param {string[]} argv */
function options(argv) {
  const bad = argv.find((arg) => arg !== '--keep');
  if (bad !== undefined) {
    process.stderr.write(`selftest: unknown option ${bad}\nusage: selftest.mjs [--keep]\n`);
    process.exit(2);
  }
  return { keep: argv.includes('--keep') };
}

/** A piece folder with its slide pages. @param {string} root @param {string} name @param {Array<{ photo: string | null, text: string, colour: string }>} slides */
function makePiece(root, name, slides) {
  const piece = path.join(root, 'Example Bin', name);
  fs.mkdirSync(path.join(piece, '.carousel', 'slides'), { recursive: true });
  slides.forEach((slide, i) => fs.writeFileSync(path.join(piece, '.carousel', 'slides', `slide-${String(i + 1).padStart(2, '0')}.html`), page(slide)));
  return piece;
}

async function main() {
  const { keep } = options(process.argv.slice(2));
  const found = findChrome(process.env);
  if (found.path === null) {
    process.stderr.write(`selftest: ${found.problem}\n`);
    process.exit(1);
  }
  const chrome = found.path;
  process.stdout.write(`chrome: ${chromeVersion(chrome) ?? 'version unknown'} (${chrome}, through ${found.source})\n`);
  if (spawnSync('uv', ['--version'], { encoding: 'utf8' }).status !== 0) {
    process.stderr.write('selftest: uv is not installed, and prep_assets.py needs it (uv runs it with Pillow). Install uv, then run this again.\n');
    process.exit(1);
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-selftest-'));
  try {
    const content = path.join(work, 'Example Bin', 'content');
    const built = spawnSync('uv', ['run', '--no-project', '--with', 'pillow', 'python', '-c', FIXTURE_PY, content], { encoding: 'utf8', timeout: 180_000 });
    if (built.status !== 0) throw new Error(`could not make the fixture photos: ${built.stderr.trim()}`);
    const photos = ['gps.jpg', 'p2.jpg', 'p3.jpg'];
    const originals = Object.fromEntries(photos.map((name) => [name, sha256(path.join(content, name))]));
    if (!hasGps(path.join(content, 'gps.jpg'))) throw new Error('the fixture photo gps.jpg has no GPS tag, so the privacy check would prove nothing');

    const delta = await calibrate(chrome);
    process.stdout.write(`calibration: window frame ${delta.dw}x${delta.dh} (${delta.dw === 0 && delta.dh === 0 ? 'no correction needed' : 'added to --window-size; nothing is resampled'})\n`);
    process.stdout.write("network: offline rule (--host-resolver-rules=MAP * ~NOTFOUND goes on every Chrome command line this run builds, and a page that names a remote address is refused before Chrome runs)\n");

    // piece A: three slides, owed to Instagram, TikTok and Pinterest
    const pieceA = makePiece(work, 'Carousel', [{ photo: 'gps.jpg', text: 'A 42 mm gap', colour: '#14213d' }, { photo: 'p2.jpg', text: 'Prints in 2 hours', colour: '#1d3557' }, { photo: null, text: 'Free on MakerWorld', colour: '#2a6f4e' }]);
    const prep = spawnSync('uv', ['run', '--no-project', '--with', 'pillow', 'python', PREP_ASSETS, content, path.join(pieceA, '.carousel', 'assets'), ...photos], { encoding: 'utf8', timeout: 180_000 });
    if (prep.status !== 0) throw new Error(`prep_assets.py failed: ${prep.stderr.trim()}`);
    const summary = JSON.parse(prep.stdout);
    const assets = filesUnder(path.join(pieceA, '.carousel', 'assets')).map((rel) => path.join(pieceA, '.carousel', 'assets', rel));
    const gpsSource = summary.assets.find((/** @type {any} */ a) => a.source === 'gps.jpg');
    check('photos', assets.length === 3 && gpsSource?.had_gps === true && assets.every((file) => !hasGps(file)), `${assets.length} photos copied to .carousel/assets (gps.jpg had a GPS tag; no copy has one)`);
    check('originals', photos.every((name) => sha256(path.join(content, name)) === originals[name]), `the sha256 of the ${photos.length} original photos are as they were`);

    const a = await renderPiece({ piece: pieceA, platforms: OWED_ALL, data: DATA, chrome, delta });
    const sizeLines = [];
    let sizesOk = true;
    for (const set of a.sets) {
      for (const rel of set.files) {
        const got = readPngSize(fs.readFileSync(path.join(pieceA, rel)));
        sizesOk &&= got !== null && got.width === set.width && got.height === set.height;
        sizeLines.push(`${rel} ${got === null ? 'not a PNG' : `${got.width}x${got.height}`}`);
      }
    }
    check('sizes', sizesOk && a.sets.length === 3, `every picture's size, read back from its PNG header, is its set's: 1080x1350 (Final/), 1080x1920 (Final/9x16/), 1000x1500 (Final/2x3/)`, sizeLines);

    // piece B: two slides, owed to Instagram alone, rendered twice
    const pieceB = makePiece(work, 'Carousel 2', [{ photo: null, text: 'First', colour: '#5a189a' }, { photo: null, text: 'Second', colour: '#7b2cbf' }]);
    await renderPiece({ piece: pieceB, platforms: ['instagram'], data: DATA, chrome, delta });
    const firstSet = Object.fromEntries(filesUnder(path.join(pieceB, 'Final')).map((rel) => [rel, sha256(path.join(pieceB, 'Final', rel))]));
    const finalA = fs.readdirSync(path.join(pieceA, 'Final'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    const finalB = fs.readdirSync(path.join(pieceB, 'Final'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    check('sets', finalA.join() === '2x3,9x16' && finalB.length === 0, 'Instagram, TikTok and Pinterest owed gives Final/, Final/9x16/ and Final/2x3/; Instagram alone gives Final/ only');

    const again = await renderPiece({ piece: pieceB, platforms: ['instagram'], data: DATA, chrome, delta });
    const after = filesUnder(path.join(pieceB, 'Final'));
    const firstKept = Object.entries(firstSet).every(([rel, hash]) => sha256(path.join(pieceB, 'Final', rel)) === hash);
    const v2Sizes = again.readBack.every((/** @type {any} */ r) => r.ok);
    check('re-render', after.join() === 'slide-01-V2.png,slide-01.png,slide-02-V2.png,slide-02.png' && firstKept && v2Sizes && again.latest.master.join() === 'Final/slide-01-V2.png,Final/slide-02-V2.png', 'slide-NN-V2.png written next to the first set, which is unchanged (sha256), and the newest slides are the -V2 ones');

    const pictures = [...filesUnder(path.join(pieceA, 'Final')).map((rel) => path.join(pieceA, 'Final', rel)), ...filesUnder(path.join(pieceB, 'Final')).map((rel) => path.join(pieceB, 'Final', rel)), ...assets];
    check('gps', pictures.every((file) => !hasGps(file)), `no GPS tag in any of the ${pictures.length} slide and photo copies, read with the scanner's own image reader`);

    // network: a page with a remote image is refused before Chrome runs, and Chrome resolves nothing
    const pieceC = makePiece(work, 'Carousel 3', [{ photo: null, text: 'One', colour: '#000' }, { photo: null, text: 'Two', colour: '#111' }]);
    fs.appendFileSync(path.join(pieceC, '.carousel', 'slides', 'slide-02.html'), '<img src="https://example.invalid/a.png" alt="">\n');
    let refused = false;
    let chromeRan = false;
    try {
      await renderPiece({ piece: pieceC, platforms: ['instagram'], data: DATA, chrome, delta, run: () => { chromeRan = true; return { status: 0, stderr: '' }; } });
    } catch (error) {
      refused = /network/.test(String(/** @type {Error} */ (error).message));
    }
    const probe = path.join(work, 'probe.html');
    fs.writeFileSync(probe, '<!doctype html><meta charset="utf-8"><title>p</title><body style="margin:0;background:#fff"><img src="https://example.invalid/a.png" width="40" height="40" alt=""></body>');
    const probeOut = path.join(work, 'probe-out.png');
    const profile = fs.mkdtempSync(path.join(work, 'profile-'));
    const probeSize = await renderSlide({ name: 'probe', width: 1080, height: 1350 }, probe, probeOut, { chrome, delta, profile }).catch(() => null);
    const offlineRule = chromeArgs({ url: 'file:///x.html', out: '/x.png', width: 1080, height: 1350, delta, profile }).includes('--host-resolver-rules=MAP * ~NOTFOUND');
    check('network', offlineRule && refused && !chromeRan && networkReferences(fs.readFileSync(probe, 'utf8')).length > 0 && probeSize !== null, "the offline rule (--host-resolver-rules=MAP * ~NOTFOUND) is on Chrome's command line; a page with a remote image is refused before Chrome runs; a page naming a host still renders (an invented host never resolves, so that shows the render does not hang, not that the rule works)");
  } finally {
    if (keep) process.stdout.write(`kept: ${work}\n`);
    else fs.rmSync(work, { recursive: true, force: true });
  }
  const total = passed + failed;
  process.stdout.write(failed === 0 ? `selftest: ${passed} checks passed.\n` : `selftest: ${failed} of ${total} checks failed.\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`selftest: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
