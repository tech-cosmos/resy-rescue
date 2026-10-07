"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "@/lib/actions";
import type { EmailOutcome, RebuildPhase, Reservation, WaitlistEntry } from "@/lib/types";
import { fmt12 } from "@/lib/time";
import GmailMark from "./GmailMark";

async function post(path: string, body?: unknown): Promise<Snapshot> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const REBUILDING: RebuildPhase[] = ["fetching", "reading"];
const CHANNELS = { both: ["sms", "email"], sms: ["sms"], email: ["email"] } as const;

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [channel, setChannel] = useState<keyof typeof CHANNELS>("both");
  const rebuildingRef = useRef(false);

  // Poll fast while the inbox is being rebuilt so each email shows up as it's processed.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    // Arriving from the landing page's "Connect Gmail" reads the inbox straight away (unless a read is already running).
    let autoStart = new URL(window.location.href).searchParams.get("connected") === "gmail";
    const startRebuild = async () => {
      setBusy("rebuild");
      rebuildingRef.current = true;
      try {
        const data = await post("/api/rebuild");
        if (alive) setSnap(data);
      } finally {
        if (alive) setBusy(null);
      }
    };

    const tick = async () => {
      try {
        const data: Snapshot = await (await fetch("/api/state", { cache: "no-store" })).json();
        if (!alive) return;
        rebuildingRef.current = REBUILDING.includes(data.rebuild.phase);
        setSnap(data);
        if (autoStart) {
          autoStart = false;
          const url = new URL(window.location.href);
          url.searchParams.delete("connected");
          window.history.replaceState(null, "", url);
          if (!REBUILDING.includes(data.rebuild.phase)) void startRebuild();
        }
      } catch {}
      if (alive) timer = setTimeout(tick, rebuildingRef.current ? 200 : 1200);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const run = async (label: string, path: string, body?: unknown) => {
    setBusy(label);
    if (label === "rebuild") rebuildingRef.current = true;
    try {
      setSnap(await post(path, body));
    } finally {
      setBusy(null);
    }
  };

  if (!snap) return <div className="p-10 text-stone-500">Loading…</div>;

  const rebuilding = busy === "rebuild" || REBUILDING.includes(snap.rebuild.phase);

  const live = snap.reservations.filter((r) => r.status !== "cancelled");
  const stats = {
    bookings: live.length,
    covers: live.reduce((n, r) => n + r.partySize, 0),
    confirmed: live.filter((r) => r.status === "confirmed").length,
    awaiting: live.filter((r) => r.status === "pending" && r.contacted).length,
    untexted: live.filter((r) => r.status === "pending" && !r.contacted).length,
    freed: snap.reservations.filter((r) => r.status === "cancelled" && r.history.some((h) => /cancelled by (text|email)/.test(h))).length,
    byText: live.filter((r) => r.source === "sms-agent").length,
    rebooked: live.filter((r) => r.source === "waitlist").length,
  };
  const outage = new Date(snap.outageSince).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-display text-2xl leading-none tracking-tight text-stone-900 hover:text-[#c8402a]">
              Resy <em>Rescue</em>
            </Link>
            <span className="h-8 w-px bg-stone-200" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{snap.restaurant} · Tonight&apos;s Book</h1>
              <p className="text-sm text-stone-500">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-medium text-stone-700 ring-1 ring-stone-200"
              title="Demo: a sample inbox stands in for Gmail"
            >
              <GmailMark className="h-3.5 w-3.5" /> Gmail connected · demo
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 font-medium text-red-700 ring-1 ring-red-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> Resy offline since {outage}
            </span>
            <span
              className={`rounded-full px-3 py-1 font-medium ring-1 ${
                snap.ai ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-stone-50 text-stone-600 ring-stone-200"
              }`}
              title={snap.ai ? "Using OpenRouter" : "Set OPENROUTER_API_KEY in .env.local to enable AI"}
            >
              {snap.ai ? `AI: ${snap.ai}` : "AI off · rules mode"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6">
        <section className="grid gap-3 md:grid-cols-3">
          <Step
            n={1}
            title="Rebuild from inbox"
            detail={
              rebuilding
                ? rebuildStatus(snap)
                : snap.rebuiltAt
                  ? `${snap.inboxCount} emails parsed by ${snap.extractedBy}`
                  : "Read Resy notification emails to recover tonight's bookings"
            }
            done={!!snap.rebuiltAt && !rebuilding}
            progress={rebuilding ? rebuildProgress(snap) : undefined}
            action={rebuilding ? "Rebuilding…" : snap.rebuiltAt ? "Rebuild again" : "Rebuild book"}
            disabled={!!busy || rebuilding}
            onClick={() => run("rebuild", "/api/rebuild")}
          />
          <Step
            n={2}
            title="Contact every guest"
            detail={stats.untexted ? `${stats.untexted} guests haven't been contacted` : "Ask each guest to confirm, cancel, or tell us a change"}
            done={!!snap.rebuiltAt && stats.untexted === 0}
            action={`Send ${stats.untexted || ""} confirmations`.replace("  ", " ")}
            disabled={!!busy || rebuilding || !snap.rebuiltAt || stats.untexted === 0}
            onClick={() => run("confirm", "/api/confirm", { channels: CHANNELS[channel] })}
          >
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as keyof typeof CHANNELS)}
              className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm"
            >
              <option value="both">Text + email</option>
              <option value="sms">Text only</option>
              <option value="email">Email only (simulated)</option>
            </select>
          </Step>
          <Step
            n={3}
            title="Guests reply"
            detail={stats.awaiting ? `${stats.awaiting} awaiting a reply` : "Replies update the book live"}
            done={!!snap.rebuiltAt && stats.awaiting === 0 && stats.untexted === 0}
            action="Simulate guest replies"
            disabled={!!busy || rebuilding || stats.awaiting === 0}
            onClick={() => run("simulate", "/api/simulate")}
          />
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Bookings tonight" value={stats.bookings} sub={`${stats.covers} covers`} />
          <Stat label="Confirmed" value={stats.confirmed} tone="green" />
          <Stat label="Awaiting reply" value={stats.awaiting} tone="amber" sub={stats.awaiting ? "call if no reply by 5pm" : undefined} />
          <Stat label="Not yet texted" value={stats.untexted} />
          <Stat
            label="Freed by cancellation"
            value={stats.freed}
            tone="red"
            sub={stats.rebooked ? `${stats.rebooked} rebooked from waitlist` : snap.waitlist.some((w) => w.status !== "booked") ? "waitlist ready to rebook" : undefined}
          />
          <Stat label="Booked by text" value={stats.byText} tone="violet" />
        </section>

        {snap.needsReview.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Needs a human:</strong> {snap.needsReview.join("; ")}. Turn on AI to parse free-form emails.
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <Inbox snap={snap} rebuilding={rebuilding} />
          <div className="min-w-0 space-y-5">
            <ReservationTable
              reservations={snap.reservations}
              rebuilding={rebuilding}
              activePhone={activePhone}
              onSelect={(r) => r.phone && setActivePhone(r.phone)}
            />
            <AvailabilityGrid grid={snap.grid} />
            <Waitlist entries={snap.waitlist} />
          </div>
          <div className="grid content-start gap-5 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
            <Phone snap={snap} activePhone={activePhone} setActivePhone={setActivePhone} onSnap={setSnap} />
            <Outbox emails={snap.outbox} />
            <Activity items={snap.activity} />
          </div>
        </div>

        <div className="pb-6 text-right">
          <button
            className="text-xs text-stone-400 underline hover:text-stone-600"
            onClick={() => {
              setActivePhone(null);
              void run("reset", "/api/reset");
            }}
          >
            Reset demo
          </button>
        </div>
      </main>
    </div>
  );
}

function rebuildStatus(snap: Snapshot): string {
  const { phase, phaseAt, cursor, total, read } = snap.rebuild;
  if (phase === "fetching") return `Fetching emails from Gmail… ${snap.inbox.length} of ${total}`;
  if (phase === "reading") {
    const secs = phaseAt ? Math.max(0, Math.floor((Date.now() - phaseAt) / 1000)) : 0;
    return `Read ${read.filter(Boolean).length} of ${total} · ${cursor + 1} applied to the book · ${secs}s`;
  }
  return "Connecting to Gmail…";
}

/** 0–1 across the whole rebuild: fetching is the first 10%, then reading and applying share the rest. */
function rebuildProgress(snap: Snapshot): number {
  const { phase, cursor, read } = snap.rebuild;
  const total = Math.max(1, snap.rebuild.total);
  if (phase === "fetching") return 0.1 * (snap.inbox.length / total);
  if (phase === "reading") return 0.1 + 0.45 * (read.filter(Boolean).length / total) + 0.45 * ((cursor + 1) / total);
  return 0.02;
}

function Step(props: {
  n: number;
  title: string;
  detail: string;
  action: string;
  done: boolean;
  progress?: number;
  disabled: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  const active = props.progress !== undefined;
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            props.done ? "bg-emerald-600 text-white" : active ? "animate-pulse bg-[#c8402a] text-white" : "bg-stone-900 text-white"
          }`}
        >
          {props.done ? "✓" : props.n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{props.title}</div>
          <div className="truncate text-sm text-stone-500" title={props.detail}>
            {props.detail}
          </div>
          {active && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-[#c8402a] transition-[width] duration-300 ease-out"
                style={{ width: `${Math.min(100, props.progress! * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>
      {props.children}
      <button
        onClick={props.onClick}
        disabled={props.disabled}
        className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
      >
        {props.action}
      </button>
    </div>
  );
}

const TONES = {
  default: "text-stone-900",
  green: "text-emerald-700",
  amber: "text-amber-600",
  red: "text-red-600",
  violet: "text-violet-700",
};

function Stat({ label, value, sub, tone = "default" }: { label: string; value: number; sub?: string; tone?: keyof typeof TONES }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${TONES[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

function StatusPill({ r }: { r: Reservation }) {
  const [label, cls] =
    r.status === "confirmed"
      ? ["Confirmed", "bg-emerald-50 text-emerald-700 ring-emerald-200"]
      : r.status === "cancelled"
        ? ["Cancelled", "bg-red-50 text-red-700 ring-red-200"]
        : r.contacted
          ? ["Awaiting reply", "bg-amber-50 text-amber-700 ring-amber-200"]
          : ["Unverified", "bg-stone-100 text-stone-600 ring-stone-200"];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>{label}</span>;
}

function ReservationTable({
  reservations,
  rebuilding,
  activePhone,
  onSelect,
}: {
  reservations: Reservation[];
  rebuilding: boolean;
  activePhone: string | null;
  onSelect: (r: Reservation) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <h2 className="font-semibold">Reservations</h2>
        <span className="text-xs text-stone-500">Click a row to open the guest&apos;s text thread</span>
      </div>
      {reservations.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-stone-500">
          {rebuilding ? (
            "Bookings will appear here as each email is applied…"
          ) : (
            <>
              Resy is down and the book is empty. Start with <strong>Rebuild book</strong>.
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Guest</th>
                <th className="px-4 py-2 font-medium">Party</th>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {reservations.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r)}
                  title={r.history.join("\n")}
                  className={`animate-row-in cursor-pointer hover:bg-stone-50 ${r.status === "cancelled" ? "text-stone-400" : ""} ${
                    activePhone && r.phone === activePhone ? "bg-violet-50/60" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-2 font-medium tabular-nums">{fmt12(r.time)}</td>
                  <td className="px-4 py-2">
                    <div className={r.status === "cancelled" ? "line-through" : ""}>{r.name}</div>
                    {r.notes && <div className="text-xs text-stone-500">{r.notes}</div>}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{r.partySize}</td>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-stone-500">{r.phone ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-stone-500">
                    {r.source === "sms-agent" ? "Text (AI host)" : r.source === "waitlist" ? "Waitlist rebook" : r.confirmation}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill r={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AvailabilityGrid({ grid }: { grid: Snapshot["grid"] }) {
  const maxCovers = Math.max(12, ...grid.map((g) => g.arriving));
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Availability tonight</h2>
        <div className="flex items-center gap-3 text-xs text-stone-500">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> open
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-stone-200" /> full
          </span>
          <span>14 tables · 90 min turns (2 hrs for 5+)</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-10 gap-1.5">
          {grid.map((g) => (
            <div key={g.time} className="flex flex-col items-center gap-1">
              <div className="flex h-16 w-full items-end rounded bg-stone-50">
                <div
                  className="w-full rounded bg-stone-300 transition-all"
                  style={{ height: `${(g.arriving / maxCovers) * 100}%` }}
                  title={`${g.arriving} covers arriving`}
                />
              </div>
              <div className="text-[11px] tabular-nums text-stone-500">{g.arriving} cv</div>
              <div className="text-xs font-medium tabular-nums">{fmt12(g.time).replace(":00", "").replace(" PM", "")}</div>
              {(["open2", "open4", "open6"] as const).map((k, i) => (
                <div
                  key={k}
                  className={`w-full rounded py-0.5 text-center text-[11px] font-medium ${
                    g[k] ? "bg-emerald-500 text-white" : "bg-stone-200 text-stone-400"
                  }`}
                >
                  {[2, 4, 6][i]}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Phone({
  snap,
  activePhone,
  setActivePhone,
  onSnap,
}: {
  snap: Snapshot;
  activePhone: string | null;
  setActivePhone: (p: string) => void;
  onSnap: (s: Snapshot) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const contacts = useMemo(() => {
    const names = new Map([
      ...snap.waitlist.filter((w) => w.name).map((w) => [w.phone, `${w.name} (waitlist)`] as const),
      ...snap.reservations.filter((r) => r.phone).map((r) => [r.phone!, r.name] as const),
    ]);
    const phones = new Set([...snap.messages.map((m) => m.phone), ...names.keys()]);
    if (activePhone) phones.add(activePhone);
    return [...phones].map((p) => ({ phone: p, name: names.get(p) ?? "New guest" }));
  }, [snap, activePhone]);

  const thread = snap.messages.filter((m) => m.phone === activePhone);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [thread.length, activePhone]);

  const send = async () => {
    if (!activePhone || !draft.trim() || sending) return;
    const body = draft;
    setDraft("");
    setSending(true);
    try {
      onSnap(await post("/api/sms", { from: activePhone, body }));
    } finally {
      setSending(false);
    }
  };

  const newGuest = () => {
    const phone = `(646) 555-${String(Math.floor(2000 + Math.random() * 7999))}`;
    setActivePhone(phone);
  };

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Simulated phone</h2>
        <button onClick={newGuest} className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500">
          + Text as new guest
        </button>
      </div>
      <select
        value={activePhone ?? ""}
        onChange={(e) => setActivePhone(e.target.value)}
        className="mb-3 w-full rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-sm"
      >
        <option value="" disabled>
          Pick a guest…
        </option>
        {contacts.map((c) => (
          <option key={c.phone} value={c.phone}>
            {c.name} · {c.phone}
          </option>
        ))}
      </select>

      <div className="mx-auto max-w-[340px] rounded-[2rem] border-[6px] border-stone-900 bg-stone-900 shadow-lg">
        <div className="rounded-[1.6rem] bg-white">
          <div className="border-b border-stone-100 px-4 py-2 text-center text-xs text-stone-500">
            {activePhone ? `${snap.restaurant} ↔ ${activePhone}` : "No thread selected"}
          </div>
          <div ref={scroller} className="h-[340px] space-y-2 overflow-y-auto px-3 py-3">
            {!activePhone && (
              <p className="pt-24 text-center text-xs text-stone-400">
                Pick a guest, click a reservation, or text as a new guest.
              </p>
            )}
            {activePhone && thread.length === 0 && (
              <p className="pt-24 text-center text-xs text-stone-400">
                Try: &ldquo;Hi, table for 4 at 8 tonight?&rdquo; If it&apos;s full, ask to join the waitlist.
              </p>
            )}
            {thread.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "in" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                    m.direction === "in" ? "rounded-br-sm bg-blue-500 text-white" : "rounded-bl-sm bg-stone-100 text-stone-800"
                  }`}
                >
                  {m.body}
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-stone-400">{snap.restaurant} is typing…</div>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex gap-2 border-t border-stone-100 p-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!activePhone}
              placeholder={activePhone ? "Text as the guest…" : "Select a thread"}
              className="min-w-0 flex-1 rounded-full border border-stone-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            />
            <button
              disabled={!activePhone || !draft.trim() || sending}
              className="rounded-full bg-blue-500 px-3 text-sm font-medium text-white disabled:bg-stone-200"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

const WAIT_STATUS: Record<WaitlistEntry["status"], [string, string]> = {
  waiting: ["Waiting", "bg-stone-100 text-stone-600 ring-stone-200"],
  offered: ["Offered · awaiting YES", "bg-amber-50 text-amber-700 ring-amber-200"],
  booked: ["Rebooked", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
};

function Waitlist({ entries }: { entries: Snapshot["waitlist"] }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Waitlist</h2>
        <span className="text-xs text-stone-500">When a table frees up, everyone who fits is texted. First YES gets it.</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-stone-400">
          Nobody waiting. Guests asking for a full time are offered a spot here, then cancel a booking at that time to see the rebook.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 text-sm">
          {entries.map((w) => {
            const [label, cls] = WAIT_STATUS[w.status];
            return (
              <li key={w.id} className="flex animate-row-in items-center gap-3 py-2">
                <span className="w-16 shrink-0 font-medium tabular-nums">{fmt12(w.time)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {w.name ?? "Guest"} <span className="text-stone-500">· party of {w.partySize} · {w.phone}</span>
                </span>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const OUTCOME: Record<EmailOutcome["kind"], { tag: string; cls: string }> = {
  booking: { tag: "New booking", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  update: { tag: "Changed", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  cancel: { tag: "Cancelled", cls: "bg-red-50 text-red-700 ring-red-200" },
  later: { tag: "Not tonight", cls: "bg-stone-100 text-stone-500 ring-stone-200" },
  skip: { tag: "Skipped", cls: "bg-stone-100 text-stone-500 ring-stone-200" },
  review: { tag: "Needs review", cls: "bg-amber-50 text-amber-800 ring-amber-300" },
};

function Inbox({ snap, rebuilding }: { snap: Snapshot; rebuilding: boolean }) {
  const { phase, cursor, read, outcomes } = snap.rebuild;
  const [open, setOpen] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);

  // Follow the rebuild: the newest email while fetching, then the email being applied. Scrolls only the list.
  useEffect(() => {
    const el = list.current;
    if (!el || !rebuilding) return;
    const row = el.querySelector<HTMLElement>(`[data-index="${phase === "fetching" ? snap.inbox.length - 1 : cursor}"]`);
    const top = row ? row.offsetTop - el.clientHeight / 2 + row.clientHeight / 2 : 0;
    el.scrollTo({ top, behavior: "smooth" });
  }, [cursor, phase, rebuilding, snap.inbox.length]);

  const counts = outcomes.reduce<Partial<Record<EmailOutcome["kind"], number>>>((acc, o) => {
    if (o) acc[o.kind] = (acc[o.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start">
      <div className="border-b border-stone-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <GmailMark className="h-4 w-4" /> Inbox
          </h2>
          <span className="text-xs tabular-nums text-stone-500">{snap.inbox.length} emails</span>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          {phase === "idle" && "Nothing read yet. Rebuild the book to scan for Resy emails."}
          {phase === "fetching" && "Pulling reservation emails from Gmail…"}
          {phase === "reading" &&
            (snap.ai
              ? `${snap.ai} reads emails in parallel batches. Each is applied in order once read, so later changes win.`
              : "Parsing Resy notification format, then applying in order so later changes win.")}
          {phase === "done" && (
            <>
              {counts.booking ?? 0} booked · {counts.update ?? 0} changed · {counts.cancel ?? 0} cancelled ·{" "}
              {(counts.later ?? 0) + (counts.skip ?? 0)} ignored
              {counts.review ? ` · ${counts.review} need review` : ""}
            </>
          )}
        </p>
      </div>

      {snap.inbox.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-stone-400">
          {rebuilding ? "Connecting to Gmail…" : "Inbox not scanned yet."}
        </div>
      ) : (
        <ul ref={list} className="relative min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto">
          {snap.inbox.map((email) => {
            const outcome = outcomes[email.index];
            const current = phase === "reading" && email.index === cursor;
            const reading = phase === "reading" && !read[email.index];
            const waiting = phase === "reading" && read[email.index] && !outcome;
            return (
              <li key={email.index} data-index={email.index} className="animate-row-in">
                <button
                  onClick={() => setOpen(open === email.index ? null : email.index)}
                  className={`block w-full px-4 py-2.5 text-left transition-colors hover:bg-stone-50 ${
                    current ? "bg-[#c8402a]/[0.06] shadow-[inset_3px_0_0_#c8402a]" : ""
                  } ${reading ? "reading-row" : ""}`}
                >
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <EmailDot outcome={outcome} current={current} />
                    <span className="truncate">{email.from === "notifications@resy.com" ? "Resy" : email.from}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-stone-400">#{email.index}</span>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-stone-800">{email.subject}</div>
                  {(reading || waiting) && (
                    <div className="mt-1 text-xs text-stone-400">{reading ? "Reading…" : "Read · waiting its turn"}</div>
                  )}
                  {outcome && (
                    <div className="mt-1 flex animate-row-in items-center gap-1.5 text-xs">
                      <span className={`shrink-0 rounded-full px-1.5 py-px font-medium ring-1 ${OUTCOME[outcome.kind].cls}`}>
                        {OUTCOME[outcome.kind].tag}
                      </span>
                      <span className="truncate text-stone-500">{outcome.label}</span>
                    </div>
                  )}
                </button>
                {open === email.index && (
                  <pre className="mx-4 mb-3 whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-stone-600">
                    {email.body}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EmailDot({ outcome, current }: { outcome: EmailOutcome | null | undefined; current: boolean }) {
  if (current) return <span className="h-2 w-2 shrink-0 animate-ping rounded-full bg-[#c8402a]" />;
  const color = !outcome
    ? "bg-transparent ring-1 ring-stone-300"
    : { booking: "bg-emerald-500", update: "bg-sky-500", cancel: "bg-red-500", later: "bg-stone-300", skip: "bg-stone-300", review: "bg-amber-500" }[
        outcome.kind
      ];
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function Outbox({ emails }: { emails: Snapshot["outbox"] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <GmailMark className="h-4 w-4" /> Sent emails
        </h2>
        <span className="text-xs text-stone-500">Simulated · not actually sent</span>
      </div>
      {emails.length === 0 ? (
        <p className="text-sm text-stone-400">Nothing sent yet.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-stone-100 overflow-y-auto text-sm">
          {emails.map((e) => (
            <li key={e.id}>
              <button onClick={() => setOpen(open === e.id ? null : e.id)} className="block w-full py-2 text-left hover:bg-stone-50">
                <div className="truncate text-xs text-stone-500">To: {e.to}</div>
                <div className="truncate">{e.subject}</div>
              </button>
              {open === e.id && <EmailBody body={e.body} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Email text with its Confirm / Cancel links made clickable, so the simulated email can be acted on. */
function EmailBody({ body }: { body: string }) {
  return (
    <pre className="mb-2 whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-stone-600">
      {body.split(/(https?:\/\/\S+)/).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="text-blue-600 underline">
            {part.includes("a=cancel") ? "Cancel reservation" : "Confirm reservation"}
          </a>
        ) : (
          part
        ),
      )}
    </pre>
  );
}

const DOT = { info: "bg-stone-400", good: "bg-emerald-500", warn: "bg-amber-500", ai: "bg-violet-500" };

function Activity({ items }: { items: Snapshot["activity"] }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="mb-2 font-semibold">Activity</h2>
      {items.length === 0 ? (
        <p className="text-sm text-stone-400">Nothing yet.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {items.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.kind]}`} />
              <span className="flex-1">{a.text}</span>
              <span className="shrink-0 text-xs tabular-nums text-stone-400">
                {new Date(a.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
