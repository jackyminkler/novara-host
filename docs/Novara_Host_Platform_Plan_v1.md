# Novara host platform, plan v1

Working name only. Date: August 17, 2026. Source: strategy conversation, August 17, 2026. Status: exploration, pre-validation. Nothing here is committed until the four partner interviews and the concierge pilot are done.

Relationship to consumer Novara: this is the supply side of the same system. It launches as a host-facing web surface, shares the graph architecture, and does not touch the consumer app build or the pace matching sequence.

---

## 1. Summary

Community events with co-hosts, vendors, and sponsors are coordinated today across iMessage, Instagram DMs, WhatsApp, spreadsheets, and four separate calendars. Every existing tool starts after the hard decisions are made: Luma and Partiful handle invites, Heylo and WhatsApp handle community chat, Peerspace handles rooms. Nothing handles the multi-party knot of aligning dates, places, terms, deliverables, and day-of logistics across a host, two co-hosts, a sponsor, a DJ, and a coffee truck.

Novara's host platform is coordination-first for the supply side, the same thesis as consumer Novara applied to organizations instead of individuals. The host is the account holder. Every other party participates through guest links with zero adoption cost. The co-host graph, org-level availability patterns, pairing outcomes, and vendor-cohort fit accrue as exhaust from real coordination, which is data no one else has because it currently lives in four people's heads.

Free for hosts, always. Revenue candidates are org accounts for event community companies and an activation module for data-collecting brand partners. The four partner interviews decide which goes first.

## 2. Problem

A single co-hosted community event requires aligning five or more independent parties on dates, location, terms, promotion, logistics, and follow-up. The host is the hub. Everything routes through the host's memory and DMs.

Observed pains from Novara's own events (host's direct experience, to be validated with partners):

- Date selection requires everyone's availability and nobody has it centralized. Proposals go out by DM, responses trickle back, and by the time the last party confirms, the first party's answer is stale.
- Terms live nowhere. Who is co-host versus sponsor versus vendor, what each gives and gets, exists only in scattered threads.
- Every vendor asks the same questions separately: headcount, timing, power, parking. When the forecast changes, nobody re-notifies.
- Partners forget to promote and the host has no visibility into who actually posted.
- The run of show lives in the host's head. Parties arrive with different assumptions.
- Post-event recaps rarely happen, which weakens the case for partners to return. The data that would prove value to a sponsor evaporates.
- Institutional knowledge (lead times, preferences, what pairings worked) is never captured.
- Meeting someone at the event has no capture path. Contact happens ad hoc over LinkedIn, Instagram, or phone, notes never get written because typing mid-event is impractical, and follow-up rarely happens. LinkedIn is the worst case: a connect request accepted days or weeks later arrives stripped of all context, and the person becomes a name with no memory attached.

Market observation (Jacky, August 2026): community groups are proliferating with only WhatsApp and Heylo as their platforms. The community boom is tooled for chat and membership, not for event operations.

## 3. Insight and positioning

Coordination-first, not discovery-first. A co-host directory would be the discovery version of this idea and would fail the same way friend-discovery apps fail. The coordination version solves the mess of aligning people who are already partners, and the graph falls out as a byproduct.

The incumbent is not Luma or Partiful. The incumbent is iMessage plus Instagram DMs plus a spreadsheet plus four calendars. That is a much better competitor to displace than a funded product, and it means the bar is "less painful than group chat," not "better than Luma."

Positioning line candidates (draft, Jacky's voice required for final):

- The operating layer for community events
- Everything before the invite
- Luma tells people about your event. This runs it.

## 4. Market context

Verified in searches during this conversation, August 2026. Re-verify before any investor use and log in Novara_Stats_and_Research.md if adopted:

- Global experiential marketing spend grew 8.3% to $138.9B last year, projected 10.3% growth in 2026 (PQ Media). EventTrack reports 84% of consumer marketers increasing event budgets in 2026. Figures vary by source and definition. Pick one source and one definition before anything goes on a slide.
- LinkedIn Jobs on the Rise 2026 includes advertising sales specialists at #8 and field marketing representatives at #13. Event coordinator appeared in the 2025 top 10 and dropped off in 2026. Field marketing is the accurate 2026 term for the branded pop-up role.
- Posh raised a $22M Series A (FirstMark, Goodwater) positioned as "Shopify for Events," focused on ticketed nightlife and creator events. That exact phrase is taken.
- Fora: 15,000+ active advisors, 97% new to the profession. The structural lesson: the professional pays nothing, suppliers fund the platform, and each new professional arrives with their own audience.
- Pricing anchors from adjacent tools (verified from published pricing, July 2026 sources): Luma Plus at $59/month annual with 0% platform fee on paid tickets; Eventbrite Flex at 3.7% + $1.79 per paid ticket plus 2.9% processing; Peerspace at a 20% take rate on venue bookings.

Conference-tier networking and capture (verified August 2026): at the enterprise event tier this is a mature paid category. Bizzabo's Klik SmartBadges offer tap-to-connect contact exchange, matchmaking, and sponsor lead retrieval (Klik acquired by Bizzabo for $13.5M in 2021; one customer reports $149K in added revenue from lead retrieval at a single event, vendor case study). Whova and Swapcard sell attendee networking and lead scoring as core features, priced for B2B conferences via custom quotes and badge hardware. At the community tier, nobody does capture: Partiful is invites, guest chat, and visible RSVPs (first paid product, ticketing, launched June 2026); Luma has attendee messaging and group chats but no meeting record, notes, context, or follow-up. Honest flag: industry analysis (Sacra) notes Luma drifting toward professional networking events where the guest list doubles as a network map, making Luma the most plausible party to ship a shallow version of capture. Assume the feature alone is copyable; the defensible parts are segment economics, stack integration, and compounding data (section 10).

Meeting capture adjacents (verified in searches, August 2026): digital business card platforms (Blinq, Popl, HiHello, Wave Connect) handle contact exchange and lead capture with professional framing; Wave auto-creates a contact record on scan with date met, tags, notes, and follow-ups. Personal CRMs (Dex at $12/month billed annually, Clay, Covve) handle notes and follow-up reminders, but capture is manual or synced from email and calendar, and none know the user is at an event. Trade-show lead capture is an established paid market: Blinq's business plan starts at $4.99 per user per month with lead packages from $3,499 (Blinq's own published comparison content, treat as vendor-sourced and re-verify before external use). None of these are event-context-native or socially framed, and none attach which event, which activity, and who else was there automatically.

Strategic read, labeled as such: no platform found in searches owns multi-party pre-event coordination or co-host matching. Peerspace-class tools sell rooms. Posh and Eventbrite sell checkout and discovery. The Knot sells vendor leads at wedding job values. Heylo and WhatsApp hold community chat. The gap is real but absence of competitors is also absence of proof, which is what the validation plan is for.

## 5. Personas

Five personas, drawn from Novara's actual partners. Each sees a different slice of the same event.

**Host (Jacky-type).** The hub. Runs events monthly. Holds every relationship and every detail. Needs: one workspace per event, delegation that actually sticks, templates from past events, and to stop being the single point of failure.

**Event community company (Circe-type).** Runs many events with multiple internal hosts. Current tooling is WhatsApp plus Heylo, which cover chat and membership but not event operations. Needs: a multi-host, multi-event calendar, repeatable formats, and a sponsor pipeline across their whole season. This is the strongest paying-customer candidate because they have the most acute version of the pain and an operating budget. Budget size unverified. The Circe interview establishes it.

**Sponsor-marketer (Tasklet-type).** An AI startup treating events as a marketing channel. Does a handful of events per year and will not adopt a tool. Needs: an easy yes (one link), clear deliverables in both directions, audience-fit context, and a recap that proves the spend to whoever approves it.

**Activation partner with data collection (Lume-type).** Runs a station at the event: demos plus cortisol testing, which means volunteers to staff it, attendees opting in, and a flow of attendee actions inside the event. This is the heaviest coordination load of any persona because their needs extend into the attendee experience itself. It is also the architectural bridge between the host platform and the consumer graph, because attendee opt-in slots touch the consumer app. Consent and regulatory obligations for the testing itself belong to Lume. The platform provides scheduling and opt-in rails only. Confirm with Lume what their consent process requires before designing this module.

**Vendor-creative (DJ, coffee truck).** Gig-based. Needs: date, time, set length, power, load-in, parking, headcount forecast, and payment clarity in one place instead of five texts. Wants: a view of relevant upcoming events to pick up more work, which is the seed of the layer 2 vendor opt-in. The DJs are friends and work other people's events too, which makes them research assets for this persona beyond Novara's own events.

## 6. The event lifecycle map

Six phases, roughly forty decisions. The structural finding: almost every decision crosses at least two parties, which is why chat threads fail. The knot is phase 1.

### Phase 0: concept and series (4 to 8 weeks out)

Decisions: format (run plus coffee plus DJ plus stations), one-off versus series, target size, goal per party, budget and barter frame, date shortlist, location shortlist.

Parties: host plus co-hosts. Pain: goal misalignment surfaces late because it is never written down. Each partner's definition of success (signups, leads, tests completed, exposure, cups sold) is different and unstated.

### Phase 1: date, place, and terms lock (3 to 6 weeks out). The knot.

Date: propose slots, collect responses from every co-host and sponsor, check DJ and truck availability, account for season and daylight. This is many-to-many scheduling with no shared calendar.

Place: route options by distance and pace-pod friendliness, bathrooms, parking, meeting point visibility, finish point with room for tent, truck, and DJ, power access or generator, permits and amplified sound approval. Permit requirements vary by site and must be verified with the specific venue or land manager; do not assume.

Terms: who is co-host versus sponsor versus vendor on this event; what each gives (promotion to their list, product, money, staff) and gets (logo placement, station, mentions, leads, testing slots). Today this exists only in DMs.

### Phase 2: vendor and logistics booking (2 to 4 weeks out)

DJ: confirm date, set time and length, power and equipment, load-in, comp or payment, vibe. Coffee truck: arrival time, parking spot, stock estimate driven by headcount forecast, payment model (sponsored or attendee-pay). Activation station: tent, table, staffing count, volunteer roles, attendee flow design (before or after the run), consent materials. Supplies: signage, water, speaker backup.

Pain: every vendor asks the same questions in a separate thread. Headcount forecasts change and nobody re-notifies. The stock estimate the truck got two weeks ago is wrong on event day.

### Phase 3: promotion (2 to 3 weeks out)

Event page: title, description, which hosts are listed, capacity, waitlist. Assets: who designs, logo approval round per partner, sizes per channel. Distribution: posting schedule across every partner's channels, stories versus feed, email blasts, flyer print and QR placement. Reminder cadence.

Pain: approval rounds happen by DM. Partners forget to post. The host has no view of who actually promoted, so under-delivery is invisible until turnout.

### Phase 4: week-of operations

RSVP tracking and reminders. Volunteer roster and roles. Run of show document. Pace pod plan. Waivers. Weather call criteria and backup plan. Day-of comms channel. Load-in schedule per party.

Pain: the run of show lives in the host's head or a note nobody else has. Parties arrive with different assumptions about timing and their own roles.

### Phase 5: day-of

Setup sequence. Check-in. Announcements and partner shoutouts. Pod launch. Sweep and safety. DJ set timing. Station flow and opt-in management. Photo capture. Teardown.

Pain: the host is running the event and cannot also be the information desk. There is no shared timeline anyone can glance at.

### Phase 6: post-event (0 to 7 days)

Thank-yous. Photo distribution and tagging rights. Recap posts. Attendance actuals versus RSVPs. Per-partner recap: what each got (impressions, leads, tests completed, cups served). Settle-up. Debrief notes. Locking the next date while energy is high. Following up with people met at the event, which today depends entirely on memory and scattered DMs across three platforms.

Pain: recaps rarely happen because the host is exhausted. This is the single biggest silent killer of partner retention, and it is also the cheapest thing to automate.

### Cross-cutting

One thread per party in a different app. Version drift on every shared fact. The host as single point of failure. Zero capture of institutional knowledge: lead times per partner, standing availability, which pairings worked, which formats drew.

## 7. Product principles

1. **Guest links, zero adoption cost.** The host is the only account holder at first. Co-hosts, sponsors, and vendors tap a link, see only their slice, respond, done. No signup, no download, no learning curve. This is non-negotiable because the parties with required participation are not the parties with the pain. If a sponsor has to create an account, the product fails regardless of quality.
2. **Do not replace chat.** WhatsApp and Heylo keep the conversation. This platform holds the decisions, the timeline, the assignments, and the facts. Trying to move chat is how this dies.
3. **The graph is exhaust, never homework.** Availability patterns, pairing history, and preferences accumulate from real coordination. Nobody fills out a profile.
4. **Consent guardrails.** No selling attendee attention or data. Partners pay for coordination and proof, not audience access. Attendee participation in any activation (demos, testing) is opt-in, and the data relationship belongs to the partner and the consenting attendee. The platform provides rails only. Wellness framing per standing guardrail; no detection or diagnosis language anywhere near the Lume module.
5. **Low-fidelity availability beats no availability.** Standing windows, blackout dates, per-event responses. Calendar integration is a later luxury, not a requirement.

## 8. Feature roadmap

### v0: superseded by build decision, August 18, 2026

Original v0 was a zero-code concierge kit. Decision: with Claude Code, the build cost of a real MVP is low enough that the MVP itself is the concierge test. v0 and v1 merge into build milestone M0 in `Novara_Host_Platform_PRD_v1.md`, run live on the next Novara event with the existing five partners. The exit criteria are unchanged and now gate M1: all parties respond through the tool without being chased more than once (instrumented via a logged-nudge button, not memory), and at least two partners ask to use it for their own events. The four partner interviews fold into partner onboarding conversations rather than preceding the build.

### v1: MVP (host account plus guest links)

- Event workspace: one page per event holding the brief, timeline, and facts
- Task board with party assignments, owners, and due dates
- Date proposal and response links (the phase 1 knot)
- Partner availability profiles: standing windows, blackouts, per-event responses
- Asset hub: logos, flyers, approval status
- Run of show with per-party views
- Guest links throughout; no partner accounts

### v1.5: memory and proof

- Partner profiles persist across events (the graph starts here)
- Event templates and cloning for series
- Deliverable checklists per partner, both directions
- Auto-generated post-event recap page per partner: attendance, posts, photos, their outcomes. This is the sponsor-retention weapon and the cheapest high-value feature in the plan.
- Meeting capture, host-side: the host's own share card (QR linking to their chosen contact methods), a two-tap quick-add for connections made off-card, voice or text note at the moment of meeting, automatic event context on every record, and an auto-created follow-up task. The other party gets a web card and needs no account. Seeds partner profiles with real intake instead of manual entry. Design constraint, stated honestly: passive detection of a new LinkedIn connection or Instagram follow is not technically possible (no APIs expose connection events), so capture only works when the exchange routes through the card or the quick-add. The record existing at the moment of meeting is also what fixes the LinkedIn lag problem, because context is saved regardless of when the connect request is accepted.

### v2: the two-sided layers

- Org accounts for event community companies: multi-host, multi-event calendar, season view, sponsor pipeline. First paid tier candidate.
- Activation module: volunteer shifts, attendee opt-in slots, consent capture rails, and consented lead capture for partner stations, the community-event version of trade-show lead retrieval. Second paid tier candidate, and the bridge to the consumer app.
- Vendor opt-in board: vendors see relevant upcoming events and raise a hand. This is the layer 2 from the original concept, arriving only after there are enough events to be worth opting into.
- Pairing suggestions from accumulated data. Only ships once the graph has real history. Suggestion, never directory.

### v3: scale layers

- Payments and settle-up (aligns with the existing P15 marketplace item)
- Sponsor series packages: a season of defined cohort events rather than one-offs
- Venue and destination fill layer (the earlier conversation's model, deferred until event volume justifies it)
- Cross-city via event community companies
- Deeper consumer integration: opt-in attendee supply for hosts who want it
- Attendee-to-attendee meeting capture ships in the consumer app alongside Friends, not here. Each mutual capture is a Social graph edge and a verified encounter for the Trust graph. It is the follow-through variable applied to relationships: friendship hours (Hall 2019, roughly 50 for casual and 200 for close) accumulate only through repeat meetings, and capture plus follow-up is the bridge from met-once to met-again. Sequenced with Friends v1 to avoid jumping the consumer queue.

## 9. Business model

Free host layer, always. Fora economics as the north star: the professional pays nothing, and each host arrives with their own audience, which makes host acquisition compound.

Revenue candidates, in the order the evidence currently suggests, all labeled hypothesis until the interviews:

1. **Org accounts (Circe-type).** Monthly subscription for multi-host, multi-event operations. Most acute pain, existing ops budgets, cleanest SaaS shape. Unknown: what these orgs actually spend on tooling today. The Circe interview establishes the anchor.
2. **Activation module (Lume-type).** Per-seat or per-event-series fee for the station, volunteer, opt-in, and consented lead capture tooling. Heaviest coordination need and real budgets, but a smaller universe of buyers. Trade-show lead retrieval is the willingness-to-pay comparable (pricing anchors in section 4): sales and marketing teams already pay for capture at professional events, and the community-event version with consent rails does not exist.
3. **Vendor listings (later).** Low monthly subscription, not per-lead. Per-lead pricing tracks job value, and community-event job values (a few hundred dollars for a truck or a DJ set) cannot support meaningful lead fees the way wedding job values can. Strategic read from The Knot comparison; validate before building.
4. **Sponsor series packages (later).** Only after recap pages have proven value repeatedly.

Pricing: no numbers in this doc on purpose. The partner interviews and the first two commercial conversations set the anchors. Published comparables for orientation only: Luma Plus $59/month annual; Eventbrite Flex 3.7% + $1.79 per ticket plus processing; Peerspace 20% take.

## 10. Moat and IP note

Planning tools get copied. Directories get copied. What does not get copied is the accumulated record of which organizations co-host together, which pairings repeat, what cadence each partner sustains, what lead time each party needs, and which vendors fit which cohorts. That data exists nowhere today because it lives in individual hosts' heads, and it only accumulates by running real events through the system.

Meeting capture adds the encounter primitive: a timestamped record that two parties actually met at a real event. No self-reported network has this, LinkedIn endorsements included, and it is the foundation the verified-encounter layer (skills, credentials) builds on later.

On the feature-versus-system question, stated precisely because diligence will raise Bizzabo: the capture feature exists at the conference tier and is copyable at the community tier. The defensible claim has three parts. Segment economics: enterprise platforms cannot price down to free community events (badge hardware, custom quotes), and Luma and Partiful monetize ticketing, so free events generate no fee and no incentive to build operational depth, while this model is built for free events specifically. Stack integration: standalone capture dies at the "now what" step because the contact lands in a hub nobody reopens; here it lands in the workspace where the partner record, the recap, and the follow-up task already live, the same reason Klik works inside Bizzabo's event system. Compounding: every capture is a graph edge, and a copied feature starts at zero history. The investor sentence is not "nobody has this." It is: the conference industry proved this is worth paying for, nobody has brought it to community events because their business models point elsewhere, and in this stack every capture compounds. Klik's commercial shape is also the activation module's shape: sold to organizers who resell capture to their sponsors.

This is the Availability, Social, and Trust graphs applied to organizations rather than individuals. Open question for patent counsel: whether org-level graph coordination sits inside the existing 34 provisional claims or warrants its own filing. Flag before any public product description.

## 11. Go-to-market

1. Design partners: the existing five (Lume, Tasklet, Circe, coffee truck, DJs), starting with the concierge kit on Novara's own next event.
2. Circe's network: if the org account resonates, Circe-type companies are both customers and distribution, because every org brings its hosts and every host brings partners.
3. SF community groups currently on WhatsApp plus Heylo, reached through the hosts and partners already in the graph.
4. Other cities through event community companies, not through individual host acquisition.

## 12. Validation plan

Four interviews before any code. Same core questions, adapted per persona:

- **Vicki (Lume):** walk me through your last three event activations anywhere, not just Novara events. What did coordinating volunteers, testing slots, and logistics actually look like? Where did it break? What does your consent process require? How do you capture and follow up with the people who visit your station today, and what happens to those contacts?
- **Circe:** what did you use to coordinate your last three co-hosted events, and where did it break? How many hosts and events are you running per month? What do you pay for today across all event tooling?
- **Tasklet:** when you sponsor an event, what does saying yes require internally? What proof do you need afterward, and for whom?
- **One DJ:** across all the events you work, not just ours, what information do you chase down every time? What would make you take a gig from a board?

Then the concierge pilot: run the next Novara event on the v0 kit and log breakage.

Decision gate: build v1 only if the interviews confirm the pain is structural rather than specific to the host holding four relationships at once, and the pilot shows parties will actually respond through shared materials. The honest alternative finding is that Jacky feels this pain worse than anyone because she is the connector, in which case the product is smaller than this plan and should shrink accordingly.

## 13. Risks and honest unknowns

- **Solo founder capacity.** This runs parallel to the consumer build and the job search. The mitigation is that v0 is zero code and v1 is a web surface reusing existing infrastructure, but the risk is real and the roadmap above is deliberately gated.
- **Chat inertia.** WhatsApp is free and everyone is already on it. The product must be less painful than group chat from the first use, which is why guest links carry the whole design.
- **Evidence bias.** All three named partners are Jacky's partners and primed to agree. The interview questions deliberately ask about their other events to correct for this.
- **Early revenue is small.** Four events a month at community scale is a services business. The venture case appears only when other hosts run events without Jacky. Early revenue's job is proof, not income.
- **Scope creep.** The gravitational pull toward becoming another community chat app or another ticketing app is constant. The principles section exists to resist it.

## 14. Open decisions for Jacky

1. Confirm or kill: hosts free forever.
2. First revenue bet: org accounts versus activation module. Interviews decide, but state a prior.
3. Confirm the guest-link architecture as non-negotiable.
4. Confirm v0 concierge on the next Novara event before any code.
5. Working name and positioning line. Personal copy comes from Jacky per standing rule.
6. Whether and when to brief patent counsel on the org-graph question.
