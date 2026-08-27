import { useState } from 'react'
import { Copy, Check, Plus, RotateCw, X } from 'lucide-react'
import {
  Avatar, Button, Card, Chip, Divider, Eyebrow, GhostButton, KV, OutlineButton, QuietButton, cx,
} from '../../ui/primitives'
import type { ChipTone } from '../../ui/primitives'
import { Field, Input, Label, Select } from '../../ui/form'
import { Modal } from '../../ui/Modal'
import { useAsync } from '../useApi'
import { useEvent } from './EventContext'
import { DueChip } from './InlineEditors'
import { ORG_TYPES, initials, orgTypeChip, profileFields } from '../../data/profiles'
import type { CustomField, Deliverable, Org, OrgType, Party, PartyStatus } from '../../data/types'
import { InlineText } from '../../ui/form'
import { track } from '../../lib/analytics'

// One card per party: role, status, terms, goal and call to action, the guest
// link, the nudge counter, their date summary, and the deliverables both ways.
// The goal line is what the recap later echoes.
//
// M1 effort ledger: deliverables carry a direction, so an arrangement where
// one side quietly does everything shows up as a count rather than as a
// feeling. The summary line reads without opening anything.

let deliverableSeq = 0
const nextDeliverableId = () => `dlv-${Date.now().toString(36)}-${(deliverableSeq += 1)}`

const DIRECTIONS: { direction: Deliverable['direction']; title: string; from: string }[] = [
  { direction: 'party', title: 'They deliver', from: 'from them' },
  { direction: 'host', title: 'You deliver', from: 'from you' },
]

/** "2 of 3 from them, 1 of 2 from you". Null when nothing is agreed yet. */
function ledgerSummary(deliverables: Deliverable[]): string | null {
  const parts = DIRECTIONS.map(({ direction, from }) => {
    const side = deliverables.filter((d) => d.direction === direction)
    if (side.length === 0) return null
    return `${side.filter((d) => d.done).length} of ${side.length} ${from}`
  }).filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

const STATUS: Record<PartyStatus, { label: string; tone: ChipTone }> = {
  invited: { label: 'Invited', tone: 'gray' },
  confirmed: { label: 'Confirmed', tone: 'grn' },
  declined: { label: 'Declined', tone: 'rose' },
}

const ROLE_TONE: Record<OrgType, ChipTone> = {
  activation: 'vio',
  sponsor: 'amb',
  cohost: 'vio',
  vendor: 'gray',
  venue: 'gray',
}

export default function PartiesTab() {
  const { bundle, run } = useEvent()
  const [adding, setAdding] = useState(false)

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {bundle.parties.map((party) => (
          <PartyCard key={party.id} party={party} />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <OutlineButton onClick={() => setAdding(true)}>
          <Plus size={13} />
          Add a party
        </OutlineButton>
        <span className="text-[13px] text-sec">
          Parties are optional. This event works as your own checklist without them.
        </span>
      </div>

      {adding && (
        <AddPartyDialog
          onClose={() => setAdding(false)}
          onAdd={(input) => {
            run((api) => api.addParty(bundle.event.id, input))
            setAdding(false)
          }}
          taken={bundle.parties.map((p) => p.orgId)}
        />
      )}
    </>
  )
}

function PartyCard({ party }: { party: Party }) {
  const { bundle, run } = useEvent()
  const [copied, setCopied] = useState(false)
  const [openLedger, setOpenLedger] = useState(false)
  const org = bundle.orgs.find((o) => o.id === party.orgId)
  const name = org?.name ?? 'Removed partner'
  const contact = org?.contacts[0]
  const status = STATUS[party.status]
  const eventId = bundle.event.id
  const confirmed = bundle.event.dateOptions.find((o) => o.id === bundle.event.confirmedDateOptionId)
  const eventDate = confirmed ? new Date(confirmed.startsAt) : null

  const guestUrl = party.tokenId ? `${window.location.origin}/g/${party.tokenId}` : null

  const copy = async () => {
    if (!guestUrl) return
    await navigator.clipboard.writeText(guestUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const regenerate = () => {
    if (party.tokenId && !window.confirm('The old link stops working right away. Regenerate?')) return
    run((api) => api.issueToken(eventId, 'party', party.id))
  }

  const cycleStatus = () => {
    const next: PartyStatus =
      party.status === 'invited' ? 'confirmed' : party.status === 'confirmed' ? 'declined' : 'invited'
    run((api) => api.updateParty(eventId, party.id, { status: next }))
    if (next === 'confirmed') track('hp_role_confirmed', { eventId, source: 'host' })
  }

  const update = (patch: Partial<Party>) => run((api) => api.updateParty(eventId, party.id, patch))

  const answered = Object.keys(party.dateResponses).length
  const yes = Object.values(party.dateResponses).filter((r) => r.value === 'yes').length

  const deliverables = party.deliverables ?? []
  const summary = ledgerSummary(deliverables)

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[9px]">
          <Avatar name={name} initials={initials(name)} size={32} />
          <div className="min-w-0">
            <b className="block truncate text-sm">{name}</b>
            {contact && (
              <span className="block truncate text-[11.5px] text-mut">
                {contact.name}
                {contact.role ? `, ${contact.role.toLowerCase()}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[6px]">
          <Chip tone={ROLE_TONE[party.roleOnEvent]}>{orgTypeChip(party.roleOnEvent)}</Chip>
          <button type="button" onClick={cycleStatus} aria-label="Change status">
            <Chip tone={status.tone}>{status.label}</Chip>
          </button>
        </div>
      </div>

      <Divider />

      <KV label="Gives" labelWidth="min-w-[86px]">
        <InlineText
          ariaLabel="What they give"
          value={party.terms.gives}
          placeholder="What they bring"
          onCommit={(gives) => update({ terms: { ...party.terms, gives } })}
        />
      </KV>
      <KV label="Gets" labelWidth="min-w-[86px]">
        <InlineText
          ariaLabel="What they get"
          value={party.terms.gets}
          placeholder="What they get back"
          onCommit={(gets) => update({ terms: { ...party.terms, gets } })}
        />
      </KV>
      <KV label="Goal" labelWidth="min-w-[86px]">
        <InlineText
          ariaLabel="Their goal"
          value={party.goal}
          placeholder="What a good day looks like for them"
          onCommit={(goal) => update({ goal })}
        />
      </KV>
      <KV label="Call to action" labelWidth="min-w-[86px]">
        <InlineText
          ariaLabel="Call to action"
          value={party.cta}
          placeholder="What you ask the crowd to do"
          onCommit={(cta) => update({ cta })}
        />
      </KV>

      {answered > 0 && (
        <KV label="Dates" labelWidth="min-w-[86px]">
          <span className="text-sec">
            {yes} yes of {answered} answered
          </span>
        </KV>
      )}

      {summary && (
        <KV label="Deliverables" labelWidth="min-w-[86px]">
          <span className="text-sec">{summary}</span>
        </KV>
      )}

      <div className="mt-1">
        <QuietButton onClick={() => setOpenLedger((v) => !v)}>
          {openLedger
            ? 'Hide deliverables'
            : summary
              ? 'Open deliverables'
              : 'Add deliverables'}
        </QuietButton>
      </div>

      {openLedger && (
        <div className="mt-2 grid gap-3">
          {DIRECTIONS.map(({ direction, title }) => (
            <DeliverableList
              key={direction}
              direction={direction}
              title={title}
              deliverables={deliverables}
              eventId={eventId}
              partyId={party.id}
              eventDate={eventDate}
            />
          ))}
        </div>
      )}

      <Divider />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {guestUrl ? (
          <>
            <QuietButton onClick={copy}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy guest link'}
            </QuietButton>
            <QuietButton onClick={regenerate}>
              <RotateCw size={12} />
              Regenerate
            </QuietButton>
          </>
        ) : (
          <QuietButton onClick={regenerate}>
            <Plus size={12} />
            Create guest link
          </QuietButton>
        )}
        <span className={cx('text-sec', party.nudgeCount > 0 && 'text-rosek')}>
          Nudges: {party.nudgeCount}
          <QuietButton
            className="ml-[6px]"
            onClick={() => {
              run((api) => api.logNudge(eventId, party.id))
              track('hp_nudge_logged', { eventId, partyId: party.id })
            }}
          >
            Log nudge
          </QuietButton>
        </span>
      </div>

      <div className="mt-2 flex justify-end">
        <GhostButton
          onClick={() => {
            if (window.confirm(`Remove ${name} from this event?`)) {
              run((api) => api.removeParty(eventId, party.id))
            }
          }}
        >
          Remove from event
        </GhostButton>
      </div>
    </Card>
  )
}

/**
 * One side of the ledger. Both lists write the whole `deliverables` array back
 * through updateParty, so the two directions can never fall out of step with
 * each other the way two fields would.
 */
function DeliverableList({
  direction,
  title,
  deliverables,
  eventId,
  partyId,
  eventDate,
}: {
  direction: Deliverable['direction']
  title: string
  deliverables: Deliverable[]
  eventId: string
  partyId: string
  eventDate: Date | null
}) {
  const { run } = useEvent()
  const [draft, setDraft] = useState('')
  const [due, setDue] = useState('')

  const rows = deliverables.filter((d) => d.direction === direction)

  const write = (next: Deliverable[]) =>
    run((api) => api.updateParty(eventId, partyId, { deliverables: next }))

  const patch = (id: string, change: Partial<Deliverable>) =>
    write(deliverables.map((d) => (d.id === id ? { ...d, ...change } : d)))

  const add = () => {
    const text = draft.trim()
    if (!text) return
    write([
      ...deliverables,
      { id: nextDeliverableId(), direction, title: text, due: due || null, done: false },
    ])
    setDraft('')
    setDue('')
  }

  const toggle = (row: Deliverable) => {
    patch(row.id, { done: !row.done })
    track('hp_deliverable_toggled', { eventId, direction })
  }

  return (
    <div>
      <Eyebrow className="mb-[5px]">{title}</Eyebrow>

      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-center gap-[6px] border-t border-hair py-[6px]">
          <button
            type="button"
            aria-label={row.done ? 'Mark not done' : 'Mark done'}
            onClick={() => toggle(row)}
            className={cx(
              'hairline flex size-[18px] shrink-0 items-center justify-center rounded-md transition',
              row.done
                ? 'border-transparent bg-grn text-grnk'
                : 'border-[#dad5ec] text-transparent hover:border-viodash',
            )}
          >
            <Check size={12} />
          </button>
          <InlineText
            ariaLabel="Deliverable"
            value={row.title}
            onCommit={(next) => next && patch(row.id, { title: next })}
            className={cx('min-w-[120px] flex-1', row.done && 'text-mut line-through')}
          />
          <DueChip
            dueDate={row.due}
            eventDate={eventDate}
            done={row.done}
            onChange={(next) => patch(row.id, { due: next })}
          />
          <button
            type="button"
            aria-label="Remove deliverable"
            onClick={() => write(deliverables.filter((d) => d.id !== row.id))}
            className="shrink-0 text-mut transition hover:text-rosek"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-[6px] border-t border-hair pt-[6px]">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={direction === 'party' ? 'What they owe' : 'What you owe'}
          aria-label={`New deliverable, ${title.toLowerCase()}`}
          className="!w-auto min-w-[140px] flex-1 !py-1 !text-xs"
        />
        <Input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date, optional"
          className="!w-auto !py-1 !text-xs"
        />
        <QuietButton onClick={add}>
          <Plus size={11} />
          Add
        </QuietButton>
      </div>
    </div>
  )
}

/** Directory picker plus the chosen type's built-in fields, per wireframe 18. */
function AddPartyDialog({
  onClose,
  onAdd,
  taken,
}: {
  onClose: () => void
  onAdd: (input: {
    orgId: string
    roleOnEvent: OrgType
    terms: { gives: string; gets: string }
    goal: string
    cta: string
    profile: Record<string, string>
    customFields: CustomField[]
  }) => void
  taken: string[]
}) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<OrgType | ''>('')
  const [selected, setSelected] = useState<Org | null>(null)
  const [role, setRole] = useState<OrgType>('vendor')
  const [gives, setGives] = useState('')
  const [gets, setGets] = useState('')
  const [goal, setGoal] = useState('')
  const [profile, setProfile] = useState<Record<string, string>>({})

  const { data: orgs } = useAsync((api) => api.listOrgs(), [])

  const choose = (org: Org) => {
    setSelected(org)
    setRole(org.type)
    // Event values start from the org defaults, then get overridden here.
    setProfile({ ...org.profile })
    setGoal(org.profile.goal ?? '')
  }

  const visible = (orgs ?? []).filter(
    (org) =>
      !taken.includes(org.id) &&
      (!typeFilter || org.type === typeFilter) &&
      org.name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <Modal title="Add a party" onClose={onClose}>
      <div className="mb-[10px] flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search partners"
          aria-label="Search partners"
          autoFocus
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as OrgType | '')}
          aria-label="Filter by type"
          className="!w-auto"
        >
          <option value="">All types</option>
          {ORG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="max-h-52 overflow-y-auto">
        {visible.length === 0 && (
          <p className="py-3 text-[12.5px] text-mut">
            No partners match. Add them in the directory first, under Partners.
          </p>
        )}
        {visible.map((org) => (
          <button
            key={org.id}
            type="button"
            onClick={() => choose(org)}
            className="flex w-full items-center justify-between gap-2 border-t border-hair py-2 text-left text-[12.5px]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={org.name} initials={initials(org.name)} size={22} />
              <span className={cx('truncate', selected?.id === org.id && 'font-medium')}>{org.name}</span>
            </span>
            {selected?.id === org.id ? (
              <Chip tone="vio">Selected</Chip>
            ) : (
              <span className="text-sec">{orgTypeChip(org.type)}</span>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <>
          <Divider />
          <Eyebrow className="mb-[6px]">{orgTypeChip(role)} details for this event</Eyebrow>

          <Field label="Role on this event" htmlFor="party-role">
            <Select id="party-role" value={role} onChange={(e) => setRole(e.target.value as OrgType)}>
              {ORG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-x-[10px] sm:grid-cols-2">
            <Field label="Gives" htmlFor="party-gives">
              <Input id="party-gives" value={gives} onChange={(e) => setGives(e.target.value)} placeholder="What they bring" />
            </Field>
            <Field label="Gets" htmlFor="party-gets">
              <Input id="party-gets" value={gets} onChange={(e) => setGets(e.target.value)} placeholder="What they get back" />
            </Field>
            {profileFields(role).map((field) => (
              <Field key={field.key} label={field.label} htmlFor={`pp-${field.key}`}>
                <Input
                  id={`pp-${field.key}`}
                  value={profile[field.key] ?? ''}
                  onChange={(e) => setProfile((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                />
              </Field>
            ))}
            <Field label="Goal" htmlFor="party-goal">
              <Input id="party-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What a good day looks like for them" />
            </Field>
          </div>

          <Label>Everything here stays editable on the party card.</Label>
        </>
      )}

      <div className="mt-2 flex items-center gap-3">
        <Button
          disabled={!selected}
          onClick={() =>
            selected &&
            onAdd({
              orgId: selected.id,
              roleOnEvent: role,
              terms: { gives: gives.trim(), gets: gets.trim() },
              goal: goal.trim(),
              cta: '',
              profile,
              customFields: [],
            })
          }
        >
          Add to event
        </Button>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
      </div>
    </Modal>
  )
}
