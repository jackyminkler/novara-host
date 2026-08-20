import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { Card, Chip, Eyebrow, KV, QuietButton, Sub, cx } from '../../ui/primitives'
import { Field, Input, InlineText, Select } from '../../ui/form'
import { Modal } from '../../ui/Modal'
import { useEvent } from './EventContext'
import { ownerLabel } from '../../data/profiles'
import type { EventDoc, EventLink, LinkStatus, Party } from '../../data/types'
import { formatLong, formatShort, isOverdue } from '../../lib/dates'
import { Button, GhostButton } from '../../ui/primitives'

// Overview carries the confirmed or pending date, the party summary, open
// tasks by owner, the links list, location, and the page governance block:
// which listing is official and who holds the guest contacts.

const PARTY_STATUS = {
  invited: { label: 'Invited', tone: 'gray' as const },
  confirmed: { label: 'Confirmed', tone: 'grn' as const },
  declined: { label: 'Declined', tone: 'rose' as const },
}

export default function OverviewTab() {
  const { bundle, run, hostName } = useEvent()
  const { event, parties, orgs, tasks, crew } = bundle
  const [addingLink, setAddingLink] = useState(false)

  const eventId = event.id
  const confirmed = event.dateOptions.find((o) => o.id === event.confirmedDateOptionId)
  const lookup = { parties, orgs, crew, hostName }

  const leading = event.dateOptions
    .map((option) => ({
      option,
      yes: parties.filter((p) => p.dateResponses[option.id]?.value === 'yes').length,
    }))
    .sort((a, b) => b.yes - a.yes)[0]

  // Open task counts per owner, which is the only breakdown the host reads here.
  const owners = Array.from(new Set(tasks.filter((t) => t.status === 'open').map((t) => t.owner)))
  const taskSummary = owners.map((owner) => {
    const open = tasks.filter((t) => t.owner === owner && t.status === 'open')
    const overdue = open.filter((t) => isOverdue(t.dueDate)).length
    return { owner, label: ownerLabel(owner, lookup), open: open.length, overdue }
  })

  const updateEvent = (patch: Partial<EventDoc>) => run((api) => api.updateEvent(eventId, patch))

  const setGovernance = (key: keyof typeof event.governance, value: string) =>
    updateEvent({ governance: { ...event.governance, [key]: value } })

  const setLocation = (key: keyof typeof event.location, value: string) =>
    updateEvent({ location: { ...event.location, [key]: value } })

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="grid gap-3 self-start">
        <Card tone={confirmed ? 'violet' : 'plain'}>
          <Eyebrow className={cx('mb-[5px]', confirmed && 'text-vio')}>Date</Eyebrow>
          {confirmed ? (
            <p className="font-display text-[15px] font-semibold text-vio">
              {formatLong(confirmed.startsAt)}
            </p>
          ) : event.dateOptions.length === 0 ? (
            <Link to={`/app/events/${eventId}/dates`} className="text-[13px] text-vio">
              No dates proposed yet. Add some options.
            </Link>
          ) : (
            <p className="text-[13px]">
              Pending, {event.dateOptions.length} options out.{' '}
              {leading && leading.yes > 0 && (
                <span className="font-medium text-vio">
                  {formatShort(leading.option.startsAt)} leading, {leading.yes} of {parties.length} in.
                </span>
              )}
            </p>
          )}
        </Card>

        <Card>
          <Eyebrow className="mb-[5px]">Parties</Eyebrow>
          {parties.length === 0 && (
            <p className="text-[12.5px] text-mut">
              Planning solo. Add partners any time, or never.
            </p>
          )}
          {parties.map((party: Party) => {
            const org = orgs.find((o) => o.id === party.orgId)
            const status = PARTY_STATUS[party.status]
            return (
              <KV key={party.id} label={org?.name ?? 'Removed partner'}>
                <Chip tone={status.tone}>{status.label}</Chip>
              </KV>
            )
          })}
        </Card>

        <Card>
          <Eyebrow className="mb-[5px]">Page governance</Eyebrow>
          <KV label="Official listing">
            <Select
              aria-label="Official listing"
              value={event.governance.officialListing}
              onChange={(e) => setGovernance('officialListing', e.target.value)}
              className="!py-1 !text-[12.5px]"
            >
              <option value="">Not decided</option>
              <option value="Luma">Luma</option>
              <option value="Partiful">Partiful</option>
              <option value="Other">Other</option>
            </Select>
          </KV>
          <KV label="Listing URL">
            <InlineText
              ariaLabel="Listing URL"
              value={event.governance.listingUrl}
              placeholder="Paste the link"
              onCommit={(v) => setGovernance('listingUrl', v)}
            />
          </KV>
          <KV label="Guest contacts">
            <InlineText
              ariaLabel="Who holds the guest contacts"
              value={event.governance.guestContactsOwner}
              placeholder="Who holds the list"
              onCommit={(v) => setGovernance('guestContactsOwner', v)}
            />
          </KV>
          <KV label="Dual posts">
            <InlineText
              ariaLabel="Dual posts"
              value={event.governance.dualPosts}
              placeholder="None planned"
              onCommit={(v) => setGovernance('dualPosts', v)}
            />
          </KV>
        </Card>
      </div>

      <div className="grid gap-3 self-start">
        <Card>
          <Eyebrow className="mb-[5px]">Open tasks</Eyebrow>
          {taskSummary.length === 0 && (
            <p className="text-[12.5px] text-mut">Nothing open. Either you are ready, or nothing is written down yet.</p>
          )}
          {taskSummary.map((row) => (
            <KV key={row.owner} label={row.label}>
              {row.open} open
              {row.overdue > 0 && <span className="text-rosek">, {row.overdue} overdue</span>}
            </KV>
          ))}
        </Card>

        <Card>
          <div className="mb-[5px] flex items-center justify-between">
            <Eyebrow>Links</Eyebrow>
            <QuietButton onClick={() => setAddingLink(true)} aria-label="Add a link">
              <Plus size={12} />
            </QuietButton>
          </div>
          {event.links.length === 0 && (
            <p className="text-[12.5px] text-mut">No links yet. The listing, the flyer, the asset folder.</p>
          )}
          {event.links.map((link) => (
            <KV
              key={link.id}
              label={
                <a href={link.url} target="_blank" rel="noreferrer" className="text-vio">
                  {link.label}
                </a>
              }
            >
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Mark ${link.label} ${link.status === 'draft' ? 'final' : 'draft'}`}
                  onClick={() =>
                    updateEvent({
                      links: event.links.map((l) =>
                        l.id === link.id
                          ? { ...l, status: (l.status === 'draft' ? 'final' : 'draft') as LinkStatus }
                          : l,
                      ),
                    })
                  }
                >
                  <Chip tone={link.status === 'final' ? 'grn' : 'gray'}>
                    {link.status === 'final' ? 'Final' : 'Draft'}
                  </Chip>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${link.label}`}
                  onClick={() => updateEvent({ links: event.links.filter((l) => l.id !== link.id) })}
                  className="text-mut transition hover:text-rosek"
                >
                  <X size={12} />
                </button>
              </span>
            </KV>
          ))}
        </Card>

        <Card>
          <Eyebrow className="mb-[5px]">Location</Eyebrow>
          <KV label="Meet point">
            <InlineText
              ariaLabel="Meet point"
              value={event.location.meetPoint}
              placeholder="Where everyone gathers"
              onCommit={(v) => setLocation('meetPoint', v)}
            />
          </KV>
          <KV label="Finish point">
            <InlineText
              ariaLabel="Finish point"
              value={event.location.finishPoint}
              placeholder="Where it ends up"
              onCommit={(v) => setLocation('finishPoint', v)}
            />
          </KV>
          <KV label="Notes">
            <InlineText
              multiline
              ariaLabel="Location notes"
              value={event.location.notes}
              placeholder="Power, wind, permits, anything that bit you last time"
              onCommit={(v) => setLocation('notes', v)}
            />
          </KV>
        </Card>

        <Card>
          <Eyebrow className="mb-[5px]">Campaign goal</Eyebrow>
          <InlineText
            ariaLabel="Campaign goal"
            value={event.campaignGoal}
            placeholder="App launch, feature promo, hiring, growing the regulars"
            onCommit={(v) => updateEvent({ campaignGoal: v })}
            className="!text-[13px]"
          />
          {confirmed && (
            <>
              <Sub className="mt-2">When it is over, the recap echoes each party's goal.</Sub>
              <Link to={`/app/events/${eventId}/recap`}>
                <QuietButton className="mt-1">Open the recap</QuietButton>
              </Link>
            </>
          )}
        </Card>
      </div>

      {addingLink && (
        <AddLinkDialog
          onClose={() => setAddingLink(false)}
          onAdd={(link) => {
            updateEvent({ links: [...event.links, link] })
            setAddingLink(false)
          }}
        />
      )}
    </div>
  )
}

function AddLinkDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (link: EventLink) => void
}) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<LinkStatus>('draft')

  return (
    <Modal title="Add a link" onClose={onClose} width="max-w-[420px]">
      <Field label="Label" htmlFor="link-label">
        <Input id="link-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Luma page, flyer, asset folder" autoFocus />
      </Field>
      <Field label="URL" htmlFor="link-url">
        <Input id="link-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
      </Field>
      <div className="mb-3 flex gap-2">
        {(['draft', 'final'] as LinkStatus[]).map((value) => (
          <button key={value} type="button" onClick={() => setStatus(value)}>
            <Chip tone={status === value ? 'vio' : 'gray'}>{value === 'draft' ? 'Draft' : 'Final'}</Chip>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button
          disabled={!label.trim() || !url.trim()}
          onClick={() =>
            onAdd({
              id: `lnk-${Date.now().toString(36)}`,
              label: label.trim(),
              url: url.trim(),
              owner: 'host',
              status,
            })
          }
        >
          Add link
        </Button>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
      </div>
    </Modal>
  )
}
