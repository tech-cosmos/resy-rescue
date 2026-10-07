import { rebuildFromInbox, snapshot } from "@/lib/actions";

export async function POST() {
  await rebuildFromInbox();
  return Response.json(snapshot());
}
