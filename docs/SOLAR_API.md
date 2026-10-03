# Google Solar API cheat-sheet

Owner: **B (API & Infra)**, with A for the map geometry. Types: `src/types/solar.ts`.

## Endpoints we use

| Endpoint | When | SKU |
|---|---|---|
| `GET https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=&location.longitude=&requiredQuality=&key=` | Every report (P0) | Essentials |
| `GET https://solar.googleapis.com/v1/dataLayers:get?location.latitude=&location.longitude=&radiusMeters=&view=&requiredQuality=&key=` | Heatmap toggle only (P1) | Enterprise (pricier) |
| `GET https://solar.googleapis.com/v1/geoTiff:get?id=...&key=` | Fetch rasters returned by dataLayers (P1) | – |

Limits: 600 queries/minute per endpoint. Set a daily quota in Cloud Console → Google Maps
Platform → Quotas, plus a billing budget alert.

## buildingInsights: fields we actually use

```
name                          "buildings/ChIJ…" (stable building id; OK to keep in the URL)
center {latitude, longitude}
boundingBox {sw, ne}          fit the map to this
imageryDate {year,month,day}  show as confidence info
imageryQuality                HIGH | MEDIUM | BASE | LOW
regionCode                    "CA" expected
administrativeArea            "BC" expected; pass it through so the UI can warn near the border
solarPotential
  maxArrayPanelsCount
  maxArrayAreaMeters2
  maxSunshineHoursPerYear
  carbonOffsetFactorKgPerMwh  don't lead with this for BC (hydro grid)
  panelCapacityWatts          400 since Apr 2024 (was 250); scale if user picks another wattage
  panelHeightMeters / panelWidthMeters   1.879 × 1.045 m; for drawing panels
  panelLifetimeYears
  wholeRoofStats {areaMeters2, sunshineQuantiles[11], groundAreaMeters2}
  roofSegmentStats[]          {pitchDegrees, azimuthDegrees, stats, center, boundingBox, planeHeightAtCenterMeters}
  solarPanels[]               {center, orientation LANDSCAPE|PORTRAIT, yearlyEnergyDcKwh, segmentIndex}
                              sorted best-first
  solarPanelConfigs[]         {panelsCount, yearlyEnergyDcKwh, roofSegmentSummaries[]}
                              ascending panelsCount; config i uses solarPanels[0 … panelsCount)
  financialAnalyses           US only → ignore for BC
```

## Quality and coverage

| `imageryQuality` | Source | Status for BC |
|---|---|---|
| `HIGH` | ~0.1 m/px low-altitude aerial | GA where available (check the coverage map for each demo address) |
| `MEDIUM` | ~0.25 m/px high-altitude aerial | GA |
| `LOW` | ~0.5 m/px+ satellite | In the enum; unclear if served in Canada |
| `BASE` | 0.25 m/px enhanced satellite (Sept 2025) | GA only in listed countries (LATAM, parts of Asia). **Experimental in Canada**: needs `experiments=EXPANDED_COVERAGE` + `requiredQuality=BASE` (pre-GA terms) |

- `requiredQuality` is a **minimum**. The API always returns the best quality it has. Omitting it
  means HIGH only, which 404s in a lot of places.
- So make **one** call with `requiredQuality=LOW`. It's never worse than asking for MEDIUM first and
  then falling back, and it costs one request instead of two.
- Optional second call (env `SOLAR_EXPANDED_COVERAGE=1`): on 404, retry with
  `experiments=EXPANDED_COVERAGE&requiredQuality=BASE`. **Before the event**, B runs the three curls
  in PLAN.md → Pre-event checklist to confirm `LOW` is accepted and whether `EXPANDED_COVERAGE`
  returns anything for a BC 404 address. If it doesn't, leave the flag off.
- `exactQualityRequired=true` is for when you want *only* one quality. We don't.

## Gotchas

1. **404 `NOT_FOUND`** = no imagery at `requiredQuality` or better. Coverage maps are
   approximate and 404s can happen inside "covered" areas. Show the no-coverage state (see above for the optional retry).
2. A 400 `INVALID_ARGUMENT` usually means a bad param (e.g. a quality value the API rejects).
   Map it to our 502 `UPSTREAM` and log it loudly, since it's our bug, not the user's.
3. `findClosest` returns **one** building, the closest to the point. A geocoded point can land on the
   street or a neighbour. Use the Places result's location, and let users **click their roof** on
   the map to re-query (A: map click → new lat/lng → new report URL).
4. Some roofs return `solarPotential` without `solarPanelConfigs` (too small). Treat
   `configs.length === 0` as "Not recommended, roof too small/shaded".
5. `solarPanels` can be long (hundreds). Create the polygons **once** per building, then toggle
   visibility (`setMap(map)` / `setMap(null)`) for indices ≥ count when the slider moves. Re-creating
   polygons on every slider tick won't hit the 16 ms target. `roofSegmentStats` and `solarPanels`
   can be missing on tiny roofs, so zod should default them to `[]`.
6. dataLayers GeoTIFF URLs **need the API key appended**, which is why they go through our proxy.
   They are raster files; decode with `geotiff` npm, colour-map the flux values, and draw to
   a canvas used as a `GroundOverlay` bounded by the raster's bbox. Apply the `maskUrl` raster
   so only the roof is coloured. Google's sample app does exactly this (link below).
7. EEA-billing-address restrictions don't apply to us (Canadian billing).
8. **Places:** use `google.maps.places.PlaceAutocompleteElement` (Places API (New)). The legacy
   `google.maps.places.Autocomplete` widget isn't available to projects created after
   2025-03-01, and most tutorials (and Claude's habits) still use it. Get coordinates with
   `place.fetchFields({ fields: ['location', 'formattedAddress'] })`. No separate Geocoding call.
   `@vis.gl/react-google-maps` has no autocomplete component; wrap the element yourself
   (the library's examples include one).

## Drawing a panel (A)

Each `solarPanels[j]` has a centre, an orientation and a `segmentIndex`. The panel's rotation
is the segment's `azimuthDegrees`. Width/height swap for `LANDSCAPE`. Offsets in metres →
lat/lng with `google.maps.geometry.spherical.computeOffset(center, distance, heading)`:

```
w = panelWidthMeters / 2, h = panelHeightMeters / 2      (swap if LANDSCAPE)
azimuth = roofSegmentStats[segmentIndex].azimuthDegrees
corners = [(+w,+h), (+w,−h), (−w,−h), (−w,+h)] → for each (x,y):
  heading = atan2(x, y) in degrees + azimuth
  dist    = hypot(x, y)
  point   = computeOffset(center, dist, heading)
```

(The sample repo's `panels` rendering does the same; copy the approach, not the Svelte code.
See [Prior art](#prior-art-googles-sample-app).)

## Prior art: Google's sample app

Before designing a fix for a Solar or Maps problem, check whether Google's sample already solved it:
[googlemaps-samples/js-solar-potential](https://github.com/googlemaps-samples/js-solar-potential/tree/9e844ed90e5526b400200513fcefca537d287d3c/src/routes)
(Svelte 4 + Material Web, Apache-2.0; links pinned to the 2025-10-31 commit). Read it for the
**decision**, then write our own React/TS. If you port a chunk nearly verbatim, keep Google's
license header on it, and check the hackathon's pre-written-code rule first.

| Problem | Where it's solved (`src/routes/`) | Fits our rules? |
|---|---|---|
| Panel centre + azimuth + orientation → polygon corners | `sections/BuildingInsightsSection.svelte` (`showSolarPotential`) | Yes, same maths as "Drawing a panel" above |
| Slider that stays fast with 100+ panels | Same file: build polygons once, toggle `setMap` by index | Yes |
| Colour panels by energy | `visualize.ts` (`createPalette`, `normalize`), `colors.ts` (`panelsPalette`) | Yes |
| Decode a GeoTIFF and get its lat/lng bounds (UTM → WGS84) | `solar.ts` (`downloadGeoTIFF`: `geotiff` + `proj4` + `geotiff-geokeys-to-proj4`) | Yes for decoding, but **fetch through `/api/solar/geotiff`**: the sample adds the key in the browser |
| Flux heatmap: palette, roof mask, value range | `layer.ts` (`annualFlux`: iron palette, 0–1800), `visualize.ts` (`renderPalette`, `renderRGB`) | Yes |
| Put a raster on the map | `sections/DataLayersSection.svelte`: canvas → `GroundOverlay` | Yes |
| Monthly / hourly flux animation | `layer.ts` (`monthlyFlux`, `hourlyShade`) | Yes (P2) |
| Calling the Solar API | `solar.ts` (`findClosestBuilding`, `getDataLayerUrls`) | **No.** Browser-side with the Maps key; we proxy (Rule 1) |
| Address search | `components/SearchBar.svelte` | **No.** Legacy `places.Autocomplete`; we use `PlaceAutocompleteElement` |
| Costs, savings, payback | `sections/SolarPotentialSection.svelte` | **No.** US net-metering model; ours is BC RS 2289 (FINANCIAL_MODEL.md) |

Not in the sample (we solve these ourselves): fitting the map to the building, re-querying on map
click, Map ID, caching, 404 handling, pitch foreshortening (it draws panels at full slope length,
about 13% too long downslope on a 30° roof).

## Policies to respect

- Show `Source: Includes solar data from Google` next to Solar data. Keep the Google Maps logo visible.
- If Solar data is shown on a map, it must be a **Google** map.
- **Caching:** the Maps Service Specific Terms let you *temporarily* cache Building Insights and
  Data Layers results for **up to 30 consecutive days**, after which they must be deleted. Place IDs
  may be stored indefinitely. What that means for us:
  - In-memory LRU (minutes): fine.
  - Disk cache (`fixtures/solar/`, gitignored, every entry stamped with `fetchedAt`): fine because the
    app ignores and deletes entries older than 25 days. Warm the demo addresses **within 25 days of
    demo day**; if the event is further out, re-warm the week before.
  - **Never commit a real response to git.** History is forever, so that's > 30 days. CI and hour-0 dev
    use the **synthetic** fixtures in `fixtures/synthetic/`, which are hand-made, not Google content.
  - No DB storage of responses, ever.
- Need a public Terms of Use and Privacy Policy page if the app goes public beyond the demo
  (D: two short static pages in the footer).

## Links

- Overview: https://developers.google.com/maps/documentation/solar/overview
- buildingInsights: https://developers.google.com/maps/documentation/solar/building-insights
- Coverage map + GeoJSON: https://developers.google.com/maps/documentation/solar/coverage
- Non-US cost method: https://developers.google.com/maps/documentation/solar/calculate-costs-non-us
- Usage & billing: https://developers.google.com/maps/documentation/solar/usage-and-billing
- Policies & attribution: https://developers.google.com/maps/documentation/solar/policies
- Service Specific Terms (Solar caching, 30 days): https://cloud.google.com/maps-platform/terms/maps-service-terms
- Imagery quality enum: https://developers.google.com/maps/documentation/solar/reference/rest/v1/ImageryQuality
- Release notes (BASE quality, coverage changes): https://developers.google.com/maps/documentation/solar/release-notes
- Place Autocomplete (New) migration: https://developers.google.com/maps/documentation/javascript/places-migration-autocomplete
- Sample app (TypeScript types, GeoTIFF rendering): https://github.com/googlemaps-samples/js-solar-potential
  (what to take from it and what not: [Prior art](#prior-art-googles-sample-app))
