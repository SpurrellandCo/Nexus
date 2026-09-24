# Codex notes

These apply only when you are Codex.

- Nexus skills are in `~/.agents/skills` (links into `~/.nexus/skills`). Nexus agents are generated into `~/.codex/agents`; edit the originals in `~/.nexus/agents` instead.
- The coding standards listed below are not loaded automatically in Codex. Read the ones that match your task before writing code.
- Nexus's hooks don't run in Codex. After creating or editing a skill or agent, run the portability check yourself (`node ~/.nexus/scripts/nexus-portability.js <file>`). New skills reach the other tools within about 10 minutes, or straight away with `node ~/.nexus/scripts/nexus-link.js`.
