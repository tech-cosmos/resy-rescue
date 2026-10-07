import type { ActivityItem, InboxEmail, RebuildProgress, Reservation, SmsMessage } from "./types";

// In-memory state for the demo. Lives on globalThis so it survives dev hot reloads.
// Single-process only: swap for a real database before deploying anywhere serverless.
export type State = {
  inbox: InboxEmail[];
  reservations: Reservation[];
  messages: SmsMessage[];
  activity: ActivityItem[];
  rebuiltAt: number | null;
  extractedBy: string | null;
  needsReview: string[];
  rebuild: RebuildProgress;
  outageSince: number;
};

const g = globalThis as unknown as { __resyRescue?: State };

export function freshState(): State {
  const outage = new Date();
  outage.setHours(13, 42, 0, 0);
  return {
    inbox: [],
    reservations: [],
    messages: [],
    activity: [],
    rebuiltAt: null,
    extractedBy: null,
    needsReview: [],
    rebuild: { run: 0, phase: "idle", phaseAt: null, total: 0, cursor: -1, read: [], outcomes: [] },
    outageSince: outage.getTime(),
  };
}

export function state(): State {
  if (!g.__resyRescue) g.__resyRescue = freshState();
  return g.__resyRescue;
}

export function resetState() {
  g.__resyRescue = freshState();
}

let seq = 0;
export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function log(kind: ActivityItem["kind"], text: string) {
  state().activity.unshift({ id: uid("a"), at: Date.now(), kind, text });
}

export function sendSms(phone: string, body: string) {
  state().messages.push({ id: uid("m"), phone, direction: "out", body, at: Date.now() });
}

export function recordInbound(phone: string, body: string) {
  state().messages.push({ id: uid("m"), phone, direction: "in", body, at: Date.now() });
}

export function findActiveByPhone(phone: string): Reservation | undefined {
  return state().reservations.find((r) => r.phone === phone && r.status !== "cancelled");
}

export const RESTAURANT = "Osteria Lucia";
