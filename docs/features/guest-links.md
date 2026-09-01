# Guest links

- **Status:** Shipped, with the M1 additions built and unreleased
- **Released in:** `hpGuestView` / `hpGuestSubmit` live since 2026-08-20; the card scope and
  deliverable toggle are on main only
- **Owner surfaces:** `novara-host`
- **Last mapped:** 2026-08-27

---

## What it does

A guest link is how everyone who is not the host takes part. Nobody signs up, nobody installs
anything, nobody gets a password. You send a link in whatever you already text that person in,
they tap it, and they see their own slice of the event and nothing else.

**Four kinds of link, because four different people need four different pages.**

A **partner link** is the main one. It opens one page: what the event is, who invited them and
as what, the terms you agreed both ways, the dates you are choosing between until one is
confirmed, what they bring and what you bring, their own tasks, the run of show with a toggle
between their items and the whole morning, and any links you have marked final. They can answer
the dates, add a note about them, accept or decline the role, tick their tasks off, and tick off
the things they agreed to bring. Everything is one tap plus a confirmation.

A **crew link** is the same page with the personal parts left out. Crew are named helpers, not
organisations, so there are no terms, no dates to answer and no agreements: there are their
tasks and the schedule, which is what a person holding an A-frame at 6 am actually needs.

A **recap link** is read only. It opens with what that partner said they wanted out of the day
and closes with what happened against it: signups, how many came by your count, how many were
verified by someone actually meeting them, their outcomes, and the photos. Nothing on it can be
changed, by design, because a recap is a record.

A **card link** is your own. It is the page behind the QR code on your lanyard: your name, one
line about what you run, the ways you want to be reached, and the name of your next confirmed
event. Underneath there is a short form the other person can fill in to send their details back
to you, which lands in your captures with a follow-up already set for two days out. It is the
only link that is meant to be passed around: every other one says on it that it is private to
the person who was sent it.

**What happens when you share.** Nothing is emailed. You copy the link and send it yourself, in
the channel you already use with that person. That is deliberate: the tool holds the decision,
you keep the conversation.

**Turning one off.** Regenerating a link kills the old one immediately, including anything
already printed on a card. Removing a partner from an event kills theirs too. There is nothing
to un-invite and no account to delete, because there was never an account.

**Where to find them.** Partner links are on each party on an event's parties tab. Crew links
are on the crew rows. Recap links are made when you generate recaps. Your card is at "Your card"
on the capture page.

---

## Surface map

Every place this feature touches. **A change to any row means checking every other row.**

| Surface | Where | What it does here | Breaks how, if changed |
| --- | --- | --- | --- |
| View function | `functions/src/index.ts` (`hpGuestView`, `buildView`, `buildCardView`) | Validates the token and assembles exactly the view its scope allows | The only reader. Adding a field here without adding it to both `guestTypes.ts` files ships a payload nothing renders |
| Submit function | `functions/src/index.ts` (`hpGuestSubmit`) | Validates the token, checks the action against the scope, writes, returns the refreshed view | A write reachable from the wrong scope is the whole risk surface: everything here runs on the Admin SDK and bypasses rules |
| Contract | `functions/src/guestTypes.ts` **and** `src/guest/guestTypes.ts` | One shape in two build roots, plus `GUEST_ACTIONS` | The two files are copies. Changing one and not the other compiles cleanly in both roots and fails at runtime |
| Guest page | `src/guest/GuestPage.tsx` | Renders the party, crew, recap and card views from that one shape | One route, four views. The scope decides which; no route knows a token's kind before it loads |
| Guest client | `src/guest/guestClient.ts` | Same-origin `fetch` to the two functions, or the mock in mock mode | Hosting rewrites keep these same-origin, so there is no CORS setup to break |
| Mock guest | `src/guest/mockGuest.ts` | Mirrors both functions against the in-memory store, so guest work is verifiable at 390 px with no backend | A guard the real function has and the mock does not is a guard nobody sees fail until production |
| Tokens | `hp_guestTokens/{token}`, `issueToken` / `issueCardToken` in both seam implementations | 24 character random ids as document ids, one live token per subject, `revoked` and `lastUsedAt` | Issuing revokes the previous token for the same subject. Dropping that turns "regenerate" into "make a second working link" |
| Card storage | `hp_profiles/{uid}` | The card, with the uid as the document id so it is a get and never a query | The card token's `subjectId` is that same uid; the view refuses when the two disagree |
| Card editor | `src/host/pages/HostCardPage.tsx` | Edits the card, issues the link, draws the QR, prints the lanyard | Saving the card and issuing a link are separate on purpose: rotating a link as a side effect of a typo fix kills something already printed |
| QR encoder | `qrcode`, loaded with a dynamic import | Renders the link as a PNG data URL in the host bundle only | A static import puts an encoder in the main host chunk for a page most sessions never open. It must never reach the guest bundle |
| Print sheet | `src/index.css` (`@media print`, `.print-sheet`) | One 3.5 by 5 inch card and nothing else on the page | Hidden with `visibility`, not `display`: the sheet sits inside the app's flex layout and collapsing its ancestors would take it with them |
| Deliverables | `Party.deliverables`, `PartiesTab` host side, party view guest side | Both directions of the agreement, with the party's own half toggleable from their link | Written back as a whole array, never a dotted path into an index: those depend on the order the host last left the list in |
| Card captures | `hp_contacts`, written by `leave_contact` | A stranger's details, attributed to the host's soonest upcoming event | The Admin SDK bypasses the client normalizers, so every field the app reads has to be written out here, `personId` and `voiceNote` included |
| Rules | Consumer repo `firestore.rules` | None of it applies. Guests never authenticate and the functions use the Admin SDK | This is why scope checks are the security model. There is no second line of defence behind them |
| Analytics | `hp_guest_view_opened`, `hp_date_response_submitted`, `hp_task_updated`, `hp_role_confirmed`, `hp_guest_deliverable_toggled`, `hp_card_link_created`, `hp_card_viewed`, `hp_card_contact_left`, `hp_nudge_logged` | Whether partners answer through the tool, which is the Event Zero success gate | `hp_nudge_logged` is the honest half of that gate and is host-side. Renaming any of these breaks the gate that reads them |

Fields this feature reads or writes are declared in `src/data/types.ts` (`GuestToken`,
`TokenScope`, `Party`, `Deliverable`, `HostCard`, `CapturedContact`). This repo has no field
registry of its own; `docs/FIELD_REGISTRY.md` lives in `novara` and covers the consumer app's
user record.

**The scope and action matrix.** This is the security model in one table.

| Scope | View serves | Actions accepted |
| --- | --- | --- |
| `party` | Event, terms, dates until one is confirmed, their tasks, deliverables both ways, run of show, final links | `respond_dates`, `update_task`, `confirm_role`, `add_note`, `update_deliverable` |
| `crew` | Event, their tasks, run of show, final links | `update_task` |
| `recap` | The recap, read only | none |
| `card` | The host's card and the title of their soonest confirmed event | `leave_contact` |

---

## Change protocol

Before you touch it:

1. Read this map, and `src/data/types.ts` for the shapes above.
2. Note which surfaces your change touches, and which it *implies*. A new field on the view
   implies both `guestTypes.ts` files, the function, the mock, and the page.
3. Never add a third endpoint, guest-side Firestore access, anonymous auth, or partner accounts
   (CLAUDE.md, hard rules). One HTTP function with an action switch beats many endpoints.

After:

4. Update the rows you changed, in the same commit.
5. Run both gates: `npx tsc --noEmit` and `npm run build` at the root, and `npm run build` in
   `functions/`. Two build roots, two builds.
6. Check the guest routes at 390 px, which is where every partner meets this product.
7. Regenerate the handbook: `python3 scripts/eng/build_feature_handbook.py`.

**Contract tests guarding this feature:** none. `tests/ownership.rules.test.ts` covers the host
side of `hp_guestTokens` and `hp_profiles` against the emulator, but rules are not what protects
guest access: the functions bypass them. The scope checks in `hpGuestSubmit` are unit-testable
and untested, and that is the largest known gap here.

**Invariants:** guests never authenticate and never touch Firestore (CLAUDE.md, hard rules). No
required check-in or attendance gating of any kind, ever (PRD 4.6). Draft links stay host-side;
a partner only ever sees what is marked final. Spend never reaches a guest page.

---

## Backward compatibility

- Tokens issued before the scope field existed carried a bare `partyId`. Everything since
  carries `scope` and `subjectId`; the loader reads only the newer shape.
- A card token carries `eventId` of `''`. Any query or cleanup that assumes `eventId` names a
  real event has to skip these. `deleteEvent` already does, because it queries tokens by the
  event id it is deleting and `''` never matches.
- Parties created before M1 have no `deliverables`. The view defaults the field on read, and the
  page renders nothing when the list is empty rather than an empty heading.
- Rate limiting does not exist. Five trusted partners is the M0 argument (PRD 3.2, accepted
  risk), but the card scope changes the shape of that risk: a card link is meant to be passed
  around, so `leave_contact` is the first guest write a stranger can reach. Every field on it is
  length capped. Revisit in M2.

---

## Cross-product

| Product | Stake | Status |
| --- | --- | --- |
| `novara` | Real, and unbuilt. A capture left through a card is a person who has met the host and has no app account; PRD M3 makes that supply the consumer bridge. Nothing reads across today | Designed |
| `novara-pulse` | None | Not built |
| `novara-matching` | None. Matching reads registrations, which arrive through imports rather than through guest links | Not built |

---

## History

Append-only. One dated line per meaningful change. Newest last.

- `2026-08-20` — the two functions went live with the party, crew and recap scopes.
- `2026-08-27` — M1 additions: deliverables both directions on the party view with the party's
  own half toggleable through `update_deliverable`; the `card` scope, its editor, QR and print
  sheet, and `leave_contact` writing a capture back to the host. `GUEST_ACTIONS` went from four
  to six.
