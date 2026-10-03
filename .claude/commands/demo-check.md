---
description: Smoke-test the demo addresses against a deployed environment
---
Argument: base URL (default: the staging URL from `/srv/solmap/.env` / `.env.vps.example`).
Staging is behind basic auth: read `STAGING_USER` / `STAGING_PASS` from my shell environment and
pass `-u "$STAGING_USER:$STAGING_PASS"` to curl. If they're not set, ask me; never write the password to a file.

For each address in `fixtures/demo-addresses.json` (the `live` list for a real deployment, the `fixtures` list when the target runs `USE_FIXTURES=1`):
1. `curl` `<base>/api/solar/building?lat=..&lng=..` and record status, `source`, `imagery.quality`, `configs.length`, and response time.
2. Run the finance engine on the response with `DEFAULT_INPUTS` plus the address's `ratePlan` / `annualKwh`
   via `pnpm tsx scripts/demo-check.ts <base>` (write that script if it doesn't exist yet; it belongs to B and only imports `lib/finance`).
   Print recommended panels, kW, payback, NPV, export share and verdict.
3. Flag: non-200s (except the expected NO_COVERAGE one), specific yield outside 700–1,400 kWh/kW, verdicts that differ from
   `expectedVerdict`, responses over 3 s, and any recorded fixture in `fixtures/solar/` older than 30 days.

Output a compact table. Don't change app code.
