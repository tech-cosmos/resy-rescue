"use client";

import Link, { useLinkStatus } from "next/link";
import GmailMark from "./GmailMark";

// Placeholder for real Google OAuth: goes straight to the dashboard, which starts reading the demo inbox.
export default function ConnectGmail() {
  return (
    <Link
      href="/dashboard?connected=gmail"
      prefetch={false}
      className="group inline-flex items-center gap-3 rounded-full border-[1.5px] border-[#1c1a16] bg-white py-3 pl-4 pr-6 text-[15px] font-medium text-[#1c1a16] shadow-[4px_4px_0_#1c1a16] transition-all duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-[6px_6px_0_#1c1a16] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_#1c1a16] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c8402a]"
    >
      <GmailMark className="h-5 w-5" />
      <Label />
    </Link>
  );
}

function Label() {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-2">
      {pending ? "Connecting to Gmail…" : "Connect Gmail"}
      <span aria-hidden className={`transition-transform ${pending ? "animate-pulse" : "group-hover:translate-x-1"}`}>
        →
      </span>
    </span>
  );
}
