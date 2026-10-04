---
description: Smoke-test the demo addresses against a deployed environment
---
Argument: base URL (default: https://sunscore.tech).
While the site is behind Cloudflare Access, read `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` (an Access
service token) from my shell environment and send them as `CF-Access-Client-Id` / `CF-Access-Client-Secret`
headers. If they're not set, ask me; never write them to a file.

For each address in `fixtures/demo-addresses.json` (the `live` list for a real deployment, the `fixtures` list when the target runs `SOLAR_SOURCE=fixtures`):
1. `curl` `<base>/api/solar/building?lat=..&lng=..` and record status, `source` (live / cache / fixture), `imagery.quality`, `configs.length`, and response time.
   On demo day every `live` address should come back as `cache`; a `live` there means it wasn't warmed.
2. Run the finance engine on the response with `DEFAULT_INPUTS` plus the address's `ratePlan` / `annualKwh`
   via `pnpm demo:check -- <base>` (`scripts/demo-check.ts`, owned by B; it does steps 1–3 itself and only imports `lib/finance`).
   It picks the `fixtures` list for localhost and `live` otherwise (`--list live|fixtures` overrides), skips `live` rows still at
   `"TODO"`, and on the VPS add `--cache-dir <SOLAR_CACHE_DIR>` for the expiry check. Exit code 1 = something flagged.
   Print recommended panels, kW, payback, NPV, export share and verdict.
3. Flag: non-200s (except the expected NO_COVERAGE one), specific yield outside 700–1,400 kWh/kW, verdicts that differ from
   `expectedVerdict`, responses over 3 s, and (if I'm on the VPS or B's machine) any disk-cache entry whose
   `fetchedAt` is within 3 days of expiry, so it can be re-warmed before the demo.

Output a compact table. Don't change app code.
