import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Check, ExternalLink } from 'lucide-react'
import { BackLink, Page } from './Page'
import { useAsync, useMutation } from '../useApi'
import { Field, InlineText } from '../../ui/form'
import {
  Avatar, Card, Chip, Divider, ErrorState, Eyebrow, KV, Loading, OutlineButton, PageTitle, Sub, SubTitle,
} from '../../ui/primitives'
import { initials } from '../../data/profiles'
import { track } from '../../lib/analytics'
import type { Person, Registration } from '../../data/types'

// Everything above the "Your notes" card is derived by the importer and is
// read only here: editing it would be silently undone on the next import.
// Notes, follow-up, and tags are the host's own and are the only writes.

const STATUS_LABELS: Record<Registration['status'], string> = {
  approved: 'Signed up',
  invited: 'Invited',
  declined: 'Declined',
}

const TIER_LABELS: Record<Person['tier'], string> = {
  signed_up: 'Signed up for at least one',
  invited_only: 'Invited, never registered',
  declined_only: 'Declined',
}

function longDate(iso: string): string {
  if (!iso) return 'No date'
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

/** Two days out, the same default the capture form uses. */
function defaultFollowUpDue(): string {
  const due = new Date()
  due.setDate(due.getDate() + 2)
  return due.toISOString().slice(0, 10)
}

function RegistrationCard({ registration }: { registration: Registration }) {
  const answers = Object.entries(registration.answers)
  return (
    <Card className="py-[10px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SubTitle className="text-[13px]">{registration.eventKey}</SubTitle>
        <Chip tone={registration.status === 'approved' ? 'vio' : 'gray'}>
          {STATUS_LABELS[registration.status]}
        </Chip>
      </div>
      <Sub>Registered {longDate(registration.registeredAt)}</Sub>

      {registration.source && <KV label="Came from">{registration.source}</KV>}
      {registration.surveyRating !== null && (
        <KV label="Rated">
          {registration.surveyRating} out of 5
          {registration.surveyFeedback ? `, "${registration.surveyFeedback}"` : ''}
        </KV>
      )}

      {answers.length > 0 && (
        <>
          <Divider className="my-[8px]" />
          <Eyebrow>What they told you</Eyebrow>
          {answers.map(([question, answer]) => (
            <KV key={question} label={question} labelWidth="min-w-[180px]">
              {answer}
            </KV>
          ))}
        </>
      )}
    </Card>
  )
}

export default function PersonDetailPage() {
  const { personId = '' } = useParams()
  const { data, error, loading, reload } = useAsync((api) => api.getPerson(personId), [personId])
  const { mutate, busy } = useMutation(reload)

  useEffect(() => {
    if (data) track('hp_person_viewed', { eventCount: data.eventCount, tier: data.tier })
  }, [data])

  if (loading) return <Page><Loading label="Loading person" /></Page>
  if (error) return <Page><ErrorState message={`This didn't load (${error}).`} onRetry={reload} /></Page>
  if (!data) return <Page><ErrorState message="No one by that id." /></Page>

  const person = data
  const history = [...person.registrations].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))

  return (
    <Page>
      <BackLink to="/app/people">People</BackLink>

      <div className="mb-4 flex items-center gap-3">
        <Avatar name={person.fullName} initials={initials(person.fullName || person.email)} size={40} />
        <div className="min-w-0">
          <PageTitle className="truncate text-[19px]">{person.fullName || person.email}</PageTitle>
          <Sub className="truncate">{person.email}</Sub>
        </div>
      </div>

      <Card className="mb-3">
        <Eyebrow>Who they are</Eyebrow>
        <KV label="Status">{TIER_LABELS[person.tier]}</KV>
        <KV label="Signed up for">
          {person.eventCount === 0
            ? 'Nothing yet'
            : person.eventCount === 1
              ? '1 event'
              : `${person.eventCount} events`}
        </KV>
        <KV label="First seen">{longDate(person.firstSeenAt)}</KV>
        <KV label="Last seen">{longDate(person.lastSeenAt)}</KV>
        {person.sources.length > 0 && <KV label="Came from">{person.sources.join(', ')}</KV>}
        {person.referredBy.length > 0 && <KV label="Referred by">{person.referredBy.join(', ')}</KV>}
        {person.handles.linkedin && (
          <KV label="LinkedIn">
            <a
              href={person.handles.linkedin.startsWith('http') ? person.handles.linkedin : `https://${person.handles.linkedin}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-[4px] text-vio transition hover:opacity-70"
            >
              {person.handles.linkedin}
              <ExternalLink size={12} />
            </a>
          </KV>
        )}
        {person.handles.instagram && <KV label="Instagram">{person.handles.instagram}</KV>}
        <KV label="In the app">
          {person.appUserUid ? (
            <span className="inline-flex items-center gap-[4px] text-vio">
              <Check size={13} />
              Matched to an account
            </span>
          ) : (
            'Not yet'
          )}
        </KV>
      </Card>

      <Card className="mb-3">
        <Eyebrow>Your notes</Eyebrow>
        <Sub className="mb-2">Only you see this. Imports never overwrite it.</Sub>

        <Field label="Notes">
          <InlineText
            value={person.notes}
            ariaLabel="Notes about this person"
            placeholder="Anything worth remembering"
            multiline
            onCommit={(notes) => {
              void mutate((api) => api.updatePerson(person.id, { notes }))
              track('hp_person_note_saved')
            }}
          />
        </Field>

        <Field label="Tags" hint="Separate with commas.">
          <InlineText
            value={person.tags.join(', ')}
            ariaLabel="Tags for this person"
            placeholder="photographer, investor"
            onCommit={(raw) =>
              void mutate((api) =>
                api.updatePerson(person.id, {
                  tags: raw.split(',').map((t) => t.trim()).filter(Boolean),
                }),
              )
            }
          />
        </Field>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {person.followUp ? (
            <>
              <Chip tone={person.followUp.done ? 'gray' : 'vio'}>
                {person.followUp.done ? 'Followed up' : `Follow up by ${person.followUp.due}`}
              </Chip>
              <OutlineButton
                disabled={busy}
                onClick={() =>
                  void mutate((api) =>
                    api.updatePerson(person.id, {
                      followUp: person.followUp ? { ...person.followUp, done: !person.followUp.done } : null,
                    }),
                  )
                }
              >
                {person.followUp.done ? 'Reopen' : 'Mark done'}
              </OutlineButton>
            </>
          ) : (
            <OutlineButton
              disabled={busy}
              onClick={() =>
                void mutate((api) =>
                  api.updatePerson(person.id, { followUp: { due: defaultFollowUpDue(), done: false } }),
                )
              }
            >
              Add a follow up
            </OutlineButton>
          )}
        </div>
      </Card>

      <Eyebrow>History</Eyebrow>
      <Sub className="mb-2">
        Every event they signed up for, were invited to, or turned down.
      </Sub>
      <div className="grid gap-[6px]">
        {history.map((registration) => (
          <RegistrationCard key={registration.eventKey} registration={registration} />
        ))}
      </div>
    </Page>
  )
}
