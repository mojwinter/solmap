# Solmap: hackathon kit

Planning docs, contracts, data and deploy config for the BC rooftop-solar viability tool. It's
not the app itself. Drop it into a fresh Next.js repo at hour 0 (see `docs/INFRA.md` → Repo bootstrap).

| File | For | What's in it |
|---|---|---|
| `CLAUDE.md` | everyone + Claude Code | Project context, stack, layout, rules, domain cheat-sheet |
| `PLAN.md` | everyone | Pitch, P0/P1/P2 scope, 4-person roles, hour-by-hour timeline, pre-event checklist, demo script, risks |
| `DESIGN.md` | D, A, lead | User, flow, screens and states, verdict and reason-chip rules, architecture, our API contract |
| `docs/FINANCIAL_MODEL.md` | C | BC tariffs, RS 2289 export rate, rebate, self-use curve, formulas, recommendation, verdict, golden cases, sources |
| `docs/SOLAR_API.md` | B, A | Endpoints, quality and coverage, gotchas, panel-drawing math, Places, Google caching terms |
| `docs/INFRA.md` | B | VPS + Caddy + Compose + GitHub Actions setup, rollback, fixtures mode, caching |
| `docs/KICKOFF_PROMPTS.md` | each dev | First Claude Code prompt per role + the integration prompt |
| `src/types/solar.ts` | B | Google Solar API response types |
| `src/types/app.ts` | all | **Our frozen contracts**: `BuildingResponse`, `FinanceInputs`, `ScenarioResult`, `Recommendation`, `FinanceEngine` |
| `src/config/bc.ts` | C | Every BC number with its source (re-checked 2026-10-03), input ranges, tuning knobs |
| `fixtures/finance-golden.json` | C | Golden cases: bill model, 8 scenarios, 4 recommend/verdict cases |
| `fixtures/synthetic/` | all | Two hand-made roofs in the exact Google response shape (not Google content), for CI and hour-0 dev |
| `fixtures/demo-addresses.json` | C, D | Fixture addresses (work today) + template for the pre-verified live demo addresses |
| `.claude/commands/` | everyone | `/verify`, `/contract-check`, `/demo-check` |
| `.claude/settings.json` | everyone | Shared Claude Code permissions: check commands allowed, real `.env` files unreadable |
| `docker/`, `scripts/deploy.sh`, `.github/workflows/`, `.dockerignore` | B | Dockerfile, compose, Caddyfile, deploy script with health check + rollback, CI + deploy workflows |
| `.env.example`, `.env.vps.example`, `.gitignore.additions` | B | Env templates |

"Solmap" is the working name. Identifiers (Docker images, `/srv/solmap`, hostnames, the repo) use lowercase `solmap`.

## Changes in the 2026-10-03 revision

If you read the first version, these are the parts that changed:

1. **Self-use is now a curve, not a flat 50%.** With a fixed ratio, export share was 50% at every
   size, so "bigger systems sell more at 10¢" (our pitch) wasn't actually in the model, and the
   export-share chip could never fire. `selfConsumptionRatio` → `daytimeLoadShare`. Golden cases regenerated.
2. **Verdicts need real dollars.** Strong/Moderate now also need NPV ≥ $2,500 / $1,000. Without that,
   the recommender found a tiny rebate-funded system on almost any roof, and nearly everything came out "Moderate".
3. **Solar API quality:** one call with `requiredQuality=LOW` replaces MEDIUM→BASE. `BASE` is
   experimental in Canada (needs `experiments=EXPANDED_COVERAGE`), so the old fallback would likely just 404 again.
   Pre-event test added.
4. **Google caching terms:** temporary caching is allowed for up to 30 days, so committing a real `demo.json`
   (in git forever) isn't. CI now uses `fixtures/synthetic/`; recorded fixtures stay local/VPS and get deleted.
5. **Places:** the legacy Autocomplete widget isn't available to new Google projects. Use `PlaceAutocompleteElement`.
6. **Bills:** BC Hydro bills monthly or every two months, and printed bills include GST. Added a bill-period
   input and `annualKwhFromBill`.
7. **Contracts:** `{lat, lng}` everywhere in `app.ts`; `recommendedIndex` can be `null`; typed `ScenarioWarning`;
   `rebateEligible`; `FinanceEngine` signatures; `source: 'manual'` for the P1 manual estimate.
8. **Infra fixes:** first deploy no longer fails on Caddy's `depends_on`; `git fetch` keeps using the deploy
   key; deploys are serialised (`flock`), gated on CI, health-checked, and roll back in seconds; `.dockerignore`
   keeps `.env*` out of images; the bcrypt hash quoting gotcha is documented.
