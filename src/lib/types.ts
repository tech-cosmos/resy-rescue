export type ReservationStatus = "pending" | "confirmed" | "cancelled";

export type Reservation = {
  id: string;
  confirmation: string;
  name: string;
  phone: string | null;
  partySize: number;
  time: string; // "HH:MM" 24h
  notes: string | null;
  status: ReservationStatus;
  contacted: boolean; // we've texted them since Resy went down
  source: "resy-email" | "sms-agent";
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
