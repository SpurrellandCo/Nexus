// What the scanner and the carousel selftest need to know about an image file (Content Board v2: V2-67 (f), V2-83,
// ARCHITECTURE Section 7 "Privacy of carousel assets"): its type (PNG, JPEG or WebP), its size in pixels, and whether it
// carries a GPS tag. Pure, read-only and dependency-free: it looks at the bytes it is given and nothing else (the caller
// reads the first IMAGE_META_READ_BYTES of the file), and it works inside those bytes: every read is bounds-checked, every
// walk has a limit, and a length a file claims is never trusted past the end of the data. A file it cannot read gives
// `{ type: null, ... }` (or a type with no size), never an exception. It changes nothing it is given.
//
// GPS means the tag is there, not what it says: a GPS IFD pointer (tag 0x8825) in the Exif block of a JPEG (APP1), a PNG
// (an eXIf chunk) or a WebP (an EXIF chunk), or a GPS position (`GPSLatitude`, `GPSLongitude`) in XMP.

/** How much of a file the caller should read for `readImageMeta`: the headers and metadata are at the start. */
export const IMAGE_META_READ_BYTES = 262144;

/** The most bytes looked at, however many are given. */
const MAX_BYTES = 1_048_576;
/** The most JPEG segments, PNG chunks or WebP chunks walked. */
const MAX_STEPS = 1000;
/** The most IFD entries read in a TIFF block. */
const MAX_IFD_ENTRIES = 4096;
/** The most bytes of an XMP packet searched. */
const MAX_XMP_BYTES = 65536;
const TAG_GPS_IFD = 0x8825;

/** @typedef {{ type: 'png' | 'jpeg' | 'webp' | null, width: number | null, height: number | null, hasGps: boolean }} ImageMeta */

/** @type {ImageMeta} */
const NONE = Object.freeze({ type: null, width: null, height: null, hasGps: false });

/**
 * A size in pixels is two whole numbers above zero; if either is not, neither is known.
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number | null, height: number | null }}
 */
const dimensions = (width, height) => (Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0 ? { width, height } : { width: null, height: null });

// ---- bounds-checked reads: -1 when the bytes are not there -----------------------------------

/** @param {Uint8Array} b @param {number} i */
const u8 = (b, i) => (i >= 0 && i < b.length ? b[i] : -1);
/** @param {Uint8Array} b @param {number} i */
const u16be = (b, i) => (i >= 0 && i + 2 <= b.length ? (b[i] << 8) | b[i + 1] : -1);
/** @param {Uint8Array} b @param {number} i */
const u16le = (b, i) => (i >= 0 && i + 2 <= b.length ? b[i] | (b[i + 1] << 8) : -1);
/** @param {Uint8Array} b @param {number} i */
const u32be = (b, i) => (i >= 0 && i + 4 <= b.length ? ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0 : -1);
/** @param {Uint8Array} b @param {number} i */
const u32le = (b, i) => (i >= 0 && i + 4 <= b.length ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0 : -1);
/** @param {Uint8Array} b @param {number} i */
const u24le = (b, i) => (i >= 0 && i + 3 <= b.length ? b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) : -1);

/**
 * Whether the bytes at `at` are these ASCII characters.
 * @param {Uint8Array} b
 * @param {number} at
 * @param {string} text
 */
function hasAscii(b, at, text) {
  if (at < 0 || at + text.length > b.length) return false;
  for (let i = 0; i < text.length; i += 1) if (b[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

/**
 * The four characters at `at`, or '' when they are not there.
 * @param {Uint8Array} b
 * @param {number} at
 */
const tag4 = (b, at) => (at >= 0 && at + 4 <= b.length ? String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]) : '');

/**
 * A part of the bytes, from `start` for `length`, cut to what is there.
 * @param {Uint8Array} b
 * @param {number} start
 * @param {number} length
 */
function part(b, start, length) {
  const from = Math.min(Math.max(start, 0), b.length);
  return b.subarray(from, Math.min(from + Math.max(length, 0), b.length));
}

// ---- GPS --------------------------------------------------------------------------------------

/**
 * Whether a TIFF block (the Exif payload) has a GPS IFD pointer in its first IFD.
 * @param {Uint8Array} t
 */
function tiffHasGps(t) {
  const little = hasAscii(t, 0, 'II');
  if (!little && !hasAscii(t, 0, 'MM')) return false;
  const u16 = little ? u16le : u16be;
  const u32 = little ? u32le : u32be;
  if (u16(t, 2) !== 42) return false;
  const ifd = u32(t, 4);
  const count = ifd === -1 ? -1 : u16(t, ifd);
  if (count < 0 || count > MAX_IFD_ENTRIES) return false;
  for (let i = 0; i < count; i += 1) if (u16(t, ifd + 2 + i * 12) === TAG_GPS_IFD) return true;
  return false;
}

/** Exif data, with the `Exif\0\0` header that JPEG and some WebP files put in front of the TIFF block removed. @param {Uint8Array} data */
const exifPayload = (data) => (hasAscii(data, 0, 'Exif') && u16be(data, 4) === 0 ? data.subarray(6) : data);

/**
 * Whether the bytes hold this ASCII text anywhere (a plain scan: linear in the bytes).
 * @param {Uint8Array} b
 * @param {string} text
 */
function containsAscii(b, text) {
  const first = text.charCodeAt(0);
  for (let i = b.indexOf(first); i !== -1 && i + text.length <= b.length; i = b.indexOf(first, i + 1)) if (hasAscii(b, i, text)) return true;
  return false;
}

/**
 * Whether an XMP packet holds a GPS position.
 * @param {Uint8Array} xmp
 */
function xmpHasGps(xmp) {
  const packet = part(xmp, 0, MAX_XMP_BYTES);
  return containsAscii(packet, 'GPSLatitude') || containsAscii(packet, 'GPSLongitude');
}

// ---- PNG --------------------------------------------------------------------------------------

/**
 * @param {Uint8Array} b
 * @returns {boolean}
 */
const isPng = (b) => b.length >= 8 && b[0] === 0x89 && hasAscii(b, 1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;

/**
 * @param {Uint8Array} b
 * @returns {ImageMeta}
 */
function pngMeta(b) {
  let width = null;
  let height = null;
  let hasGps = false;
  let at = 8;
  for (let step = 0; step < MAX_STEPS && at + 8 <= b.length; step += 1) {
    const length = u32be(b, at);
    const type = tag4(b, at + 4);
    if (at + 8 + length > b.length) break; // a chunk that does not fit in the bytes is not read
    const data = b.subarray(at + 8, at + 8 + length);
    if (step === 0 && type === 'IHDR' && length >= 8) ({ width, height } = dimensions(u32be(data, 0), u32be(data, 4)));
    if (type === 'eXIf' && tiffHasGps(data)) hasGps = true;
    if ((type === 'iTXt' || type === 'tEXt' || type === 'zTXt') && hasAscii(data, 0, 'XML:com.adobe.xmp') && xmpHasGps(data)) hasGps = true;
    if (type === 'IEND') break;
    at += 12 + length;
  }
  return { type: 'png', width, height, hasGps };
}

// ---- JPEG -------------------------------------------------------------------------------------

/** A marker with no length: standalone markers (TEM, restarts) and the start and end of the image. @param {number} marker */
const standalone = (marker) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9);
/** A start-of-frame marker, which carries the size (not DHT, JPG or DAC). @param {number} marker */
const isFrame = (marker) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/**
 * @param {Uint8Array} b
 * @returns {ImageMeta}
 */
function jpegMeta(b) {
  let width = null;
  let height = null;
  let hasGps = false;
  let at = 2;
  for (let step = 0; step < MAX_STEPS && at < b.length; step += 1) {
    if (b[at] !== 0xff) break;
    const marker = u8(b, at + 1);
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x00 || marker === -1) break;
    if (standalone(marker)) {
      if (marker === 0xd9) break;
      at += 2;
      continue;
    }
    const length = u16be(b, at + 2);
    if (length < 2 || at + 2 + length > b.length) break;
    const data = b.subarray(at + 4, at + 2 + length);
    if (marker === 0xda) break;
    if (isFrame(marker) && width === null) {
      ({ width, height } = dimensions(u16be(data, 3), u16be(data, 1)));
    }
    if (marker === 0xe1) {
      if (hasAscii(data, 0, 'Exif') && tiffHasGps(exifPayload(data))) hasGps = true;
      else if (hasAscii(data, 0, 'http://ns.adobe.com/xap/1.0/') && xmpHasGps(data)) hasGps = true;
    }
    at += 2 + length;
  }
  return { type: 'jpeg', width, height, hasGps };
}

// ---- WebP -------------------------------------------------------------------------------------

/**
 * @param {Uint8Array} b
 * @returns {boolean}
 */
const isWebp = (b) => b.length >= 12 && hasAscii(b, 0, 'RIFF') && hasAscii(b, 8, 'WEBP');

/**
 * The size a VP8, VP8L or VP8X chunk gives, or null.
 * @param {string} type
 * @param {Uint8Array} data
 * @returns {{ width: number | null, height: number | null } | null}
 */
function webpSize(type, data) {
  if (type === 'VP8X') return u24le(data, 7) === -1 ? null : dimensions(u24le(data, 4) + 1, u24le(data, 7) + 1);
  if (type === 'VP8L' && u8(data, 0) === 0x2f) {
    const bits = u32le(data, 1);
    return bits === -1 ? null : dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (type === 'VP8 ' && u8(data, 3) === 0x9d && u8(data, 4) === 0x01 && u8(data, 5) === 0x2a) {
    const w = u16le(data, 6);
    const h = u16le(data, 8);
    return w === -1 || h === -1 ? null : dimensions(w & 0x3fff, h & 0x3fff);
  }
  return null;
}

/**
 * The chunks of a WebP file. Unlike a PNG chunk, a WebP chunk is read as far as the bytes go: the size sits in the first
 * bytes of the (large) image chunk, and the caller reads only the start of a big file, so a lossy file ends inside it.
 * @param {Uint8Array} b
 * @returns {ImageMeta}
 */
function webpMeta(b) {
  let width = null;
  let height = null;
  let hasGps = false;
  let canvas = false;
  let at = 12;
  for (let step = 0; step < MAX_STEPS && at + 8 <= b.length; step += 1) {
    const type = tag4(b, at);
    const length = u32le(b, at + 4);
    const data = part(b, at + 8, length);
    const found = webpSize(type, data);
    if (found !== null && (!canvas || type === 'VP8X')) {
      ({ width, height } = found);
      canvas = canvas || type === 'VP8X';
    }
    if (type === 'EXIF' && tiffHasGps(exifPayload(data))) hasGps = true;
    if (type === 'XMP ' && xmpHasGps(data)) hasGps = true;
    at += 8 + length + (length % 2);
  }
  return { type: 'webp', width, height, hasGps };
}

/**
 * The type, pixel size and GPS tag of an image, from its first bytes. `{ type: null, width: null, height: null,
 * hasGps: false }` for anything that is not a PNG, a JPEG or a WebP, or is not bytes; a recognised file whose size
 * cannot be read has `null` for it.
 * @param {Uint8Array} bytes the start of the file (about IMAGE_META_READ_BYTES of it)
 * @returns {ImageMeta}
 */
export function readImageMeta(bytes) {
  if (!(bytes instanceof Uint8Array)) return NONE;
  const b = bytes.length > MAX_BYTES ? bytes.subarray(0, MAX_BYTES) : bytes;
  if (isPng(b)) return pngMeta(b);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) return jpegMeta(b);
  if (isWebp(b)) return webpMeta(b);
  return NONE;
}
