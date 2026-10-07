export type ReservationStatus = "pending" | "confirmed" | "cancelled";

export type Reservation = {
  id: string;
  confirmation: string;
  name: string;
  phone: string | null;
  email: string | null;
  partySize: number;
  time: string; // "HH:MM" 24h
  notes: string | null;
  status: ReservationStatus;
  contacted: boolean; // we've texted them since Resy went down
  source: "resy-email" | "sms-agent" | "waitlist";
  history: string[];
};

export type SmsMessage = {
  id: string;
  phone: string;
  direction: "in" | "out";
  body: string;
  at: number;
};

export type ActivityItem = {
  id: string;
  at: number;
  kind: "info" | "good" | "warn" | "ai";
  text: string;
};

export type ResyEvent = {
  type: "new" | "modified" | "cancelled";
  confirmation: string;
  name: string;
  phone: string | null;
  email: string | null;
  partySize: number | null;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM
  notes: string | null;
  emailIndex: number;
};

export type InboxEmail = {
  index: number;
  from: string;
  subject: string;
  body: string;
};

/** What one inbox email turned into, shown next to it in the dashboard's inbox panel. */
export type EmailOutcome = {
  kind: "booking" | "update" | "cancel" | "later" | "skip" | "review";
  label: string;
};

export type RebuildPhase = "idle" | "fetching" | "reading" | "done";

export type RebuildProgress = {
  run: number;
  phase: RebuildPhase;
  phaseAt: number | null; // when the current phase started
  total: number; // emails in the inbox being rebuilt
  cursor: number; // index of the email most recently applied to the book, -1 before any
  read: boolean[]; // by email index: the extractor has finished with it
  outcomes: (EmailOutcome | null)[]; // by email index
};

/** A guest who wanted a time that was full. Freed tables are offered to them by text, first YES wins. */
export type WaitlistEntry = {
  id: string;
  phone: string;
  name: string | null;
  partySize: number;
  time: string; // "HH:MM" 24h
  status: "waiting" | "offered" | "booked";
  at: number;
};

/** A simulated outbound email (nothing is actually sent). Shown in the dashboard's outbox. */
export type OutboundEmail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  at: number;
  reservationId: string | null;
};
