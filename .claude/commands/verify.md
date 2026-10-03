---
description: Run all checks before pushing and fix what fails
---
Run, in order: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `SOLAR_SOURCE=fixtures pnpm build`
(in PowerShell: `$env:SOLAR_SOURCE='fixtures'; pnpm build`).

Then two guards:
- `git ls-files fixtures/solar` must print nothing. Real Google responses (the disk cache) are never committed (CLAUDE.md rule 2).
  If anything is listed, stop and tell me; don't just delete it, since it may need removing from history.
- If `fixtures/finance-golden.json` changed on this branch, its `note` must still describe how it was generated,
  and the PR must say why. Expected values are never hand-edited one by one.

For each failure:
1. Fix it only if the fix is inside the folders I own (see PLAN.md → Team). Otherwise, stop and tell me who owns it and what's broken.
2. Never weaken a test or golden case in `fixtures/finance-golden.json` to make it pass. If a golden case fails, explain which formula in docs/FINANCIAL_MODEL.md the code disagrees with.
3. Re-run the failing check after fixing.

Finish with a short summary: what passed, what you changed, anything left for someone else.
