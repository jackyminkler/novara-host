import { Link } from 'react-router-dom'
import { CalendarClock, CircleAlert, Clock } from 'lucide-react'
import { Page } from './Page'
import { useAsync } from '../useApi'
import { useHost } from '../AuthProvider'
import { Button, Card, Chip, EmptyState, ErrorState, Eyebrow, Loading, PageTitle, Sub, SubTitle } from '../../ui/primitives'
import type { EventBundle, EventDoc } from '../../data/types'
import { daysBetween, formatLong, formatShort, formatDue, isOverdue, pluralDays } from '../../lib/dates'

// The first ten seconds of a session are triage, not navigation. This page
// answers what is blocked, and nothing else.

interface Attention {
  key: string
  icon: 'quiet' | 'due' | 'overdue'
  text: string
  chip: string
  tone: 'rose' | 'vio'
  to: string
}

/** Yes counts per option, used for the leading-option line. */
function leadingOption(event: EventDoc, bundle: EventBundle) {
  if (event.confirmedDateOptionId || event.dateOptions.length === 0) return null
  const scored = event.dateOptions.map((option) => ({
    option,
    yes: bundle.parties.filter((p) => p.dateResponses[option.id]?.value === 'yes').length,
  }))
  scored.sort((a, b) => b.yes - a.yes)
  return { ...scored[0], total: bundle.parties.length }
}

function buildAttention(bundles: EventBundle[], today: Date): Attention[] {
  const items: Attention[] = []

  for (const bundle of bundles) {
    const { event, parties, orgs } = bundle
    const eventPath = `/app/events/${event.id}`

    // A party that has answered nothing while options are out is the single
    // most common blocker, and the reason the nudge counter exists.
    if (!event.confirmedDateOptionId && event.dateOptions.length > 0) {
      // "Quiet since when" is measured from the moment answers started
      // arriving, not from event creation, which can predate the ask by weeks.
      const firstAnswer = parties
        .flatMap((p) => Object.values(p.dateResponses).map((r) => r.at))
        .sort()[0]
      const since = new Date(firstAnswer ?? event.createdAt)

      for (const party of parties) {
        if (Object.keys(party.dateResponses).length > 0) continue
        const org = orgs.find((o) => o.id === party.orgId)
        const quiet = Math.max(daysBetween(since, today), 0)
        items.push({
          key: `quiet-${event.id}-${party.id}`,
          icon: 'quiet',
          text: `${org?.name ?? 'A partner'} has not answered the date options`,
          chip: quiet > 0 ? `${pluralDays(quiet)} quiet` : 'Just sent',
          tone: 'rose',
          to: `${eventPath}/dates`,
        })
      }
    }

    for (const task of bundle.tasks) {
      if (task.status === 'done' || !task.dueDate) continue
      const overdue = isOverdue(task.dueDate, today)
      const soon = daysBetween(today, new Date(task.dueDate)) <= 5
      if (!overdue && !soon) continue
      items.push({
        key: `task-${event.id}-${task.id}`,
        icon: overdue ? 'overdue' : 'due',
        text: task.title,
        chip: formatDue(task.dueDate, today),
        tone: overdue ? 'rose' : 'vio',
        to: `${eventPath}/tasks`,
      })
    }
  }

  // Quiet partners first, then overdue work, then what is merely coming up.
  const rank = (item: Attention) => (item.icon === 'quiet' ? 0 : item.icon === 'overdue' ? 1 : 2)
  return items.sort((a, b) => rank(a) - rank(b)).slice(0, 5)
}

const ICONS = { quiet: Clock, due: CalendarClock, overdue: CircleAlert }

export default function TodayPage() {
  const host = useHost()
  const today = new Date()

  const { data, error, loading, reload } = useAsync(async (api) => {
    const events = await api.listEvents()
    const active = events.filter((e) => e.status !== 'wrapped')
    const bundles = await Promise.all(active.map((e) => api.getEventBundle(e.id)))
    return { events, bundles: bundles.filter((b): b is EventBundle => b !== null) }
  }, [])

  if (loading) return <Page><Loading label="Loading today" /></Page>
  if (error || !data) {
    return (
      <Page>
        <ErrorState message={`Today didn't load (${error ?? 'unknown'}).`} onRetry={reload} />
      </Page>
    )
  }

  const attention = buildAttention(data.bundles, today)
  const next = data.bundles[0] ?? null
  const lead = next ? leadingOption(next.event, next) : null

  const dayLine = today.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const count = attention.length
  const needLine =
    count === 0
      ? 'Nothing is waiting on you.'
      : count === 1
        ? 'One thing needs you today.'
        : `${count} things need you today.`

  return (
    <Page>
      <PageTitle>Good morning, {host.shortName}</PageTitle>
      <Sub className="mb-4">
        {dayLine}. {needLine}
      </Sub>

      {next ? (
        <Card className="mb-3">
          <Eyebrow className="mb-[6px]">Next event</Eyebrow>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <SubTitle>{next.event.title}</SubTitle>
              <Sub>
                {next.event.confirmedDateOptionId ? (
                  <>
                    Confirmed,{' '}
                    <span className="font-medium text-vio">
                      {formatLong(
                        next.event.dateOptions.find((o) => o.id === next.event.confirmedDateOptionId)
                          ?.startsAt ?? '',
                      )}
                    </span>
                  </>
                ) : lead && lead.yes > 0 ? (
                  <>
                    Date pending,{' '}
                    <span className="font-medium text-vio">
                      {formatShort(lead.option.startsAt)} leading with {lead.yes} of {lead.total} in
                    </span>
                  </>
                ) : (
                  'Date pending, no responses yet'
                )}
              </Sub>
            </div>
            <Link to={`/app/events/${next.event.id}/${next.event.confirmedDateOptionId ? 'tasks' : 'dates'}`}>
              <Button>{next.event.confirmedDateOptionId ? 'Open the plan' : 'Review dates'}</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="No events in flight"
          body="Start one when you have a date in mind, or a partner who wants to do something."
          action={
            <Link to="/app/events/new">
              <Button>New event</Button>
            </Link>
          }
        />
      )}

      {attention.length > 0 && (
        <Card>
          <Eyebrow className="mb-1">Needs attention</Eyebrow>
          {attention.map((item, index) => {
            const Icon = ICONS[item.icon]
            return (
              <Link
                key={item.key}
                to={item.to}
                className={`flex items-center justify-between gap-3 py-[9px] text-[13px] transition hover:opacity-70 ${
                  index > 0 ? 'border-t border-hair' : ''
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon size={14} className="shrink-0 text-mut" />
                  <span className="truncate">{item.text}</span>
                </span>
                <Chip tone={item.tone}>{item.chip}</Chip>
              </Link>
            )
          })}
        </Card>
      )}
    </Page>
  )
}
