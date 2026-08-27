import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  GUEST_ACTIONS,
  type GuestAction,
  type GuestDeliverable,
  type GuestDeliverableCounts,
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
const PROFILES = "hp_profiles";
const CONTACTS = "hp_contacts";

interface TokenDoc {
  /** Empty on a card token, which is the one scope with no event behind it. */
  eventId: string;
  scope: "party" | "crew" | "recap" | "card";
  subjectId: string;
  /** The host who owns everything this token can reach. */
  ownerUid: string;
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
  // Every other scope is addressed through its event. A card token is not, so
  // the owner is the only thing scoping its reads and its one write, and a
  // token without one has nothing to scope them by.
  if (data.scope === "card" && typeof data.ownerUid !== "string") throw new InvalidToken();
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

const emptyCounts = (): GuestDeliverableCounts => ({
  party: { done: 0, total: 0 },
  host: { done: 0, total: 0 },
});

function countDeliverables(items: GuestDeliverable[]): GuestDeliverableCounts {
  const counts = emptyCounts();
  for (const item of items) {
    const side = item.direction === "host" ? counts.host : counts.party;
    side.total += 1;
    if (item.done) side.done += 1;
  }
  return counts;
}

/**
 * The host's soonest event that has not happened yet, by confirmed date.
 *
 * Equality on `ownerUid` and everything else in memory, like every other query
 * in this product: a date filter would want a composite index, and a host has
 * tens of events rather than thousands.
 */
async function soonestUpcoming(
  ownerUid: string
): Promise<{ id: string; title: string } | null> {
  const snap = await db.collection(EVENTS).where("ownerUid", "==", ownerUid).get();
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  return (
    snap.docs
      .map((d) => {
        const event = d.data() as Record<string, any>;
        const option = (event.dateOptions ?? []).find(
          (o: any) => o.id === event.confirmedDateOptionId
        );
        return option?.startsAt
          ? { id: d.id, title: (event.title as string) ?? "", startsAt: option.startsAt as string }
          : null;
      })
      .filter((row): row is { id: string; title: string; startsAt: string } => row !== null)
      .filter((row) => new Date(row.startsAt).getTime() >= from)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((row) => ({ id: row.id, title: row.title }))[0] ?? null
  );
}

/**
 * A card view carries the card and nothing else. It is built from scratch
 * rather than from an event, because there is no event: the shell below is
 * empty on purpose, and no host document other than the card is read.
 */
async function buildCardView(token: { id: string; data: TokenDoc }): Promise<GuestView> {
  const { subjectId, ownerUid } = token.data;
  // The card's document id is the host's uid, and the token's subject is that
  // same uid. Reading anyone else's card would need both to be wrong.
  if (subjectId !== ownerUid) throw new InvalidToken();

  const snap = await db.collection(PROFILES).doc(subjectId).get();
  if (!snap.exists) throw new InvalidToken();
  const card = snap.data() as Record<string, any>;

  const next = await soonestUpcoming(ownerUid);
  const displayName = (card.displayName as string) || "your host";
  const methods = (card.methods ?? {}) as Record<string, string>;

  return {
    scope: "card",
    event: {
      title: "",
      description: "",
      hostName: displayName,
      location: { name: "", meetPoint: "", finishPoint: "", notes: "" },
      confirmedStartsAt: null,
    },
    subject: {
      name: displayName,
      roleLabel: "",
      status: "confirmed",
      terms: { gives: "", gets: "" },
      goal: "",
      cta: "",
      constraintNote: "",
    },
    dateOptions: [],
    tasks: [],
    deliverables: [],
    deliverableCounts: emptyCounts(),
    runOfShow: [],
    links: [],
    recap: null,
    card: {
      displayName,
      headline: (card.headline as string) ?? "",
      // Only the five known keys, and only the ones with a value, so a stray
      // field on the document cannot ride out to a stranger's phone.
      methods: {
        ...(methods.instagram && { instagram: methods.instagram }),
        ...(methods.linkedin && { linkedin: methods.linkedin }),
        ...(methods.phone && { phone: methods.phone }),
        ...(methods.email && { email: methods.email }),
        ...(methods.other && { other: methods.other }),
      },
      eventContext: next?.title ?? null,
    },
  };
}

async function buildView(token: { id: string; data: TokenDoc }): Promise<GuestView> {
  const { eventId, scope, subjectId } = token.data;

  if (scope === "card") return buildCardView(token);

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

  // Both directions, so an arrangement where one side quietly does everything
  // is visible to both of them rather than remembered differently by each.
  // Party links only: a recap is a read-only look back and never a checklist.
  const deliverables: GuestDeliverable[] =
    scope === "party" && party
      ? ((party.deliverables ?? []) as any[]).map((d) => ({
          id: d.id as string,
          direction: d.direction === "host" ? ("host" as const) : ("party" as const),
          title: (d.title as string) ?? "",
          due: (d.due as string) ?? null,
          done: d.done === true,
        }))
      : [];

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
    deliverables,
    deliverableCounts: countDeliverables(deliverables),
    runOfShow: schedule,
    // Draft links stay host-side. A partner only ever sees what is final.
    links: (event.links ?? [])
      .filter((l: any) => l.status === "final")
      .map((l: any) => ({ label: l.label, url: l.url })),
    recap: null,
    card: null,
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

/**
 * Two days out, matching the default the host's own quick add uses. Computed
 * in the function's zone, which is UTC, so a capture left late in a Pacific
 * evening is due on what the host would call the third day. A day either way
 * on a reminder is not worth carrying a timezone through a token.
 */
function dueInTwoDays(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const trimmed = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * What a stranger may write through a card link, which is one capture with a
 * name on it. Everything is length capped and nothing else on the payload is
 * read: there is no rate limiting in M0 (PRD 3.2, accepted risk), so the size
 * of a single write is the only thing bounded here.
 */
function readContactPayload(
  payload: Record<string, unknown>
): { name: string; handles: Record<string, string>; note: string } | null {
  const name = trimmed(payload.name, 120);
  if (!name) return null;

  const instagram = trimmed(payload.instagram, 120);
  const linkedin = trimmed(payload.linkedin, 300);
  const phone = trimmed(payload.phone, 40);
  const email = trimmed(payload.email, 200);

  return {
    name,
    handles: {
      ...(instagram && { instagram }),
      ...(linkedin && { linkedin }),
      ...(phone && { phone }),
      ...(email && { email }),
    },
    note: trimmed(payload.note, 1000),
  };
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

    const { eventId, scope, subjectId, ownerUid } = token.data;
    const now = new Date().toISOString();

    // A card link has no event behind it, so it takes exactly one action and
    // every event-scoped write below would have nothing to write to. Handled
    // here, before an event reference is built from an empty id.
    if (scope === "card") {
      if (action !== "leave_contact") {
        res.status(403).json({ error: "not_permitted" });
        return;
      }
      const details = readContactPayload(payload);
      if (!details) {
        res.status(400).json({ error: "bad_payload" });
        return;
      }
      // Attributed to the host's soonest event, which is where the card is
      // being handed out. Null when nothing is confirmed, and the capture
      // still stands on its own.
      const next = await soonestUpcoming(ownerUid);
      await db.collection(CONTACTS).add({
        ownerUid,
        name: details.name,
        handles: details.handles,
        eventId: next?.id ?? null,
        note: details.note,
        // Written out rather than left off: the Admin SDK bypasses the
        // client normalizers, so a field missing here is missing forever.
        quote: "",
        voiceNote: null,
        followUp: { due: dueInTwoDays(), done: false },
        personId: null,
        capturedAt: now,
        capturedBy: "card",
      });

      const cardView = await buildView(token);
      await touch(token.id);
      res.set("Cache-Control", "no-store");
      res.status(200).json(cardView);
      return;
    }

    // The mirror of the guard above: an event link never leaves a contact.
    if (action === "leave_contact") {
      res.status(403).json({ error: "not_permitted" });
      return;
    }

    const eventRef = db.collection(EVENTS).doc(eventId);

    // Crew links carry tasks and the schedule, no terms, dates or agreements,
    // so the party-only actions are refused rather than silently ignored.
    const partyOnly: GuestAction[] = [
      "respond_dates",
      "confirm_role",
      "add_note",
      "update_deliverable",
    ];
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

    if (action === "update_deliverable") {
      const deliverableId = payload.deliverableId;
      if (typeof deliverableId !== "string" || typeof payload.done !== "boolean") {
        res.status(400).json({ error: "bad_payload" });
        return;
      }
      const partyRef = eventRef.collection("parties").doc(subjectId);
      const partySnap = await partyRef.get();
      const current = (partySnap.data()?.deliverables ?? []) as any[];
      // Their own list, and only the half they owe. What the host brings is
      // the host's to tick off, and is read-only on the guest page.
      const target = current.find((d) => d.id === deliverableId);
      if (!target || target.direction === "host") {
        res.status(403).json({ error: "not_permitted" });
        return;
      }
      // The whole array goes back, never a dotted path into an index: those
      // depend on the order the host last left the list in.
      await partyRef.update({
        deliverables: current.map((d) =>
          d.id === deliverableId ? { ...d, done: payload.done } : d
        ),
      });
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
