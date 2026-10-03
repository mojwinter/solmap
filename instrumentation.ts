// Runs once when the Next.js server starts. Creating the Solar stores prunes Google responses older
// than SOLAR_CACHE_MAX_AGE_DAYS from the disk cache and schedules the hourly prune (docs/INFRA.md).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getLayersStore } = await import("./lib/solar/layers-cache");
    getLayersStore(); // also creates the building store (getSolarStore)
  }
}
