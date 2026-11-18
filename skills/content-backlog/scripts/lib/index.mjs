// Public surface of the shared scanner. The content-backlog CLI and the Content Board app (which
// vendors this folder, D-001) import from here.
//
// The gate (Content Board v2: V2-35, D-036): `scanBrand` and `scanCard` send a brand whose `itemLayout` is exactly 2 to the v2
// scan (`scan-v2.mjs`) and every other brand to the untouched v1 functions (`cards.mjs`), so a legacy brand's cards, lanes and
// CLI output do not change by a byte. `scanBacklog` (the CLI's walker) is v1 only.
import { scanBrandV2, scanCardV2 } from './scan-v2.mjs';
import { noPromoReel, scanBrand as scanBrandV1, scanCard as scanCardV1 } from './cards.mjs';

export { ACCOUNTS_VERSION, brandNamed, brandsFor, chooseBrand, findBrandByModelsRoot, isWithinRoot, parseAccounts, techTipsBrand, videoPlatforms } from './accounts.mjs';
export { PRESET_KINDS, accountKinds, accountTakes } from './presets.mjs';
export { memoListDir, projectsLinkedTo, resolveModel } from './models.mjs';
export { cardId } from './card-id.mjs';
export { ConfigError, DAY_MS, DEFAULTS, DEFAULT_DAYS, brandInput, itemLayoutOf, modelsRootOf, normalizeRel, normalizeRoot, resolveConfig, sameRoot } from './config.mjs';
export { dependentsOf, resolveDependency, resolveDependencyV2 } from './dependency.mjs';
export { headingOf, ideaDateFromName, ideaTitle } from './layouts.mjs';
export { listingDateOf, listingStatuses, readScheduledTxt } from './listings.mjs';
export { parsePublishMd, readPublishMd, sectionsByAccount } from './publish-md.mjs';
export { LANES, cardStatuses, placeCard } from './stages.mjs';
export { buildStage, placeCardV2, placeListingV2, placePiece } from './stages-v2.mjs';
export { localDate, startOfDay } from './dates.mjs';
export { createIo } from './fs-io.mjs';
export {
  NOT_PLATFORMS, isPlatformScheduled, isPost, isScheduledValue, isSkipped, matchRecordLine, parsePosted, parseScheduledValue,
  postedDateOf, postedUrlOf, recordBelongsTo,
} from './posted.mjs';
export { GROUPS, dateIn, scanBacklog, statusOf } from './scan.mjs';
export {
  activeAccountsFor, activeVideoAccounts, deriveStatuses, deriveStatusesFor, dueState, effectivePosts, pieceStatuses, postedDays, postedDaysApprox, slotsOf,
} from './status.mjs';
export { FLAG_CODES, FLAG_SEVERITY, accountFlags, composeFlags, describeFlag, fileFlags, flagText, modelDetail, modelNotes, projectFlags } from './flags.mjs';
export { MIN_SLIDES, OTHER_MEDIA_FLAGS, isConfirmedSlides, isImageName, isMp4Name, readMedia } from './media.mjs';
export { discoverPieces, isSkippedFolder, readPiece, readProject } from './pieces.mjs';
export { carriedByListing, noPromoReelV2, pieceCard } from './piece-cards.mjs';
export { IMAGE_META_READ_BYTES, readImageMeta } from './image-meta.mjs';
export { applyRecord, classifyValue, recordContext } from './record-step.mjs';
export {
  KINDS, LIMITS, STATUSES, createStatusFile, describeChange, editStatusFile, isKind, isModelLink, isPieceRelPath, parseStatusFile,
} from './status-file.mjs';
export { noPromoReel, scanBrandV2, scanCardV2 };

/**
 * Every card of one brand (FR 4): the v2 scan for a brand whose `itemLayout` is 2, v1's otherwise.
 * @param {import('./config.mjs').ScanConfig} cfg
 * @param {Parameters<typeof scanBrandV1>[1]} options
 */
export function scanBrand(cfg, options) {
  return cfg.itemLayout === 2 ? scanBrandV2(cfg, options) : scanBrandV1(cfg, options);
}

/**
 * The cards of one folder, for a quick refresh after a write (FR 43): a project or piece folder (or, with `options.root` of
 * `'models'`, a model folder) for a v2 brand, v1's folder otherwise. v1 ignores `options.root`.
 * @param {import('./config.mjs').ScanConfig} cfg
 * @param {string} relFolder
 * @param {Parameters<typeof scanCardV1>[2] & { root?: 'content' | 'models' }} options
 */
export function scanCard(cfg, relFolder, options) {
  return cfg.itemLayout === 2 ? scanCardV2(cfg, relFolder, options) : scanCardV1(cfg, relFolder, options);
}
