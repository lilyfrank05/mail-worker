/** Heartbeat monitoring — pure time helpers, testable without I/O. */

export const TIMEZONE = "Australia/Melbourne";

export const HEARTBEAT_SLOTS: ReadonlyArray<{ hour: number; minute: number }> = [
  { hour: 10, minute: 0 },
  { hour: 16, minute: 0 },
];

export const GRACE_MINUTES = 5;

export interface WallTime {
  y: number; // 4-digit year
  mo: number; // 1-12
  d: number; // 1-31
  h: number; // 0-23
  m: number; // 0-59
}

/** Convert a Date to wall-clock components in the given IANA timezone. */
export function localWallTime(date: Date, tz: string = TIMEZONE): WallTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  return {
    y: value("year"),
    mo: value("month"),
    d: value("day"),
    h: value("hour") % 24, // hour12:false may emit "24" for midnight
    m: value("minute"),
  };
}

/** Compare two WallTime values; negative = a < b, positive = a > b, zero = equal. */
export function cmpWall(a: WallTime, b: WallTime): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.mo !== b.mo) return a.mo - b.mo;
  if (a.d !== b.d) return a.d - b.d;
  if (a.h !== b.h) return a.h - b.h;
  return a.m - b.m;
}

function addMinutes(w: WallTime, minutes: number): WallTime {
  const dt = new Date(Date.UTC(w.y, w.mo - 1, w.d, w.h, w.m + minutes));
  return {
    y: dt.getUTCFullYear(),
    mo: dt.getUTCMonth() + 1,
    d: dt.getUTCDate(),
    h: dt.getUTCHours(),
    m: dt.getUTCMinutes(),
  };
}

function dayBefore(w: WallTime): WallTime {
  const dt = new Date(Date.UTC(w.y, w.mo - 1, w.d - 1));
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(), h: 0, m: 0 };
}

/** Return the most recent heartbeat slot whose deadline (slot + grace) has passed,
 *  or null if no slot is due yet. Considers today's and yesterday's slots. */
export function dueSlot(now: WallTime): WallTime | null {
  const today = now;
  const yesterday = dayBefore(now);
  let best: WallTime | null = null;
  for (const day of [today, yesterday]) {
    for (const s of HEARTBEAT_SLOTS) {
      const slot: WallTime = { y: day.y, mo: day.mo, d: day.d, h: s.hour, m: s.minute };
      const deadline = addMinutes(slot, GRACE_MINUTES);
      if (cmpWall(now, deadline) >= 0 && (!best || cmpWall(slot, best) > 0)) {
        best = slot;
      }
    }
  }
  return best;
}

/** Stable dedup key for a slot, e.g. "2026-08-13T10". */
export function slotKey(slot: WallTime): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${slot.y}-${p(slot.mo)}-${p(slot.d)}T${p(slot.h)}`;
}