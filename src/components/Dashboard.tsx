"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "@/lib/actions";
import type { Reservation } from "@/lib/types";
import { fmt12 } from "@/lib/time";

async function post(path: string, body?: unknown): Promise<Snapshot> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activePhone, setActivePhone] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch("/api/state", { cache: "no-store" })
        .then((res) => res.json())
        .then((data: Snapshot) => alive && setSnap(data))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 1200);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const run = async (label: string, path: string) => {
    setBusy(label);
    try {
      setSnap(await post(path));
    } finally {
      setBusy(null);
    }
  };

  if (!snap) return <div className="p-10 text-stone-500">Loading…</div>;

  const live = snap.reservations.filter((r) => r.status !== "cancelled");
  const stats = {
    bookings: live.length,
    covers: live.reduce((n, r) => n + r.partySize, 0),
    confirmed: live.filter((r) => r.status === "confirmed").length,
    awaiting: live.filter((r) => r.status === "pending" && r.contacted).length,
    untexted: live.filter((r) => r.status === "pending" && !r.contacted).length,
    freed: snap.reservations.filter((r) => r.status === "cancelled" && r.history.some((h) => h.includes("by text"))).length,
    byText: live.filter((r) => r.source === "sms-agent").length,
  };
  const outage = new Date(snap.outageSince).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{snap.restaurant} · Tonight&apos;s Book</h1>
            <p className="text-sm text-stone-500">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
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

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6">
        <section className="grid gap-3 md:grid-cols-3">
          <Step
            n={1}
            title="Rebuild from inbox"
            detail={
              snap.rebuiltAt
                ? `${snap.inboxCount} emails parsed by ${snap.extractedBy}`
                : "Read Resy notification emails to recover tonight's bookings"
            }
            done={!!snap.rebuiltAt}
            action={busy === "rebuild" ? "Reading inbox…" : snap.rebuiltAt ? "Rebuild again" : "Rebuild book"}
            disabled={!!busy}
            onClick={() => run("rebuild", "/api/rebuild")}
          />
          <Step
            n={2}
            title="Text every guest"
            detail={stats.untexted ? `${stats.untexted} guests haven't been contacted` : "Ask each guest to reply YES, CANCEL, or a change"}
            done={!!snap.rebuiltAt && stats.untexted === 0}
            action={`Send ${stats.untexted || ""} confirmations`.replace("  ", " ")}
            disabled={!!busy || !snap.rebuiltAt || stats.untexted === 0}
            onClick={() => run("confirm", "/api/confirm")}
          />
          <Step
            n={3}
            title="Guests reply"
            detail={stats.awaiting ? `${stats.awaiting} awaiting a reply` : "Replies update the book live"}
            done={!!snap.rebuiltAt && stats.awaiting === 0 && stats.untexted === 0}
            action="Simulate guest replies"
            disabled={!!busy || stats.awaiting === 0}
            onClick={() => run("simulate", "/api/simulate")}
          />
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Bookings tonight" value={stats.bookings} sub={`${stats.covers} covers`} />
          <Stat label="Confirmed" value={stats.confirmed} tone="green" />
          <Stat label="Awaiting reply" value={stats.awaiting} tone="amber" sub={stats.awaiting ? "call if no reply by 5pm" : undefined} />
          <Stat label="Not yet texted" value={stats.untexted} />
          <Stat label="Freed by cancellation" value={stats.freed} tone="red" />
          <Stat label="Booked by text" value={stats.byText} tone="violet" />
        </section>

        {snap.needsReview.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Needs a human:</strong> {snap.needsReview.join("; ")}. Turn on AI to parse free-form emails.
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-5">
            <ReservationTable
              reservations={snap.reservations}
              activePhone={activePhone}
              onSelect={(r) => r.phone && setActivePhone(r.phone)}
            />
            <AvailabilityGrid grid={snap.grid} />
          </div>
          <div className="space-y-5">
            <Phone snap={snap} activePhone={activePhone} setActivePhone={setActivePhone} onSnap={setSnap} />
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

function Step(props: {
  n: number;
  title: string;
  detail: string;
  action: string;
  done: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            props.done ? "bg-emerald-600 text-white" : "bg-stone-900 text-white"
          }`}
        >
          {props.done ? "✓" : props.n}
        </span>
        <div>
          <div className="font-medium">{props.title}</div>
          <div className="text-sm text-stone-500">{props.detail}</div>
        </div>
      </div>
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
  activePhone,
  onSelect,
}: {
  reservations: Reservation[];
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
          Resy is down and the book is empty. Start with <strong>Rebuild book</strong>.
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
                  className={`cursor-pointer hover:bg-stone-50 ${r.status === "cancelled" ? "text-stone-400" : ""} ${
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
                    {r.source === "sms-agent" ? "Text (AI host)" : r.confirmation}
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
    const names = new Map(snap.reservations.filter((r) => r.phone).map((r) => [r.phone!, r.name]));
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
                Try: &ldquo;Hi, table for 2 at 8 tonight?&rdquo;
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
