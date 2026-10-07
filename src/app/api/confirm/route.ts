import { snapshot, textAllGuests } from "@/lib/actions";

export function POST() {
  textAllGuests();
  return Response.json(snapshot());
}
