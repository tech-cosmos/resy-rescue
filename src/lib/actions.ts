import { buildInbox } from "@/data/inbox";
import { handleInbound } from "./agent";
import { slotGrid } from "./capacity";
import { extractInBatches, reconcile, type SkippedEmail } from "./extract";
import { llm, MODEL } from "./llm";
import { emailConfirmationRequest } from "./mailer";
import { log, RESTAURANT, sendSms, state } from "./store";
import { fmt12, todayISO } from "./time";
import type { EmailOutcome, RebuildPhase, ResyEvent } from "./types";

// The rebuild is paced so the dashboard (polling /api/state) can show each step:
// emails arriving, batches being read, then each email being applied to the book in order.
const FETCH_MS = 45;
const APPLY_MS = 160;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function rebuildFromInbox() {
  const s = state();
  const run = s.rebuild.run + 1;
  // A reset swaps the state object and a newer rebuild bumps `run`; either way this one stops writing.
  const stale = () => state() !== s || s.rebuild.run !== run;
  const setPhase = (phase: RebuildPhase) => Object.assign(s.rebuild, { phase, phaseAt: Date.now() });

  const inbox = buildInbox();
  Object.assign(s, { inbox: [], reservations: [], needsReview: [], extractedBy: null, rebuiltAt: null });
  s.rebuild = { run, phase: "fetching", phaseAt: Date.now(), total: inbox.length, cursor: -1, read: [], outcomes: [] };
  log("info", "Gmail connected, fetching reservation emails");
  for (const email of inbox) {
    if (stale()) return;
    s.inbox.push(email);
    await sleep(FETCH_MS);
  }

  setPhase("reading");
  log(llm ? "ai" : "info", llm ? `${MODEL} is reading ${inbox.length} emails` : `Reading ${inbox.length} emails with Resy-format rules`);
  const results = extractInBatches(inbox);
  results.forEach((p, i) => void p.then(() => !stale() && (s.rebuild.read[i] = true)));

  // Apply strictly in inbox order (later changes and cancellations must win), each as soon as it's been read.
  const events: ResyEvent[] = [];
  const skipped: SkippedEmail[] = [];
  const extractors = new Set<string>();
  const today = todayISO();
  for (const email of inbox) {
    const result = await results[email.index];
    if (stale()) return;
    extractors.add(result.extractedBy);
    s.extractedBy = [...extractors].join(" + ");
    const event = result.events.find((e) => e.emailIndex === email.index);
    const skip = result.skipped.find((x) => x.emailIndex === email.index);
    if (event) events.push(event);
    if (skip) skipped.push(skip);
    s.reservations = reconcile(events);
    s.rebuild.outcomes[email.index] = describe(event, skip, today);
    s.rebuild.cursor = email.index;
    await sleep(APPLY_MS);
  }

  setPhase("done");
  s.rebuiltAt = Date.now();
  s.needsReview = skipped.filter((x) => x.review).map((x) => `"${inbox[x.emailIndex]?.subject}" from ${inbox[x.emailIndex]?.from}`);
  const live = s.reservations.filter((r) => r.status !== "cancelled");
  const cancelled = s.reservations.length - live.length;
  log(
    "good",
    `Rebuilt tonight's book: ${live.length} bookings, ${live.reduce((n, r) => n + r.partySize, 0)} covers` +
      (cancelled ? `, ${cancelled} cancellations applied` : ""),
  );
  for (const item of s.needsReview) log("warn", `Needs review (rules couldn't parse): ${item}`);
}

function describe(event: ResyEvent | undefined, skip: SkippedEmail | undefined, today: string): EmailOutcome {
  if (!event) {
    return skip?.review ? { kind: "review", label: skip.reason } : { kind: "skip", label: skip?.reason ?? "Not a reservation" };
  }
  const when = [event.partySize && `${event.partySize}`, event.time && `at ${fmt12(event.time)}`].filter(Boolean).join(" ");
  if (event.type === "cancelled") return { kind: "cancel", label: `${event.name} cancelled` };
  if (event.type === "modified") return { kind: "update", label: `${event.name} now ${when}` };
  if (event.date && event.date !== today) return { kind: "later", label: `${event.name} · not tonight` };
  return { kind: "booking", label: `${event.name}, ${when}` };
}

export type Channel = "sms" | "email";

/** Reach every unverified guest on the chosen channels (email is simulated: it lands in the outbox). */
export function sendConfirmations(channels: Channel[]) {
  const targets = state().reservations.filter((r) => r.status === "pending" && !r.contacted);
  let texts = 0;
  let emails = 0;
  for (const r of targets) {
    if (channels.includes("sms") && r.phone) {
      sendSms(
        r.phone,
        `Hi ${r.name.split(" ")[0]}, it's ${RESTAURANT}. Our booking system is down, but we have you for ` +
          `${r.partySize} at ${fmt12(r.time)} tonight. Reply YES to confirm, CANCEL to cancel, or text us any changes.`,
      );
      r.history.push("Confirmation text sent");
      texts++;
      r.contacted = true;
    }
    if (channels.includes("email") && emailConfirmationRequest(r)) {
      r.history.push("Confirmation email sent");
      emails++;
      r.contacted = true;
    }
  }
  log("info", `Sent ${[texts && `${texts} confirmation texts`, emails && `${emails} confirmation emails`].filter(Boolean).join(" and ") || "no confirmations (no contact details)"}`);
  return { texts, emails };
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
    waitlist: s.waitlist,
    outbox: s.outbox.slice(0, 80),
    activity: s.activity.slice(0, 60),
    grid: slotGrid(s.reservations),
    rebuiltAt: s.rebuiltAt,
    extractedBy: s.extractedBy,
    needsReview: s.needsReview,
    inbox: s.inbox,
    rebuild: s.rebuild,
    outageSince: s.outageSince,
    inboxCount: s.inbox.length,
    ai: llm ? MODEL : null,
    restaurant: RESTAURANT,
  };
}

export type Snapshot = ReturnType<typeof snapshot>;
