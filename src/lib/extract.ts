import { z } from "zod";
import type { InboxEmail, Reservation, ResyEvent } from "./types";
import { llm, MODEL, stripFences } from "./llm";
import { normalizePhone, parseTime, todayISO } from "./time";

const EventSchema = z.object({
  type: z.enum(["new", "modified", "cancelled"]),
  confirmation: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  partySize: z.number().int().nullable(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  notes: z.string().nullable(),
  emailIndex: z.number().int(),
});
const ExtractionSchema = z.object({
  events: z.array(EventSchema),
  skipped: z.array(z.object({ emailIndex: z.number().int(), reason: z.string() })),
});

// Some providers behind OpenRouter reject the "$schema" meta key.
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void $schema;
  return rest;
}

/** An email that produced no event. `review` marks ones a human should read (free-form guest emails). */
export type SkippedEmail = { emailIndex: number; reason: string; review?: boolean };
export type ExtractionResult = { events: ResyEvent[]; skipped: SkippedEmail[]; extractedBy: string };

// One LLM call over the whole inbox takes ~30s; small parallel batches come back in a few seconds
// each, so the book can start filling while later emails are still being read.
const BATCH_SIZE = 5;

/** Starts extracting every email at once. Returns one promise per email (shared by its batch), in inbox order. */
export function extractInBatches(inbox: InboxEmail[], now = new Date()): Promise<ExtractionResult>[] {
  if (!llm) {
    const all = Promise.resolve(extractWithRules(inbox));
    return inbox.map(() => all);
  }
  const batches: Promise<ExtractionResult>[] = [];
  for (let i = 0; i < inbox.length; i += BATCH_SIZE) {
    const batch = inbox.slice(i, i + BATCH_SIZE);
    batches.push(
      extractWithLLM(batch, now).catch((err) => {
        console.error("LLM extraction failed, falling back to rules for this batch:", err);
        return extractWithRules(batch);
      }),
    );
  }
  return inbox.map((_, i) => batches[Math.floor(i / BATCH_SIZE)]);
}

async function extractWithLLM(inbox: InboxEmail[], now: Date): Promise<ExtractionResult> {
  const emails = inbox
    .map((e) => `--- EMAIL ${e.index} ---\nFrom: ${e.from}\nSubject: ${e.subject}\n\n${e.body}`)
    .join("\n\n");

  const res = await llm!.chat.completions.create({
    model: MODEL,
    response_format: {
      type: "json_schema",
      json_schema: { name: "reservation_events", schema: jsonSchema(ExtractionSchema) },
    },
    messages: [
      {
        role: "system",
        content:
          "You help reconstruct a restaurant's reservation book from emails in its inbox while the booking system is offline. " +
          "For every email that creates, modifies, or cancels a reservation, emit one event. This includes informal emails " +
          "forwarded by guests that mention a booking (treat those as type 'new'). Skip newsletters and anything else, listing them in 'skipped'.\n" +
          `Today is ${now.toDateString()} (${todayISO(now)}). Output dates as YYYY-MM-DD and times as 24h HH:MM. ` +
          "For modified events, use the UPDATED time and party size. Use null for unknown fields. Respond with JSON only.",
      },
      { role: "user", content: emails },
    ],
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) throw new Error("empty LLM response");
  const parsed = ExtractionSchema.parse(JSON.parse(stripFences(raw)));
  return {
    events: parsed.events.map((e) => ({ ...e, time: e.time ? parseTime(e.time) ?? e.time : null })),
    skipped: parsed.skipped,
    extractedBy: MODEL,
  };
}

/** Deterministic fallback: understands Resy's notification format, nothing else. */
export function extractWithRules(inbox: InboxEmail[]): ExtractionResult {
  const events: ResyEvent[] = [];
  const skipped: SkippedEmail[] = [];
  const field = (body: string, label: string) => body.match(new RegExp(`^${label}:\\s*(.+)$`, "mi"))?.[1]?.trim() ?? null;

  for (const email of inbox) {
    if (email.from !== "notifications@resy.com") {
      if (/reserv|booking|tonight|table/i.test(email.subject + email.body) && !/digest/i.test(email.subject)) {
        skipped.push({ emailIndex: email.index, reason: "Free-form email, rules can't read it", review: true });
      } else {
        skipped.push({ emailIndex: email.index, reason: "Not a reservation" });
      }
      continue;
    }
    const type = /cancel/i.test(email.subject) ? "cancelled" : /updated|modified/i.test(email.subject) ? "modified" : "new";
    const confirmation = field(email.body, "Confirmation #");
    const name = field(email.body, "Guest");
    if (!confirmation || !name) {
      skipped.push({ emailIndex: email.index, reason: "Missing guest or confirmation #", review: true });
      continue;
    }

    const dateStr = field(email.body, "Date");
    const date = dateStr ? todayISO(new Date(dateStr.replace(/^\w+,\s*/, ""))) : null;
    const time = field(email.body, type === "modified" ? "Updated Time" : "Time");
    const party = field(email.body, type === "modified" ? "Updated Party Size" : "Party Size");

    events.push({
      type,
      confirmation,
      name,
      phone: field(email.body, "Phone"),
      partySize: party ? Number(party) : null,
      date,
      time: time ? parseTime(time) : null,
      notes: field(email.body, "Special Requests"),
      emailIndex: email.index,
    });
  }
  return { events, skipped, extractedBy: "rules (no OPENROUTER_API_KEY)" };
}

/** Replay events in inbox order, so later updates and cancellations win. Keeps tonight's bookings only. */
export function reconcile(events: ResyEvent[], now = new Date()): Reservation[] {
  const today = todayISO(now);
  const byConf = new Map<string, Reservation & { date: string | null }>();

  for (const e of [...events].sort((a, b) => a.emailIndex - b.emailIndex)) {
    const existing = byConf.get(e.confirmation);
    if (e.type === "new" || !existing) {
      if (e.type === "cancelled" && !existing) continue;
      byConf.set(e.confirmation, {
        id: `r_${e.confirmation}`, // stable across partial replays so rows don't remount as the book fills
        confirmation: e.confirmation,
        name: e.name,
        phone: normalizePhone(e.phone),
        partySize: e.partySize ?? 2,
        time: e.time ?? "19:00",
        notes: e.notes,
        status: "pending",
        contacted: false,
        source: "resy-email",
        history: [`Booked via Resy (email #${e.emailIndex})`],
        date: e.date,
      });
      continue;
    }
    if (e.type === "cancelled") {
      existing.status = "cancelled";
      existing.history.push(`Cancelled via Resy (email #${e.emailIndex})`);
    } else {
      if (e.time) existing.time = e.time;
      if (e.partySize) existing.partySize = e.partySize;
      if (e.phone) existing.phone = normalizePhone(e.phone) ?? existing.phone;
      existing.history.push(`Modified via Resy (email #${e.emailIndex})`);
    }
  }

  return [...byConf.values()]
    .filter((r) => r.date === today)
    .map((r): Reservation => {
      const { date, ...rest } = r;
      void date;
      return rest;
    })
    .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}
