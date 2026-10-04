import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import demo from "@/fixtures/demo-addresses.json";
import { parseLatLng } from "@/lib/solar/http";

// Every demo address must be a lookup /api/solar/building accepts (#71): the route answers 400 for a
// point outside BC's box, which would break the demo link and pnpm demo:check before Google is asked.
const rows = [...demo.fixtures.map((r) => ({ ...r, list: "fixtures" })), ...demo.live.map((r) => ({ ...r, list: "live" }))];

describe("demo addresses", () => {
  it.each(rows)("$list · $label is inside BC's box", ({ lat, lng }) => {
    const parsed = parseLatLng(new Request(`http://test/api/solar/building?lat=${lat}&lng=${lng}`));
    expect(parsed).toEqual({ lat, lng });
  });

  it("has no live entry left as TODO", () => {
    for (const r of demo.live) {
      expect(r.address).not.toBe("TODO");
      expect(r.lat).not.toBe(0);
      expect(r.lng).not.toBe(0);
    }
  });

  it("covers every live story: Strong, Moderate, Weak and the no-coverage state", () => {
    const verdicts = new Set(demo.live.map((r) => r.expectedVerdict));
    for (const v of ["strong", "moderate", "weak", "NO_COVERAGE"]) expect(verdicts).toContain(v);
  });
});
