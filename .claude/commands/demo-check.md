---
description: Smoke-test the demo addresses against a deployed environment
---
Argument: base URL (default: the staging URL from `/srv/solmap/.env` / `.env.vps.example`).
Staging is behind basic auth: read `STAGING_USER` / `STAGING_PASS` from my shell environment and
pass `-u "$STAGING_USER:$STAGING_PASS"` to curl. If they're not set, ask me; never write the password to a file.

For each address in `fixtures/demo-addresses.json` (the `live` list for a real deployment, the `fixtures` list when the target runs `SOLAR_SOURCE=fixtures`):
1. `curl` `<base>/api/solar/building?lat=..&lng=..` and record status, `source` (live / cache / fixture), `imagery.quality`, `configs.length`, and response time.
   On demo day every `live` address should come back as `cache`; a `live` there means it wasn't warmed.
2. Run the finance engine on the response with `DEFAULT_INPUTS` plus the address's `ratePlan` / `annualKwh`
   via `pnpm tsx scripts/demo-check.ts <base>` (write that script if it doesn't exist yet; it belongs to B and only imports `lib/finance`).
   Print recommended panels, kW, payback, NPV, export share and verdict.
3. Flag: non-200s (except the expected NO_COVERAGE one), specific yield outside 700–1,400 kWh/kW, verdicts that differ from
   `expectedVerdict`, responses over 3 s, and (if I'm on the VPS or B's machine) any disk-cache entry whose
   `fetchedAt` is within 3 days of expiry, so it can be re-warmed before the demo.

Output a compact table. Don't change app code.
