# Resy Rescue

**Challenge:** Resy is down on a busy afternoon. How do you reach guests, verify availability, and confirm tonight's bookings?

**Answer:** The data isn't gone, it's scattered. Resy Rescue rebuilds tonight's book from the restaurant's inbox, texts every guest to confirm, and runs an AI host over SMS that checks real table availability before it books, moves, or cancels anything.

## Run it

```bash
cp .env.example .env.local   # add OPENROUTER_API_KEY (optional)
npm install
npm run dev                  # http://localhost:3000 (landing) → /dashboard
```

Without a key the app runs in **rules mode**: Resy-format emails and simple texts still work, but free-form emails get flagged for a human.

## Demo script (~2 min)

1. **"It's 2pm, Resy is down."** The book is empty.
2. **Rebuild book.** 30 emails become 21 bookings, with cancellations and modifications applied and tomorrow's bookings filtered out. With AI on, the messy forwarded "Fwd: tonight" email from a guest is parsed too.
3. **Send confirmations.** Pick *Text + email*, *Text only*, or *Email only*. Emails are simulated and land in the **Sent emails** outbox. Each one has working Confirm / Cancel links, and guests get an email receipt when they confirm, cancel, or change, whichever channel they used.
4. **Simulate guest replies.** Replies come in: YES confirms, CANCEL frees a table, "push to 8:30?" moves the booking, and the availability grid updates live.
5. **+ Text as new guest:** "table for 4 at 8 tonight?" 8pm is full, so the AI host offers 7:30, gets a name, and books it.
6. **Waitlist rebook:** as that new guest, ask to join the waitlist for 8pm (reply WAITLIST in rules mode). Then open Grace Liu's thread (4 at 8:00) and text "cancel". Everyone waitlisted who now fits gets "a table just opened, reply YES". The first YES is booked as a *Waitlist rebook*, and anyone else offered that table is told it's gone and stays on the list.

## How it works

| Piece | File |
|---|---|
| Seed inbox (Resy notifications, noise, a messy guest forward) | `src/data/inbox.ts` |
| Email → events (LLM JSON-schema extraction, regex fallback) → reconciled book | `src/lib/extract.ts` |
| Tables, turn times, greedy seating, open slots, alternatives | `src/lib/capacity.ts` |
| SMS handling: YES/CANCEL fast path, then the AI host with tools | `src/lib/agent.ts` |
| OpenRouter client (OpenAI-compatible) | `src/lib/llm.ts` |
| In-memory state (single process, demo only) | `src/lib/store.ts` |
| API: `/api/rebuild`, `/api/confirm`, `/api/simulate`, `/api/sms`, `/api/state`, `/api/reset` | `src/app/api/*` |

AI host tools: `get_my_reservation`, `check_availability`, `book_table`, `modify_reservation`, `confirm_reservation`, `cancel_reservation`, `join_waitlist`, `accept_waitlist_offer`.

## Going real

- **SMS:** point a Twilio webhook at `/api/sms` (map `From`/`Body`) and replace `sendSms` in `store.ts` with a Twilio send.
- **Email:** emails are simulated (`sendEmail` in `store.ts`, templates in `mailer.ts`). Swap in a Gmail API send from the connected inbox; set `APP_URL` so the Confirm/Cancel links point at the deployed app.
- **Inbox:** swap `buildInbox()` for a Gmail API query (`from:resy.com newer_than:7d`).
- **State:** in-memory state won't survive serverless instances. Use Postgres or Redis before deploying.
- **Next:** voice AI for no-replies, waitlist auto-fill for freed tables, reconciliation export for when Resy comes back.
