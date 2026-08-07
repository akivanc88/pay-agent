/**
 * Formatting and copy helpers shared by the activity console (approval inbox + run timeline).
 *
 * Kept framework-agnostic (no JSX) so both server components and the client decide widget can
 * import it without pulling "use client" along for the ride.
 */

/** "2:14 PM" for something that happened today, "Aug 5" (or "Aug 5, 2024" across a year
 *  boundary) otherwise — never a raw ISO string on screen. */
export function formatClock(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

/** "just now" / "12m ago" / "3h ago" for the inbox's sense of urgency; falls back to
 *  `formatClock` once something is more than a day old, where relative time stops being useful. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return formatClock(iso, now);
}

/** A light, deterministic reformat of a raw id — "acme-store" → "Acme Store". Never invents a
 *  brand fact, just makes the id readable; the raw id is always shown alongside it too. */
export function humanizeId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Truncates a long token (a JWS) to a short, still-legible, never-wrapping form. The full
 *  value is always what gets copied — this is a display convenience only. */
export function truncateMiddle(value: string, head = 22, tail = 10): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
