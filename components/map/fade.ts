/** How long map layers take to crossfade (Satellite ⇄ Sun exposure). */
export const FADE_MS = 300;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Calls onFrame(t) with t easing 0 → 1 over `ms` (ease-in-out) on animation frames, for things the
 * map draws itself (Google polygons and overlays can't take CSS transitions). With
 * prefers-reduced-motion it jumps straight to t = 1 (DESIGN.md → Motion). Returns a cancel function.
 */
export function tween(onFrame: (t: number) => void, ms = FADE_MS): () => void {
  if (ms <= 0 || reducedMotion()) {
    onFrame(1);
    return () => {};
  }
  const start = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    const p = Math.min(1, (now - start) / ms);
    onFrame(p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
    if (p < 1) frame = requestAnimationFrame(step);
  });
  return () => cancelAnimationFrame(frame);
}
