import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { BackLink, FocusColumn } from '../pages/Page'
import { useAsync, useMutation } from '../useApi'
import {
  Button, Card, Chip, ErrorState, Eyebrow, GhostButton, Loading, PageTitle, QuietButton, Sub,
} from '../../ui/primitives'
import { Field, Input, Label } from '../../ui/form'
import type { EventRecap, Outcome, Party } from '../../data/types'

// The ten minute input that generates every party's recap: headcount,
// remembered attendees, and outcomes per party against their goal.
//
// Attendance is corroborated, never gated. Host headcount is the baseline,
// captures at the event count as verified presence, and remembered names top
// it up. There is no check-in of any kind, and there never will be.

export default function RecapEditorPage() {
  const { eventId = '' } = useParams()

  const { data, error, loading, reload } = useAsync(
    async (api) => {
      const bundle = await api.getEventBundle(eventId)
      if (!bundle) return null
      const contacts = await api.listContacts()
      return { bundle, verified: contacts.filter((c) => c.eventId === eventId).length }
    },
    [eventId],
  )

  if (loading) return <FocusColumn><Loading label="Loading the recap" /></FocusColumn>
  if (error || !data) {
    return (
      <FocusColumn>
        <ErrorState message={`The recap didn't load (${error ?? 'unknown'}).`} onRetry={reload} />
      </FocusColumn>
    )
  }

  return (
    <FocusColumn width="max-w-[480px]">
      <BackLink to={`/app/events/${eventId}`}>{data.bundle.event.title}</BackLink>
      <RecapForm
        key={data.bundle.event.id}
        eventId={eventId}
        title={data.bundle.event.title}
        signups={data.bundle.event.signupCount}
        verified={data.verified}
        initial={data.bundle.event.recap}
        parties={data.bundle.parties}
        orgs={data.bundle.orgs}
        onSaved={reload}
      />
    </FocusColumn>
  )
}

function RecapForm({
  eventId,
  title,
  signups,
  verified,
  initial,
  parties,
  orgs,
  onSaved,
}: {
  eventId: string
  title: string
  signups: number | null
  verified: number
  initial: EventRecap
  parties: Party[]
  orgs: { id: string; name: string }[]
  onSaved: () => void
}) {
  const [headcount, setHeadcount] = useState(initial.headcount?.toString() ?? '')
  const [remembered, setRemembered] = useState<string[]>(initial.remembered)
  const [nameDraft, setNameDraft] = useState('')
  const [photosLink, setPhotosLink] = useState(initial.photosLink)
  const [postsRan, setPostsRan] = useState(initial.postsRan)
  const [signupDraft, setSignupDraft] = useState(signups?.toString() ?? '')
  const { mutate, busy, error } = useMutation(onSaved)

  const addName = () => {
    const name = nameDraft.trim()
    if (!name || remembered.includes(name)) return
    setRemembered((prev) => [...prev, name])
    setNameDraft('')
  }

  const recap = (): EventRecap => ({
    headcount: headcount ? Number(headcount) : null,
    remembered,
    photosLink: photosLink.trim(),
    postsRan: postsRan.trim(),
    generatedAt: initial.generatedAt,
  })

  const save = () =>
    void mutate(async (api) => {
      await api.saveRecap(eventId, recap())
      await api.updateEvent(eventId, { signupCount: signupDraft ? Number(signupDraft) : null })
    })

  const generate = () =>
    void mutate(async (api) => {
      await api.saveRecap(eventId, recap())
      await api.updateEvent(eventId, { signupCount: signupDraft ? Number(signupDraft) : null })
      await api.generateRecaps(eventId)
    })

  return (
    <>
      <PageTitle className="text-lg">Recap, {title}</PageTitle>
      <Sub className="mb-3">
        {signups !== null ? `Signups ${signups} pulled in. ` : ''}
        Captures at the event: {verified} verified.
      </Sub>

      <Card className="mb-3">
        <div className="grid gap-x-[10px] sm:grid-cols-2">
          <Field label="Signups" htmlFor="recap-signups">
            <Input
              id="recap-signups"
              type="number"
              inputMode="numeric"
              value={signupDraft}
              onChange={(e) => setSignupDraft(e.target.value)}
              placeholder="From the listing"
            />
          </Field>
          <Field label="Attended, your count" htmlFor="recap-headcount">
            <Input
              id="recap-headcount"
              type="number"
              inputMode="numeric"
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
              placeholder="Your best count"
            />
          </Field>
        </div>

        <Label>Attendees you remember</Label>
        <div className="mb-[6px] flex flex-wrap gap-[6px]">
          {remembered.map((name) => (
            <Chip key={name} tone="gray">
              {name}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => setRemembered((prev) => prev.filter((n) => n !== name))}
              >
                <X size={10} />
              </button>
            </Chip>
          ))}
        </div>
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addName()}
          placeholder="Type a name and press enter"
          aria-label="Remembered attendee"
        />
        <p className="mt-1 text-[11px] text-mut">
          Nothing here gates anyone. Full guest list import arrives with lists in M1.
        </p>
      </Card>

      {parties.map((party) => (
        <PartyOutcomes
          key={party.id}
          party={party}
          orgName={orgs.find((o) => o.id === party.orgId)?.name ?? 'Partner'}
          eventId={eventId}
          onSaved={onSaved}
        />
      ))}

      <Card className="mb-3">
        <Field label="Photos link" htmlFor="recap-photos">
          <Input
            id="recap-photos"
            value={photosLink}
            onChange={(e) => setPhotosLink(e.target.value)}
            placeholder="Album URL"
          />
        </Field>
        <Field label="Posts that ran" htmlFor="recap-posts">
          <Input
            id="recap-posts"
            value={postsRan}
            onChange={(e) => setPostsRan(e.target.value)}
            placeholder="Six across both accounts"
          />
        </Field>
      </Card>

      {error && <p className="mb-2 text-[12px] text-rosek">Saving didn't work ({error}).</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={generate} disabled={busy}>
          {busy ? 'Working' : 'Generate recaps'}
        </Button>
        <GhostButton onClick={save} disabled={busy}>
          Save without sharing
        </GhostButton>
        <span className="text-[13px] text-sec">One page per party, shared by link.</span>
      </div>

      {initial.generatedAt && (
        <p className="mt-2 text-[11px] text-mut">
          Recap links were generated. Copy them from the parties tab.
        </p>
      )}
    </>
  )
}

function PartyOutcomes({
  party,
  orgName,
  eventId,
  onSaved,
}: {
  party: Party
  orgName: string
  eventId: string
  onSaved: () => void
}) {
  const [outcomes, setOutcomes] = useState<Outcome[]>(party.outcomes)
  const { mutate } = useMutation(onSaved)

  const commit = (next: Outcome[]) => {
    setOutcomes(next)
    void mutate((api) => api.updateParty(eventId, party.id, { outcomes: next }))
  }

  const set = (id: string, key: 'label' | 'value', value: string) =>
    setOutcomes((prev) => prev.map((o) => (o.id === id ? { ...o, [key]: value } : o)))

  return (
    <Card className="mb-3">
      <Eyebrow className="mb-[6px]">
        {orgName}
        {party.goal && `, goal: ${party.goal}`}
      </Eyebrow>

      <div className="grid gap-x-[10px] sm:grid-cols-2">
        {outcomes.map((outcome) => (
          <div key={outcome.id} className="mb-[10px]">
            <Input
              value={outcome.label}
              onChange={(e) => set(outcome.id, 'label', e.target.value)}
              onBlur={() => commit(outcomes)}
              placeholder="What you measured"
              aria-label="Outcome name"
              className="mb-1 !text-xs"
            />
            <div className="flex gap-1">
              <Input
                value={outcome.value}
                onChange={(e) => set(outcome.id, 'value', e.target.value)}
                onBlur={() => commit(outcomes)}
                placeholder="How it went"
                aria-label="Outcome value"
              />
              <button
                type="button"
                aria-label="Remove outcome"
                onClick={() => commit(outcomes.filter((o) => o.id !== outcome.id))}
                className="shrink-0 text-mut transition hover:text-rosek"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {outcomes.length < 3 && (
        <QuietButton
          onClick={() =>
            commit([...outcomes, { id: `oc-${Date.now().toString(36)}`, label: '', value: '' }])
          }
        >
          <Plus size={11} />
          Add an outcome
        </QuietButton>
      )}
    </Card>
  )
}
