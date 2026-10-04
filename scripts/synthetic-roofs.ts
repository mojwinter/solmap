/**
 * Synthetic roofs in the exact Google Solar `buildingInsights:findClosest` response shape.
 *
 * Pure: no fs, no Date. `scripts/make-synthetic.ts` writes the files, and
 * `scripts/make-synthetic.test.ts` checks them. Add a roof by appending a spec to `ROOFS`, then run
 * `pnpm tsx scripts/make-synthetic.ts`.
 *
 * Geometry is in metres around the roof's (lat, lng): dx = east, dy = north. The roofs are
 * axis-aligned (azimuths 0/90/180/270), which keeps the panel grids simple.
 *
 * The output mirrors the Python reference script that made `south-gable` and `shaded-gable`
 * byte for byte: Python's round() (half-to-even on the exact binary value), the same float
 * operation order, and `json.dump(indent=1)` formatting (floats keep their `.0`).
 */
import type {
  BuildingInsightsResponse,
  GDate,
  ImageryQuality,
  LatLng,
  RoofSegmentSizeAndSunshineStats,
  RoofSegmentSummary,
  SolarPanel,
  SolarPanelConfig,
} from "@/src/types/solar";
import { degreesPerMeter } from "@/lib/geo/meters";

/** Google's default 400 W panel. */
export const PANEL_WIDTH_M = 1.045;
export const PANEL_HEIGHT_M = 1.879;
export const PANEL_WATTS = 400;
/** Google only lists configs from this many panels up. */
export const MIN_CONFIG_PANELS = 4;

/** A coordinate along one axis: a fixed offset, or `sign * (start + i*step + step/2)` for i < count. */
export type Axis = number | { start: number; step: number; count: number; sign?: 1 | -1 };

export interface SegmentSpec {
  pitch: number;
  azimuth: number;
  /** Footprint E–W and N–S (m); also the segment's bounding box. */
  w: number;
  d: number;
  /** Footprint centre (m). */
  cx: number;
  cy: number;
  planeHeight: number;
  /** 11 ascending quantiles of annual sun hours on this segment. */
  quantiles: number[];
  /** Ground area when the face isn't the full w × d rectangle (hip triangles, trapezoids). */
  groundArea?: number;
}

/** A grid of panels on one segment. Rows (y) outer, columns (x) inner; yields follow that order. */
export interface ArraySpec {
  segmentIndex: number;
  x: Axis;
  y: Axis;
  /** DC kWh/yr per panel, one per placed panel (after `skip`). */
  yields: number[];
  /** [row, col] cells left empty (vents, HVAC units). */
  skip?: [number, number][];
  orientation?: SolarPanel["orientation"];
}

export interface RoofSpec {
  /** File name (without .json) and the `buildings/SYNTHETIC-<name>` id. */
  name: string;
  lat: number;
  lng: number;
  imageryQuality: ImageryQuality;
  note: string;
  /** Building centre and bounding box, as [dx, dy] offsets (m). */
  center: [number, number];
  bbox: [[number, number], [number, number]];
  segments: SegmentSpec[];
  arrays: ArraySpec[];
  imageryDate?: GDate;
  /** Referenced by fixtures/finance-golden.json: the CLI never overwrites it. */
  frozen?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Python-compatible number handling

/** Python's round(x, nd): correctly rounded, exact ties go to even. */
export function pyRound(x: number, nd = 0): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const a = Math.abs(x);
  // toFixed works on the exact binary value, so 100 digits show whether this is an exact tie.
  const exact = a.toFixed(100);
  const dot = exact.indexOf(".");
  const kept = exact.slice(0, dot + 1 + nd);
  const tail = exact.slice(dot + 1 + nd);
  let r = Number(a.toFixed(nd)); // ties round up here
  if (/^50*$/.test(tail) && Number(kept.replace(".", "").slice(-1)) % 2 === 0) r = Number(kept);
  return x < 0 ? -r : r;
}

const radians = (deg: number) => deg * (Math.PI / 180);

/** Distance between panel rows on a roof of this pitch, measured on the ground (m). */
export const rowStep = (pitch: number) => PANEL_HEIGHT_M * Math.cos(radians(pitch));

/** n values evenly from a to b (inclusive). */
export const lin = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, k) => (n === 1 ? a : a + ((b - a) * k) / (n - 1)));

/** Keys that hold floats in the Google response; printed with a trailing `.0` when whole. */
const FLOAT_KEYS = new Set([
  "latitude",
  "longitude",
  "pitchDegrees",
  "azimuthDegrees",
  "areaMeters2",
  "groundAreaMeters2",
  "yearlyEnergyDcKwh",
  "planeHeightAtCenterMeters",
  "maxArrayAreaMeters2",
  "carbonOffsetFactorKgPerMwh",
  "panelHeightMeters",
  "panelWidthMeters",
]);

const asciiString = (s: string) =>
  JSON.stringify(s).replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

/** Same text as Python's `json.dumps(value, indent=1)`. */
export function toPythonJson(value: unknown, indent = 1): string {
  const walk = (v: unknown, level: number, isFloat: boolean): string => {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return isFloat && Number.isInteger(v) ? `${v}.0` : String(v);
    if (typeof v === "string") return asciiString(v);
    if (typeof v === "boolean") return String(v);
    const pad = " ".repeat((level + 1) * indent);
    const close = " ".repeat(level * indent);
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      return `[\n${v.map((x) => pad + walk(x, level + 1, isFloat)).join(",\n")}\n${close}]`;
    }
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    if (entries.length === 0) return "{}";
    return `{\n${entries.map(([k, x]) => `${pad}${asciiString(k)}: ${walk(x, level + 1, FLOAT_KEYS.has(k))}`).join(",\n")}\n${close}}`;
  };
  return walk(value, 0, false);
}

// ---------------------------------------------------------------------------------------------
// The builder (port of the reference script's build())

const axisValues = (a: Axis): number[] =>
  typeof a === "number"
    ? [a]
    : Array.from({ length: a.count }, (_, i) => (a.sign ?? 1) * (a.start + i * a.step + a.step / 2));

export function buildRoof(spec: RoofSpec): BuildingInsightsResponse & { _note: string } {
  const { lat: mlat, lng: mlng } = degreesPerMeter(spec.lat);
  const P = (dx: number, dy: number): LatLng => ({
    latitude: pyRound(spec.lat + dy * mlat, 7),
    longitude: pyRound(spec.lng + dx * mlng, 7),
  });

  const panels: SolarPanel[] = [];
  for (const arr of spec.arrays) {
    if (!spec.segments[arr.segmentIndex]) throw new Error(`${spec.name}: bad segmentIndex ${arr.segmentIndex}`);
    const skip = new Set((arr.skip ?? []).map(([r, c]) => `${r},${c}`));
    let k = 0;
    axisValues(arr.y).forEach((dy, r) =>
      axisValues(arr.x).forEach((dx, c) => {
        if (skip.has(`${r},${c}`)) return;
        if (k >= arr.yields.length) throw new Error(`${spec.name}: more panels than yields on segment ${arr.segmentIndex}`);
        panels.push({
          center: P(dx, dy),
          orientation: arr.orientation ?? "PORTRAIT",
          yearlyEnergyDcKwh: pyRound(arr.yields[k++], 1),
          segmentIndex: arr.segmentIndex,
        });
      }),
    );
    if (k !== arr.yields.length) throw new Error(`${spec.name}: ${arr.yields.length} yields for ${k} panels`);
  }
  panels.sort((a, b) => b.yearlyEnergyDcKwh - a.yearlyEnergyDcKwh); // stable, like Python's sort

  const segStats: RoofSegmentSizeAndSunshineStats[] = spec.segments.map((s) => {
    const ground = s.groundArea ?? s.w * s.d;
    return {
      pitchDegrees: s.pitch,
      azimuthDegrees: s.azimuth,
      stats: {
        areaMeters2: pyRound(ground / Math.cos(radians(s.pitch)), 2),
        sunshineQuantiles: s.quantiles,
        groundAreaMeters2: pyRound(ground, 2),
      },
      center: P(s.cx, s.cy),
      boundingBox: { sw: P(s.cx - s.w / 2, s.cy - s.d / 2), ne: P(s.cx + s.w / 2, s.cy + s.d / 2) },
      planeHeightAtCenterMeters: s.planeHeight,
    };
  });

  const configs: SolarPanelConfig[] = [];
  for (let n = MIN_CONFIG_PANELS; n <= panels.length; n++) {
    const summ = new Map<number, RoofSegmentSummary>();
    let total = 0;
    for (const p of panels.slice(0, n)) {
      let s = summ.get(p.segmentIndex);
      if (!s) {
        const seg = spec.segments[p.segmentIndex];
        s = { pitchDegrees: seg.pitch, azimuthDegrees: seg.azimuth, panelsCount: 0, yearlyEnergyDcKwh: 0, segmentIndex: p.segmentIndex };
        summ.set(p.segmentIndex, s);
      }
      s.panelsCount += 1;
      s.yearlyEnergyDcKwh += p.yearlyEnergyDcKwh;
      total += p.yearlyEnergyDcKwh;
    }
    const summaries = [...summ.values()]
      .map((s) => ({ ...s, yearlyEnergyDcKwh: pyRound(s.yearlyEnergyDcKwh, 1) }))
      .sort((a, b) => a.segmentIndex - b.segmentIndex);
    configs.push({ panelsCount: n, yearlyEnergyDcKwh: pyRound(total, 1), roofSegmentSummaries: summaries });
  }

  let roofArea = 0;
  let groundArea = 0;
  for (const s of segStats) {
    roofArea += s.stats.areaMeters2;
    groundArea += s.stats.groundAreaMeters2;
  }
  const allq = segStats.flatMap((s) => s.stats.sunshineQuantiles).sort((a, b) => a - b);
  const wholeQ = Array.from({ length: 11 }, (_, k) => allq[pyRound((k * (allq.length - 1)) / 10)]);

  return {
    _note: spec.note,
    name: `buildings/SYNTHETIC-${spec.name}`,
    center: P(...spec.center),
    imageryDate: spec.imageryDate ?? { year: 2024, month: 8, day: 15 },
    imageryProcessedDate: { year: 2025, month: 3, day: 1 },
    postalCode: "V0V 0V0",
    administrativeArea: "BC",
    statisticalArea: "SYNTHETIC",
    regionCode: "CA",
    imageryQuality: spec.imageryQuality,
    boundingBox: { sw: P(...spec.bbox[0]), ne: P(...spec.bbox[1]) },
    solarPotential: {
      maxArrayPanelsCount: panels.length,
      maxArrayAreaMeters2: pyRound(panels.length * PANEL_WIDTH_M * PANEL_HEIGHT_M, 2),
      maxSunshineHoursPerYear: Math.max(...wholeQ),
      carbonOffsetFactorKgPerMwh: 26,
      panelCapacityWatts: PANEL_WATTS,
      panelHeightMeters: PANEL_HEIGHT_M,
      panelWidthMeters: PANEL_WIDTH_M,
      panelLifetimeYears: 20,
      wholeRoofStats: { areaMeters2: pyRound(roofArea, 2), sunshineQuantiles: wholeQ, groundAreaMeters2: pyRound(groundArea, 2) },
      buildingStats: { areaMeters2: pyRound(roofArea * 1.05, 2), sunshineQuantiles: wholeQ, groundAreaMeters2: pyRound(groundArea * 1.05, 2) },
      roofSegmentStats: segStats,
      solarPanels: panels,
      // Google leaves this out when not even MIN_CONFIG_PANELS fit (the "roof too small" case).
      solarPanelConfigs: configs.length > 0 ? configs : undefined,
    },
  };
}

/** The file text: Python-style indent=1 JSON with a trailing LF. */
export const renderRoof = (spec: RoofSpec) => toPythonJson(buildRoof(spec)) + "\n";

// ---------------------------------------------------------------------------------------------
// The roofs

const BASE_NOTE =
  "SYNTHETIC. Hand-made in the buildingInsights:findClosest response shape. NOT Google content, so it is safe " +
  "to commit (Google's 30-day caching limit does not apply). The roof geometry does not line up with the real " +
  "satellite imagery at these coordinates.";
const noteFor = (name: string, recipe: string, date = "2026-10-03") =>
  `${BASE_NOTE} Generated for the Solmap kit on ${date} by scripts/make-synthetic.ts (spec "${name}": ${recipe}).`;

// Yields: DC kWh/yr per 400 W panel ≈ 0.4 kW × 1,150 kWh/kW × MANUAL.orientationFactor (src/config/bc.ts).
// Quantiles: every panel's kWh per kW sits inside its segment's sunshineQuantiles range (the test checks).
const PW = PANEL_WIDTH_M;
/** A row of `count` columns centred on dx = 0. */
const cols = (count: number): Axis => ({ start: -(count * PW) / 2, step: PW, count });

/** The original 3-segment gable (south + north faces, west garage) from the reference script. */
function gable(
  name: string,
  lat: number,
  lng: number,
  south: number[],
  north: number[],
  west: number[],
  quantiles: [number[], number[], number[]],
  imageryQuality: ImageryQuality,
): RoofSpec {
  const row = rowStep(30);
  return {
    name,
    lat,
    lng,
    imageryQuality,
    frozen: true,
    note: `${BASE_NOTE} Generated for the Solmap kit on 2026-10-03.`,
    center: [-1.5, 0.0],
    bbox: [
      [-11.0, -6.0],
      [8.0, 6.0],
    ],
    segments: [
      { pitch: 30, azimuth: 180, w: 14, d: 5, cx: 0, cy: -2.5, planeHeight: 6.8, quantiles: quantiles[0] },
      { pitch: 30, azimuth: 0, w: 14, d: 5, cx: 0, cy: 2.5, planeHeight: 6.8, quantiles: quantiles[1] },
      { pitch: 20, azimuth: 265, w: 3, d: 6, cx: -8.5, cy: -1, planeHeight: 3.4, quantiles: quantiles[2] },
    ],
    arrays: [
      { segmentIndex: 0, x: { start: -6.27, step: PW, count: 12 }, y: { start: 0.3, step: row, count: 2, sign: -1 }, yields: south },
      { segmentIndex: 1, x: { start: -6.27, step: PW, count: 12 }, y: { start: 0.3, step: row, count: 2, sign: 1 }, yields: north },
      // west garage: one row running N–S
      { segmentIndex: 2, x: -8.5, y: { start: -3.6, step: PW, count: 5 }, yields: west },
    ],
  };
}

const row3 = rowStep(3);
const row22 = rowStep(22);
const row25 = rowStep(25);

export const ROOFS: RoofSpec[] = [
  gable("south-gable", 49.25, -123.15, lin(478, 432, 24), lin(300, 262, 24), lin(392, 371, 5),
    [
      [905, 1180, 1222, 1248, 1265, 1279, 1290, 1301, 1312, 1324, 1352],
      [402, 580, 640, 676, 701, 720, 737, 752, 768, 789, 841],
      [612, 860, 921, 955, 978, 996, 1010, 1023, 1037, 1052, 1093],
    ], "HIGH"),
  gable("shaded-gable", 49.2615, -123.1702, lin(330, 214, 24), lin(190, 140, 24), lin(236, 186, 5),
    [
      [240, 352, 430, 492, 548, 598, 646, 694, 748, 820, 1010],
      [180, 260, 318, 362, 400, 432, 461, 489, 520, 560, 690],
      [240, 365, 452, 528, 590, 640, 684, 724, 766, 815, 930],
    ], "MEDIUM"),

  // Burnaby. Commercial flat roof, 3° pitch facing south, 14 × 5 grid minus a 2 × 2 HVAC unit.
  // Flat factor 0.88 → ~405 kWh per panel.
  {
    name: "flat-roof",
    lat: 49.2488,
    lng: -122.98,
    imageryQuality: "HIGH",
    note: noteFor("flat-roof", "18 x 12 m flat roof, 3 deg pitch, azimuth 180, 66 panels around an HVAC unit"),
    center: [0, 0],
    bbox: [[-10, -7], [10, 7]],
    segments: [
      { pitch: 3, azimuth: 180, w: 18, d: 12, cx: 0, cy: 0, planeHeight: 8.5,
        quantiles: [760, 985, 1042, 1068, 1084, 1096, 1105, 1113, 1121, 1130, 1150] },
    ],
    arrays: [
      { segmentIndex: 0, x: cols(14), y: { start: -(5 * row3) / 2, step: row3, count: 5 },
        skip: [[2, 9], [2, 10], [3, 9], [3, 10]], yields: lin(416, 388, 66) },
    ],
  },

  // Oak Bay, Victoria. Gable with the ridge running N–S: east and west faces only, no south face.
  // E/W factor 0.82 → ~377 kWh per panel; west a touch better (morning marine cloud).
  {
    name: "east-west",
    lat: 48.4265,
    lng: -123.3165,
    imageryQuality: "HIGH",
    note: noteFor("east-west", "N-S ridge, 25 deg faces at azimuth 90 and 270, 2 x 11 panels each"),
    center: [0, 0],
    bbox: [[-6, -7], [6, 7]],
    segments: [
      { pitch: 25, azimuth: 90, w: 5, d: 12, cx: 2.5, cy: 0, planeHeight: 6.5,
        quantiles: [610, 820, 868, 892, 906, 918, 928, 937, 946, 956, 985] },
      { pitch: 25, azimuth: 270, w: 5, d: 12, cx: -2.5, cy: 0, planeHeight: 6.5,
        quantiles: [620, 835, 880, 905, 919, 931, 941, 950, 960, 971, 1000] },
    ],
    arrays: [
      { segmentIndex: 0, x: { start: 0.3, step: row25, count: 2, sign: 1 }, y: cols(11), yields: lin(378, 356, 22) },
      { segmentIndex: 1, x: { start: 0.3, step: row25, count: 2, sign: -1 }, y: cols(11), yields: lin(386, 364, 22) },
    ],
  },

  // Kelowna. A 3 × 2.8 m garden shed: one 1.879 m panel needs 1.63 m of ground depth on a 30° face
  // that is only 1.4 m deep, so nothing fits. solarPanels is [] and solarPanelConfigs is absent.
  {
    name: "tiny-roof",
    lat: 49.888,
    lng: -119.496,
    imageryQuality: "HIGH",
    note: noteFor("tiny-roof", "3 x 2.8 m shed, two 1.4 m deep 30 deg faces, no panel fits, so no solarPanelConfigs"),
    center: [0, 0],
    bbox: [[-2, -1.8], [2, 1.8]],
    segments: [
      { pitch: 30, azimuth: 180, w: 3, d: 1.4, cx: 0, cy: -0.7, planeHeight: 2.6,
        quantiles: [700, 1150, 1250, 1290, 1310, 1325, 1338, 1350, 1362, 1375, 1400] },
      { pitch: 30, azimuth: 0, w: 3, d: 1.4, cx: 0, cy: 0.7, planeHeight: 2.6,
        quantiles: [380, 520, 580, 610, 632, 650, 666, 680, 695, 712, 760] },
    ],
    arrays: [],
  },

  // Richmond. 3-storey townhouse block, 32 × 13 m gable, 3 × 30 panels per face = 180 (> 150).
  // South at 22° ≈ 0.98 → ~450 kWh; north at 22° ≈ 0.72 → ~330 kWh.
  {
    name: "multi-unit",
    lat: 49.1666,
    lng: -123.1336,
    imageryQuality: "HIGH",
    note: noteFor("multi-unit", "32 x 13 m townhouse block, 22 deg gable, 3 x 30 panels per face, 180 panels"),
    center: [0, 0],
    bbox: [[-17, -7.5], [17, 7.5]],
    segments: [
      { pitch: 22, azimuth: 180, w: 32, d: 6.5, cx: 0, cy: -3.25, planeHeight: 11.5,
        quantiles: [880, 1150, 1195, 1220, 1236, 1249, 1260, 1270, 1281, 1294, 1325] },
      { pitch: 22, azimuth: 0, w: 32, d: 6.5, cx: 0, cy: 3.25, planeHeight: 11.5,
        quantiles: [470, 700, 760, 792, 812, 828, 842, 855, 868, 884, 925] },
    ],
    arrays: [
      { segmentIndex: 0, x: cols(30), y: { start: 0.3, step: row22, count: 3, sign: -1 }, yields: lin(470, 425, 90) },
      { segmentIndex: 1, x: cols(30), y: { start: 0.3, step: row22, count: 3, sign: 1 }, yields: lin(345, 300, 90) },
    ],
  },

  // Kamloops. Ordinary 13 × 9 m hip roof (4 m ridge, 25°) seen only by satellite: imageryQuality BASE.
  // Trapezoid S face holds 4 + 7 panels, the E and W triangles 4 each, N none. Sunnier than the coast.
  {
    name: "base-quality",
    lat: 50.6745,
    lng: -120.3273,
    imageryQuality: "BASE",
    imageryDate: { year: 2023, month: 7, day: 4 },
    note: noteFor("base-quality", "13 x 9 m hip roof, 25 deg, BASE satellite imagery, 19 panels on S/E/W faces"),
    center: [0, 0],
    bbox: [[-7.5, -5.5], [7.5, 5.5]],
    segments: [
      { pitch: 25, azimuth: 180, w: 13, d: 4.5, cx: 0, cy: -2.25, planeHeight: 5.2, groundArea: 38.25,
        quantiles: [980, 1270, 1318, 1345, 1362, 1376, 1388, 1399, 1410, 1424, 1460] },
      { pitch: 25, azimuth: 0, w: 13, d: 4.5, cx: 0, cy: 2.25, planeHeight: 5.2, groundArea: 38.25,
        quantiles: [450, 640, 700, 735, 760, 780, 797, 812, 828, 848, 900] },
      { pitch: 25, azimuth: 90, w: 4.5, d: 9, cx: 4.25, cy: 0, planeHeight: 5.2, groundArea: 20.25,
        quantiles: [700, 950, 1000, 1025, 1042, 1055, 1066, 1076, 1087, 1100, 1135] },
      { pitch: 25, azimuth: 270, w: 4.5, d: 9, cx: -4.25, cy: 0, planeHeight: 5.2, groundArea: 20.25,
        quantiles: [720, 975, 1025, 1050, 1068, 1081, 1093, 1104, 1115, 1128, 1165] },
    ],
    arrays: [
      // S face narrows towards the 4 m ridge: 4 panels in the upper row, 7 in the lower one.
      { segmentIndex: 0, x: cols(4), y: { start: 0.3, step: row25, count: 1, sign: -1 }, yields: lin(498, 490, 4) },
      { segmentIndex: 0, x: cols(7), y: { start: 0.3 + row25, step: row25, count: 1, sign: -1 }, yields: lin(494, 470, 7) },
      { segmentIndex: 2, x: 5.35, y: cols(4), yields: lin(405, 393, 4) },
      { segmentIndex: 3, x: -5.35, y: cols(4), yields: lin(415, 400, 4) },
    ],
  },
];
