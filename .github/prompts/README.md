# Claude Code Prompts

Orchestrator prompts for agent-driven work on devportal-platform.

## Prompts

| File | Purpose |
|------|---------|
| `automated-update.md` | Dry-run (local) — applies updates to working tree only, no git operations |
| `automated-update-ci.md` | CI version — creates branch, commits, opens PR via GitHub Actions |
| `security-scan.md` | Security vulnerability scanning (separate workflow) |
| `docs-refresh.md` | **One-shot** — handoff for a fresh-context agent to author `docs/`. Not CI-driven; invoke when ready. |

## Running a dry-run locally

```bash
cd /path/to/devportal-base
.github/prompts/claude-watch.sh .github/prompts/automated-update.md
```
To restrict which tools the agent can use:

```bash
.github/prompts/claude-watch.sh .github/prompts/automated-update.md "Bash,Read,Glob,Grep"
```

### Requirements

- `claude` CLI installed and authenticated
- `jq` installed
- Run from the repo root
- `agent-browser` (optional) — only needed if running `automated-update-ci.md` locally for visual regression

### After the run

Review changes with `git diff` and revert if needed with `git checkout .`.
