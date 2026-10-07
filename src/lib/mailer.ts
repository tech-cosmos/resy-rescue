import type { Reservation } from "./types";
import { RESTAURANT, sendEmail, state } from "./store";
import { fmt12 } from "./time";

// Simulated email channel. Every message lands in the dashboard outbox; nothing is actually sent.
// Going real: swap sendEmail() for a Gmail API send from the connected inbox.

const appUrl = () => process.env.APP_URL ?? state().origin ?? "http://localhost:3000";
const respondLink = (r: Reservation, action: "confirm" | "cancel") =>
  `${appUrl()}/api/respond?r=${encodeURIComponent(r.id)}&a=${action}`;
const first = (r: Reservation) => r.name.split(" ")[0];
const booking = (r: Reservation) => `${r.partySize} ${r.partySize === 1 ? "guest" : "guests"} · tonight at ${fmt12(r.time)}`;
const footer = `\n\n${RESTAURANT}\nOur booking system is temporarily down, so we're confirming reservations directly.`;

/** Ask the guest to confirm, with one-click Confirm / Cancel links. */
export function emailConfirmationRequest(r: Reservation) {
  if (!r.email) return false;
  sendEmail(
    r.email,
    `Please confirm your reservation tonight at ${RESTAURANT}`,
    `Hi ${first(r)},\n\nOur reservation system is down, but your table is safe. We have you down for:\n\n` +
      `  ${booking(r)}\n  Confirmation #: ${r.confirmation}\n` +
      (r.notes ? `  Notes: ${r.notes}\n` : "") +
      `\nPlease let us know you're still coming:\n\n` +
      `  ✅ Confirm: ${respondLink(r, "confirm")}\n  ❌ Cancel:  ${respondLink(r, "cancel")}\n\n` +
      `Need to change the time or party size? Just text us${r.phone ? ` from ${r.phone}` : ""}.` +
      footer,
    r.id,
  );
  return true;
}

type Receipt = "confirmed" | "cancelled" | "changed";

/** Receipt after any change to the booking, whichever channel it came through. */
export function emailReceipt(r: Reservation, kind: Receipt, detail?: string) {
  if (!r.email) return;
  const subject = {
    confirmed: `You're confirmed for tonight at ${RESTAURANT}`,
    cancelled: `Your reservation at ${RESTAURANT} is cancelled`,
    changed: `Your reservation at ${RESTAURANT} has been updated`,
  }[kind];
  const lead = {
    confirmed: "Thanks for confirming! We look forward to seeing you.",
    cancelled: "Your reservation has been cancelled. We hope to see you another night.",
    changed: `Your reservation has been updated${detail ? ` (${detail})` : ""}.`,
  }[kind];
  sendEmail(
    r.email,
    subject,
    `Hi ${first(r)},\n\n${lead}\n\n  ${booking(r)}\n  Confirmation #: ${r.confirmation}\n` +
      (kind !== "cancelled" ? `\nCan't make it after all? Cancel here: ${respondLink(r, "cancel")}` : "") +
      footer,
    r.id,
  );
}
