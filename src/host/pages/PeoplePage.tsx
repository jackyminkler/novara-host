import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Page, PageHeader } from './Page'
import { useAsync } from '../useApi'
import { Input, Select } from '../../ui/form'
import { Avatar, Card, Chip, EmptyState, ErrorState, Loading, OutlineButton, Sub, SubTitle, cx } from '../../ui/primitives'
import { initials } from '../../data/profiles'
import { SEGMENTS, referralCounts } from '../../data/segments'
import { track } from '../../lib/analytics'
import type { Person } from '../../data/types'

// The whole list loads in one read and every filter runs here. At this size
// that is faster than a round trip per filter, needs no composite index, and
// is the only way the referral segment can work at all.
const PAGE_SIZE = 100

const TIER_LABELS: Record<Person['tier'], string> = {
  signed_up: 'Signed up',
  invited_only: 'Invited only',
  declined_only: 'Declined',
}

function lastSeenLabel(iso: string): string {
  if (!iso) return 'No date'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Every event key anyone registered for, newest first. Keys sort as dates. */
function eventKeys(people: Person[]): string[] {
  const keys = new Set<string>()
  for (const person of people) for (const r of person.registrations) keys.add(r.eventKey)
  return [...keys].sort().reverse()
}

function allTags(people: Person[]): string[] {
  const tags = new Set<string>()
  for (const person of people) for (const tag of person.tags) tags.add(tag)
  return [...tags].sort()
}

export default function PeoplePage() {
  const { data, error, loading, reload } = useAsync((api) => api.listPeople(), [])
  const [segmentId, setSegmentId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState('')
  const [eventKey, setEventKey] = useState('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<'lastSeen' | 'events'>('lastSeen')
  const [shown, setShown] = useState(PAGE_SIZE)

  const people = useMemo(() => data ?? [], [data])

  useEffect(() => {
    if (data) track('hp_people_list_viewed', { total: data.length })
  }, [data])

  // Any filter change starts the list over, or page two of the old filter
  // would be showing under the new one.
  useEffect(() => setShown(PAGE_SIZE), [segmentId, search, tier, eventKey, tag, sort])

  const referrals = useMemo(() => referralCounts(people), [people])

  const filtered = useMemo(() => {
    const segment = SEGMENTS.find((s) => s.id === segmentId)
    let rows = segment ? segment.select(people) : people

    const needle = search.trim().toLowerCase()
    if (needle) {
      rows = rows.filter(
        (p) => p.fullName.toLowerCase().includes(needle) || p.email.includes(needle),
      )
    }
    if (tier) rows = rows.filter((p) => p.tier === tier)
    if (eventKey) rows = rows.filter((p) => p.registrations.some((r) => r.eventKey === eventKey))
    if (tag) rows = rows.filter((p) => p.tags.includes(tag))

    // The referral segment arrives ranked by how many people someone brought;
    // re-sorting it by date would throw away the only thing it is for.
    if (segmentId === 'superconnectors') return rows
    return [...rows].sort((a, b) =>
      sort === 'events'
        ? b.eventCount - a.eventCount || b.lastSeenAt.localeCompare(a.lastSeenAt)
        : b.lastSeenAt.localeCompare(a.lastSeenAt),
    )
  }, [people, segmentId, search, tier, eventKey, tag, sort])

  const activeSegment = SEGMENTS.find((s) => s.id === segmentId)

  return (
    <Page>
      <PageHeader
        title="People"
        subtitle={
          people.length
            ? `${filtered.length.toLocaleString()} of ${people.length.toLocaleString()} who have been to or been asked to something`
            : undefined
        }
      />

      {loading && <Loading label="Loading people" />}
      {error && <ErrorState message={`People didn't load (${error}).`} onRetry={reload} />}

      {data && data.length === 0 && (
        <EmptyState
          title="No one here yet"
          body="Guest lists arrive by importing an event export. Until then this stays empty, and everything else in the app still works."
        />
      )}

      {data && data.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap gap-[6px]">
            <button type="button" onClick={() => setSegmentId('')}>
              <Chip
                tone={segmentId === '' ? 'vio' : 'gray'}
                className={cx('cursor-pointer transition', segmentId === '' && 'ring-1 ring-vio/30')}
              >
                Everyone
              </Chip>
            </button>
            {SEGMENTS.map((segment) => (
              <button
                key={segment.id}
                type="button"
                title={segment.description}
                onClick={() => setSegmentId(segment.id === segmentId ? '' : segment.id)}
              >
                <Chip
                  tone={segmentId === segment.id ? 'vio' : 'gray'}
                  className={cx('cursor-pointer transition', segmentId === segment.id && 'ring-1 ring-vio/30')}
                >
                  {segment.label}
                </Chip>
              </button>
            ))}
          </div>

          {activeSegment && <Sub className="mb-3">{activeSegment.description}</Sub>}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={13} className="absolute left-[10px] top-1/2 -translate-y-1/2 text-mut" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
                aria-label="Search people by name or email"
                className="pl-[28px]"
              />
            </div>
            <div className="w-[128px] shrink-0"><Select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by status">
              <option value="">Any status</option>
              {Object.entries(TIER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select></div>
            <div className="w-[190px] shrink-0"><Select value={eventKey} onChange={(e) => setEventKey(e.target.value)} aria-label="Filter by event">
              <option value="">Any event</option>
              {eventKeys(people).map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </Select></div>
            {allTags(people).length > 0 && (
              <div className="w-[120px] shrink-0"><Select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
                <option value="">Any tag</option>
                {allTags(people).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select></div>
            )}
            <div className="w-[168px] shrink-0"><Select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'lastSeen' | 'events')}
              aria-label="Sort people"
            >
              <option value="lastSeen">Most recent first</option>
              <option value="events">Most events first</option>
            </Select></div>
          </div>

          {filtered.length === 0 && (
            <EmptyState title="Nothing matches" body="Try a different segment, or clear the search." />
          )}

          <div className="grid gap-[6px]">
            {filtered.slice(0, shown).map((person) => {
              const brought = referrals.get(person.email) ?? 0
              return (
                <Link key={person.id} to={`/app/people/${person.id}`}>
                  <Card className="py-[10px] transition hover:border-viodash">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-[10px]">
                        <Avatar name={person.fullName} initials={initials(person.fullName)} size={30} />
                        <div className="min-w-0">
                          <SubTitle className="truncate text-[13px]">{person.fullName || person.email}</SubTitle>
                          <p className="truncate text-[11.5px] text-mut">{person.email}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-[6px]">
                        {brought > 0 && <Chip>Brought {brought}</Chip>}
                        {person.eventCount > 0 && (
                          <Chip tone={person.eventCount >= 2 ? 'vio' : 'gray'}>
                            {person.eventCount === 1 ? '1 event' : `${person.eventCount} events`}
                          </Chip>
                        )}
                        {person.eventCount === 0 && <Chip>{TIER_LABELS[person.tier]}</Chip>}
                        <span className="hidden text-[11.5px] text-mut sm:inline">
                          {lastSeenLabel(person.lastSeenAt)}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>

          {filtered.length > shown && (
            <div className="mt-3 flex justify-center">
              <OutlineButton onClick={() => setShown((n) => n + PAGE_SIZE)}>
                Show more, {(filtered.length - shown).toLocaleString()} left
              </OutlineButton>
            </div>
          )}
        </>
      )}
    </Page>
  )
}
