import { createCn } from "cn/config"

// Teach the class merger the design system's custom theme names (app/globals.css). Without this it
// reads `text-callout` as a colour and drops it when a real colour follows (`text-callout text-ink`).
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["display-xl", "display", "title", "metric-xl", "metric", "headline", "body", "callout", "footnote"] },
      ],
      "font-family": [{ font: ["display", "rounded"] }],
      rounded: [{ rounded: ["pill"] }],
      shadow: [{ shadow: ["float", "control", "sheen"] }],
    },
  },
})
