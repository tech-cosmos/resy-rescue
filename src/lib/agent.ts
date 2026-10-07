import type OpenAI from "openai";
import type { Reservation } from "./types";
import { llm, MODEL } from "./llm";
import { alternatives, canSeat, FIRST_SEATING, LAST_SEATING } from "./capacity";
import { findActiveByPhone, log, recordInbound, RESTAURANT, sendSms, state, uid } from "./store";
import { findTimeInText, fmt12, normalizePhone, parseTime } from "./time";

const YES = /^\s*(y|yes|yep|yeah|yup|confirm(ed)?|see you|we'?ll be there|👍)\b/i;
const CANCEL = /^\s*(cancel|can'?t make it|no longer)/i;

/** Entry point for every inbound text. Handles YES/CANCEL directly; everything else goes to the AI host. */
export async function handleInbound(rawPhone: string, body: string): Promise<string> {
  const phone = normalizePhone(rawPhone) ?? rawPhone;
  recordInbound(phone, body);
  const res = findActiveByPhone(phone);

  let reply: string;
  // Fast path only for plain replies; "yes but we're 3 now" needs the agent.
  const plain = !/\d|\bbut\b|\bchange\b|\binstead\b/i.test(body);
  if (res && plain && YES.test(body)) {
    reply = confirm(res);
  } else if (res && plain && CANCEL.test(body)) {
    reply = cancel(res);
  } else if (llm) {
    try {
      reply = await runAgent(phone);
    } catch (err) {
      console.error("agent failed, using rules:", err);
      reply = ruleBasedReply(phone, body);
    }
  } else {
    reply = ruleBasedReply(phone, body);
  }

  sendSms(phone, reply);
  return reply;
}

// ---- actions shared by the fast path, the rules fallback, and the AI tools ----

function confirm(r: Reservation): string {
  r.status = "confirmed";
  r.history.push("Guest confirmed by text");
  log("good", `${r.name} confirmed (${r.partySize} @ ${fmt12(r.time)})`);
  return `Thank you, ${first(r)}! You're confirmed for ${r.partySize} at ${fmt12(r.time)} tonight. See you soon.`;
}

function cancel(r: Reservation): string {
  r.status = "cancelled";
  r.history.push("Guest cancelled by text");
  log("warn", `${r.name} cancelled. ${r.partySize}-top at ${fmt12(r.time)} is free again`);
  return `No problem, ${first(r)}. Your ${fmt12(r.time)} reservation is cancelled. Hope to see you another night!`;
}

function modify(r: Reservation, time: string | null, partySize: number | null) {
  const newTime = time ?? r.time;
  const newParty = partySize ?? r.partySize;
  if (!canSeat(state().reservations, newParty, newTime, r.id)) {
    return { ok: false as const, alternatives: alternatives(state().reservations, newParty, newTime, r.id).map(fmt12) };
  }
  const before = `${r.partySize} @ ${fmt12(r.time)}`;
  r.time = newTime;
  r.partySize = newParty;
  r.status = "confirmed";
  r.history.push(`Changed by text: ${before} → ${newParty} @ ${fmt12(newTime)}`);
  log("ai", `${r.name} moved ${before} → ${newParty} @ ${fmt12(newTime)}`);
  return { ok: true as const, reservation: summary(r) };
}

function book(phone: string, name: string, partySize: number, time: string, notes: string | null) {
  const list = state().reservations;
  if (!canSeat(list, partySize, time)) {
    return { ok: false as const, alternatives: alternatives(list, partySize, time).map(fmt12) };
  }
  const r: Reservation = {
    id: uid("r"),
    confirmation: `TXT-${Math.floor(10000 + Math.random() * 90000)}`,
    name,
    phone,
    partySize,
    time,
    notes,
    status: "confirmed",
    contacted: true,
    source: "sms-agent",
    history: ["Booked by AI host over text"],
  };
  list.push(r);
  list.sort((a, b) => a.time.localeCompare(b.time));
  log("ai", `New booking by text: ${name}, ${partySize} @ ${fmt12(time)}`);
  return { ok: true as const, reservation: summary(r) };
}

const first = (r: Reservation) => r.name.split(" ")[0];
const summary = (r: Reservation) => ({
  name: r.name,
  partySize: r.partySize,
  time: fmt12(r.time),
  status: r.status,
  confirmation: r.confirmation,
});

// ---- AI host (OpenRouter, OpenAI-compatible tool calling) ----

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  fn("get_my_reservation", "Look up tonight's reservation for the guest texting us (matched by phone number).", {}),
  fn("check_availability", "Check whether a party can be seated tonight at a time. Returns nearby alternatives if not.", {
    party_size: { type: "integer", minimum: 1, maximum: 6 },
    time: { type: "string", description: "24h HH:MM, e.g. 20:30" },
  }, ["party_size", "time"]),
  fn("book_table", "Book a new table tonight for the guest texting us. Only call once you know their name, party size and time.", {
    name: { type: "string", description: "Guest's full name" },
    party_size: { type: "integer", minimum: 1, maximum: 6 },
    time: { type: "string", description: "24h HH:MM" },
    notes: { type: "string", description: "Allergies, occasions, etc." },
  }, ["name", "party_size", "time"]),
  fn("modify_reservation", "Change the time and/or party size of the guest's existing reservation.", {
    time: { type: "string", description: "New time, 24h HH:MM" },
    party_size: { type: "integer", minimum: 1, maximum: 6 },
  }),
  fn("confirm_reservation", "Mark the guest's existing reservation as confirmed.", {}),
  fn("cancel_reservation", "Cancel the guest's existing reservation.", {}),
];

function fn(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: "function" as const,
    function: { name, description, parameters: { type: "object", properties, required } },
  };
}

function runTool(phone: string, name: string, args: Record<string, unknown>): unknown {
  const r = findActiveByPhone(phone);
  const time = typeof args.time === "string" ? parseTime(args.time) : null;
  const party = typeof args.party_size === "number" ? args.party_size : null;
  switch (name) {
    case "get_my_reservation":
      return r ? summary(r) : { found: false };
    case "check_availability":
      if (!time || !party) return { error: "need party_size and time" };
      return canSeat(state().reservations, party, time)
        ? { available: true }
        : { available: false, alternatives: alternatives(state().reservations, party, time).map(fmt12) };
    case "book_table":
      if (r) return { error: "This guest already has a reservation tonight; use modify_reservation instead.", existing: summary(r) };
      if (!time || !party || typeof args.name !== "string") return { error: "need name, party_size and time" };
      return book(phone, args.name, party, time, typeof args.notes === "string" ? args.notes : null);
    case "modify_reservation":
      if (!r) return { error: "no reservation found for this phone number" };
      return modify(r, time, party);
    case "confirm_reservation":
      if (!r) return { error: "no reservation found for this phone number" };
      confirm(r);
      return { ok: true, reservation: summary(r) };
    case "cancel_reservation":
      if (!r) return { error: "no reservation found for this phone number" };
      cancel(r);
      return { ok: true };
    default:
      return { error: `unknown tool ${name}` };
  }
}

async function runAgent(phone: string): Promise<string> {
  const thread = state().messages.filter((m) => m.phone === phone).slice(-12);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        `You are the host at ${RESTAURANT}, replying to guests by SMS. Our reservation system (Resy) is temporarily down, ` +
        `so you manage tonight's book directly with your tools. Today is ${new Date().toDateString()}; it is now ` +
        `${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. ` +
        `Seatings run ${fmt12(FIRST_SEATING)}–${fmt12(LAST_SEATING)}, parties of 1–6 (larger groups: ask them to call). ` +
        `The guest's phone is ${phone}. Always check the guest's existing reservation and real availability with tools before ` +
        `promising anything. If a time is full, offer the alternatives returned. To book someone new you need their name. ` +
        `Replies are SMS: warm, one to three short sentences, no markdown.`,
    },
    ...thread.map((m) => ({ role: m.direction === "in" ? ("user" as const) : ("assistant" as const), content: m.body })),
  ];

  for (let i = 0; i < 6; i++) {
    const res = await llm!.chat.completions.create({ model: MODEL, messages, tools });
    const msg = res.choices[0]?.message;
    if (!msg) break;
    messages.push(msg);
    const calls = msg.tool_calls?.filter((c) => c.type === "function") ?? [];
    if (calls.length === 0) return msg.content?.trim() || "Thanks! A member of our team will text you back shortly.";
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* treat as no args */
      }
      const out = runTool(phone, call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out) });
    }
  }
  return "Thanks! A member of our team will text you back shortly.";
}

// ---- rules fallback when no OPENROUTER_API_KEY is set ----

function ruleBasedReply(phone: string, body: string): string {
  const r = findActiveByPhone(phone);
  let time = timeOf(body);
  let party = partyOf(body);

  if (r) {
    if (!time && !party) return `Hi ${first(r)}, you're down for ${r.partySize} at ${fmt12(r.time)} tonight. Reply YES to confirm or CANCEL to cancel.`;
    const out = modify(r, time, party);
    return out.ok
      ? `Done! You're now confirmed for ${r.partySize} at ${fmt12(r.time)} tonight.`
      : `Sorry, that's full. We can do ${out.alternatives.join(", ") || "another night"}. Reply with a time that works.`;
  }

  // New guest: carry details across the conversation so "what name?" → "Sam Lee" works.
  const thread = state().messages.filter((m) => m.phone === phone);
  const inbound = thread.filter((m) => m.direction === "in").map((m) => m.body);
  const lastOut = thread.filter((m) => m.direction === "out").at(-1)?.body ?? "";
  for (const text of inbound.slice(0, -1).reverse()) {
    time ??= timeOf(text);
    party ??= partyOf(text);
  }
  const name =
    body.match(/(?:this is|i'?m|name is|it'?s|under)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/)?.[1] ??
    (/what name/i.test(lastOut) ? body.trim().replace(/[.!]$/, "") : undefined);
  if (!time || !party) return `Hi! This is ${RESTAURANT}. We'd love to have you tonight. How many people, and what time?`;
  if (!canSeat(state().reservations, party, time)) {
    const alts = alternatives(state().reservations, party, time).map(fmt12);
    return `Sorry, ${fmt12(time)} is full for ${party}. We can do ${alts.join(", ") || "another night"}.`;
  }
  if (!name) return `Good news: ${fmt12(time)} for ${party} is available! What name should I put it under?`;
  const out = book(phone, name, party, time, null);
  return out.ok ? `You're booked! ${name}, ${party} at ${fmt12(time)} tonight. See you then.` : "Sorry, that slot just filled up.";
}

const PARTY = /\b(?:for|party of|we'?re|we are|now)\s+(\d)\b(?!\s*(?::|am|pm))|\b(\d)\s+(?:people|of us|guests|ppl|pax)\b/i;

function partyOf(text: string): number | null {
  const m = text.match(PARTY);
  return m ? Number(m[1] ?? m[2]) : null;
}

function timeOf(text: string): string | null {
  return findTimeInText(text.replace(new RegExp(PARTY.source, "gi"), " "));
}
