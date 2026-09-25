---
description: Pull the latest Nexus changes into ~/.nexus and refresh links, dependencies, and tool sharing.
---

# Nexus Update

Run Nexus's `update.sh` and report the result. Find it with this, which tries `$NEXUS_HOME`, then `~/.nexus`, then the Windows profile folder, then `~/.claude` (older installs):

```bash
for dir in "${NEXUS_HOME:-}" "$HOME/.nexus" "$(cygpath -u "${USERPROFILE:-}" 2>/dev/null)/.nexus" "$HOME/.claude"; do
  if [ -f "$dir/update.sh" ]; then bash "$dir/update.sh"; break; fi
done
```

The profile-folder step matters on Windows machines where Git Bash sets `HOME` to a network drive while the AI tool folders live under `C:\Users\<name>`: a plain `bash ~/.nexus/update.sh` would look on the network drive and find nothing. If none of the folders has `update.sh`, ask the user where Nexus is installed rather than guessing.

That script pulls the latest commits from the Nexus repo into `~/.nexus` (the `~/.claude` links pick them up automatically), refreshes machine-level dependencies via `bootstrap.sh`, and is safe to run any time — a real conflict with local changes fails cleanly without losing anything, rather than silently overwriting.

After it finishes, summarize what changed: how many new commits landed (if any), and list them from the script's output. If the pull failed due to a conflict, tell the user to run `git status` inside `~/.nexus` to see what's conflicting, and offer to help resolve it rather than re-running blindly.
