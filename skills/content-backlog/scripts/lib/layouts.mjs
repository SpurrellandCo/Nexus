// Brand layouts (Content Board FR 11): `models` is one folder per 3D model (MakerWorld style, with
// `_Ideas/` and `_Tutorials/`); `videos` is one folder per video (`<Video>/brief.md`, `Content/Final/`)
// with tech-tip ideas in `_Ideas/` named `YYYY-MM-DD <Idea title>.md` (D-007).

const DATED_IDEA = /^(\d{4})-(\d{2})-(\d{2}) (.+)$/;

/** @typedef {'models' | 'videos'} Layout */

/**
 * The display title of an idea file: the file name without `.md`, and for the `videos` layout without
 * its `YYYY-MM-DD ` prefix.
 * @param {string} fileName
 * @param {Layout} layout
 * @returns {string}
 */
export function ideaTitle(fileName, layout) {
  const stem = fileName.replace(/\.md$/i, '');
  if (layout !== 'videos') return stem;
  const m = DATED_IDEA.exec(stem);
  return m ? m[4] : stem;
}

/**
 * The date a `videos`-layout idea was saved, from its `YYYY-MM-DD ` file-name prefix.
 * @param {string} fileName
 * @returns {string | null}
 */
export function ideaDateFromName(fileName) {
  const m = DATED_IDEA.exec(fileName.replace(/\.md$/i, ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * The first `# Heading` of a brief or idea file, if it has one.
 * @param {string | null} text
 * @returns {string | null}
 */
export function headingOf(text) {
  const m = text?.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1] : null;
}
