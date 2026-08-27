# Personal availability calendar, plan and journey map v1

Date: 2026-08-26. Status: building. Feature numbers continue the PRD's F-series.

Jacky's own calendar gets an availability layer on top of it, so friends can book a coffee, a
run, or a call into time she is actually free. Placement, the per-friend link decision, the 90
day default horizon, and the blocking-rule defaults are settled and recorded in
`docs/build-log.md` under 2026-08-26.

---

## 1. The two journeys

### Jacky's journey

1. **Connect a calendar.** She drops in a `.ics` export, or later pastes the secret iCal address
   Google gives every calendar. No account linking, no consent screen.
2. **See what the tool thinks.** Her real events render, and next to each one a small note
   saying what it blocked and why: "out of town, takes the weekend", "evening event, morning
   stays open", "ignored, all day with no location". The reasoning is visible, because a
   scheduling tool that silently hides half her calendar is one she stops trusting.
3. **Correct it.** Any event's reading can be overridden by hand. Rules and slot shapes are
   editable: which kinds she offers, the hours for each, buffers, horizon.
4. **Add a friend.** Pick or type a name, get a link, send it over text or DM the way she
   already does with partners.
5. **A booking lands.** It shows up as a request or a confirmation, and from that moment it
   blocks like any other calendar event so nobody else can take it.

### The friend's journey

1. Taps the link on a phone, no account, no app.
2. Sees when Jacky is free, grouped by what they can do: coffee, run, call.
3. Picks one, picks a time, leaves a name and how to reach them.
4. Done, with a confirmation and a way to cancel.

The friend never sees her calendar, only the openings. That distinction is the whole privacy
model: the derived slots are the output, the events are never sent to the guest.

---

## 2. Features

**F14. Calendar source.** Two paths behind one interface, so the derivation layer never learns
where events came from.

*Google Calendar, the primary path.* Google Identity Services gets a read-only access token in
the browser, the Calendar API is called directly from there, and events are normalized and
derived locally. The page asks for a token silently when it opens, so a calendar that changes
constantly stays current with no manual step, and once she has published openings at least once
the automatic pass republishes them too. Tokens live in memory for about an hour and are never
stored. Google's own `eventType` and attendee response fields answer questions the `.ics`
heuristics have to guess at: a working location marker, a birthday, and an invitation she
declined are all identified outright rather than inferred from a title.

*A `.ics` file, the fallback.* Parsed in the browser, nothing uploaded. Kept because it needs no
setup at all, works for a calendar that is not Google's, and is the path that still works when
the OAuth client is not configured in a build.

**The client id lives in its own Google Cloud project, not `novarasocial-dev`.** A GCP project
has one OAuth consent screen shared by everything in it, and `calendar.readonly` is a Google
sensitive scope. Adding it to the Firebase project's screen would change what every Novara
consumer user sees at sign in, and would push a published screen back into verification review.
Setup steps in `docs/Google_Calendar_Setup.md`.

Acceptance: connecting Google produces a correct week within a few seconds, reopening the page
refreshes with no prompt, and a build with no client id still works through the file path.

**F15. Open hours.** The host says when she is open, per weekday, and nothing is ever offered
outside it. This is the sleep and downtime setting, and it is the only time constraint: inside
those hours, anything the calendar has not taken is bookable. Availability is a stretch of time,
not a count of appointments, so there are no caps and no slot quotas.

Kinds of thing to do (coffee, run, call) are duration *templates*: they suggest a length the
person booking can change, they do not define a fixed slot. Buffers and the per-weekday hours are
editable and re-derive immediately.

Acceptance: closing Sunday removes every Sunday opening, and moving Monday's start to 9:00
visibly shortens Monday's window.

**F16. Availability view.** The derived picture for the host: the open stretches, a total, and
the next few real days spelled out. Alongside it, only the calendar readings worth questioning,
meaning travel, out of town, and ignored. Events that merely blocked their own hours are not
listed: repeating her calendar back at her tells her nothing she cannot see in Google.

Acceptance: one glance answers "when am I actually offering time, and why is Saturday empty".

**F17. Friend links.** A named friend, a capability token, and a horizon. One link per friend,
never one public URL: an unthrottled shared link would leak the shape of her calendar to
whoever it gets forwarded to, and the M0 "no rate limiting, five trusted partners" risk does not
carry over to something sent to thirty people. Horizon defaults to 90 days, editable per link,
because a bachelorette needs a year and a coffee needs a month.

Acceptance: revoking a link stops it working immediately, same as partner links.

**F18. Guest booking page.** Mobile-first at 390 px, served by the existing `hpGuestView` with a
new `booking` scope. No third endpoint. Booking writes through `hpGuestSubmit` with a new action.

Acceptance: a friend who has never seen the product books a coffee in under 60 seconds with no
instructions.

**F19. Bookings.** The host's list of what has been booked, with cancel. A confirmed booking
blocks the slot for every other friend, which is the one piece of shared state in the feature
and the one place a race can happen.

Acceptance: two friends cannot book the same time.

---

## 3. Build order and what blocks what

1. Derivation core, pure. **Done**, 15 tests passing.
2. ICS parsing, pure. No dependencies.
3. Data model, api seam, mock implementation. Unblocks all UI work with no backend.
4. Host availability page: import, view, tune.
5. Friend links and the guest booking page.
6. Firebase implementation and the guest function's `booking` scope.

Steps 1 to 5 need nothing from Jacky. Step 6 needs a rules match block applied through the
consumer repo, per the standing handoff in `docs/pending-rules.md`.

---

## 4. Decisions taken while building

**A booking token is not an event token.** `hp_guestTokens` currently requires an `eventId`, and
every guest read is scoped through an event. A booking link belongs to a host, not an event, so
`eventId` becomes nullable and the `booking` scope reads from the owner's availability rather
than an event subtree. This is the first token that is not about an event, and it is worth
knowing that is a real widening of what a guest token means.

**The friend never receives events.** `hpGuestView` computes slots server side and returns only
those. Sending raw events and deriving in the browser would be simpler and would hand every
friend the full contents of her calendar.

**Bookings block immediately, without a confirmation step.** A held-then-confirmed flow needs
expiry, reminders, and a way to chase, which is notification machinery the PRD does not have.
Booked is booked, and cancelling is one tap.

**No file lands in Storage.** The `.ics` is read in the browser and discarded. This keeps the
M0 Storage non-goal intact and means the raw calendar never leaves her machine.

---

## 5. Not now

**Weekly caps on how much she meets.** Rejected for now, and worth recording why: a cap answers
"how much do I want to meet", which is a different question from "when am I open". Only build it
if the honest windows turn out to attract more than she wants.

**Background sync.** Refresh happens when she opens the page, not on a schedule. Doing better
means a stored refresh token and a scheduled job, which means a server that can read her
calendar, which is the exact privacy property this design exists to protect. The staleness
window is the time between visits, and it is real: a friend can book a slot that filled up since
she last opened the app. Revisit only if that actually bites, and price the trade honestly when
it does.

Two-way sync back to Google. Recurring event expansion beyond simple weekly rules. Timezone
handling beyond the host's own zone. Reminders or emails to either side. Payment. Group
booking. Anything that requires the friend to have an account, ever.
