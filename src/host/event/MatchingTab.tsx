import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Users } from 'lucide-react'
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  Eyebrow,
  Loading,
  Sub,
  SubTitle,
  cx,
} from '../../ui/primitives'
import { Field, Select } from '../../ui/form'
import { useEvent } from './EventContext'
import { useAsync } from '../useApi'
import { getApi } from '../../data/api'
import { track } from '../../lib/analytics'
import { formatShort } from '../../lib/dates'
import { MATCHING_MODES, initials, matchingModeLabel } from '../../data/profiles'
import type { MatchingRun, TemplateMatching } from '../../data/types'
import {
  ENGINE_VERSION,
  RESULTS_BYTE_CAP,
  asRankResults,
  peopleToEngineRows,
  requiredColumnsPresent,
  resultsByteSize,
  runRank,
} from '../../lib/matching'
import type { RankResults } from '../../lib/matching'

/**
 * M-match-0. Pair up the people who signed up for this event.
 *
 * Rank runs here, in the browser, on the vendored `matchcore.js` (the decision
 * of 2026-08-24: one engine, no fork). Sparks and pods are Python-canonical
 * behind a service that is not deployed yet, so this tab tells the host what
 * their signup form needs and stops there.
 *
 * The three ways this comes up empty are three different problems and get
 * three different answers: no guest list linked, a linked list with nobody
 * approved on it, and a list whose signup form asked none of the matching
 * questions. A blank result for any of them would read as a broken feature.
 */
export default function MatchingTab() {
  const { bundle } = useEvent()
  const event = bundle.event
  const eventId = event.id

  const { data, error, loading, reload } = useAsync(
    async (api) => {
      const [runs, templates, people] = await Promise.all([
        api.listMatchingRuns(eventId),
        event.templateId ? api.listTemplates() : Promise.resolve([]),
        event.sourceKey ? api.listPeople() : Promise.resolve([]),
      ])
      return { runs, templates, people }
    },
    [eventId, event.templateId, event.sourceKey],
  )

  const [picked, setPicked] = useState<TemplateMatching['mode']>('rank')
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const people = data?.people ?? []
  const runs = data?.runs ?? []

  const template = useMemo(
    () => (event.templateId ? (data?.templates ?? []).find((t) => t.id === event.templateId) : undefined),
    [data?.templates, event.templateId],
  )
  const declared = template?.matching ?? null
  const mode = declared?.mode ?? picked

  const rows = useMemo(
    () => (event.sourceKey ? peopleToEngineRows(people, event.sourceKey) : []),
    [people, event.sourceKey],
  )
  const report = useMemo(() => requiredColumnsPresent(rows), [rows])

  const runMatching = async () => {
    setFailure(null)
    setRunning(true)
    track('hp_matching_run_started', { eventId, mode: 'rank' })
    try {
      const outcome = runRank(rows)
      if (resultsByteSize(outcome.results) > RESULTS_BYTE_CAP) {
        setFailure(
          'This run came out too big to store. Try it on a smaller list, or ask fewer questions on the form.',
        )
        return
      }
      const api = await getApi()
      const savedId = await api.saveMatchingRun(eventId, {
        mode: 'rank',
        profileName: declared?.profileName ?? '',
        engineVersion: ENGINE_VERSION,
        createdAt: new Date().toISOString(),
        peopleCount: outcome.peopleCount,
        matchedCount: outcome.matchedCount,
        results: outcome.results,
      })
      track('hp_matching_run_completed', {
        eventId,
        mode: 'rank',
        people: outcome.peopleCount,
        matched: outcome.matchedCount,
      })
      setOpenRunId(savedId)
      reload()
    } catch (err) {
      // The engine refuses rather than scoring nonsense, and what it refuses
      // over is worth reading: a pace column that mostly does not parse is the
      // difference between a real result and a page of identical fallbacks.
      const message = (err as { message?: string })?.message
      setFailure(message ?? 'That run did not finish.')
    } finally {
      setRunning(false)
    }
  }

  if (loading && !data) return <Loading label="Loading matching" />
  if (error) return <Card className="text-center text-[13px] text-sec">Matching did not load ({error}).</Card>

  const openRun = runs.find((r) => r.id === openRunId) ?? null

  return (
    <>
      <ModeLine declared={declared} picked={picked} onPick={setPicked} />

      {mode === 'rank' ? (
        <>
          {!event.sourceKey ? (
            <Guard
              title="No guest list on this event yet"
              body="Link guests first: import this event's signups on the overview tab, then matching has people to work with."
            />
          ) : rows.length === 0 ? (
            <Guard
              title="Nobody to match yet"
              body={`This event is stored under ${event.sourceKey}, and nobody on that list is signed up. Import the signups on the overview tab, then run it again.`}
            />
          ) : !report.scorable ? (
            <MissingQuestions
              title="This run's signup form didn't ask the matching questions, so rank can't score everyone. Here are the questions to add next time:"
              needs={report.missing}
            />
          ) : (
            <Card className="mb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <SubTitle>Pair up the guest list</SubTitle>
                  <Sub>
                    {rows.length} {rows.length === 1 ? 'person is' : 'people are'} signed up.
                    Everyone gets their three closest matches, scored on the answers both of them
                    gave.
                  </Sub>
                </div>
                <Button onClick={() => void runMatching()} disabled={running}>
                  <Play size={13} />
                  {running ? 'Running' : 'Run matching'}
                </Button>
              </div>

              {report.missing.length > 0 && (
                <>
                  <Divider />
                  <p className="text-[12.5px] text-sec">
                    Some of it will be skipped. This form did not ask about{' '}
                    {report.missing.map((n) => n.label.toLowerCase()).join(', ')}, so those parts
                    score nothing and the rest carries the weight. Worth adding next time:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {report.missing.map((need) => (
                      <li key={need.dimension} className="text-[12.5px] text-ink">
                        {need.question}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {failure && <p className="mt-3 text-[12.5px] text-rosek">{failure}</p>}
            </Card>
          )}
        </>
      ) : (
        <ServiceNotConnected mode={mode} declared={declared} />
      )}

      {runs.length > 0 && (
        <div className="mb-3">
          <Eyebrow className="mb-[6px]">Runs</Eyebrow>
          <Card className="!px-[18px] !py-[6px]">
            {runs.map((run, index) => (
              <RunRow
                key={run.id}
                run={run}
                open={run.id === openRunId}
                first={index === 0}
                onToggle={() => setOpenRunId(run.id === openRunId ? null : run.id)}
              />
            ))}
          </Card>
        </div>
      )}

      {openRun && <Results run={openRun} eventId={eventId} />}
    </>
  )
}

/** Where the mode came from: the event's template, or a choice made here. */
function ModeLine({
  declared,
  picked,
  onPick,
}: {
  declared: TemplateMatching | null
  picked: TemplateMatching['mode']
  onPick: (next: TemplateMatching['mode']) => void
}) {
  if (declared) {
    return (
      <Card tone="violet" className="mb-3">
        <p className="text-[13px] font-medium text-ink">
          {matchingModeLabel(declared.mode)}
          {declared.profileName ? `, profile ${declared.profileName}` : ''}, from your template.
        </p>
        {declared.requiredQuestions.length > 0 && (
          <Sub>
            Your template lists{' '}
            {declared.requiredQuestions.length === 1
              ? 'one signup question'
              : `${declared.requiredQuestions.length} signup questions`}{' '}
            this needs.
          </Sub>
        )}
      </Card>
    )
  }

  return (
    <Card className="mb-3">
      <Field
        label="How this event pairs people up"
        htmlFor="matching-mode"
        hint="Set this on a template and every event made from it starts here instead."
      >
        <Select
          id="matching-mode"
          value={picked}
          onChange={(e) => onPick(e.target.value as TemplateMatching['mode'])}
          className="!w-[220px]"
        >
          {MATCHING_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {matchingModeLabel(option.value)}
            </option>
          ))}
        </Select>
      </Field>
    </Card>
  )
}

function Guard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="mb-3">
      <div className="flex items-start gap-3">
        <Users size={16} className="mt-[2px] shrink-0 text-mut" />
        <div>
          <SubTitle className="!text-[14px]">{title}</SubTitle>
          <Sub>{body}</Sub>
        </div>
      </div>
    </Card>
  )
}

/** The whole point of M-match-2, arriving early: the questions a run needs. */
function MissingQuestions({
  title,
  needs,
}: {
  title: string
  needs: { dimension: string; question: string }[]
}) {
  return (
    <Card tone="amber" className="mb-3">
      <p className="text-[13px] text-ink">{title}</p>
      <ul className="mt-2 space-y-[6px]">
        {needs.map((need) => (
          <li key={need.dimension} className="text-[12.5px] text-ink">
            {need.question}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-mut">
        Any one of them helps on its own. Rank scores what it has and leaves the rest out.
      </p>
    </Card>
  )
}

/** Sparks and pods, honestly: written down now, running when the service is up. */
function ServiceNotConnected({
  mode,
  declared,
}: {
  mode: TemplateMatching['mode']
  declared: TemplateMatching | null
}) {
  const label = matchingModeLabel(mode)
  return (
    <Card className="mb-3">
      <SubTitle>{label} runs on the matching service</SubTitle>
      <Sub>
        {label} needs the Python engine, which is not connected yet. It stays there on purpose:
        it is the most correctness critical code we have, and running one copy beats keeping two
        in step. Rank runs here today.
      </Sub>

      {declared && declared.requiredQuestions.length > 0 ? (
        <>
          <Divider />
          <Eyebrow className="mb-[6px]">Add these to the signup form</Eyebrow>
          <ul className="space-y-[6px]">
            {declared.requiredQuestions.map((question) => (
              <li key={question} className="text-[12.5px] text-ink">
                {question}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-mut">
            The answers have to exist before the run, so this is the part worth doing now. Without
            them {label.toLowerCase()} has nothing to score when the service arrives.
          </p>
        </>
      ) : (
        <p className="mt-3 text-[12px] text-mut">
          Put the questions this mode needs on a template, and they show up here as the list to add
          to your signup form.
        </p>
      )}
    </Card>
  )
}

function RunRow({
  run,
  open,
  first,
  onToggle,
}: {
  run: MatchingRun
  open: boolean
  first: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cx(
        'flex w-full flex-wrap items-center justify-between gap-2 py-[10px] text-left transition hover:opacity-80',
        !first && 'border-t border-hair',
      )}
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{formatShort(run.createdAt)}</p>
        <p className="text-[12px] text-sec">
          {run.peopleCount} {run.peopleCount === 1 ? 'person' : 'people'}, {run.matchedCount}{' '}
          matched
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Chip tone={open ? 'vio' : 'gray'}>{matchingModeLabel(run.mode)}</Chip>
        <span className="text-[12.5px] font-medium text-vio">{open ? 'Hide' : 'Open'}</span>
      </div>
    </button>
  )
}

function Results({ run, eventId }: { run: MatchingRun; eventId: string }) {
  const results = useMemo<RankResults | null>(() => asRankResults(run.results), [run.results])

  // Once per run opened, not once per render, so the count answers "was this
  // ever looked at" rather than "how often did React re-render".
  const seen = useRef<string | null>(null)
  useEffect(() => {
    if (results && seen.current !== run.id) {
      seen.current = run.id
      track('hp_matching_results_viewed', { eventId, mode: run.mode })
    }
  }, [results, run.id, run.mode, eventId])

  if (!results) {
    return (
      <Card className="mb-3">
        <Sub>
          This run was stored by a different engine and cannot be opened here. Run it again to see
          the matches.
        </Sub>
      </Card>
    )
  }

  const people = Object.entries(results)

  return (
    <div>
      <Eyebrow className="mb-[6px]">Matches, {formatShort(run.createdAt)}</Eyebrow>
      <p className="mb-3 text-[12.5px] text-sec">
        Everyone with their closest matches, best first. The score is how well two people fit
        across the questions they both answered, and the reasons only ever come from those
        answers.
      </p>

      {people.map(([id, person]) => (
        <Card key={id} className="mb-2">
          <div className="flex items-center gap-[9px]">
            <Avatar name={person.name} initials={initials(person.name)} size={26} />
            <p className="font-display text-[14px] font-semibold text-ink">{person.name}</p>
          </div>

          {person.matches.length === 0 ? (
            <p className="mt-2 pl-[35px] text-[12.5px] text-mut">
              No match yet. Nothing they answered lines up with anyone else on the list.
            </p>
          ) : (
            person.matches.map((match, index) => (
              <div
                key={`${match.email || match.name}-${index}`}
                className="mt-2 flex flex-wrap items-start justify-between gap-2 border-t border-hair pt-2 pl-[35px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{match.name}</p>
                  <div className="mt-[5px] flex flex-wrap gap-[5px]">
                    {match.why
                      .split(';')
                      .map((reason) => reason.trim())
                      .filter(Boolean)
                      .map((reason) => (
                        <Chip key={reason}>{reason}</Chip>
                      ))}
                  </div>
                </div>
                <Chip tone="vio" className="shrink-0">
                  {Math.round(match.total * 100)} percent
                </Chip>
              </div>
            ))
          )}
        </Card>
      ))}

      <p className="mt-3 text-[12px] text-mut">
        Scored by {run.engineVersion}. Results stay here with the event and are never on a guest
        page.
      </p>
    </div>
  )
}
