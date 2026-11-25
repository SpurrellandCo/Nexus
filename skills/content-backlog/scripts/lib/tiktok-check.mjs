// TikTok's redirecting-traffic rule (quickvid's references/platform-policy.md): a video or carousel posted from a TikTok Shop creator
// account must not send viewers off TikTok for what it promotes ("link in bio", "it's on MakerWorld", a store, a URL, a code).
// This finds the first such wording a piece would carry to TikTok:
//   - the `## TikTok` section of its publish.md (the caption and cover text), always;
//   - a reel's spoken and on-screen lines (the numbered lines of `.quickvid/script.md`), unless that section names a TikTok cut on
//     a `Video:` line (quickvid's tiktok_cut.py: the same video ending on a follow card);
//   - a carousel's slide copy (`.carousel/copy.md`), since its TikTok slides are the same images.
// Pure and linear in the text; the flag only shows while a TikTok account is still owed or scheduled (flags.mjs).

/** The wording that sends viewers off TikTok, in the order checked. Each match is reported as written, clipped. */
const OFF_TIKTOK = Object.freeze([
  /\blink in (?:my |the )?(?:bio|description|profile)\b/i,
  /\bmakerworld\b/i,
  /\b(?:printables|thingiverse|thangs|cults3d|etsy|amazon|amzn|ebay|shopify|gumroad|patreon)\b/i,
  /\bhttps?:\/\/\S+|\bwww\.\S+/i,
  /\b(?:dm|message) me\b/i,
  /\bqr code\b/i,
  /\b(?:use (?:my )?code|promo code|discount code)\b/i,
]);

/** A TikTok cut's file name: `<slug>-tiktok.mp4`, or a later version `<slug>-tiktok-V2.mp4`. */
const TIKTOK_CUT = /-tiktok(?:-V\d+)?\.mp4$/i;
/** A `Video:` line (plain or bold label) that names a TikTok cut. */
const CUT_LINE = /^\s*(?:\*\*)?video:?(?:\*\*)?:?\s.*-tiktok(?:-V\d+)?\.mp4/im;
/** Lines of the TikTok section that are not posted: the file to upload and the sound to add. */
const NOT_POSTED = /^\s*(?:\*\*)?(?:video|sound)\b/i;
/** A script's narration or shot line: `08. ...`, `8) ...` or a table row `| 08 | ... |`. */
const SCRIPT_LINE = /^\s*(?:\d{1,2}[.)]\s|\|\s*\d{1,2}\s*\|)/;
const MAX_PHRASE = 40;

/** @param {string} name */
export const isTikTokCut = (name) => TIKTOK_CUT.test(String(name));

/**
 * The first off-TikTok wording in a text, as written, or null.
 * @param {string} text
 * @returns {string | null}
 */
export function offTikTokPhrase(text) {
  let first = null;
  for (const pattern of OFF_TIKTOK) {
    const match = pattern.exec(text);
    if (match && (first === null || match.index < first.index)) first = match;
  }
  return first === null ? null : first[0].slice(0, MAX_PHRASE);
}

/**
 * The publish.md section for TikTok: the first `## TikTok...` heading (`TikTok`, `TikTok (photo mode)`).
 * @param {Array<{ heading: string, body: string }>} sections
 */
const tiktokSection = (sections) => sections.find((s) => /^tiktok\b/i.test(s.heading.trim())) ?? null;

/**
 * The raw `tiktok-redirect` flag a piece earns, or none.
 * @param {{ kind: string, sections: Array<{ heading: string, body: string }>, draftText: string | null }} facts
 * @returns {Array<{ code: string, params: Record<string, string> }>}
 */
export function tiktokFlags({ kind, sections, draftText }) {
  const section = tiktokSection(sections);
  if (section) {
    const posted = section.body.split('\n').filter((line) => !NOT_POSTED.test(line)).join('\n');
    const phrase = offTikTokPhrase(posted);
    if (phrase) return [{ code: 'tiktok-redirect', params: { where: 'caption', phrase } }];
  }
  if (!draftText) return [];
  if (kind === 'carousel') {
    const phrase = offTikTokPhrase(draftText);
    return phrase ? [{ code: 'tiktok-redirect', params: { where: 'slides', phrase } }] : [];
  }
  if (section && CUT_LINE.test(section.body)) return [];
  const spoken = draftText.split('\n').filter((line) => SCRIPT_LINE.test(line)).join('\n');
  const phrase = offTikTokPhrase(spoken);
  return phrase ? [{ code: 'tiktok-redirect', params: { where: 'video', phrase } }] : [];
}
