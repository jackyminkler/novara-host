import { Link, useParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { BackLink, Page } from './Page'
import { useAsync } from '../useApi'
import {
  Avatar, Card, Chip, Divider, ErrorState, Eyebrow, KV, Loading, OutlineButton, PageTitle, Sub,
} from '../../ui/primitives'
import { initials, orgTypeLabel, profileFields } from '../../data/profiles'
import type { EventDoc } from '../../data/types'
import { formatShort } from '../../lib/dates'

// Detail view carries the two provenance fields from discovery: via, and
// relationship terms. Both are private to the host and never reach a guest
// page, which is what the "only you see this" chip is promising.

interface History {
  event: EventDoc
  note: string
}

export default function PartnerDetailPage() {
  const { orgId = '' } = useParams()

  const { data, error, loading, reload } = useAsync(
    async (api) => {
      const org = await api.getOrg(orgId)
      if (!org) return { org: null, history: [] as History[] }

      const events = await api.listEvents()
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
      return { org, history }
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
                  {' '}
                  ,{' '}
                  {formatShort(
                    event.dateOptions.find((o) => o.id === event.confirmedDateOptionId)?.startsAt ?? '',
                  )}
                </span>
              )}
            </KV>
          ))}
        </Card>

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
      </div>
    </Page>
  )
}
