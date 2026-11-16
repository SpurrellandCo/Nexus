// Stable card ids (Content Board ARCHITECTURE 4.1): `<brandId>:<type>:<path>`, where the path is relative
// to the brand's content root, with `/` separators, Unicode NFC and lower case. The same folder always
// gives the same id, whatever the letter case on disk or the platform's separator.

/** @typedef {'idea' | 'tutorial' | 'reel' | 'listing'} CardType */

/**
 * @param {string} brandId
 * @param {CardType} type
 * @param {string} relPath folder (or idea file) relative to the content root
 * @returns {string}
 */
export function cardId(brandId, type, relPath) {
  const normalised = relPath.split(/[\\/]+/).map((s) => s.trim()).filter(Boolean).join('/').normalize('NFC').toLowerCase();
  return `${brandId}:${type}:${normalised}`;
}
