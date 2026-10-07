import type { InboxEmail } from "@/lib/types";
import { longDate } from "@/lib/time";

// Seed inbox: what the restaurant's email looks like the afternoon Resy goes down.
// Mostly Resy notification emails (new / updated / cancelled), plus noise and one
// messy forwarded email that only the LLM extractor can read.

type Seed =
  | { kind: "new"; name: string; phone: string; party: number; time: string; conf: string; notes?: string; day?: "today" | "tomorrow" }
  | { kind: "updated"; name: string; conf: string; prevTime: string; prevParty: number; time: string; party: number }
  | { kind: "cancelled"; name: string; conf: string; time: string; party: number }
  | { kind: "raw"; from: string; subject: string; body: string };

const SEEDS: Seed[] = [
  { kind: "new", name: "Maya Chen", phone: "(917) 555-0142", party: 4, time: "7:30 PM", conf: "RSY-48213", notes: "Anniversary — booth if possible" },
  { kind: "new", name: "David Okafor", phone: "(646) 555-0187", party: 2, time: "6:00 PM", conf: "RSY-48220" },
  { kind: "new", name: "Priya Raman", phone: "(212) 555-0119", party: 6, time: "8:00 PM", conf: "RSY-48231", notes: "Birthday, bringing a cake" },
  { kind: "new", name: "James Whitfield", phone: "(718) 555-0163", party: 2, time: "5:30 PM", conf: "RSY-48244" },
  { kind: "new", name: "Sofia Alvarez", phone: "(917) 555-0108", party: 4, time: "7:00 PM", conf: "RSY-48252" },
  { kind: "raw", from: "digest@resy.com", subject: "Your Resy Weekly Digest", body: "Here's how your restaurant performed this week: 412 covers, 3.1% no-show rate..." },
  { kind: "new", name: "Ethan Brooks", phone: "(347) 555-0124", party: 2, time: "7:00 PM", conf: "RSY-48260" },
  { kind: "new", name: "Hannah Kim", phone: "(646) 555-0151", party: 3, time: "6:30 PM", conf: "RSY-48271", notes: "Severe nut allergy" },
  { kind: "new", name: "Marcus Bell", phone: "(212) 555-0177", party: 2, time: "8:30 PM", conf: "RSY-48279" },
  { kind: "new", name: "Olivia Rossi", phone: "(917) 555-0195", party: 5, time: "7:30 PM", conf: "RSY-48288" },
  { kind: "new", name: "Chloe Martin", phone: "(718) 555-0136", party: 2, time: "7:00 PM", conf: "RSY-48290" },
  { kind: "new", name: "Liam Novak", phone: "(347) 555-0158", party: 2, time: "9:00 PM", conf: "RSY-48301" },
  { kind: "new", name: "Aisha Patel", phone: "(646) 555-0112", party: 4, time: "6:00 PM", conf: "RSY-48307" },
  { kind: "new", name: "Omar Haddad", phone: "(212) 555-0144", party: 2, time: "6:00 PM", conf: "RSY-48311" },
  { kind: "new", name: "Noah Feldman", phone: "(917) 555-0171", party: 2, time: "7:30 PM", conf: "RSY-48319" },
  { kind: "new", name: "Grace Liu", phone: "(718) 555-0189", party: 4, time: "8:00 PM", conf: "RSY-48326" },
  { kind: "new", name: "Nate Ellis", phone: "(646) 555-0103", party: 2, time: "7:00 PM", conf: "RSY-48330", day: "tomorrow" },
  { kind: "new", name: "Daniel Mensah", phone: "(347) 555-0129", party: 2, time: "6:30 PM", conf: "RSY-48334" },
  { kind: "new", name: "Emma Schultz", phone: "(212) 555-0166", party: 6, time: "7:00 PM", conf: "RSY-48341", notes: "Work dinner, need one check" },
  { kind: "new", name: "Lucas Moreau", phone: "(917) 555-0138", party: 2, time: "8:00 PM", conf: "RSY-48348" },
  { kind: "updated", name: "Chloe Martin", conf: "RSY-48290", prevTime: "7:00 PM", prevParty: 2, time: "7:30 PM", party: 4 },
  { kind: "new", name: "Zoe Adams", phone: "(718) 555-0114", party: 4, time: "5:30 PM", conf: "RSY-48355" },
  { kind: "new", name: "Ben Carter", phone: "(646) 555-0197", party: 2, time: "9:30 PM", conf: "RSY-48362" },
  { kind: "cancelled", name: "Omar Haddad", conf: "RSY-48311", time: "6:00 PM", party: 2 },
  { kind: "new", name: "Isabella Greco", phone: "(347) 555-0181", party: 3, time: "7:00 PM", conf: "RSY-48370" },
  { kind: "new", name: "Ryan Walsh", phone: "(212) 555-0122", party: 2, time: "8:30 PM", conf: "RSY-48377" },
  { kind: "new", name: "Ava Thompson", phone: "(917) 555-0150", party: 4, time: "7:30 PM", conf: "RSY-48381", day: "tomorrow" },
  { kind: "new", name: "Lily Tran", phone: "(718) 555-0172", party: 4, time: "8:30 PM", conf: "RSY-48389" },
  {
    kind: "raw",
    from: "tom.reyes84@gmail.com",
    subject: "Fwd: tonight",
    body:
      "hey!! resy app is freaking out and I can't see my booking, just want to make sure we're still good for tonight. " +
      "it's Tom Reyes, 2 of us at 9, confirmation was RSY-48394 I think. my cell is 347 555 0146. thanks!!",
  },
  { kind: "cancelled", name: "Ryan Walsh", conf: "RSY-48377", time: "8:30 PM", party: 2 },
];

export function buildInbox(now = new Date()): InboxEmail[] {
  const today = longDate(now);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  const tomorrow = longDate(tomorrowDate);

  return SEEDS.map((s, index) => {
    switch (s.kind) {
      case "new": {
        const date = s.day === "tomorrow" ? tomorrow : today;
        return {
          index,
          from: "notifications@resy.com",
          subject: `New Reservation: ${s.name}, Party of ${s.party}, ${date} at ${s.time}`,
          body: [
            `You have a new reservation.`,
            `Guest: ${s.name}`,
            `Phone: ${s.phone}`,
            `Party Size: ${s.party}`,
            `Date: ${date}`,
            `Time: ${s.time}`,
            `Confirmation #: ${s.conf}`,
            s.notes ? `Special Requests: ${s.notes}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        };
      }
      case "updated":
        return {
          index,
          from: "notifications@resy.com",
          subject: `Reservation Updated: ${s.name}`,
          body: [
            `A reservation has been modified.`,
            `Guest: ${s.name}`,
            `Confirmation #: ${s.conf}`,
            `Date: ${today}`,
            `Previous: ${s.prevTime}, Party of ${s.prevParty}`,
            `Updated Time: ${s.time}`,
            `Updated Party Size: ${s.party}`,
          ].join("\n"),
        };
      case "cancelled":
        return {
          index,
          from: "notifications@resy.com",
          subject: `Reservation Cancelled: ${s.name}`,
          body: [
            `A reservation has been cancelled by the guest.`,
            `Guest: ${s.name}`,
            `Confirmation #: ${s.conf}`,
            `Date: ${today}`,
            `Time: ${s.time}`,
            `Party Size: ${s.party}`,
          ].join("\n"),
        };
      case "raw":
        return { index, from: s.from, subject: s.subject, body: s.body };
    }
  });
}
