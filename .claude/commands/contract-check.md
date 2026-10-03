---
description: Check a change to shared types against every consumer
---
Contracts live in `src/types/app.ts` and are frozen (see CLAUDE.md → Contracts).

1. Run `git diff origin/main -- src/types/` and list every changed or removed field.
2. For each one, grep the repo for usages and list the files and owners (PLAN.md → Team) that are affected.
3. Say whether the change is additive (safe) or breaking.
4. If it's breaking, draft a one-paragraph message for the team channel naming the owners who need to 👍 it, and propose the smallest additive alternative.

Don't edit other owners' files.
