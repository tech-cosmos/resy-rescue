import { snapshot } from "@/lib/actions";
import { handleInbound } from "@/lib/agent";

// Simulated SMS webhook. With Twilio this would receive `From` and `Body` form fields instead.
export async function POST(request: Request) {
  const { from, body } = (await request.json()) as { from?: string; body?: string };
  if (!from || !body?.trim()) return Response.json({ error: "from and body are required" }, { status: 400 });
  const reply = await handleInbound(from, body.trim());
  return Response.json({ reply, ...snapshot() });
}
