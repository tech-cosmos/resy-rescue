import { simulateReplies, snapshot } from "@/lib/actions";

export function POST() {
  simulateReplies();
  return Response.json(snapshot());
}
