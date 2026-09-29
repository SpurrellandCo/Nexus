# Upstream

This skill is vendored from [tt-a1i/archify](https://github.com/tt-a1i/archify) (MIT; see `LICENSE` and `THIRD_PARTY_NOTICES.md`).

| | |
|---|---|
| Version | 3.0.1 |
| Upstream commit | `0e4949f910a8e390bd3b4933883a4dcabad571be` |
| Source | the repo's release bundle `archify.zip` (the `archify/` folder without tests), not the repo's `archify/` folder |
| Vendored | 2026-09-28 |

## Local changes

- **Update check is off by default.** Upstream's `finalize` and `deliver` check `https://tt-a1i.github.io/archify/skill-updates/archify/stable.json` and ask the agent to mention newer releases. A vendored copy only changes when Nexus refreshes it, so `bin/delivery-update.mjs` and `scripts/check-update.mjs` now treat the check as disabled unless `ARCHIFY_UPDATE_CHECK_DISABLED=0` is set (upstream: disabled only when it is `1`). Each patched line carries a `Nexus:` comment.

## Refreshing

1. Download the new `archify.zip` from the upstream repo root and unzip it.
2. Replace this folder's contents with the zip's `archify/` folder, keeping this file.
3. Reapply the two `Nexus:` patches above (search both files for `ARCHIFY_UPDATE_CHECK_DISABLED`).
4. Update the version, commit, and date in the table.
5. Run `node bin/archify.mjs doctor` and `node $NEXUS_HOME/scripts/nexus-portability.js SKILL.md`.
