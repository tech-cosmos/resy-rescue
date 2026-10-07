import { sendConfirmations, snapshot, type Channel } from "@/lib/actions";
import { state } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { channels?: Channel[] };
  const channels = body.channels?.filter((c) => c === "sms" || c === "email") ?? [];
  state().origin = new URL(request.url).origin; // for Confirm/Cancel links in emails
  sendConfirmations(channels.length ? channels : ["sms", "email"]);
  return Response.json(snapshot());
}
