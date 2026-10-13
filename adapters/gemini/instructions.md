# Gemini CLI notes

These apply only when you are Gemini CLI.

- Nexus skills are in `~/.agents/skills` (links into `~/.nexus/skills`). Nexus agents are generated into `~/.gemini/agents`; edit the originals in `~/.nexus/agents` instead.
- The coding standards listed below are not loaded automatically in Gemini CLI. Read the ones that match your task before writing code.
- Nexus's hooks don't run in Gemini CLI. After creating or editing a skill or agent, run the portability check yourself (`node ~/.nexus/scripts/nexus-portability.js <file>`). New skills reach the other tools within about 10 minutes, or straight away with `node ~/.nexus/scripts/nexus-link.js`.
- **OpenMontage jobs** (`integrations/openmontage`): `nexus-integrations.js openmontage start <jobId>` prints the checkout folder, an `OPENMONTAGE_PROJECTS_DIR` value, folders to read, and a first message. Start an interactive session in the checkout: `cd "<checkout>" && OPENMONTAGE_PROJECTS_DIR="<projects dir>" gemini --include-directories "<job workspace>,<source folder>" -i "<first message>"`. The hand-off tells the agent to read OpenMontage's `AGENT_GUIDE.md` first. Use `-i` (interactive), not `-p`: OpenMontage stops at approval gates that need the user.
