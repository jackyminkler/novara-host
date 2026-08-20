# Novara host platform

A coordination workspace for community event hosts. It is solo first: one person can run the whole thing as their own checklist. Co-hosts, sponsors, vendors, and crew can optionally participate through tokenized guest links with no account. Web only.

- Build contract: [docs/Novara_Host_Platform_PRD_v1.md](docs/Novara_Host_Platform_PRD_v1.md)
- Design source of truth: [docs/novara-hosts-wireframes-v2.html](docs/novara-hosts-wireframes-v2.html), open it in a browser
- Strategy context: [docs/Novara_Host_Platform_Plan_v1.md](docs/Novara_Host_Platform_Plan_v1.md)
- Working rules for Claude Code: [CLAUDE.md](CLAUDE.md)

## Stack

React 18 plus Vite, TypeScript, Tailwind 4, Firebase (Auth, Firestore, Functions on Node 20, Hosting multi-site), Amplitude. Shares the `novarasocial-dev` Firebase project with the Novara consumer app; all Firestore collections here are prefixed `hp_`.

Every read and write goes through the `src/data/api.ts` seam. Components never import `firebase/firestore` directly, so the mock and Firebase implementations swap with one environment variable.

## Local setup

```
npm install
npm --prefix functions install
cp .env.example .env.local   # fill in values, see comments in the file
npm run dev
```

## Local dev with no backend at all

The fastest loop, and how UI work gets checked against the wireframes:

```
npm run dev:mock
```

This runs the entire host app against an in-memory store seeded with the wireframes' fictional partners, with no Firebase, no emulators, and no sign in. Changes persist to localStorage; clear the `novara-hosts-mock-v1` key to reset to the fixture. Guest pages work too: open a party's guest link from the parties tab, or use a seeded token such as `/g/tok-alma-presidio`.

## Local dev with emulators

Fully offline, no contact with the shared project:

```
npm run emulators
npm run dev:emu
```

Sign in with any fake account the auth emulator offers. The gate will show its UID; seed it into the emulator's `hp_config/allowlist` (a REST call with `Authorization: Bearer owner` bypasses rules, or use the Emulator Suite UI). `emulator/firestore.rules` mirrors the pending rules block for local testing and never deploys anywhere.

## Seeding your own content

Templates, partners, and contacts are your data, never application code. The app ships fully generic.

```
cp seed/content.example.json seed/content.json    # then fill it in
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node seed/seed.mjs --dry-run
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node seed/seed.mjs
```

`seed/content.json` is gitignored. Re-running matches documents by name and updates in place, so nothing duplicates.

## Checks

```
npm run typecheck
npm run build
```

## Deploy

Always explicit targets, never a bare `firebase deploy`:

```
npm run build
firebase deploy --only functions:hosts,hosting:novara-host
```

This repo never deploys Firestore rules. The consumer app repo owns `firestore.rules` for the shared project. New or changed `hp_` rules and indexes go in [docs/pending-rules.md](docs/pending-rules.md) and get applied through the consumer repo.
