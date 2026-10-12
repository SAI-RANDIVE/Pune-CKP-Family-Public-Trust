/** "2 days 4 hrs left" for a number of milliseconds, or null when the time is up. Used on the server and in the browser. */
export function describeTimeLeft(ms) {
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} day${d === 1 ? '' : 's'} ${h} hr${h === 1 ? '' : 's'} left`;
  if (h > 0) return `${h} hr${h === 1 ? '' : 's'} ${m} min left`;
  return `${m} min ${String(s % 60).padStart(2, '0')} sec left`;
}
