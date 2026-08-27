import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AtSign, Check, Link2, Mail, Phone, Plus } from 'lucide-react'
import { useAsync, useMutation } from '../useApi'
import { useHost } from '../AuthProvider'
import {
  Avatar, Button, Card, Chip, Eyebrow, GhostButton, Loading, QuietButton, SubTitle, cx,
} from '../../ui/primitives'
import { Field, Input, Textarea } from '../../ui/form'
import { Modal } from '../../ui/Modal'
import type { CapturedContact, EventDoc } from '../../data/types'
import { addDays, formatDue, toDateKey } from '../../lib/dates'
import { initials } from '../../data/profiles'
import { track } from '../../lib/analytics'

// Split template: follow-ups queue on the left, the person on the right,
// worked like an inbox. Every capture at an event also counts as verified
// presence on that event's recap (F11).

function handleLink(kind: keyof CapturedContact['handles'], value: string): string {
  if (kind === 'instagram') return `https://instagram.com/${value.replace(/^@/, '')}`
  if (kind === 'linkedin') return value.startsWith('http') ? value : `https://${value}`
  if (kind === 'phone') return `sms:${value.replace(/[^\d+]/g, '')}`
  return `mailto:${value}`
}

const HANDLE_META = {
  instagram: { icon: AtSign, label: 'Instagram' },
  linkedin: { icon: Link2, label: 'LinkedIn' },
  phone: { icon: Phone, label: 'Text' },
  email: { icon: Mail, label: 'Email' },
} as const

export default function CapturePage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const { data, loading, reload } = useAsync(async (api) => {
    const [contacts, events] = await Promise.all([api.listContacts(), api.listEvents()])
    return { contacts, events }
  }, [])

  const contacts = data?.contacts ?? []
  const selected = contacts.find((c) => c.id === selectedId) ?? contacts[0] ?? null

  // Keep a selection alive across refetches without fighting the user.
  useEffect(() => {
    if (!selectedId && contacts.length > 0) setSelectedId(contacts[0].id)
  }, [contacts, selectedId])

  const open = contacts.filter((c) => c.followUp && !c.followUp.done)
  const done = contacts.filter((c) => !c.followUp || c.followUp.done)

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="hairline w-full shrink-0 border-0 border-b border-line bg-well px-[10px] py-[14px] lg:w-52 lg:border-b-0 lg:border-r">
        <div className="mb-2 flex items-center justify-between px-1">
          <Eyebrow>Follow ups</Eyebrow>
          <button
            onClick={() => setAdding(true)}
            aria-label="Add a capture"
            className="text-vio transition hover:opacity-70"
          >
            <Plus size={15} />
          </button>
        </div>

        {loading && <Loading label="Loading" />}

        {open.map((contact) => (
          <ContactRow
            key={contact.id}
            contact={contact}
            active={selected?.id === contact.id}
            onSelect={() => setSelectedId(contact.id)}
          />
        ))}

        {open.length === 0 && !loading && (
          <p className="px-2 py-3 text-[11.5px] text-mut">Nothing waiting on you.</p>
        )}

        {done.length > 0 && (
          <>
            <div className="mx-1 my-2 border-t border-hair" />
            <Eyebrow className="mb-[6px] px-1">Done</Eyebrow>
            {done.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                active={selected?.id === contact.id}
                onSelect={() => setSelectedId(contact.id)}
                muted
              />
            ))}
          </>
        )}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-4 sm:px-[18px]">
        {selected ? (
          <ContactDetail
            key={selected.id}
            contact={selected}
            events={data?.events ?? []}
            onChanged={reload}
          />
        ) : (
          !loading && (
            <Card className="text-center">
              <SubTitle className="mb-1">No one captured yet</SubTitle>
              <p className="text-[13px] text-sec">
                Add someone you met and a note about why. It takes about twenty seconds.
              </p>
              <div className="mt-4 flex justify-center">
                <Button onClick={() => setAdding(true)}>
                  <Plus size={13} />
                  Add a capture
                </Button>
              </div>
            </Card>
          )
        )}
      </main>

      {adding && (
        <QuickAdd
          events={data?.events ?? []}
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setSelectedId(id)
            reload()
          }}
        />
      )}
    </div>
  )
}

function ContactRow({
  contact,
  active,
  onSelect,
  muted,
}: {
  contact: CapturedContact
  active: boolean
  onSelect: () => void
  muted?: boolean
}) {
  const due = contact.followUp && !contact.followUp.done ? formatDue(contact.followUp.due) : null
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        'mb-[6px] block w-full rounded-[9px] px-[10px] py-2 text-left transition',
        active ? 'hairline border-[#dad5ec] bg-surface' : 'hover:bg-surface/60',
      )}
    >
      <span className={cx('block truncate text-xs font-medium', muted ? 'text-mut' : 'text-ink')}>
        {contact.name}
      </span>
      {due && <span className="mt-[2px] block text-[11px] text-vio">{due}</span>}
    </button>
  )
}

function ContactDetail({
  contact,
  events,
  onChanged,
}: {
  contact: CapturedContact
  events: EventDoc[]
  onChanged: () => void
}) {
  const { mutate, busy } = useMutation(onChanged)
  const event = events.find((e) => e.id === contact.eventId)
  const openFollowUp = contact.followUp && !contact.followUp.done

  const markDone = () =>
    void mutate(async (api) => {
      await api.updateContact(contact.id, {
        followUp: contact.followUp ? { ...contact.followUp, done: true } : null,
      })
      track('hp_followup_done', { eventId: contact.eventId })
    })

  const snooze = () =>
    void mutate((api) =>
      api.updateContact(contact.id, {
        followUp: { due: toDateKey(addDays(new Date(), 3)), done: false },
      }),
    )

  const handles = Object.entries(contact.handles).filter(([, value]) => Boolean(value)) as [
    keyof CapturedContact['handles'],
    string,
  ][]

  return (
    <>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-[10px]">
          <Avatar name={contact.name} initials={initials(contact.name)} size={38} />
          <div className="min-w-0">
            <SubTitle>{contact.name}</SubTitle>
            <p className="text-xs text-sec">
              {event ? `Met at ${event.title}` : 'Met outside an event'}
            </p>
          </div>
        </div>
        {openFollowUp && contact.followUp && (
          <Chip tone="vio">Follow up {formatDue(contact.followUp.due).toLowerCase()}</Chip>
        )}
      </div>

      {handles.length > 0 && (
        <div className="my-3 flex flex-wrap gap-[6px]">
          {handles.map(([kind, value]) => {
            const { icon: Icon, label } = HANDLE_META[kind]
            return (
              <a
                key={kind}
                href={handleLink(kind, value)}
                target="_blank"
                rel="noreferrer"
                className="hairline inline-flex items-center gap-[6px] rounded-[9px] border-[#dad5ec] bg-surface px-[11px] py-[5px] text-xs font-medium transition hover:border-viodash"
              >
                <Icon size={13} className="text-vio" />
                {kind === 'instagram' ? value : label}
              </a>
            )
          })}
        </div>
      )}

      <Card className="mb-3">
        <Eyebrow className="mb-[5px]">Note from the event</Eyebrow>
        <p className="text-[13px] leading-[1.55]">
          {contact.note || <span className="text-mut">No note.</span>}
        </p>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {openFollowUp && (
          <>
            <Button onClick={markDone} disabled={busy}>
              <Check size={13} />
              Mark followed up
            </Button>
            <GhostButton onClick={snooze} disabled={busy}>
              Snooze three days
            </GhostButton>
          </>
        )}
        {event && event.status !== 'wrapped' && (
          <Link to={`/app/events/${event.id}`}>
            <QuietButton>Open {event.title}</QuietButton>
          </Link>
        )}
      </div>
    </>
  )
}

function QuickAdd({
  events,
  onClose,
  onSaved,
}: {
  events: EventDoc[]
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const host = useHost()
  // Where met defaults to the most recent live or upcoming event, changeable.
  const defaultEvent = events.find((e) => e.status !== 'wrapped') ?? events[0]

  const [name, setName] = useState('')
  const [eventId, setEventId] = useState(defaultEvent?.id ?? '')
  const [note, setNote] = useState('')
  const [instagram, setInstagram] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [followUp, setFollowUp] = useState(true)
  const [showHandles, setShowHandles] = useState(false)
  const { mutate, busy, error } = useMutation()

  const save = () => {
    if (!name.trim()) return
    void mutate(async (api) => {
      const id = await api.createContact(
        {
          name: name.trim(),
          handles: {
            ...(instagram.trim() && { instagram: instagram.trim() }),
            ...(linkedin.trim() && { linkedin: linkedin.trim() }),
            ...(phone.trim() && { phone: phone.trim() }),
            ...(email.trim() && { email: email.trim() }),
          },
          eventId: eventId || null,
          note: note.trim(),
          // M1 fields, empty until the quote field and the recorder land.
          quote: '',
          voiceNote: null,
          followUp: followUp ? { due: toDateKey(addDays(new Date(), 2)), done: false } : null,
        },
        host.uid,
      )
      track('hp_capture_created', { eventId: eventId || null })
      onSaved(id)
      onClose()
    })
  }

  return (
    <Modal title="Who did you meet?" onClose={onClose} width="max-w-[420px]">
      <Field label="Name" htmlFor="capture-name">
        <Input
          id="capture-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First name is enough"
          autoFocus
        />
      </Field>

      {events.length > 0 && (
        <Field label="Where you met" htmlFor="capture-event">
          <select
            id="capture-event"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="hairline w-full rounded-lg border-[#dad5ec] bg-surface px-[11px] py-2 text-[13px] outline-none focus:ring-focus"
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
            <option value="">Somewhere else</option>
          </select>
        </Field>
      )}

      <Field label="Note" htmlFor="capture-note">
        <Textarea
          id="capture-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why you want to remember them"
        />
      </Field>

      {showHandles ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Instagram" aria-label="Instagram" />
          <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="LinkedIn URL" aria-label="LinkedIn" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" aria-label="Phone" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" type="email" />
        </div>
      ) : (
        <QuietButton onClick={() => setShowHandles(true)}>
          <Plus size={12} />
          Add a handle
        </QuietButton>
      )}

      <label className="mt-3 flex items-center gap-2 text-[12.5px]">
        <input
          type="checkbox"
          checked={followUp}
          onChange={(e) => setFollowUp(e.target.checked)}
          className="size-[15px] accent-[#4f3bc9]"
        />
        Remind me to follow up in two days
      </label>

      {error && <p className="mt-2 text-[12px] text-rosek">Saving didn't work ({error}).</p>}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={busy || !name.trim()}>
          {busy ? 'Saving' : 'Save'}
        </Button>
        <GhostButton onClick={onClose} disabled={busy}>
          Cancel
        </GhostButton>
      </div>
    </Modal>
  )
}
