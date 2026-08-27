import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { BackLink, FocusColumn } from '../pages/Page'
import { useAsync, useMutation } from '../useApi'
import {
  Button, Card, Chip, Divider, ErrorState, Eyebrow, GhostButton, KV, Loading, PageTitle,
  QuietButton, Sub,
} from '../../ui/primitives'
import { Field, Input, Label, Select } from '../../ui/form'
import { venueParty } from './siteChecks'
import { formatDayOnly } from '../../lib/dates'
import { track } from '../../lib/analytics'
import type {
  EventDoc, EventRecap, Org, Outcome, Party, Person, SpendEntry,
} from '../../data/types'

// The ten minute input that generates every party's recap: headcount,
// remembered attendees, and outcomes per party against their goal.
//
// Attendance is corroborated, never gated. Host headcount is the baseline,
// captures at the event count as verified presence, and remembered names top
// it up. There is no check-in of any kind, and there never will be.
//
// M1 adds the sponsor ROI layer: what the event cost in money and in kind,
// where the people came from, and each party's spend echoed beside their goal.
// All of it is host side. Spend never reaches a guest page or a recap link.

let rowSeq = 0
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(rowSeq += 1)}`

/** Whole dollars. Nobody records cents for a coffee cart. */
function money(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`
}

const KIND_LABEL: Record<SpendEntry['kind'], string> = { cash: 'cash', inkind: 'in-kind' }

export default function RecapEditorPage() {
  const { eventId = '' } = useParams()

  const { data, error, loading, reload } = useAsync(
    async (api) => {
      const bundle = await api.getEventBundle(eventId)
      if (!bundle) return null
      const contacts = await api.listContacts()
      // Registrations join on the event's slug, so an event created in the
      // workspace has nothing to look up and does not pay for the read.
      const people = bundle.event.sourceKey ? await api.listPeople() : []
      return { bundle, verified: contacts.filter((c) => c.eventId === eventId).length, people }
    },
    [eventId],
  )

  if (loading) return <FocusColumn><Loading label="Loading the recap" /></FocusColumn>
  if (error || !data) {
    return (
      <FocusColumn>
        <ErrorState message={`The recap didn't load (${error ?? 'unknown'}).`} onRetry={reload} />
      </FocusColumn>
    )
  }

  return (
    <FocusColumn width="max-w-[480px]">
      <BackLink to={`/app/events/${eventId}`}>{data.bundle.event.title}</BackLink>
      <RecapForm
        key={data.bundle.event.id}
        event={data.bundle.event}
        verified={data.verified}
        people={data.people}
        parties={data.bundle.parties}
        orgs={data.bundle.orgs}
        onSaved={reload}
      />
    </FocusColumn>
  )
}

function RecapForm({
  event,
  verified,
  people,
  parties,
  orgs,
  onSaved,
}: {
  event: EventDoc
  verified: number
  people: Person[]
  parties: Party[]
  orgs: Org[]
  onSaved: () => void
}) {
  const eventId = event.id
  const initial: EventRecap = event.recap
  const signups = event.signupCount

  const [headcount, setHeadcount] = useState(initial.headcount?.toString() ?? '')
  const [remembered, setRemembered] = useState<string[]>(initial.remembered)
  const [nameDraft, setNameDraft] = useState('')
  const [photosLink, setPhotosLink] = useState(initial.photosLink)
  const [postsRan, setPostsRan] = useState(initial.postsRan)
  const [signupDraft, setSignupDraft] = useState(signups?.toString() ?? '')
  const { mutate, busy, error } = useMutation(onSaved)

  const spendLog = event.spendLog ?? []
  const venue = venueParty(parties, orgs)

  const addName = () => {
    const name = nameDraft.trim()
    if (!name || remembered.includes(name)) return
    setRemembered((prev) => [...prev, name])
    setNameDraft('')
  }

  const recap = (): EventRecap => ({
    headcount: headcount ? Number(headcount) : null,
    remembered,
    photosLink: photosLink.trim(),
    postsRan: postsRan.trim(),
    generatedAt: initial.generatedAt,
  })

  const save = () =>
    void mutate(async (api) => {
      await api.saveRecap(eventId, recap())
      await api.updateEvent(eventId, { signupCount: signupDraft ? Number(signupDraft) : null })
    })

  const generate = () =>
    void mutate(async (api) => {
      await api.saveRecap(eventId, recap())
      await api.updateEvent(eventId, { signupCount: signupDraft ? Number(signupDraft) : null })
      await api.generateRecaps(eventId)
    })

  return (
    <>
      <PageTitle className="text-lg">Recap, {event.title}</PageTitle>
      <Sub className="mb-3">
        {signups !== null ? `Signups ${signups} pulled in. ` : ''}
        Captures at the event: {verified} verified.
      </Sub>

      <Card className="mb-3">
        <div className="grid gap-x-[10px] sm:grid-cols-2">
          <Field label="Signups" htmlFor="recap-signups">
            <Input
              id="recap-signups"
              type="number"
              inputMode="numeric"
              value={signupDraft}
              onChange={(e) => setSignupDraft(e.target.value)}
              placeholder="From the listing"
            />
          </Field>
          <Field label="Attended, your count" htmlFor="recap-headcount">
            <Input
              id="recap-headcount"
              type="number"
              inputMode="numeric"
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
              placeholder="Your best count"
            />
          </Field>
        </div>

        <Label>Attendees you remember</Label>
        <div className="mb-[6px] flex flex-wrap gap-[6px]">
          {remembered.map((name) => (
            <Chip key={name} tone="gray">
              {name}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => setRemembered((prev) => prev.filter((n) => n !== name))}
              >
                <X size={10} />
              </button>
            </Chip>
          ))}
        </div>
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addName()}
          placeholder="Type a name and press enter"
          aria-label="Remembered attendee"
        />
        <p className="mt-1 text-[11px] text-mut">
          Nothing here gates anyone. Import signups on the overview tab to see sources below.
        </p>
      </Card>

      <SpendCard
        eventId={eventId}
        initial={spendLog}
        parties={parties}
        orgs={orgs}
        onSaved={onSaved}
      />

      <ShowRate eventId={eventId} sourceKey={event.sourceKey} people={people} />

      {parties.map((party) => (
        <PartyOutcomes
          key={party.id}
          party={party}
          orgName={orgs.find((o) => o.id === party.orgId)?.name ?? 'Partner'}
          spend={spendLog.filter((entry) => entry.partyId === party.id)}
          eventId={eventId}
          onSaved={onSaved}
        />
      ))}

      {venue && <SiteLessons eventId={eventId} org={venue.org} onSaved={onSaved} />}

      <Card className="mb-3">
        <Field label="Photos link" htmlFor="recap-photos">
          <Input
            id="recap-photos"
            value={photosLink}
            onChange={(e) => setPhotosLink(e.target.value)}
            placeholder="Album URL"
          />
        </Field>
        <Field label="Posts that ran" htmlFor="recap-posts">
          <Input
            id="recap-posts"
            value={postsRan}
            onChange={(e) => setPostsRan(e.target.value)}
            placeholder="Six across both accounts"
          />
        </Field>
      </Card>

      {error && <p className="mb-2 text-[12px] text-rosek">Saving didn't work ({error}).</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={generate} disabled={busy}>
          {busy ? 'Working' : 'Generate recaps'}
        </Button>
        <GhostButton onClick={save} disabled={busy}>
          Save without sharing
        </GhostButton>
        <span className="text-[13px] text-sec">One page per party, shared by link.</span>
      </div>

      {initial.generatedAt && (
        <p className="mt-2 text-[11px] text-mut">
          Recap links were generated. Copy them from the parties tab.
        </p>
      )}
    </>
  )
}

// M1 spend log. Amounts are held as strings while they are being typed and
// parsed on commit, so a half-typed number never becomes a zero.

interface SpendDraft {
  id: string
  label: string
  amount: string
  kind: SpendEntry['kind']
  /** Empty string means the cost is the host's own, attributed to nobody. */
  partyId: string
}

function toDrafts(entries: SpendEntry[]): SpendDraft[] {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    amount: entry.amount ? String(entry.amount) : '',
    kind: entry.kind,
    partyId: entry.partyId ?? '',
  }))
}

function toEntries(drafts: SpendDraft[]): SpendEntry[] {
  return drafts.map((draft) => ({
    id: draft.id,
    label: draft.label.trim(),
    amount: Math.max(0, Math.round(Number(draft.amount) || 0)),
    kind: draft.kind,
    partyId: draft.partyId || null,
  }))
}

function SpendCard({
  eventId,
  initial,
  parties,
  orgs,
  onSaved,
}: {
  eventId: string
  initial: SpendEntry[]
  parties: Party[]
  orgs: Org[]
  onSaved: () => void
}) {
  const [rows, setRows] = useState<SpendDraft[]>(() => toDrafts(initial))
  const { mutate } = useMutation(onSaved)

  const commit = (next: SpendDraft[]) => {
    setRows(next)
    void mutate((api) => api.updateEvent(eventId, { spendLog: toEntries(next) }))
  }

  const set = (id: string, change: Partial<SpendDraft>) =>
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...change } : row)))

  const add = () => {
    const row: SpendDraft = { id: nextId('sp'), label: '', amount: '', kind: 'cash', partyId: '' }
    commit([...rows, row])
    track('hp_spend_entry_added', { eventId, kind: row.kind })
  }

  const entries = toEntries(rows)
  const total = (kind: SpendEntry['kind']) =>
    entries.filter((e) => e.kind === kind).reduce((sum, e) => sum + e.amount, 0)

  return (
    <Card className="mb-3">
      <Eyebrow className="mb-[6px]">Spend</Eyebrow>

      {rows.map((row) => (
        <div key={row.id} className="mb-[10px] border-t border-hair pt-[10px]">
          <div className="mb-1 flex gap-1">
            <Input
              value={row.label}
              onChange={(e) => set(row.id, { label: e.target.value })}
              onBlur={() => commit(rows)}
              placeholder="What it was"
              aria-label="What the spend was for"
              className="!text-xs"
            />
            <button
              type="button"
              aria-label="Remove spend row"
              onClick={() => commit(rows.filter((r) => r.id !== row.id))}
              className="shrink-0 text-mut transition hover:text-rosek"
            >
              <X size={13} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            <Input
              type="number"
              inputMode="numeric"
              value={row.amount}
              onChange={(e) => set(row.id, { amount: e.target.value })}
              onBlur={() => commit(rows)}
              placeholder="Dollars"
              aria-label="Amount in dollars"
              className="!w-[100px] !text-xs"
            />
            <Select
              value={row.kind}
              onChange={(e) => commit(
                rows.map((r) =>
                  r.id === row.id ? { ...r, kind: e.target.value as SpendEntry['kind'] } : r,
                ),
              )}
              aria-label="Cash or in-kind"
              className="!w-auto !text-xs"
            >
              <option value="cash">Cash</option>
              <option value="inkind">In-kind</option>
            </Select>
            <Select
              value={row.partyId}
              onChange={(e) => commit(
                rows.map((r) => (r.id === row.id ? { ...r, partyId: e.target.value } : r)),
              )}
              aria-label="Which partner this sits with"
              className="!w-auto flex-1 !text-xs"
            >
              <option value="">Yours, no partner</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {orgs.find((o) => o.id === party.orgId)?.name ?? 'Partner'}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ))}

      <QuietButton onClick={add}>
        <Plus size={11} />
        Add a line
      </QuietButton>

      {entries.length > 0 && (
        <p className="mt-2 text-[12.5px] text-sec">
          Cash {money(total('cash'))}. In-kind {money(total('inkind'))}.
        </p>
      )}
      <Sub className="mt-1 !text-[11px] !text-mut">
        Private to you. Recap pages never show spend.
      </Sub>
    </Card>
  )
}

// M1 sponsor ROI, the honest half: where the people came from, counted from
// the guest exports already imported. No estimate is presented as a
// measurement, and when there is nothing measured the priors say so.

interface SourceRow {
  source: string
  approved: number
  checkedIn: number
  /** Everyone on the list from this source, signed up or not. */
  total: number
}

export interface ShowRateSummary {
  rows: SourceRow[]
  /** True once any registration for this event carries a check-in time. */
  anyCheckIn: boolean
  approved: number
}

/** Registrations for one event, grouped by the source they arrived through. */
export function showRateBySource(people: Person[], eventKey: string): ShowRateSummary {
  const bySource = new Map<string, SourceRow>()
  let anyCheckIn = false
  let approved = 0

  for (const person of people) {
    for (const registration of person.registrations ?? []) {
      if (registration.eventKey !== eventKey) continue
      const source = registration.source?.trim() || 'direct'
      const row = bySource.get(source) ?? { source, approved: 0, checkedIn: 0, total: 0 }
      row.total += 1
      if (registration.status === 'approved') {
        row.approved += 1
        approved += 1
      }
      if (registration.checkedInAt) {
        row.checkedIn += 1
        anyCheckIn = true
      }
      bySource.set(source, row)
    }
  }

  const rows = [...bySource.values()].sort(
    (a, b) => b.approved - a.approved || a.source.localeCompare(b.source),
  )
  return { rows, anyCheckIn, approved }
}

function ShowRate({
  eventId,
  sourceKey,
  people,
}: {
  eventId: string
  sourceKey: string | null
  people: Person[]
}) {
  const summary = sourceKey ? showRateBySource(people, sourceKey) : null
  const rendered = Boolean(summary && summary.rows.length > 0)

  // Once per visit to the editor, and only when there was something to read.
  const counted = useRef(false)
  useEffect(() => {
    if (rendered && !counted.current) {
      counted.current = true
      track('hp_roi_viewed', { eventId })
    }
  }, [rendered, eventId])

  if (!summary || !rendered) return null

  return (
    <Card className="mb-3">
      <Eyebrow className="mb-[6px]">Where people came from</Eyebrow>
      {summary.rows.map((row) => (
        <KV key={row.source} label={row.source === 'direct' ? 'Direct' : row.source}>
          {row.approved === 0 ? (
            `None signed up, ${row.total} on the list`
          ) : (
            <>
              {row.approved} signed up
              {summary.anyCheckIn && (
                <>
                  , {row.checkedIn} came, {Math.round((row.checkedIn / row.approved) * 100)} percent
                </>
              )}
            </>
          )}
        </KV>
      ))}
      {!summary.anyCheckIn && summary.approved > 0 && (
        <p className="mt-2 text-[11.5px] text-mut">
          Typical show rates: about 62 percent from your own reach, 27 from partner reach, 20
          from featured listings.
        </p>
      )}
    </Card>
  )
}

function PartyOutcomes({
  party,
  orgName,
  spend,
  eventId,
  onSaved,
}: {
  party: Party
  orgName: string
  spend: SpendEntry[]
  eventId: string
  onSaved: () => void
}) {
  const [outcomes, setOutcomes] = useState<Outcome[]>(party.outcomes)
  const { mutate } = useMutation(onSaved)

  const commit = (next: Outcome[]) => {
    setOutcomes(next)
    void mutate((api) => api.updateParty(eventId, party.id, { outcomes: next }))
  }

  const set = (id: string, key: 'label' | 'value', value: string) =>
    setOutcomes((prev) => prev.map((o) => (o.id === id ? { ...o, [key]: value } : o)))

  const attributed = spend.reduce((sum, entry) => sum + entry.amount, 0)

  return (
    <Card className="mb-3">
      <Eyebrow className="mb-[6px]">{orgName}</Eyebrow>
      {party.goal && <p className="mb-[10px] text-[12.5px] text-sec">Goal: {party.goal}</p>}

      <div className="grid gap-x-[10px] sm:grid-cols-2">
        {outcomes.map((outcome) => (
          <div key={outcome.id} className="mb-[10px]">
            <Input
              value={outcome.label}
              onChange={(e) => set(outcome.id, 'label', e.target.value)}
              onBlur={() => commit(outcomes)}
              placeholder="What you measured"
              aria-label="Outcome name"
              className="mb-1 !text-xs"
            />
            <div className="flex gap-1">
              <Input
                value={outcome.value}
                onChange={(e) => set(outcome.id, 'value', e.target.value)}
                onBlur={() => commit(outcomes)}
                placeholder="How it went"
                aria-label="Outcome value"
              />
              <button
                type="button"
                aria-label="Remove outcome"
                onClick={() => commit(outcomes.filter((o) => o.id !== outcome.id))}
                className="shrink-0 text-mut transition hover:text-rosek"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {outcomes.length < 3 && (
        <QuietButton onClick={() => commit([...outcomes, { id: nextId('oc'), label: '', value: '' }])}>
          <Plus size={11} />
          Add an outcome
        </QuietButton>
      )}

      {spend.length > 0 && (
        <>
          <Divider />
          <Eyebrow className="mb-[5px]">Spend</Eyebrow>
          {spend.map((entry) => (
            <KV key={entry.id} label={entry.label || 'Unnamed line'}>
              {money(entry.amount)}, {KIND_LABEL[entry.kind]}
            </KV>
          ))}
          <p className="mt-1 text-[12.5px] text-sec">Total {money(attributed)}.</p>
        </>
      )}
    </Card>
  )
}

/**
 * M1 lessons loop. What the day taught about the place, written onto the venue
 * rather than onto this event, so the next run here starts with it.
 */
function SiteLessons({
  eventId,
  org,
  onSaved,
}: {
  eventId: string
  org: Org
  onSaved: () => void
}) {
  const [draft, setDraft] = useState('')
  const { mutate } = useMutation(onSaved)

  const profile = org.siteProfile ?? {
    lessons: [],
    permitThresholds: { amplifiedSound: false, headcountAbove: null },
    notes: '',
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    const lesson = { id: nextId('sl'), text, eventId, at: new Date().toISOString() }
    void mutate((api) =>
      api.updateOrg(org.id, {
        siteProfile: { ...profile, lessons: [...profile.lessons, lesson] },
      }),
    )
    track('hp_site_lesson_added', { eventId })
    setDraft('')
  }

  return (
    <Card className="mb-3">
      <Eyebrow className="mb-[6px]">Site lessons, {org.name}</Eyebrow>

      {profile.lessons.map((lesson) => (
        <KV key={lesson.id} label={formatDayOnly(lesson.at)}>
          {lesson.text}
        </KV>
      ))}

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="What you would tell yourself before the next one here"
          aria-label="New site lesson"
          className="!w-auto min-w-[180px] flex-1 !text-xs"
        />
        <QuietButton onClick={add}>
          <Plus size={11} />
          Add
        </QuietButton>
      </div>

      <Sub className="mt-1 !text-[11px] !text-mut">
        Kept on the site, not on this event. It comes back the next time you plan here.
      </Sub>
    </Card>
  )
}
