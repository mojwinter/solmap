// Runs once when the Next.js server starts. Creating the Solar store prunes Google responses older
// than SOLAR_CACHE_MAX_AGE_DAYS from the disk cache and schedules the hourly prune (docs/INFRA.md).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getSolarStore } = await import("./lib/solar/cache");
    getSolarStore();
  }
}
