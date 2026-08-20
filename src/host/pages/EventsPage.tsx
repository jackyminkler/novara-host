import { Link } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Plus, Users } from 'lucide-react'
import { Page, PageHeader } from './Page'
import { useAsync } from '../useApi'
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Loading, Sub, SubTitle } from '../../ui/primitives'
import type { ChipTone } from '../../ui/primitives'
import type { EventBundle, EventDoc, EventStatus } from '../../data/types'
import { initials } from '../../data/profiles'
import { formatShort } from '../../lib/dates'

// Full-width collection. Each card is a destination, and the pending card
// leads with whatever is blocking it.

const STATUS: Record<EventStatus, { label: string; tone: ChipTone }> = {
  draft: { label: 'Draft', tone: 'gray' },
  planning: { label: 'Planning', tone: 'vio' },
  confirmed: { label: 'Confirmed', tone: 'vio' },
  live: { label: 'Live', tone: 'amb' },
  wrapped: { label: 'Wrapped', tone: 'grn' },
}

function dateSummary(event: EventDoc, bundle: EventBundle | undefined) {
  const confirmed = event.dateOptions.find((o) => o.id === event.confirmedDateOptionId)
  if (confirmed) {
    return (
      <span className="flex items-center gap-[6px] font-medium text-vio">
        <CalendarDays size={14} />
        {formatShort(confirmed.startsAt)}
      </span>
    )
  }
  if (!bundle || bundle.parties.length === 0) {
    return <span>{event.dateOptions.length} date options out</span>
  }
  const answered = bundle.parties.filter((p) => Object.keys(p.dateResponses).length > 0).length
  return (
    <span>
      {answered} of {bundle.parties.length} dates in
    </span>
  )
}

export default function EventsPage() {
  const { data, error, loading, reload } = useAsync(async (api) => {
    const events = await api.listEvents()
    const bundles = await Promise.all(events.map((e) => api.getEventBundle(e.id)))
    const byId = new Map<string, EventBundle>()
    bundles.forEach((b) => b && byId.set(b.event.id, b))
    return { events, byId }
  }, [])

  const newEventButton = (
    <Link to="/app/events/new">
      <Button>
        <Plus size={13} />
        New event
      </Button>
    </Link>
  )

  return (
    <Page>
      <PageHeader title="Events" action={newEventButton} />

      {loading && <Loading label="Loading events" />}
      {error && <ErrorState message={`Events didn't load (${error}).`} onRetry={reload} />}

      {data && data.events.length === 0 && (
        <EmptyState
          title="No events yet"
          body="Start one when you have a date in mind. Partners are optional, so this works as your own checklist first."
          action={newEventButton}
        />
      )}

      {data?.events.map((event) => {
        const bundle = data.byId.get(event.id)
        const status = STATUS[event.status]
        const openTasks = bundle?.tasks.filter((t) => t.status === 'open').length ?? 0

        return (
          <Link key={event.id} to={`/app/events/${event.id}`} className="mb-3 block">
            <Card className="transition hover:border-viodash">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SubTitle>{event.title}</SubTitle>
                  <Sub>{event.location.name}</Sub>
                </div>
                <Chip tone={status.tone}>{status.label}</Chip>
              </div>

              {event.description && (
                <p className="mt-[9px] text-[13px] text-body">{event.description}</p>
              )}

              <div className="mt-[11px] flex flex-wrap items-center gap-4 border-t border-hair pt-[10px] text-xs text-sec">
                {bundle && bundle.parties.length > 0 && (
                  <span className="flex items-center">
                    <span className="flex items-center">
                      {bundle.parties.map((party) => {
                        const org = bundle.orgs.find((o) => o.id === party.orgId)
                        const name = org?.name ?? 'Partner'
                        return (
                          <Avatar
                            key={party.id}
                            name={name}
                            initials={initials(name)}
                            size={22}
                            className="-ml-[7px] border-[1.5px] border-surface first:ml-0"
                          />
                        )
                      })}
                    </span>
                    <span className="ml-[7px]">{dateSummary(event, bundle)}</span>
                  </span>
                )}
                {(!bundle || bundle.parties.length === 0) && (
                  <span className="flex items-center gap-[6px]">
                    <Users size={14} />
                    Planning solo
                  </span>
                )}
                {openTasks > 0 && (
                  <span className="flex items-center gap-[6px]">
                    <CheckCircle2 size={14} />
                    {openTasks} open {openTasks === 1 ? 'task' : 'tasks'}
                  </span>
                )}
                {event.status === 'wrapped' && (
                  <span className="font-medium text-vio">View recap</span>
                )}
              </div>
            </Card>
          </Link>
        )
      })}
    </Page>
  )
}
