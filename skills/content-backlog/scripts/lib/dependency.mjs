// A promo reel that links to its MakerWorld listing can't go out before the listing (Content Board FR 70).
// The scanner records the link; the app re-resolves it whenever the listing's date changes.

/**
 * @typedef {{ listingCardId: string | null, mentionsMakerWorld: boolean, notBefore: string | null, blocked: boolean }} Dependency
 */

/**
 * The dependency of a reel card on the listing card in the same model folder. A reel depends on its listing
 * when its publish.md mentions MakerWorld (or links makerworld.com). `notBefore` is the listing's date
 * (published, else scheduled); with no date yet the reel is `blocked` ("waiting for its listing").
 * @param {any} reel
 * @param {any | undefined} listing
 * @returns {Dependency}
 */
export function resolveDependency(reel, listing) {
  const mentionsMakerWorld = Boolean(reel.dependency?.mentionsMakerWorld);
  if (reel.type !== 'reel' || !mentionsMakerWorld || !listing) {
    return { listingCardId: null, mentionsMakerWorld, notBefore: null, blocked: false };
  }
  const date = listing.listingDate?.date ?? null;
  return { listingCardId: listing.id, mentionsMakerWorld, notBefore: date, blocked: date === null };
}

/**
 * The dependency of a v2 piece on its listing (V2-24, FR 70). A piece depends on the listing card of the model its `model:`
 * resolves to when its posting copy mentions MakerWorld, whatever its kind; a tutorial never does. `notBefore` is the
 * listing's date (published, else scheduled); a listing with no date yet blocks it ("Waiting for its listing"). A piece
 * whose link does not resolve, or whose model has no listing card, has none. Derived on every compose, never stored (D-037).
 * @param {any} piece a raw piece card (`piece.format`, `model.listingCardId`, `dependency.mentionsMakerWorld`)
 * @param {any | undefined} listing the card whose id is the piece's `model.listingCardId`, when there is one
 * @returns {Dependency}
 */
export function resolveDependencyV2(piece, listing) {
  const mentionsMakerWorld = Boolean(piece.dependency?.mentionsMakerWorld);
  const id = piece.model?.listingCardId ?? null;
  if (piece.piece.format === 'tutorial' || !mentionsMakerWorld || id === null || !listing || listing.id !== id) {
    return { listingCardId: null, mentionsMakerWorld, notBefore: null, blocked: false };
  }
  const date = listing.listingDate?.date ?? null;
  return { listingCardId: listing.id, mentionsMakerWorld, notBefore: date, blocked: date === null };
}

/**
 * The pieces that depend on a listing (FR 70 (d)): the warning when the listing moves names each of them. In folder order.
 * @param {{ id: string }} listing
 * @param {any[]} pieces composed piece cards (each with its `dependency`)
 * @returns {any[]}
 */
export function dependentsOf(listing, pieces) {
  return pieces.filter((p) => p.dependency?.listingCardId === listing.id).sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0));
}
