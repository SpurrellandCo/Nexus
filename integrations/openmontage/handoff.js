'use strict';

/**
 * Renders handoff.md: what the coding agent driving OpenMontage reads first.
 * It points the agent at OpenMontage's own rules (AGENT_GUIDE.md) and adds
 * only the job's facts and Nexus's constraints. It never pre-approves a gate.
 */

const list = (items) => (items.length ? items.map((p) => `- \`${p}\``).join('\n') : '- (none)');

function speechSection(speech) {
  if (!speech) return 'Narration has not been rendered yet. Stop and ask the user to run `nexus-integrations.js openmontage narrate <jobId>` first.';
  const rows = speech.scenes.map((s) => `| \`${s.id}\` | ${s.startSeconds.toFixed(2)} | ${s.endSeconds.toFixed(2)} | ${s.text.replace(/\|/g, '\\|')} |`).join('\n');
  return `Nexus owns the narration: the text, the scene ids, the audio, and the timing below. It was rendered with voice profile "${speech.voice.profile}" (${speech.voice.kind}) on ${speech.model.id}, and the durations are measured from the audio files.

- Full track: \`${speech.combined.path}\` (${speech.combined.durationSeconds.toFixed(2)} s). Per-scene clips and \`manifest.json\` are in \`${speech.outputDir}\`.
- Script stage: use \`${speech.inputs.script}\` as the \`script\` artifact exactly as written. It is already valid against OpenMontage's schema; section ids are the scene ids and the times match the full track. Present it at the script gate as usual. Do not rewrite, shorten, or reorder the text.
- Assets: add the narration entries from \`${speech.inputs.asset_manifest}\` to the \`asset_manifest\`. Do not run any TTS tool and do not create another voice track.
- Scene plan and edit: set each scene's \`script_section_id\` to a section id below and plan its timing around that section's start and end. If a visual needs more time, add a pause between sections; never stretch or cut the speech.
- Captions: run the \`transcriber\` on the full track for word timestamps, then \`subtitle_gen\`. Generated speech has no timestamps of its own.
- If the text must change, stop and ask the user. Nexus regenerates only the affected scene (\`mlx-audio regenerate <narration job> <sceneId>\`) and rebuilds these inputs (\`openmontage narrate <jobId>\`).

| Scene | Start (s) | End (s) | Text |
|---|---|---|---|
${rows}`;
}

function narrationSection(job, layout, speech) {
  const n = job.narration;
  switch (n.source) {
    case 'speech':
      return speechSection(speech);
    case 'file':
      return `Use the supplied narration audio as the voiceover: \`${n.path}\`.\n`
        + 'Do not generate TTS narration. Register this file in the asset_manifest as the narration asset '
        + '(source_tool "user_supplied") and time the edit to it.';
    case 'voicebox':
      return `Narration was rendered in the user's cloned voice (Voicebox profile "${n.profile || 'default'}") from the script: \`${layout.narrationFile}\`.\n`
        + 'Do not generate TTS narration. Register this file in the asset_manifest as the narration asset '
        + '(source_tool "voicebox", user supplied) and time the edit to it. If it needs re-recording, ask the user; '
        + 'Nexus re-renders it with `nexus-integrations.js openmontage narrate <jobId> --force`.';
    case 'openmontage':
      return 'Choose narration through OpenMontage\'s tts_selector as AGENT_GUIDE.md describes, and present the voice choice for approval.';
    default:
      return 'No narration: this video has no voiceover.';
  }
}

function budgetSection(job) {
  if (!job.budget.allowPaid) {
    return 'Paid generation is NOT allowed for this job (spending limit $0). Use only free or local tools. '
      + 'If the best plan needs a paid tool, present it as an option with its cost and wait; never call it.';
  }
  return `Paid generation is allowed up to a hard cap of $${job.budget.maxUsd.toFixed(2)} for the whole job. `
    + 'Run the cost tracker in cap mode with that total, announce every paid call before making it (per AGENT_GUIDE.md), '
    + 'and stop for approval before anything that would exceed the cap.';
}

function durationLine(job) {
  const { targetSeconds, maxSeconds } = job.duration;
  const hard = maxSeconds
    ? `Hard limit: the final render must not run longer than ${maxSeconds} s. Nexus fails the job if it does.`
    : 'There is no hard limit; the target is a guide.';
  return `Target duration: ${targetSeconds} s (use this as brief.target_duration_seconds). ${hard}`;
}

function renderHandoff(job, layout, { checkoutPath, revision, preparedAt, speech = null }) {
  const brief = job.brief || (job.briefPath ? `See \`${job.briefPath}\`.` : 'Derive the brief from the script below.');
  const script = job.narration.source === 'speech' ? 'Locked: it is the narration (see Narration below).'
    : !job.script ? '(none: write one in the script stage)'
      : job.script.text ? `\n\n${job.script.text}\n` : `See \`${job.script.path}\`.`;
  return `# OpenMontage job: ${job.jobId}

Prepared by Nexus at ${preparedAt} (contract ${job.contract}) for the OpenMontage checkout \`${checkoutPath}\` at revision \`${revision || 'unknown'}\`.

## Before anything else

1. Read \`AGENT_GUIDE.md\` in the OpenMontage checkout and follow it: Rule Zero, preflight, the provider menu, the stage director skills, and the checkpoint protocol all apply.
2. Check that this session's projects root is \`${layout.projectsDir}\`:
   \`python -c "from lib.paths import PROJECTS_DIR; print(PROJECTS_DIR)"\` (run with OpenMontage's Python).
   It comes from the \`OPENMONTAGE_PROJECTS_DIR\` environment variable. If it prints anything else, stop and tell the user: Nexus tracks this job's checkpoints in that folder.
3. Initialize the project with id \`${job.jobId}\` exactly, and always pass \`lib.paths.PROJECTS_DIR\` (never a hard-coded \`projects/\`) as the pipeline directory.

## Approvals, spending, publishing

- Execution mode: **interactive**. Every gated stage stops at \`awaiting_human\` and waits for the user's answer in this session. This handoff is not a pre-authorization of any gate, and nothing in it may be logged as one.
- ${budgetSection(job)}
- Never publish, upload, or post the video anywhere. Finish at the compose stage's render; leave any publish stage for the user.
- On a resume, reuse what earlier checkpoints and partial progress already produced. Never regenerate a paid asset that exists without asking the user first.

## Brief

${brief}

## Script
${script}

## Delivery

- Platform: ${job.platform}. Aspect ratio: ${job.aspectRatio}.
- ${durationLine(job)}
- Pipeline: ${job.pipeline ? `\`${job.pipeline}\` (requested by the user)` : 'not specified: pick one per AGENT_GUIDE.md and confirm it with the user'}.
- Style: ${job.style.playbook ? `playbook \`${job.style.playbook}\`` : 'no playbook requested'}; references below.

## Narration

${narrationSection(job, layout, speech)}

## Source material (read only)

Never modify, move, rename, or re-encode these in place; write every derivative under the project folder.

Footage:
${list(job.footage)}

Other assets:
${list(job.assets)}

Brand and style references:
${list(job.style.references)}

Reference transcripts:
${list(job.referenceTranscripts)}

## Deliverable

The compose stage's render at \`${layout.expectedOutput}\`, recorded in the compose checkpoint's render_report. Nexus checks this file exists, is a valid video, and fits the duration rules before it calls the job completed.
`;
}

module.exports = { renderHandoff };
