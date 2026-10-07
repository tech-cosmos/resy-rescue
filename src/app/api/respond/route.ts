import { connection } from "next/server";
import { cancel, confirm } from "@/lib/agent";
import { RESTAURANT, state } from "@/lib/store";
import { fmt12 } from "@/lib/time";

// One-click Confirm / Cancel links from the (simulated) confirmation emails.
export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const r = state().reservations.find((x) => x.id === url.searchParams.get("r"));
  const action = url.searchParams.get("a");

  let message: string;
  if (!r) message = "We couldn't find that reservation. Please text or call us.";
  else if (r.status === "cancelled") message = `This reservation for ${r.partySize} at ${fmt12(r.time)} is already cancelled.`;
  else if (action === "confirm") message = r.status === "confirmed" ? "You're already confirmed. See you tonight!" : confirm(r, "email");
  else if (action === "cancel") message = cancel(r, "email");
  else message = "Unknown action.";

  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${RESTAURANT}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1c1a16">` +
      `<h1 style="font-size:1.4rem">${RESTAURANT}</h1><p style="font-size:1.1rem;line-height:1.5">${escape(message)}</p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
