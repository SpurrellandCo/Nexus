// The `--out` option of inventory.mjs and render.mjs, read the same way by both: `--out <dir>` and `--out=<dir>` are one option.
// Pure: arguments in, arguments out.

/**
 * Return the arguments with `--out <dir>` turned into `--out=<dir>` (an `--out` with nothing after it becomes `--out=`, which the
 * callers refuse), and the folder that followed a bare `--out` taken out so it is not read as the footage folder.
 * @param {string[]} argv
 * @returns {string[]}
 */
export const joinOut = (argv) => argv.flatMap((a, i) => (a === '--out' ? [`--out=${argv[i + 1] ?? ''}`] : argv[i - 1] === '--out' ? [] : [a]));
