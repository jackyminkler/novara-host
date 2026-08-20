import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  GUEST_ACTIONS,
  type GuestAction,
  type GuestRunItem,
  type GuestView,
} from "./guestTypes";

// All guest access goes through these two functions. Guests never
// authenticate and never touch Firestore directly; the Admin SDK here
// bypasses security rules by design, so every read and write below is scoped
// by hand to exactly what the token permits.
//
// No rate limiting in M0. Five trusted partners, accepted risk, revisit in
// M2 (PRD 3.2).

initializeApp();
const db = getFirestore();

const TOKENS = "hp_guestTokens";
const EVENTS = "hp_events";

interface TokenDoc {
  eventId: string;
  scope: "party" | "crew" | "recap";
  subjectId: string;
  revoked: boolean;
}

/** Anything the caller should not be able to tell apart. */
class InvalidToken extends Error {}

async function loadToken(raw: unknown): Promise<{ id: string; data: TokenDoc }> {
  if (typeof raw !== "string" || raw.length < 20 || !/^[A-Za-z0-9-]+$/.test(raw)) {
    throw new InvalidToken();
  }
  const snap = await db.collection(TOKENS).doc(raw).get();
  if (!snap.exists) throw new InvalidToken();
  const data = snap.data() as TokenDoc;
  if (data.revoked) throw new InvalidToken();
  return { id: raw, data };
}

const ORG_TYPE_LABEL: Record<string, string> = {
  cohost: "Co-host",
  sponsor: "Sponsor",
  vendor: "Vendor",
  activation: "Activation partner",
  venue: "Venue",
};

async function readSub(eventId: string, name: string) {
  const snap = await db.collection(EVENTS).doc(eventId).collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }));
}

async function buildView(token: { id: string; data: TokenDoc }): Promise<GuestView> {
  const { eventId, scope, subjectId } = token.data;

  const eventSnap = await db.collection(EVENTS).doc(eventId).get();
  if (!eventSnap.exists) throw new InvalidToken();
  const event = eventSnap.data() as Record<string, any>;

  const [parties, tasks, runOfShow, crew] = await Promise.all([
    readSub(eventId, "parties"),
    readSub(eventId, "tasks"),
    readSub(eventId, "runOfShow"),
    readSub(eventId, "crew"),
  ]);

  const party = scope === "crew" ? null : (parties.find((p) => p.id === subjectId) as any);
  const person = scope === "crew" ? (crew.find((c) => c.id === subjectId) as any) : null;
  if (!party && !person) throw new InvalidToken();

  const owner = party ? `party:${party.id}` : `crew:${person.id}`;

  // Org names are the only thing read outside the event, and only for the
  // parties actually on it.
  const orgIds = Array.from(new Set(parties.map((p) => (p as any).orgId).filter(Boolean)));
  const orgs = await Promise.all(
    orgIds.map(async (id) => {
      const snap = await db.collection("hp_orgs").doc(id as string).get();
      return { id: id as string, name: (snap.data()?.name as string) ?? "Partner" };
    })
  );
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? "Partner";

  const confirmed = (event.dateOptions ?? []).find(
    (o: any) => o.id === event.confirmedDateOptionId
  );

  const hostName = (event.hostDisplayName as string) || "your host";

  const ownerLabel = (ref: string): string => {
    if (ref === "host") return hostName;
    if (ref === "all") return "All";
    const id = ref.slice(ref.indexOf(":") + 1);
    if (ref.startsWith("crew:")) {
      const member = crew.find((c) => c.id === id) as any;
      return member ? `${member.name}, crew` : "Crew";
    }
    const other = parties.find((p) => p.id === id) as any;
    return other ? orgName(other.orgId) : "Partner";
  };

  const schedule: GuestRunItem[] = runOfShow
    .map((item: any) => ({
      time: item.time as string,
      title: item.title as string,
      owner: ownerLabel(item.owner as string),
      mine: item.owner === owner || item.owner === "all",
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const view: GuestView = {
    scope,
    event: {
      title: event.title ?? "",
      description: event.description ?? "",
      hostName,
      location: {
        name: event.location?.name ?? "",
        meetPoint: event.location?.meetPoint ?? "",
        finishPoint: event.location?.finishPoint ?? "",
        notes: event.location?.notes ?? "",
      },
      confirmedStartsAt: confirmed?.startsAt ?? null,
    },
    subject: {
      name: party ? orgName(party.orgId) : person.name,
      roleLabel: party ? ORG_TYPE_LABEL[party.roleOnEvent] ?? "Partner" : "Crew",
      status: party?.status ?? "confirmed",
      terms: party?.terms ?? { gives: "", gets: "" },
      goal: party?.goal ?? "",
      cta: party?.cta ?? "",
      constraintNote: party?.constraintNote ?? "",
    },
    // Once a date is confirmed the options stop being a question.
    dateOptions: confirmed
      ? []
      : (event.dateOptions ?? []).map((option: any) => ({
          id: option.id,
          startsAt: option.startsAt,
          response: party?.dateResponses?.[option.id]?.value ?? null,
        })),
    tasks: tasks
      .filter((t: any) => t.owner === owner)
      .map((t: any) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate ?? null,
        status: t.status,
        note: t.note ?? "",
      })),
    runOfShow: schedule,
    // Draft links stay host-side. A partner only ever sees what is final.
    links: (event.links ?? [])
      .filter((l: any) => l.status === "final")
      .map((l: any) => ({ label: l.label, url: l.url })),
    recap: null,
  };

  if (scope === "recap" && party) {
    // Verified presence is corroboration, never a gate: it counts the people
    // captured at this event, and nothing about it blocks anyone.
    const captures = await db.collection("hp_contacts").where("eventId", "==", eventId).get();
    view.recap = {
      goal: party.goal ?? "",
      outcomes: (party.outcomes ?? [])
        .filter((o: any) => o.label && o.value)
        .map((o: any) => ({ label: o.label, value: o.value })),
      signups: event.signupCount ?? null,
      attended: event.recap?.headcount ?? null,
      verified: captures.size,
      photosLink: event.recap?.photosLink ?? "",
      postsRan: event.recap?.postsRan ?? "",
      hostName,
    };
  }

  return view;
}

function touch(tokenId: string): Promise<unknown> {
  return db.collection(TOKENS).doc(tokenId).update({ lastUsedAt: new Date().toISOString() });
}

export const hpGuestView = onRequest({ invoker: "public" }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  try {
    const token = await loadToken(req.query.t);
    const view = await buildView(token);
    await touch(token.id);
    // Never cached: a revoked link has to stop working immediately.
    res.set("Cache-Control", "no-store");
    res.status(200).json(view);
  } catch (err) {
    if (err instanceof InvalidToken) {
      res.status(404).json({ error: "invalid_token" });
      return;
    }
    console.error("hpGuestView failed", err);
    res.status(500).json({ error: "server_error" });
  }
});

export const hpGuestSubmit = onRequest({ invoker: "public" }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  try {
    const body = (req.body ?? {}) as { t?: unknown; action?: unknown; payload?: unknown };
    const token = await loadToken(body.t);
    const action = body.action as GuestAction;
    const payload = (body.payload ?? {}) as Record<string, unknown>;

    if (!GUEST_ACTIONS.includes(action)) {
      res.status(400).json({ error: "unknown_action" });
      return;
    }

    // A recap link is read only. This is the whole point of scoping tokens.
    if (token.data.scope === "recap") {
      res.status(403).json({ error: "read_only" });
      return;
    }

    const { eventId, scope, subjectId } = token.data;
    const eventRef = db.collection(EVENTS).doc(eventId);
    const now = new Date().toISOString();

    // Crew links carry tasks and the schedule, no terms and no dates, so the
    // party-only actions are refused rather than silently ignored.
    const partyOnly: GuestAction[] = ["respond_dates", "confirm_role", "add_note"];
    if (scope === "crew" && partyOnly.includes(action)) {
      res.status(403).json({ error: "not_permitted" });
      return;
    }

    if (action === "respond_dates") {
      const responses = (payload.responses ?? {}) as Record<string, string>;
      const eventSnap = await eventRef.get();
      const optionIds: string[] = ((eventSnap.data()?.dateOptions ?? []) as any[]).map(
        (o) => o.id
      );

      const update: Record<string, unknown> = {};
      for (const [optionId, value] of Object.entries(responses)) {
        // Only real options, only real answers. Everything else is dropped.
        if (!optionIds.includes(optionId)) continue;
        if (value !== "yes" && value !== "no" && value !== "maybe") continue;
        update[`dateResponses.${optionId}`] = { value, source: "link", note: "", at: now };
      }
      if (typeof payload.constraintNote === "string") {
        update.constraintNote = payload.constraintNote.slice(0, 1000);
      }
      if (Object.keys(update).length > 0) {
        await eventRef.collection("parties").doc(subjectId).update(update);
      }
    }

    if (action === "update_task") {
      const taskId = payload.taskId;
      if (typeof taskId !== "string") {
        res.status(400).json({ error: "bad_payload" });
        return;
      }
      const taskRef = eventRef.collection("tasks").doc(taskId);
      const taskSnap = await taskRef.get();
      const owner = scope === "crew" ? `crew:${subjectId}` : `party:${subjectId}`;
      // A guest can only ever touch a task assigned to them.
      if (!taskSnap.exists || taskSnap.data()?.owner !== owner) {
        res.status(403).json({ error: "not_permitted" });
        return;
      }
      const update: Record<string, unknown> = {};
      if (payload.status === "open" || payload.status === "done") update.status = payload.status;
      if (typeof payload.note === "string") update.note = payload.note.slice(0, 1000);
      if (Object.keys(update).length > 0) await taskRef.update(update);
    }

    if (action === "confirm_role") {
      await eventRef
        .collection("parties")
        .doc(subjectId)
        .update({ status: payload.declined === true ? "declined" : "confirmed" });
    }

    if (action === "add_note" && typeof payload.note === "string") {
      await eventRef
        .collection("parties")
        .doc(subjectId)
        .update({ constraintNote: payload.note.slice(0, 1000) });
    }

    const view = await buildView(token);
    await touch(token.id);
    res.set("Cache-Control", "no-store");
    res.status(200).json(view);
  } catch (err) {
    if (err instanceof InvalidToken) {
      res.status(404).json({ error: "invalid_token" });
      return;
    }
    console.error("hpGuestSubmit failed", err);
    res.status(500).json({ error: "server_error" });
  }
});
