// Which kinds of piece each platform takes (Content Board v2: V2-76, D-033), the one copy of that table.
// Dependency-free apart from the kinds table (isKind), so the app's renderer can bundle it too, and pure: an
// account in, a list of kinds out, never an exception (a hand-edited accounts file must not stop a scan).
//
// An account takes the kinds in its own optional `kinds` list. With none, the preset for its platform key
// supplies them. An account with neither takes `reel` when it accepts video, so every v1 file behaves as
// it did before kinds existed. MakerWorld takes neither kind: it is a listing account.
import { isKind } from './status-file.mjs';

const BOTH = Object.freeze(['reel', 'carousel']);
const REEL_ONLY = Object.freeze(['reel']);

/**
 * Platform key (as in accounts.json and posted.txt) to the kinds that platform takes (V2-76, Section 10 of the PRD).
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const PRESET_KINDS = Object.freeze({
  instagram: BOTH,
  tiktok: BOTH,
  facebook: BOTH,
  threads: BOTH,
  linkedin: BOTH,
  pinterest: BOTH,
  youtube: REEL_ONLY,
  'youtube shorts': REEL_ONLY,
  x: REEL_ONLY,
  makerworld: Object.freeze(/** @type {string[]} */ ([])),
});

/**
 * The known kinds in an account's own `kinds` value, each once, in the order written; empty when it is
 * not a list or holds none.
 * @param {unknown} kinds
 * @returns {string[]}
 */
function ownKinds(kinds) {
  if (!Array.isArray(kinds)) return [];
  return [...new Set(kinds.filter(isKind))];
}

/**
 * The kinds an account takes (V2-76): its own `kinds` (known kinds only, when there is at least one), else
 * the preset for its platform, else `reel` for an account that accepts video, else none. The result is a
 * new array every time.
 * @param {any} account an accounts.json account (`platform`, `accepts`, optional `kinds`)
 * @returns {string[]}
 */
export function accountKinds(account) {
  if (!account || typeof account !== 'object') return [];
  const own = ownKinds(account.kinds);
  if (own.length > 0) return own;
  const platform = typeof account.platform === 'string' ? account.platform.trim().toLowerCase() : '';
  if (Object.hasOwn(PRESET_KINDS, platform)) return [...PRESET_KINDS[platform]];
  return account.accepts === 'video' ? ['reel'] : [];
}

/**
 * Whether an account takes pieces of `kind`.
 * @param {any} account
 * @param {string} kind
 * @returns {boolean}
 */
export const accountTakes = (account, kind) => accountKinds(account).includes(kind);
