import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Pencil, X } from 'lucide-react'
import { BackLink, Page } from './Page'
import { useAsync, useMutation } from '../useApi'
import {
  Avatar, Card, Chip, Divider, ErrorState, Eyebrow, KV, Loading, OutlineButton, PageTitle, Sub,
} from '../../ui/primitives'
import { Input, InlineText } from '../../ui/form'
import { initials, orgTypeLabel, profileFields } from '../../data/profiles'
import type { EventDoc, Org, SiteProfile } from '../../data/types'
import { formatDayOnly, formatShort } from '../../lib/dates'

// Detail view carries the two provenance fields from discovery: via, and
// relationship terms. Both are private to the host and never reach a guest
// page, which is what the "only you see this" chip is promising.
//
// M1 adds the site profile on a venue: the lessons this place has taught,
// its permit thresholds, and the standing notes. All host side, all editable
// here, because the lessons arrive at a recap and get read while planning.

interface History {
  event: EventDoc
  note: string
}

const BLANK_PROFILE: SiteProfile = {
  lessons: [],
  permitThresholds: { amplifiedSound: false, headcountAbove: null },
  notes: '',
}

export default function PartnerDetailPage() {
  const { orgId = '' } = useParams()

  const { data, error, loading, reload } = useAsync(
    async (api) => {
      const org = await api.getOrg(orgId)
      if (!org) return { org: null, history: [] as History[], eventTitles: {} as Record<string, string> }

      const events = await api.listEvents()
      // A site lesson can name an event this partner had no part in, so the
      // titles come from the whole list rather than from the history below.
      const eventTitles: Record<string, string> = {}
      for (const event of events) eventTitles[event.id] = event.title
      const bundles = await Promise.all(events.map((e) => api.getEventBundle(e.id)))
      const history: History[] = []
      for (const bundle of bundles) {
        if (!bundle) continue
        const party = bundle.parties.find((p) => p.orgId === orgId)
        if (!party) continue
        const outcome = party.outcomes[0]
        const status = bundle.event.status === 'wrapped' ? 'Wrapped' : 'Planning'
        history.push({
          event: bundle.event,
          note: outcome ? `${status}, ${outcome.label.toLowerCase()} ${outcome.value}` : status,
        })
      }
      return { org, history, eventTitles }
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

          {org.type === 'venue' && (
            <SiteProfileCard org={org} eventTitles={data.eventTitles} onSaved={reload} />
          )}
        </div>
      </div>
    </Page>
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
