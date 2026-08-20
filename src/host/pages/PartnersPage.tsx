import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Page, PageHeader } from './Page'
import { useAsync } from '../useApi'
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Loading, Sub, SubTitle } from '../../ui/primitives'
import { initials, orgTypeLabel } from '../../data/profiles'

function contactsSummary(contacts: { name: string; role?: string }[]): string {
  return contacts
    .map((c) => (c.role ? `${c.name}, ${c.role.toLowerCase()}` : c.name))
    .filter(Boolean)
    .join(' and ')
}

export default function PartnersPage() {
  const { data, error, loading, reload } = useAsync((api) => api.listOrgs(), [])

  const addButton = (
    <Link to="/app/partners/new">
      <Button>
        <Plus size={13} />
        Add partner
      </Button>
    </Link>
  )

  return (
    <Page>
      <PageHeader title="Partners" action={addButton} />

      {loading && <Loading label="Loading partners" />}
      {error && <ErrorState message={`Partners didn't load (${error}).`} onRetry={reload} />}

      {data && data.length === 0 && (
        <EmptyState
          title="No partners yet"
          body="Add the co-hosts, sponsors, and vendors you plan with. You can also plan an event without any of them."
          action={addButton}
        />
      )}

      <div className="grid gap-3">
        {data?.map((org) => (
          <Link key={org.id} to={`/app/partners/${org.id}`}>
            <Card className="transition hover:border-viodash">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-[10px]">
                  <Avatar name={org.name} initials={initials(org.name)} size={32} />
                  <div className="min-w-0">
                    <SubTitle className="truncate text-sm">{org.name}</SubTitle>
                    {org.contacts.length > 0 && (
                      <p className="truncate text-[11.5px] text-mut">
                        {contactsSummary(org.contacts)}
                      </p>
                    )}
                  </div>
                </div>
                <Chip tone="vio">{orgTypeLabel(org.type)}</Chip>
              </div>
              {org.description && <Sub className="truncate">{org.description}</Sub>}
            </Card>
          </Link>
        ))}
      </div>
    </Page>
  )
}
