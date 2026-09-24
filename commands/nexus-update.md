---
description: Pull the latest Nexus changes into ~/.nexus and refresh links, dependencies, and tool sharing.
---

# Nexus Update

Run `bash ~/.nexus/update.sh` and report the result.

That script pulls the latest commits from the Nexus repo into `~/.nexus` (the `~/.claude` links pick them up automatically), refreshes machine-level dependencies via `bootstrap.sh`, and is safe to run any time — a real conflict with local changes fails cleanly without losing anything, rather than silently overwriting.

After it finishes, summarize what changed: how many new commits landed (if any), and list them from the script's output. If the pull failed due to a conflict, tell the user to run `git status` inside `~/.nexus` to see what's conflicting, and offer to help resolve it rather than re-running blindly.
