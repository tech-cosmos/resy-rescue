import { snapshot } from "@/lib/actions";
import { resetState } from "@/lib/store";

export function POST() {
  resetState();
  return Response.json(snapshot());
}
