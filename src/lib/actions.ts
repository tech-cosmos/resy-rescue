import { buildInbox } from "@/data/inbox";
import { handleInbound } from "./agent";
import { slotGrid } from "./capacity";
import { extractEvents, reconcile } from "./extract";
import { llm, MODEL } from "./llm";
import { log, RESTAURANT, sendSms, state } from "./store";
import { fmt12 } from "./time";

export async function rebuildFromInbox() {
  const s = state();
  s.inbox = buildInbox();
  log("info", `Scanning inbox: ${s.inbox.length} emails`);
  const { events, needsReview, extractedBy } = await extractEvents(s.inbox);
  s.reservations = reconcile(events);
  s.needsReview = needsReview;
  s.extractedBy = extractedBy;
  s.rebuiltAt = Date.now();
  const live = s.reservations.filter((r) => r.status !== "cancelled");
  const cancelled = s.reservations.length - live.length;
  log(
    "good",
    `Rebuilt tonight's book: ${live.length} bookings, ${live.reduce((n, r) => n + r.partySize, 0)} covers` +
      (cancelled ? `, ${cancelled} cancellations applied` : ""),
  );
  for (const item of needsReview) log("warn", `Needs review (rules couldn't parse): ${item}`);
}

export function textAllGuests() {
  const targets = state().reservations.filter((r) => r.status === "pending" && !r.contacted && r.phone);
  for (const r of targets) {
    sendSms(
      r.phone!,
      `Hi ${r.name.split(" ")[0]}, it's ${RESTAURANT}. Our booking system is down, but we have you for ` +
        `${r.partySize} at ${fmt12(r.time)} tonight. Reply YES to confirm, CANCEL to cancel, or text us any changes.`,
    );
    r.contacted = true;
    r.history.push("Confirmation text sent");
  }
  log("info", `Sent ${targets.length} confirmation texts`);
  return targets.length;
}

// Scripted guest behaviour so the demo shows a realistic mix of replies.
const SCRIPT: Array<string | null> = [
  "Yes! See you then",
  "yes",
  "Can we push to 8:30 instead?",
  "YES 👍",
  "Yes thank you",
  "cancel, sorry something came up",
  null,
  "Yes",
  "yep we'll be there",
  "Yes but we're now 3 people, is that ok?",
  "yes!",
  null,
  "Confirm",
  "yes see you tonight",
];

export function simulateReplies() {
  const awaiting = state().reservations.filter((r) => r.status === "pending" && r.contacted && r.phone);
  let delay = 400;
  awaiting.forEach((r, i) => {
    const reply = SCRIPT[i % SCRIPT.length];
    if (!reply) return;
    setTimeout(() => void handleInbound(r.phone!, reply).catch(console.error), delay);
    delay += 700;
  });
  log("info", `Simulating replies from ${awaiting.length} guests`);
}

export function snapshot() {
  const s = state();
  return {
    reservations: s.reservations,
    messages: s.messages,
    activity: s.activity.slice(0, 60),
    grid: slotGrid(s.reservations),
    rebuiltAt: s.rebuiltAt,
    extractedBy: s.extractedBy,
    needsReview: s.needsReview,
    outageSince: s.outageSince,
    inboxCount: s.inbox.length,
    ai: llm ? MODEL : null,
    restaurant: RESTAURANT,
  };
}

export type Snapshot = ReturnType<typeof snapshot>;
