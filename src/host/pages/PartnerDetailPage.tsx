import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil, Plus, X } from 'lucide-react'
import { BackLink, Page } from './Page'
import { useAsync, useMutation } from '../useApi'
import {
  Avatar, Button, Card, Chip, Divider, ErrorState, Eyebrow, GhostButton, KV, Loading,
  OutlineButton, PageTitle, QuietButton, Sub,
} from '../../ui/primitives'
import { Input, InlineText, Select } from '../../ui/form'
import { initials, orgTypeLabel, profileFields } from '../../data/profiles'
import {
  PATTERN_MIN_NO, patternSummary, weekdayPatterns, type WeekdayPattern,
} from '../../data/standing'
import type { EventDoc, Org, SiteProfile, StandingNote } from '../../data/types'
import { formatDayOnly, formatShort } from '../../lib/dates'

// Detail view carries the two provenance fields from discovery: via, and
// relationship terms. Both are private to the host and never reach a guest
// page, which is what the "only you see this" chip is promising.
//
// M1 adds the site profile on a venue: the lessons this place has taught,
// its permit thresholds, and the standing notes. All host side, all editable
// here, because the lessons arrive at a recap and get read while planning.
//
// M1 also adds standing availability, on every partner rather than only a
// venue: the weekday pattern their answers already add up to, and the notes
// the host writes about weeks they are away. The dates tab warns from the
// same two sources, through `src/data/standing.ts`.

interface History {
  event: EventDoc
  note: string
}

const BLANK_PROFILE: SiteProfile = {
  lessons: [],
  permitThresholds: { amplifiedSound: false, headcountAbove: null },
  notes: '',
}

let noteSeq = 0
const nextNoteId = () => `st-${Date.now().toString(36)}-${(noteSeq += 1)}`

export default function PartnerDetailPage() {
  const { orgId = '' } = useParams()

  const { data, error, loading, reload } = useAsync(
    async (api) => {
      const org = await api.getOrg(orgId)
      const blank = {
        org: null,
        history: [] as History[],
        eventTitles: {} as Record<string, string>,
        patterns: [] as WeekdayPattern[],
      }
      if (!org) return blank

      // Parties rather than bundles: this page reads one party per event and a
      // bundle each would also pull tasks, run of show, crew and the whole
      // directory for every event the host has.
      const [events, parties] = await Promise.all([api.listEvents(), api.listPartyHistory()])
      // A site lesson can name an event this partner had no part in, so the
      // titles come from the whole list rather than from the history below.
      const eventTitles: Record<string, string> = {}
      for (const event of events) eventTitles[event.id] = event.title

      const byEvent = new Map(parties.map((row) => [row.eventId, row.parties]))
      const history: History[] = []
      for (const event of events) {
        const party = (byEvent.get(event.id) ?? []).find((p) => p.orgId === orgId)
        if (!party) continue
        const outcome = party.outcomes[0]
        const status = event.status === 'wrapped' ? 'Wrapped' : 'Planning'
        history.push({
          event,
          note: outcome ? `${status}, ${outcome.label.toLowerCase()} ${outcome.value}` : status,
        })
      }

      return {
        org,
        history,
        eventTitles,
        patterns: weekdayPatterns(events, parties).get(orgId) ?? [],
      }
    },
    [orgId],
  )

  if (loading) return <Page><Loading label="Loading partner" /></Page>
  if (error) return <Page><ErrorState message={`Partner didn't load (${error}).`} onRetry={reload} /></Page>
  if (!data?.org) {
    return (
      <Page>
        <BackLink to="/app/partners">Partners</BackLink>
        <ErrorState message="This partner is no longer in the directory." />
      </Page>
    )
  }

  const org = data.org
  const fields = profileFields(org.type)
  const hasRelationship = Boolean(org.via || org.relationshipTerms || org.notes)

  return (
    <Page>
      <BackLink to="/app/partners">Partners</BackLink>

      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[10px]">
          <Avatar name={org.name} initials={initials(org.name)} size={38} />
          <div className="min-w-0">
            <PageTitle className="text-lg">{org.name}</PageTitle>
            {org.description && <Sub>{org.description}</Sub>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone="vio">{orgTypeLabel(org.type)}</Chip>
          <Link to={`/app/partners/${org.id}/edit`}>
            <OutlineButton>
              <Pencil size={13} />
              Edit
            </OutlineButton>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <Eyebrow className="mb-[5px]">Contacts</Eyebrow>
          {org.contacts.length === 0 && <p className="text-[12.5px] text-mut">No contacts saved.</p>}
          {org.contacts.map((contact, i) => (
            <KV key={i} label={contact.name}>
              {[contact.role, contact.email, contact.phone, contact.instagram, contact.linkedin]
                .filter(Boolean)
                .join(', ')}
            </KV>
          ))}

          {fields.length > 0 && (
            <>
              <Divider />
              <Eyebrow className="mb-[5px]">{orgTypeLabel(org.type)} details</Eyebrow>
              {fields.map((field) => (
                <KV key={field.key} label={field.label}>
                  {org.profile[field.key] || <span className="text-mut">Not set</span>}
                </KV>
              ))}
            </>
          )}

          {org.customFields.length > 0 && (
            <>
              <Divider />
              {org.customFields.map((field, i) => (
                <KV key={i} label={field.label}>
                  {field.value}
                </KV>
              ))}
            </>
          )}

          <Divider />
          <Eyebrow className="mb-[5px]">Event history</Eyebrow>
          {data.history.length === 0 && (
            <p className="text-[12.5px] text-mut">No events together yet.</p>
          )}
          {data.history.map(({ event, note }) => (
            <KV key={event.id} label={<Link className="text-vio" to={`/app/events/${event.id}`}>{event.title}</Link>}>
              {note}
              {event.confirmedDateOptionId && (
                <span className="text-mut">
                  {', '}
                  {formatShort(
                    event.dateOptions.find((o) => o.id === event.confirmedDateOptionId)?.startsAt ?? '',
                  )}
                </span>
              )}
            </KV>
          ))}
        </Card>

        {/* The right column stacks, so the site profile sits under the
            relationship card rather than under the long left one. */}
        <div className="grid gap-3 self-start">
          <Card>
            <div className="mb-[5px] flex items-center justify-between gap-2">
              <Eyebrow>Relationship</Eyebrow>
              <Chip tone="gray">Only you see this</Chip>
            </div>
            {!hasRelationship && (
              <p className="text-[12.5px] text-mut">
                Nothing recorded yet. How you met and what you have agreed informally both live here.
              </p>
            )}
            {org.via && <KV label="Via">{org.via}</KV>}
            {org.relationshipTerms && <KV label="Relationship terms">{org.relationshipTerms}</KV>}
            {org.notes && (
              <>
                <Divider />
                <Eyebrow className="mb-[5px]">Notes</Eyebrow>
                <p className="text-[12.5px] text-body">{org.notes}</p>
              </>
            )}
          </Card>

          <StandingCard org={org} patterns={data.patterns} onSaved={reload} />

          {org.type === 'venue' && (
            <SiteProfileCard org={org} eventTitles={data.eventTitles} onSaved={reload} />
          )}
        </div>
      </div>
    </Page>
  )
}

/**
 * What this partner's calendar usually looks like, from the two sources the
 * dates tab also warns from.
 *
 * The pattern is counted, not typed: every date they have ever answered,
 * folded by weekday. It is read as a hint and never as a rule, because a
 * partner who has said no to three Saturdays may still say yes to the fourth.
 * The notes below it are the host's own record of what the partner told them.
 */
function StandingCard({
  org,
  patterns,
  onSaved,
}: {
  org: Org
  patterns: WeekdayPattern[]
  onSaved: () => void
}) {
  const standing = org.standing ?? []
  const { mutate } = useMutation(onSaved)
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<StandingNote['kind']>('window')
  const [text, setText] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const write = (next: StandingNote[]) =>
    void mutate((api) => api.updateOrg(org.id, { standing: next }))

  const patch = (id: string, change: Partial<StandingNote>) =>
    write(standing.map((note) => (note.id === id ? { ...note, ...change } : note)))

  const remove = (id: string) => write(standing.filter((note) => note.id !== id))

  const add = () => {
    const body = text.trim()
    if (!body) return
    write([
      ...standing,
      {
        id: nextNoteId(),
        kind,
        text: body,
        startDate: startDate || null,
        endDate: endDate || null,
      },
    ])
    setText('')
    setStartDate('')
    setEndDate('')
    setAdding(false)
  }

  return (
    <Card>
      <div className="mb-[5px] flex items-center justify-between gap-2">
        <Eyebrow>Standing availability</Eyebrow>
        <Chip tone="gray">Only you see this</Chip>
      </div>

      {patterns.length === 0 ? (
        <p className="text-[12.5px] text-mut">
          No date answers from them yet. The pattern fills in as they respond.
        </p>
      ) : (
        <div className="flex flex-wrap gap-[6px]">
          {patterns.map((pattern) => (
            <Chip
              key={pattern.weekday}
              tone={pattern.no >= PATTERN_MIN_NO && pattern.yes === 0 ? 'warn' : 'gray'}
            >
              {pattern.label}: {patternSummary(pattern)}
            </Chip>
          ))}
        </div>
      )}
      <Sub>From their date responses so far.</Sub>

      <Divider />
      <div className="mb-[5px] flex items-center justify-between gap-2">
        <Eyebrow>Notes</Eyebrow>
        {!adding && (
          <QuietButton onClick={() => setAdding(true)} aria-label="Add a standing note">
            <Plus size={12} />
          </QuietButton>
        )}
      </div>

      {standing.length === 0 && !adding && (
        <p className="text-[12.5px] text-mut">
          Nothing recorded. The weeks they are away, and the mornings that always work.
        </p>
      )}

      {standing.map((note) => (
        <div key={note.id} className="flex items-start gap-2 border-t border-hair py-[6px] first:border-t-0 first:pt-1">
          <button
            type="button"
            onClick={() => patch(note.id, { kind: note.kind === 'window' ? 'blackout' : 'window' })}
            aria-label={`Change what the note "${note.text}" means`}
            className="mt-[5px] shrink-0"
          >
            <Chip tone={note.kind === 'window' ? 'vio' : 'warn'}>
              {note.kind === 'window' ? 'Open window' : 'Blackout'}
            </Chip>
          </button>

          <span className="min-w-0 flex-1">
            <InlineText
              multiline
              ariaLabel="Standing note"
              value={note.text}
              onCommit={(next) => (next ? patch(note.id, { text: next }) : remove(note.id))}
            />
            <span className="mt-[2px] flex flex-wrap items-center gap-1 px-2 text-[11px] text-mut">
              <Input
                type="date"
                value={note.startDate ?? ''}
                onChange={(e) => patch(note.id, { startDate: e.target.value || null })}
                aria-label="First day"
                className="!w-[124px] !py-[2px] !text-[11px]"
              />
              to
              <Input
                type="date"
                value={note.endDate ?? ''}
                onChange={(e) => patch(note.id, { endDate: e.target.value || null })}
                aria-label="Last day"
                className="!w-[124px] !py-[2px] !text-[11px]"
              />
            </span>
          </span>

          <button
            type="button"
            aria-label="Remove note"
            onClick={() => remove(note.id)}
            className="mt-[7px] shrink-0 text-mut transition hover:text-rosek"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {adding && (
        <div className="mt-2 grid gap-2">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as StandingNote['kind'])}
            aria-label="What this note means"
            className="!py-1 !text-[12.5px]"
          >
            <option value="window">Open window</option>
            <option value="blackout">Blackout</option>
          </Select>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Tuesday mornings suit them, or the last week of every month is out"
            aria-label="Standing note"
            className="!py-1 !text-xs"
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-mut">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="First day"
              className="!w-[124px] !py-[2px] !text-[11px]"
            />
            to
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Last day"
              className="!w-[124px] !py-[2px] !text-[11px]"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={add} disabled={!text.trim()}>
              Add note
            </Button>
            <GhostButton onClick={() => setAdding(false)}>Cancel</GhostButton>
          </div>
          <Sub>
            Dates are optional on an open window. A blackout only warns on a date proposal when it
            has them.
          </Sub>
        </div>
      )}
    </Card>
  )
}

/**
 * The venue's own record: what this place has taught, what it needs a permit
 * for, and anything else worth reading before planning here again. Lessons
 * arrive from a recap; everything on this card is editable in place.
 */
function SiteProfileCard({
  org,
  eventTitles,
  onSaved,
}: {
  org: Org
  eventTitles: Record<string, string>
  onSaved: () => void
}) {
  const profile = org.siteProfile ?? BLANK_PROFILE
  const [headcount, setHeadcount] = useState(
    profile.permitThresholds.headcountAbove === null
      ? ''
      : String(profile.permitThresholds.headcountAbove),
  )
  const { mutate } = useMutation(onSaved)

  const write = (next: SiteProfile) => void mutate((api) => api.updateOrg(org.id, { siteProfile: next }))

  const setThreshold = (change: Partial<SiteProfile['permitThresholds']>) =>
    write({ ...profile, permitThresholds: { ...profile.permitThresholds, ...change } })

  const commitHeadcount = () => {
    const parsed = Math.trunc(Number(headcount))
    const value = headcount.trim() && parsed > 0 ? parsed : null
    if (value !== profile.permitThresholds.headcountAbove) setThreshold({ headcountAbove: value })
  }

  return (
    <Card>
      <div className="mb-[5px] flex items-center justify-between gap-2">
        <Eyebrow>Site profile</Eyebrow>
        <Chip tone="gray">Only you see this</Chip>
      </div>

      <KV label="Permit above">
        <span className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            onBlur={commitHeadcount}
            placeholder="No threshold"
            aria-label="Headcount that needs a permit"
            className="!w-[110px] !py-1 !text-xs"
          />
          <span className="text-mut">people</span>
        </span>
      </KV>

      <KV label="Amplified sound">
        <button
          type="button"
          aria-label="Change whether amplified sound needs a permit here"
          onClick={() => setThreshold({ amplifiedSound: !profile.permitThresholds.amplifiedSound })}
        >
          <Chip tone={profile.permitThresholds.amplifiedSound ? 'warn' : 'gray'}>
            {profile.permitThresholds.amplifiedSound ? 'Needs a permit' : 'No permit needed'}
          </Chip>
        </button>
      </KV>

      <KV label="Notes">
        <InlineText
          multiline
          ariaLabel="Site notes"
          value={profile.notes}
          placeholder="Power, trash, wind, the thing the site office never mentions"
          onCommit={(notes) => write({ ...profile, notes })}
        />
      </KV>

      <Divider />
      <Eyebrow className="mb-[5px]">Lessons</Eyebrow>
      {profile.lessons.length === 0 && (
        <p className="text-[12.5px] text-mut">
          Nothing learned here yet. Lessons get written at the recap and come back next time.
        </p>
      )}
      {profile.lessons.map((lesson) => (
        <div key={lesson.id} className="flex gap-2 py-[5px] text-[12.5px]">
          <span className="min-w-[92px] font-medium text-sec">{formatDayOnly(lesson.at)}</span>
          <span className="min-w-0 flex-1">
            {lesson.text}
            {lesson.eventId && eventTitles[lesson.eventId] && (
              <Link className="ml-1 text-vio" to={`/app/events/${lesson.eventId}`}>
                From {eventTitles[lesson.eventId]}
              </Link>
            )}
          </span>
          <button
            type="button"
            aria-label="Remove lesson"
            onClick={() =>
              write({ ...profile, lessons: profile.lessons.filter((l) => l.id !== lesson.id) })
            }
            className="shrink-0 text-mut transition hover:text-rosek"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </Card>
  )
}
