import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  GUEST_ACTIONS,
  type BookingKindTemplate,
  type BookingSlot,
  type BookingView,
  type BookingWindow,
  type GuestAction,
  type GuestScope,
  type HuddleView,
  type GuestPayload,
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
const AVAILABILITY_SETTINGS = "hp_availabilitySettings";
const FRIEND_LINKS = "hp_friendLinks";
const BOOKINGS = "hp_bookings";
const HUDDLES = "hp_huddles";

interface TokenDoc {
  /** Null for booking tokens, which belong to a host rather than an event. */
  eventId: string | null;
  scope: "party" | "crew" | "recap" | "booking" | "huddle";
  subjectId: string;
  revoked: boolean;
  ownerUid: string;
  /** Null means never. A lapsed link is refused exactly like a revoked one. */
  expiresAt: string | null;
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
  // Expiry and revocation are the same answer to the caller on purpose: a link
  // that says "this expired" tells a stranger the link was once real.
  if (data.expiresAt && Date.parse(data.expiresAt) < Date.now()) throw new InvalidToken();
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
  // Booking tokens carry no event and are served by buildBookingView. Reaching
  // here with one means the caller routed wrong, so refuse rather than guess.
  if (!eventId || scope === "booking" || scope === "huddle") throw new InvalidToken();

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
    scope: scope as GuestScope,
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

/**
 * F18. The host derives her openings in the browser and publishes only those,
 * so this is a filter rather than a second copy of the derivation rules. It
 * never reads a calendar, because none was ever stored.
 */
async function buildBookingView(token: { id: string; data: TokenDoc }): Promise<BookingView> {
  const { subjectId, ownerUid } = token.data;
  const [linkSnap, settingsSnap] = await Promise.all([
    db.collection(FRIEND_LINKS).doc(subjectId).get(),
    db.collection(AVAILABILITY_SETTINGS).doc(ownerUid).get(),
  ]);
  if (!linkSnap.exists || !settingsSnap.exists) throw new InvalidToken();

  const link = linkSnap.data() as { name: string; horizonDays: number; ownerUid: string };
  // A token whose link belongs to someone else is a broken invariant, not a
  // recoverable state. Refuse rather than serve one host's times under
  // another's token.
  if (link.ownerUid !== ownerUid) throw new InvalidToken();

  const settings = settingsSnap.data() ?? {};
  const published = ((settings.windows ?? []) as { s: number; e: number }[]);
  const kinds = ((settings.kinds ?? []) as BookingKindTemplate[]);

  const bookedSnap = await db
    .collection(BOOKINGS)
    .where("ownerUid", "==", ownerUid)
    .where("status", "==", "booked")
    .get();
  const booked = bookedSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const taken = booked
    .map((b) => ({
      start: new Date(b.startsAt).getTime(),
      end: new Date(b.endsAt).getTime(),
    }))
    .sort((a, b) => a.start - b.start);

  const from = Date.now();
  const to = from + link.horizonDays * 86400000;
  // Bookings are cut out here rather than at publish time, because they change
  // far more often than the calendar does and one friend's choice should not
  // rewrite the document every other friend reads.
  const windows: BookingWindow[] = [];
  const MIN_MS = 15 * 60000;
  for (const w of published) {
    const start = Math.max(w.s, from);
    const end = Math.min(w.e, to);
    if (end <= start) continue;
    let cursor = start;
    for (const t of taken) {
      if (t.end <= cursor) continue;
      if (t.start >= end) break;
      if (t.start > cursor && t.start - cursor >= MIN_MS) windows.push({ s: cursor, e: Math.min(t.start, end) });
      cursor = Math.max(cursor, t.end);
      if (cursor >= end) break;
    }
    if (end - cursor >= MIN_MS) windows.push({ s: cursor, e: end });
  }

  return {
    scope: "booking",
    hostName: "your host",
    friendName: link.name,
    hostZone: (settings.timeZone as string) ?? "UTC",
    kinds,
    windows,
    mine: booked
      .filter((b) => b.friendLinkId === subjectId)
      .map((b) => ({
        id: b.id,
        kind: b.kind,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        durationMinutes: b.durationMinutes ?? 60,
      })),
  };
}

/**
 * A huddle, as everyone on the link sees it.
 *
 * Every participant's free time goes to every participant, which is the deal a
 * huddle makes: you see when the others are free, never what they are doing.
 * Ranking happens in the browser from exactly this data, so there is no second
 * copy of the suggestion algorithm here to drift from the one in src/lib.
 */
async function buildHuddleView(
  token: { id: string; data: TokenDoc },
  you: string | null,
): Promise<HuddleView> {
  const snap = await db.collection(HUDDLES).doc(token.data.subjectId).get();
  if (!snap.exists) throw new InvalidToken();
  const huddle = snap.data() as any;
  if (huddle.ownerUid !== token.data.ownerUid) throw new InvalidToken();

  return {
    scope: "huddle",
    huddleId: snap.id,
    title: huddle.title ?? "",
    durationMinutes: huddle.durationMinutes ?? 60,
    horizonDays: huddle.horizonDays ?? 30,
    weekdays: huddle.weekdays ?? [],
    participants: ((huddle.participants ?? []) as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      free: p.free ?? [],
    })),
    votes: huddle.votes ?? {},
    settledStartsAt: huddle.settledStartsAt ?? null,
    expiresAt: huddle.expiresAt ?? null,
    you,
  };
}

/** Huddle writes. Joining replaces rather than duplicates; one vote each. */
async function handleHuddleSubmit(
  token: { id: string; data: TokenDoc },
  action: GuestAction,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const ref = db.collection(HUDDLES).doc(token.data.subjectId);
  const snap = await ref.get();
  if (!snap.exists) throw new InvalidToken();
  const huddle = snap.data() as any;

  let you = typeof payload.you === "string" ? payload.you.slice(0, 60) : null;
  const participants: any[] = huddle.participants ?? [];

  if (action === "join_huddle") {
    const name = payloadString(payload, "name", 80).trim();
    if (!name) return you;
    // Bounded: an unchecked list is a way to write a megabyte into someone
    // else's document, and no real calendar has a thousand free stretches in
    // a month.
    const free = (Array.isArray(payload.free) ? payload.free : [])
      .filter(
        (w: any) => typeof w?.s === "number" && typeof w?.e === "number" && w.e > w.s
      )
      .slice(0, 500)
      .map((w: any) => ({ s: w.s, e: w.e }));

    const existing = you ? participants.find((p) => p.id === you) : null;
    if (existing) {
      // Rejoining updates: someone re-reading their calendar after moving a
      // meeting should replace their answer, not appear twice.
      existing.name = name;
      existing.free = free;
    } else {
      you = `hp-${Date.now().toString(36)}${participants.length}`;
      participants.push({ id: you, name, free, joinedAt: new Date().toISOString() });
    }
    await ref.update({ participants });
    return you;
  }

  if (action === "cast_vote" && you) {
    const key = payloadString(payload, "slot", 20);
    if (!/^\d+$/.test(key)) return you;
    const votes: Record<string, string[]> = huddle.votes ?? {};
    // One vote each, moved rather than accumulated: a tally where somebody
    // voted for everything is not a tally.
    for (const ids of Object.values(votes)) {
      const at = ids.indexOf(you);
      if (at >= 0) ids.splice(at, 1);
    }
    votes[key] = [...(votes[key] ?? []), you];
    await ref.update({ votes });
  }

  return you;
}

function payloadString(payload: Record<string, unknown>, key: string, max: number): string {
  const value = payload[key];
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Booking writes. Kept apart from the event actions, which share no state. */
async function handleBookingSubmit(
  token: { id: string; data: TokenDoc },
  action: GuestAction,
  payload: Record<string, unknown>,
): Promise<void> {
  const { subjectId, ownerUid } = token.data;

  if (action === "book_slot") {
    const startsAt = payloadString(payload, "startsAt", 40);
    const kind = payloadString(payload, "kind", 10) as BookingSlot["kind"];
    const durationMinutes = Number(payload.durationMinutes ?? 0);
    const start = new Date(startsAt).getTime();
    // Bounded rather than merely positive: an unchecked duration is a way to
    // write an event stretching to the end of time onto someone's calendar.
    if (!Number.isFinite(start) || !Number.isFinite(durationMinutes)) return;
    if (durationMinutes <= 0 || durationMinutes > 480) return;

    // Re-derive from the published windows instead of trusting the posted
    // time, and recompute the end rather than accepting one. This is the only
    // place in the feature where two people can race for the same state.
    const view = await buildBookingView(token);
    const end = start + durationMinutes * 60000;
    const fits = view.windows.some((w) => start >= w.s && end <= w.e);
    if (!fits) return;

    await db.collection(BOOKINGS).add({
      ownerUid,
      friendLinkId: subjectId,
      friendName: payloadString(payload, "friendName", 120) || view.friendName,
      kind,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
      durationMinutes,
      contact: payloadString(payload, "contact", 200),
      note: payloadString(payload, "note", 1000),
      status: "booked",
      createdAt: new Date().toISOString(),
    });
    return;
  }

  if (action === "cancel_booking") {
    const bookingId = payloadString(payload, "bookingId", 80);
    if (!bookingId) return;
    const ref = db.collection(BOOKINGS).doc(bookingId);
    const snap = await ref.get();
    // Scoped by hand: a friend may only cancel what their own link booked.
    if (snap.exists && snap.data()?.friendLinkId === subjectId) {
      await ref.update({ status: "cancelled" });
    }
  }
}

export const hpGuestView = onRequest({ invoker: "public" }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  try {
    const token = await loadToken(req.query.t);
    const you = typeof req.query.you === "string" ? req.query.you.slice(0, 60) : null;
    const view: GuestPayload =
      token.data.scope === "booking"
        ? await buildBookingView(token)
        : token.data.scope === "huddle"
          ? await buildHuddleView(token, you)
          : await buildView(token);
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

    // Booking links share the endpoint and nothing else: no event, no party,
    // and none of the four event actions.
    if (scope === "booking") {
      if (action !== "book_slot" && action !== "cancel_booking") {
        res.status(403).json({ error: "not_permitted" });
        return;
      }
      await handleBookingSubmit(token, action, payload);
      const view = await buildBookingView(token);
      await touch(token.id);
      res.set("Cache-Control", "no-store");
      res.status(200).json(view);
      return;
    }

    if (scope === "huddle") {
      if (action !== "join_huddle" && action !== "cast_vote") {
        res.status(403).json({ error: "not_permitted" });
        return;
      }
      const you = await handleHuddleSubmit(token, action, payload);
      const view = await buildHuddleView(token, you);
      await touch(token.id);
      res.set("Cache-Control", "no-store");
      res.status(200).json(view);
      return;
    }

    const huddleOnly: GuestAction[] = ["join_huddle", "cast_vote"];
    if (huddleOnly.includes(action)) {
      res.status(403).json({ error: "not_permitted" });
      return;
    }

    const bookingOnly: GuestAction[] = ["book_slot", "cancel_booking"];
    if (bookingOnly.includes(action)) {
      res.status(403).json({ error: "not_permitted" });
      return;
    }

    if (!eventId) throw new InvalidToken();
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

      // A partner who connected their calendar sends the same answers with a
      // different provenance. Only these two values are accepted, so the field
      // cannot be set to anything the matrix does not know how to render.
      const source = payload.source === "calendar" ? "calendar" : "link";

      const update: Record<string, unknown> = {};
      for (const [optionId, value] of Object.entries(responses)) {
        // Only real options, only real answers. Everything else is dropped.
        if (!optionIds.includes(optionId)) continue;
        if (value !== "yes" && value !== "no" && value !== "maybe") continue;
        update[`dateResponses.${optionId}`] = { value, source, note: "", at: now };
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
