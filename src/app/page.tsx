import ConnectGmail from "@/components/ConnectGmail";

const BOOK = [
  { time: "6:00", name: "David Okafor", party: 2, mark: "✓" },
  { time: "6:30", name: "Hannah Kim", party: 3, note: "nut allergy", mark: "✓" },
  { time: "7:00", name: "Sofia Alvarez", party: 4, mark: "?" },
  { time: "7:30", name: "Maya Chen", party: 4, note: "anniversary", mark: "✓" },
  { time: "7:30", name: "Chloe Martin", party: 4, note: "was 2 @ 7:00", mark: "↻" },
  { time: "8:00", name: "Priya Raman", party: 6, note: "cake", mark: "✓" },
  { time: "9:00", name: "Tom Reyes", party: 2, note: "from his email", mark: "?" },
];

const NEXT = [
  {
    n: "01",
    title: "Rebuild tonight's book",
    body: "Every Resy confirmation, change and cancellation in your inbox is replayed in order. Tomorrow's bookings and newsletters are set aside. Messy guest emails get read too.",
  },
  {
    n: "02",
    title: "Confirm every guest",
    body: "One text to each party: reply YES, CANCEL, or tell us what changed. Replies update the book live, and cancellations free up tables.",
  },
  {
    n: "03",
    title: "Keep taking bookings",
    body: "New guests can text for a table. An AI host checks real availability across your 14 tables before it books, moves or cancels anything.",
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3ecdf] text-[#1c1a16] selection:bg-[#c8402a] selection:text-white">
      <Grain />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 pt-7 sm:px-10">
        <span className="font-display text-[28px] leading-none tracking-tight">
          Resy <em className="text-[#c8402a]">Rescue</em>
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#1c1a16]/15 bg-[#f3ecdf]/70 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6e6658]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-[#c8402a] opacity-60" />
            <span className="relative h-2 w-2 rounded-full bg-[#c8402a]" />
          </span>
          Outage mode
        </span>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl items-center gap-16 px-6 pb-20 pt-14 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-20">
        <section>
          <p className="rise font-mono text-[11px] uppercase tracking-[0.22em] text-[#6e6658]" style={{ animationDelay: "0ms" }}>
            For restaurants · the afternoon Resy goes down
          </p>
          <h1
            className="rise mt-6 font-display text-[clamp(3.4rem,7.2vw,6.4rem)] leading-[0.92] tracking-[-0.02em]"
            style={{ animationDelay: "80ms" }}
          >
            Ready, we are
            <br />
            there to <em className="text-[#c8402a]">help.</em>
          </h1>
          <p className="rise mt-7 max-w-[34rem] text-[17px] leading-relaxed text-[#4a453c]" style={{ animationDelay: "180ms" }}>
            Your reservations aren&apos;t lost. Every booking, change and cancellation is already sitting in your inbox. Connect
            it and we&apos;ll rebuild tonight&apos;s book, confirm every guest by text, and keep seating people until Resy is back.
          </p>

          <div
            className="rise mt-10 max-w-[34rem] rounded-2xl border border-[#1c1a16]/12 bg-[#fbf7ef] p-6 shadow-[0_1px_0_#fff_inset,0_24px_48px_-28px_rgb(28_26_22/0.35)]"
            style={{ animationDelay: "280ms" }}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#c8402a]">Step 1 of 3</span>
              <span className="font-mono text-[11px] text-[#6e6658]">~30 seconds</span>
            </div>
            <h2 className="mt-2 font-display text-[30px] leading-tight">Connect the inbox your Resy emails go to</h2>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <ConnectGmail />
              <span className="text-sm text-[#6e6658]">Gmail only, for now.</span>
            </div>
            <p className="mt-5 border-t border-dashed border-[#1c1a16]/15 pt-4 text-[13px] leading-relaxed text-[#6e6658]">
              Demo: this opens a sample inbox for <span className="text-[#1c1a16]">Osteria Lucia</span>. No Google sign-in
              happens yet.
            </p>
          </div>
        </section>

        <BookArt />
      </main>

      <section className="relative z-10 border-t border-[#1c1a16]/10 bg-[#efe6d6]/60">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#6e6658]">After you connect</h2>
          <ol className="mt-8 grid gap-10 md:grid-cols-3 md:gap-8">
            {NEXT.map((s) => (
              <li key={s.n} className="border-t border-[#1c1a16]/80 pt-5">
                <span className="font-display text-5xl italic leading-none text-[#c8402a]">{s.n}</span>
                <h3 className="mt-4 font-display text-[26px] leading-tight">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#4a453c]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-6 py-8 font-mono text-[11px] text-[#8a8274] sm:px-10">
        <span>Resy Rescue · keep the room full when the system isn&apos;t</span>
        <span>Not affiliated with Resy.</span>
      </footer>
    </div>
  );
}

/** The hero illustration: Resy emails landing on a paper reservation book that's being rewritten. */
function BookArt() {
  return (
    <div className="relative mx-auto w-full max-w-[460px] pb-16 pl-6 pt-28 lg:pl-0" aria-hidden>
      {/* incoming emails */}
      <div
        className="drift absolute -left-2 top-0 z-20 w-[250px] -rotate-[5deg] rounded-lg border border-[#1c1a16]/15 bg-white p-3.5 shadow-[0_18px_30px_-18px_rgb(28_26_22/0.5)] sm:-left-12"
        style={{ animationDelay: "500ms" }}
      >
        <div className="flex items-center justify-between font-mono text-[10px] text-[#8a8274]">
          <span>notifications@resy.com</span>
          <span>1:12 PM</span>
        </div>
        <div className="mt-1.5 text-[13px] font-medium leading-snug">New Reservation: Maya Chen, Party of 4 at 7:30 PM</div>
        <div className="mt-1 font-mono text-[10px] text-[#8a8274]">Special Requests: Anniversary, booth if possible</div>
      </div>
      <div
        className="drift absolute bottom-0 -right-2 z-20 w-[236px] rotate-[4deg] rounded-lg border border-[#1c1a16]/15 bg-white p-3.5 shadow-[0_18px_30px_-18px_rgb(28_26_22/0.5)] sm:-right-8"
        style={{ animationDelay: "700ms" }}
      >
        <div className="flex items-center justify-between font-mono text-[10px] text-[#8a8274]">
          <span>tom.reyes84@gmail.com</span>
          <span>2:31 PM</span>
        </div>
        <div className="mt-1.5 text-[13px] font-medium">Fwd: tonight</div>
        <div className="mt-1 text-[12px] leading-snug text-[#6e6658]">
          hey!! resy app is freaking out… it&apos;s Tom Reyes, 2 of us at 9…
        </div>
      </div>

      {/* the book page */}
      <div className="relative rotate-[1.2deg] rounded-[6px] border border-[#1c1a16]/20 bg-[#fffdf8] px-7 pb-20 pt-7 shadow-[0_40px_60px_-30px_rgb(28_26_22/0.45),0_2px_0_#e9dfcc]">
        <div className="pointer-events-none absolute inset-y-0 left-12 w-px bg-[#c8402a]/30" />
        <div className="flex items-end justify-between border-b-2 border-[#1c1a16] pb-2 pl-8">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8a8274]">Osteria Lucia</div>
            <div className="font-display text-[28px] leading-none">Tonight</div>
          </div>
          <div className="text-right font-mono text-[10px] leading-tight text-[#8a8274]">
            22 bookings
            <br />
            71 covers
          </div>
        </div>
        <ul className="mt-1">
          {BOOK.map((r, i) => (
            <li
              key={r.name}
              className="ink grid grid-cols-[2.6rem_1fr_auto_1.2rem] items-baseline gap-3 border-b border-[#1c1a16]/10 py-[9px] pl-1 text-[14px]"
              style={{ animationDelay: `${700 + i * 140}ms` }}
            >
              <span className="font-mono text-[12px] tabular-nums text-[#6e6658]">{r.time}</span>
              <span className="truncate">
                {r.name}
                {r.note && <span className="ml-2 font-display text-[15px] italic text-[#8a8274]">{r.note}</span>}
              </span>
              <span className="font-mono text-[12px] tabular-nums text-[#6e6658]">×{r.party}</span>
              <span className={`text-center font-medium ${r.mark === "?" ? "text-[#b7791f]" : "text-[#2f7a4f]"}`}>{r.mark}</span>
            </li>
          ))}
        </ul>
        <div
          className="stamp absolute bottom-6 left-14 rotate-[-8deg] rounded-md border-[3px] border-[#c8402a] px-3 py-1 font-mono text-[15px] font-bold uppercase tracking-[0.18em] text-[#c8402a] mix-blend-multiply"
          style={{ animationDelay: `${700 + BOOK.length * 140 + 250}ms` }}
        >
          Rebuilt
        </div>
      </div>
    </div>
  );
}

function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-multiply"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.11 0 0 0 0 0.1 0 0 0 0 0.09 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
  );
}
