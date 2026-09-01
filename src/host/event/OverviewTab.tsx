import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Upload, X } from 'lucide-react'
import { Card, Chip, Eyebrow, KV, OutlineButton, QuietButton, Sub, cx } from '../../ui/primitives'
import { Field, Input, InlineText, Select } from '../../ui/form'
import { Modal } from '../../ui/Modal'
import ImportGuestsDialog from '../people/ImportGuestsDialog'
import { useEvent } from './EventContext'
import { useHost } from '../AuthProvider'
import { useAsync, useMutation } from '../useApi'
import { ownerLabel } from '../../data/profiles'
import { track } from '../../lib/analytics'
import type { EventDoc, EventLink, LinkStatus, Party } from '../../data/types'
import { formatLong, formatShort, isOverdue } from '../../lib/dates'
import { Button, GhostButton } from '../../ui/primitives'
import { clashedEvents, dateClashes, permitChecks, venueParty } from './siteChecks'

// Overview carries the confirmed or pending date, the party summary, open
// tasks by owner, the links list, location, the talk tracks for the day, and
// the page governance block: which listing is official and who holds the guest
// contacts.
//
// M1 adds two quiet warnings: the site's permit thresholds against what this
// event plans to be, and another event of the host's sitting on the same day.
// Both are chips, neither blocks anything.

const PARTY_STATUS = {
  invited: { label: 'Invited', tone: 'gray' as const },
  confirmed: { label: 'Confirmed', tone: 'grn' as const },
  declined: { label: 'Declined', tone: 'rose' as const },
}

export default function OverviewTab() {
  const { bundle, reload, run, hostName } = useEvent()
  const { event, parties, orgs, tasks, crew } = bundle
  const [addingLink, setAddingLink] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [importingGuests, setImportingGuests] = useState(false)

  const eventId = event.id
  const confirmed = event.dateOptions.find((o) => o.id === event.confirmedDateOptionId)
  const lookup = { parties, orgs, crew, hostName }

  // Contention needs the host's other events, which the bundle does not carry.
  const { data: allEvents } = useAsync((api) => api.listEvents(), [])
  const clashes = clashedEvents(dateClashes(event, allEvents ?? []))

  const venue = venueParty(parties, orgs)
  const checks = permitChecks(event, venue?.org ?? null)

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
          {clashes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-[6px]">
              {clashes.map((clash) => (
                <Link key={clash.eventId} to={`/app/events/${clash.eventId}`}>
                  <Chip tone="warn">Date shared with {clash.title}</Chip>
                </Link>
              ))}
            </div>
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

        <Card>
          <Eyebrow className="mb-[5px]">Guest list</Eyebrow>
          {event.sourceKey ? (
            <KV label="Stored under">{event.sourceKey}</KV>
          ) : (
            <p className="text-[12.5px] text-mut">
              Nothing imported yet. Bring the signup export in and everyone on it stays findable
              long after the day, with their answers attached.
            </p>
          )}
          <div className="mt-2">
            <OutlineButton onClick={() => setImportingGuests(true)}>
              <Upload size={13} />
              Import guests
            </OutlineButton>
          </div>
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
          <KV label="Capacity target">
            <InlineText
              ariaLabel="Capacity target"
              value={event.capacityTarget === null ? '' : String(event.capacityTarget)}
              placeholder="How many you are planning for"
              onCommit={(v) => {
                const parsed = Math.trunc(Number(v))
                updateEvent({ capacityTarget: v.trim() && parsed > 0 ? parsed : null })
              }}
            />
          </KV>
          {venue && (
            <>
              <KV label="Site">
                <Link className="text-vio" to={`/app/partners/${venue.org.id}`}>
                  {venue.org.name}
                </Link>
              </KV>
              {checks.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-[6px]">
                  {checks.map((check) => (
                    <Chip key={check} tone="warn">
                      {check}
                    </Chip>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>

        <Card>
          <Eyebrow className="mb-[5px]">Description</Eyebrow>
          {/* Shown on the events list since that page was built, but until now
              it could only be set while creating the event. */}
          <InlineText
            ariaLabel="Event description"
            value={event.description}
            placeholder="A line or two about what this one is"
            multiline
            onCommit={(v) => updateEvent({ description: v })}
            textClass="text-[13px]"
          />
        </Card>

        <Card>
          <Eyebrow className="mb-[5px]">Campaign goal</Eyebrow>
          <InlineText
            ariaLabel="Campaign goal"
            value={event.campaignGoal}
            placeholder="App launch, feature promo, hiring, growing the regulars"
            onCommit={(v) => updateEvent({ campaignGoal: v })}
            textClass="text-[13px]"
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

        <TalkTracks />

        <Card>
          <Eyebrow className="mb-[5px]">Template</Eyebrow>
          <p className="mb-3 text-[12.5px] text-sec">
            Save this plan so the next one starts here. Role slots, tasks, and the run of show
            carry over as offsets, and the partner names stay behind.
          </p>
          <OutlineButton onClick={() => setSavingTemplate(true)}>Save as template</OutlineButton>
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

      {savingTemplate && (
        <SaveAsTemplateDialog
          eventId={eventId}
          eventTitle={event.title}
          onClose={() => setSavingTemplate(false)}
        />
      )}

      {importingGuests && (
        <ImportGuestsDialog
          event={event}
          events={allEvents ?? []}
          onClose={() => setImportingGuests(false)}
          onImported={reload}
        />
      )}
    </div>
  )
}

/**
 * M1 talk tracks. Short prompts for the day, in the host's own words. Stored
 * as plain strings rather than objects: there is nothing else to know about a
 * line you are going to say out loud.
 */
function TalkTracks() {
  const { bundle, run } = useEvent()
  const [draft, setDraft] = useState('')

  const eventId = bundle.event.id
  const tracks = bundle.event.talkTracks ?? []

  const write = (next: string[]) => run((api) => api.updateEvent(eventId, { talkTracks: next }))

  const add = () => {
    const text = draft.trim()
    if (!text) return
    write([...tracks, text])
    setDraft('')
  }

  return (
    <Card>
      <Eyebrow className="mb-[5px]">Talk tracks</Eyebrow>

      {tracks.map((text, index) => (
        // Keyed by position and text together: a plain index would let a
        // removed line leave its words behind in the input below it.
        <div key={`${index}-${text}`} className="flex items-start gap-1 py-[3px]">
          <span
            aria-hidden="true"
            className="mt-[13px] size-[4px] shrink-0 rounded-full bg-faint"
          />
          <InlineText
            multiline
            ariaLabel="Talk track"
            value={text}
            onCommit={(next) =>
              write(
                next
                  ? tracks.map((t, i) => (i === index ? next : t))
                  : tracks.filter((_, i) => i !== index),
              )
            }
            className="flex-1"
          />
          <button
            type="button"
            aria-label="Remove talk track"
            onClick={() => write(tracks.filter((_, i) => i !== index))}
            className="mt-[6px] shrink-0 text-mut transition hover:text-rosek"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Something worth saying twice"
          aria-label="New talk track"
          className="!w-auto min-w-[180px] flex-1 !py-1 !text-xs"
        />
        <QuietButton onClick={add}>
          <Plus size={11} />
          Add
        </QuietButton>
      </div>

      <Sub className="mt-2">Prompts for the day. Quotes you capture land on contacts.</Sub>
    </Card>
  )
}

/**
 * The other direction from event creation: an event that went well becomes the
 * skeleton for the next one. Derivation lives in the seam, so this only names
 * it and hands the host their new template to edit.
 */
function SaveAsTemplateDialog({
  eventId,
  eventTitle,
  onClose,
}: {
  eventId: string
  eventTitle: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const host = useHost()
  const [name, setName] = useState(eventTitle)
  const { mutate, busy, error } = useMutation()

  const save = () =>
    void mutate(async (api) => {
      const id = await api.saveEventAsTemplate(eventId, name.trim(), host.uid)
      track('hp_event_saved_as_template', { eventId })
      track('hp_template_created', { createdFrom: 'event' })
      navigate(`/app/templates/${id}`)
    })

  return (
    <Modal title="Save as template" onClose={onClose} width="max-w-[420px]">
      <Field
        label="Template name"
        htmlFor="tpl-from-event"
        hint="Everything stays editable in the template afterwards."
      >
        <Input
          id="tpl-from-event"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What to call this plan"
          autoFocus
        />
      </Field>
      {error && (
        <p className="mb-2 text-[12px] text-rosek">Saving didn't work ({error}).</p>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy || !name.trim()}>
          {busy ? 'Saving' : 'Save template'}
        </Button>
        <GhostButton onClick={onClose} disabled={busy}>
          Cancel
        </GhostButton>
      </div>
    </Modal>
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
