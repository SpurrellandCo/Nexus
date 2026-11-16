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
