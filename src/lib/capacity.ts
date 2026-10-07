import type { Reservation } from "./types";
import { fromMinutes, toMinutes } from "./time";

export const TABLES = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `T${i + 1}`, seats: 2 })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `T${i + 7}`, seats: 4 })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `T${i + 12}`, seats: 6 })),
];

export const FIRST_SEATING = "17:00";
export const LAST_SEATING = "21:30";
export const SLOTS: string[] = [];
for (let m = toMinutes(FIRST_SEATING); m <= toMinutes(LAST_SEATING); m += 30) SLOTS.push(fromMinutes(m));

export const turnMinutes = (party: number) => (party >= 5 ? 120 : 90);

type Seatable = Pick<Reservation, "id" | "partySize" | "time">;

/** Greedy table assignment: earliest bookings first, smallest table that fits and is free for the full turn. */
export function assignTables(list: Seatable[]): Map<string, string | null> {
  const sorted = [...list].sort((a, b) => toMinutes(a.time) - toMinutes(b.time) || b.partySize - a.partySize);
  const busy = new Map<string, Array<[number, number]>>(TABLES.map((t) => [t.id, []]));
  const result = new Map<string, string | null>();
  for (const r of sorted) {
    const start = toMinutes(r.time);
    const end = start + turnMinutes(r.partySize);
    const table = TABLES.filter((t) => t.seats >= r.partySize)
      .sort((a, b) => a.seats - b.seats)
      .find((t) => busy.get(t.id)!.every(([s, e]) => end <= s || start >= e));
    if (table) busy.get(table.id)!.push([start, end]);
    result.set(r.id, table?.id ?? null);
  }
  return result;
}

const active = (list: Reservation[]) => list.filter((r) => r.status !== "cancelled");

export function canSeat(list: Reservation[], partySize: number, time: string, excludeId?: string): boolean {
  if (partySize < 1 || partySize > 6) return false;
  const m = toMinutes(time);
  if (m < toMinutes(FIRST_SEATING) || m > toMinutes(LAST_SEATING)) return false;
  const probe = { id: "__probe__", partySize, time };
  const seats = assignTables([...active(list).filter((r) => r.id !== excludeId), probe]);
  return seats.get("__probe__") != null;
}

/** Nearest open slots to the requested time, for offering alternatives. */
export function alternatives(list: Reservation[], partySize: number, time: string, excludeId?: string): string[] {
  const target = toMinutes(time);
  return SLOTS.filter((s) => s !== time && canSeat(list, partySize, s, excludeId))
    .sort((a, b) => Math.abs(toMinutes(a) - target) - Math.abs(toMinutes(b) - target))
    .slice(0, 3)
    .sort();
}

export function slotGrid(list: Reservation[]) {
  const live = active(list);
  return SLOTS.map((time) => ({
    time,
    arriving: live.filter((r) => r.time === time).reduce((n, r) => n + r.partySize, 0),
    open2: canSeat(list, 2, time),
    open4: canSeat(list, 4, time),
    open6: canSeat(list, 6, time),
  }));
}
