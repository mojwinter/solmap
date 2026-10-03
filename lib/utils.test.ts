import { describe, expect, it } from "vitest"
import { cn } from "./utils"

describe("cn knows the design system's theme names", () => {
  it("keeps a custom text size next to a text colour", () => {
    expect(cn("text-callout text-ink-secondary")).toBe("text-callout text-ink-secondary")
    expect(cn("font-rounded text-metric tabular-nums", "text-good-ink")).toBe(
      "font-rounded text-metric tabular-nums text-good-ink",
    )
  })

  it("still lets a later size or radius win", () => {
    expect(cn("text-body", "text-callout")).toBe("text-callout")
    expect(cn("rounded-lg", "rounded-pill")).toBe("rounded-pill")
    expect(cn("shadow-sm", "shadow-float")).toBe("shadow-float")
    expect(cn("font-sans", "font-rounded")).toBe("font-rounded")
  })
})
