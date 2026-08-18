# Novara host platform

A coordination workspace for community event hosts. The host has an account; co-hosts, sponsors, and vendors participate through tokenized guest links with no account. Web only.

- Build contract: [docs/Novara_Host_Platform_PRD_v1.md](docs/Novara_Host_Platform_PRD_v1.md)
- Strategy context: [docs/Novara_Host_Platform_Plan_v1.md](docs/Novara_Host_Platform_Plan_v1.md)
- Working rules for Claude Code: [CLAUDE.md](CLAUDE.md)

## Stack

React 18 plus Vite, Tailwind 4, Firebase (Auth, Firestore, Functions on Node 20, Hosting multi-site), Amplitude. Shares the `novarasocial-dev` Firebase project with the Novara consumer app; all Firestore collections here are prefixed `hp_`.

## Local setup

```
npm install
npm --prefix functions install
cp .env.example .env.local   # fill in values, see comments in the file
npm run dev
```

## Local dev with emulators

Fully offline, no contact with the shared project:

```
npm run emulators
npm run dev:emu
```

Sign in with any fake account the auth emulator offers. The gate will show its UID; seed it into the emulator's `hp_config/allowlist` (a REST call with `Authorization: Bearer owner` bypasses rules, or use the Emulator Suite UI). `emulator/firestore.rules` mirrors the pending rules block for local testing and never deploys anywhere.

## Deploy

Always explicit targets, never a bare `firebase deploy`:

```
npm run build
firebase deploy --only functions:hosts,hosting:novara-host
```

This repo never deploys Firestore rules. The consumer app repo owns `firestore.rules` for the shared project. New or changed `hp_` rules and indexes go in [docs/pending-rules.md](docs/pending-rules.md) and get applied through the consumer repo.
