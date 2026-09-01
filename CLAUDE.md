# CLAUDE.md

Novara host platform: a coordination workspace for community event hosts. The host has an account; co-hosts, sponsors, vendors, and crew participate through optional tokenized guest links with no account. Web only.

Cross-repo engineering conventions — commits, ADRs, invariants, releases — are in
**`ENGINEERING.md`** (a mirror; edit the canonical copy in `novara`).

**Product canon and the normative design rules are in `novara-brain`, indexed by
`docs/PRODUCT_CANON.md`. Read that before building any feature or any UI here.**
`Novara_Design_Rules_v1.md` names Novara Hosts, guest token pages and share cards explicitly in
its scope, so it governs this repo too, not only the Flutter app. The rules broken most often: no
em dashes anywhere, sentence case throughout, nothing above font weight 500, twelve colour tokens
with no opacity variants, every number carries its unit, every screen defines five states, and no
score on a person anywhere. Repo gates and the
rules-ownership boundary are in `CONTRIBUTING.md`.

Build contract: @docs/Novara_Host_Platform_PRD_v1.md
Design source of truth: `docs/novara-hosts-wireframes-v2.html` (open in a browser; every screen maps to a feature number)
Strategy context (read on demand, do not import): docs/Novara_Host_Platform_Plan_v1.md

## The three principles

1. **Solo-first.** The tool is fully usable by one person as their own checklist. Parties, guest links, and crew are optional at every layer. Never build a flow that requires sending something to someone.
2. **Guest links, zero adoption cost, when used.** Partners never need accounts.
3. **Do not replace chat.** This tool holds decisions, timelines, assignments, and facts.

## Hard rules

- Never modify the Novara consumer app repo, its Cloud Functions, or any Firestore collection that does not start with `hp_`. If a change there seems necessary, stop and surface it instead of making it.
- Guests never authenticate and never touch Firestore directly. All guest reads and writes go through the two HTTP functions (`hpGuestView`, `hpGuestSubmit`) with capability token validation. Tokens carry a scope (`party`, `crew`, `recap`, `card`); the view function serves the matching view and the submit function accepts only the actions that scope allows. `card` is the host's share card and is the only scope with no event behind it: those tokens carry `eventId` of `''`. Do not add guest-side Firestore access, anonymous auth, partner accounts, or a third endpoint.
- Host access is open Google sign-in: anyone signed in gets their own workspace (2026-08-25, supersedes the `hp_config/allowlist` gate in PRD 0.4). **Isolation is `ownerUid`, not a gate.** Every top-level `hp_` document carries `ownerUid`, every `list*` filters on it, and every `hp_` collection gets an explicit match block with the owner condition; event subcollections inherit via `hpOwnsEvent`. Rules cannot wildcard a collection-name prefix. Never propose a collection-group rule (`match /{path=**}/name/`): those span the consumer app's subcollections too in the shared ruleset.
- This repo never deploys Firestore rules. The consumer app repo owns `firestore.rules` for the shared project. firebase.json here must contain no `firestore` section, and deploys always use explicit targets (`firebase deploy --only functions:hosts,hosting:novara-host`). When a new or changed `hp_` collection needs rules, a composite index, or (from M1) a Storage rules path: write the exact definition to `docs/pending-rules.md`, mirror it into `emulator/firestore.rules`, add behavioural cases to `tests/ownership.rules.test.ts` (negative-control first: the new cases must fail without the block), and open a PR. CI runs the ownership suite on it. **Jacky reviews the PR; she does not run the deploy, and the gate is no longer "tell Jacky and stop"** (2026-08-31 — that gate is why four live collections sat unprotected, then mis-recorded as Pending, for days). Applied means read back from the Firebase Rules API, checked mechanically by `novara/tools/rules_check.py`. Full flow: the Workflow section of `docs/pending-rules.md`. Surface composite-index needs as soon as the query is written, not when it breaks.
- **Personal content is data, never code.** Jacky's templates, partners, contacts, and any real names enter Firestore through `seed/` or the UI. The app ships fully generic; mock data uses the wireframes' fictional partners. If content seems to need hardcoding, stop and surface it.
- PRD milestones order the work, they do not gate it (2026-08-26, supersedes the shrink-to-PRD reflex and PRD 4.6 as a hard boundary). Event Zero stays an idea of validation, not a checkpoint that has to clear before more gets built. A feature may land ahead of its milestone: record the decision in `docs/build-log.md` and say which non-goal it overrides. Still shrink rather than expand within a feature, and still surface anything that would touch the consumer app.

## Copy rules (apply to every UI string, error, and empty state)

- Never use em dashes. Use commas, periods, or colons.
- Sentence case for all headings, buttons, and labels.
- Plain, warm, non-corporate voice. Never use the word "engagement" in product copy.
- Outputs are activities, tasks, and dates, never lists of people.

## Design system

> **Superseded, 2026-08-31.** "Design system A.1", locked August 19 2026, defined its own violet and
> its own button gradient. It predates the colour correction of 2026-08-27 and was never swept.
> **Host and consumer are one brand. There is no separate host palette.**
> `Novara_Design_Rules_v1.md` in `novara-brain` is normative for this repo, and it names Novara
> Hosts, guest token pages and share cards explicitly in scope.

Tokens live in `src/index.css` as CSS variables and Tailwind theme colors. Never hardcode a hex in a component.

**The code has not been migrated yet.** `src/index.css` still carries the A.1 values, so what is in
the repo today is not what the rules require. Do not treat the current CSS as authority and do not
copy its violet into anything new. The file-by-file list is at
`novara-brain/00-now/audits/2026-08-31-brand-palette-delta.md`.

Canonical values, from design rules section 2.1:

- Violet `#6C3CE0`, violet-tint `#F1EDFC`. **Retired: `#4F3BC9`, and the `#6C4FF0` to `#BB4FD4` gradient.**
- Ink `#1E1B26`, secondary `#5C5766`, muted `#918B9C`. **Retired: `#241F3D`, `#6B6880`, `#8D8A9E`.**
- Paper `#F9F8FC`, surface white, line `#E8E5EE`, line-2 `#D7D2E0`, neutral fill `#F3F1F7`.
- Danger `#D64545`, success `#1D9E75`.
- Violet is reserved for meaning: active nav, chips, avatars, proposed-date marks, focus states. Not decoration.
- **No gradient on a button.** Gradients carry activity identity and appear in four places only: a plan-card identity block, a plan-detail hero, a moment surface (hero or CTA, not both), and share cards. A primary button is flat violet, radius 8, weight 500.
- Poppins for display (headings, times, numerals), Instrument Sans for interface text.
- Icons: Lucide only.
- Borders are hairlines (0.5px), radii 8 to 13px, shadows barely there.
- Layout templates: overview stack, full-width collection, tabbed workspace, canvas, split, focus column, bare guest column.
- The sidebar collapses to an icon rail everywhere, not just on split pages. The chevron control sits at its foot in both states, the choice persists per user in localStorage, split-view pages default to collapsed, and below 900 px it collapses on its own. The toggle stays available at every width; a narrow window can still be opened, but that choice lasts the session rather than persisting. Collapsed labels become hover and focus tooltips.
- Guest and recap routes are mobile-first at 390 px and must load in under two seconds on LTE. Host routes are desktop-comfortable.

## Stack

React 18 plus Vite, **TypeScript**, Tailwind 4, Firebase (Auth, Firestore, Functions on Node 20, Hosting multi-site), Amplitude Browser SDK.

- **All data flows through the `src/data/api.ts` seam.** Components never import `firebase/firestore` directly. Two implementations sit behind it: `mockApi` (in-memory, seeded with the wireframes' fictional partners) and `firebaseApi`. `VITE_DATA_MODE=mock` runs the whole host app with no backend, which is how UI work gets verified.
- Functions deploy under a separate `codebase` in firebase.json so existing consumer functions are untouched.
- Prefer boring solutions: simple refetch over realtime listeners where either works, one HTTP function with an action switch over many endpoints.
- New code is `.ts` / `.tsx`. `allowJs` stays on only until the last `.jsx` file is gone.

## Definition of done, every feature

1. Meets its acceptance criteria in PRD section 4.2.
2. Matches its screen in the wireframes file.
3. Every new UI string passes the copy rules above.
4. Guest-facing changes verified at 390 px.
5. The relevant Amplitude events from PRD 4.3 fire.
6. `npx tsc --noEmit` and `npm run build` both pass.

Keep this file short. When a durable convention emerges during the build, add one concise line here rather than re-explaining it in chat next session.

## Matching

The matching algorithm has one source of truth: **`MATCHING.md`** at the repo root.

Read it before changing anything in a matching path. It covers the shipped scoring core, the
dimension set and weights, hard constraints versus weights, the selection modes, the status
board of what is and is not implemented, the settled decisions with dates, and a list of traps
that each produced real defects in production or in a live event.

Readable version: https://claude.ai/code/artifact/6a055630-c583-4f58-94bf-ec5b4a69add5

If the code and `MATCHING.md` disagree, the code is right and the document needs correcting.

**Filing decisions (compaction-proof rule).** When a matching decision is made in this
checkout — a weight changed, a rule settled, a tolerance tuned, a trap discovered — append a
dated block to `MATCHING_INBOX.md` (repo root) and include it IN THE SAME COMMIT as the code
change. Never defer filing to the end of the session: a compacted or interrupted session
loses anything it was still meaning to do. `MATCHING.md` is generated — never hand-edit it;
Cowork sweeps the inbox into it.
