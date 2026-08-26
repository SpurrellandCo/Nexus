# Agent Orchestration

## Available Agents

Located in `~/.claude/agents/`:

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits, auth/payment/user-input code |
| typescript-reviewer | TypeScript-specific review | Backend `.ts` changes |
| react-reviewer | React-specific review | Frontend `.jsx`/`.tsx` changes |
| database-reviewer | Schema/query review | `schema.prisma` or migration changes |
| a11y-architect | Accessibility review | Component changes (WCAG 2.2) |
| e2e-runner | E2E testing | Critical user flows (checkout, auth) |
| performance-optimizer | Performance review | Hero/landing/CWV-sensitive pages |
| seo-specialist | Technical SEO review | Static marketing site (`.html`) changes |
| build-error-resolver | Fix build errors | When a non-Vite/Next build fails |
| react-build-resolver | Fix Vite/Next build errors | When a Vite/Next build or dev command fails |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |
| rust-reviewer | Rust code review | Rust projects |
| harmonyos-app-resolver | HarmonyOS app development | HarmonyOS/ArkTS projects |

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests - Use **planner** agent
2. Code just written/modified - Use **code-reviewer** agent
3. Bug fix or new feature - Use **tdd-guide** agent
4. Architectural decision - Use **architect** agent

## Automated Triggers (Hooks, Not Just Policy)

The rows above describe *when a human should reach for* an agent. The following are additionally enforced by hooks in `~/.claude/settings.json` — they fire automatically and inject a reminder into context, rather than relying on this file being re-read and followed every turn:

- **`Stop` hook** (`scripts/hooks/stop-review-agent-suggest.js`) — at the end of each turn, scans uncommitted changes (`git status`) and suggests every matching reviewer by file pattern: `code-reviewer` (any source file), `security-reviewer` (auth/payment/oauth/jwt/webhook paths), `typescript-reviewer` (`.ts`), `react-reviewer` + `a11y-architect` (`.jsx`/`.tsx`), `database-reviewer` (`schema.prisma`/migrations), `e2e-runner` (cart/checkout/stripe), `performance-optimizer` (hero/landing/Preview3D), `seo-specialist` (`.html`).
- **`PostToolUse(Bash)` hook** (`scripts/hooks/post-bash-build-failure-agent-suggest.js`) — fires when an `npm/pnpm/yarn/vite/next build|dev` command fails, suggesting `react-build-resolver` (Vite/Next) or `build-error-resolver` (other stacks).

Both are non-blocking (context injection + a visible message, not a hard stop) — added 2026-07-26 after an audit found `code-reviewer`/`security-reviewer` had zero real invocations despite the "no user prompt needed" policy above, meaning the policy text alone wasn't sufficient.

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth module
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utilities

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker
