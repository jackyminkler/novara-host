import { useMemo, useState } from 'react'
import { useAsync, useMutation } from '../useApi'
import { useHost } from '../AuthProvider'
import { Modal } from '../../ui/Modal'
import { Button, Chip, Eyebrow, GhostButton, Loading, Sub } from '../../ui/primitives'
import { Field, Input, Select, Textarea } from '../../ui/form'
import { parseCsvRecords, type CsvRow } from '../../data/people/csv'
import { mergeRows, normalizeEmail, type ImportSummary } from '../../data/people/merge'
import { toDateKey } from '../../lib/dates'
import { track } from '../../lib/analytics'
import type { EventDoc } from '../../data/types'

// CRM-3, the in-app half of the importer. The other half is
// `seed/import-luma-guests.ts`, and the two share `src/data/people/csv.ts` and
// `src/data/people/merge.ts` rather than each holding a version of the rules.
//
// The preview is the same merge the import runs, dry, against the same list.
// Anything else would be a second implementation of "what will this change",
// and the number a host trusts before pressing the button would eventually
// stop matching what the button did.
//
// One dialog, two doors: the people page, where the event has to be named, and
// an event workspace, where it is already known.

/** How many parsed rows to show before importing. Enough to spot a bad file. */
const PREVIEW_ROWS = 8

/**
 * The slug an event's guest list is stored under. Dated first so keys sort as
 * dates, and derived from the confirmed option or, failing that, the first one
 * proposed.
 */
export function suggestedEventKey(event: EventDoc, today = new Date()): string {
  const option =
    event.dateOptions.find((o) => o.id === event.confirmedDateOptionId) ?? event.dateOptions[0]
  const day = toDateKey(option ? new Date(option.startsAt) : today)
  const title = event.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return title ? `${day}-${title}` : day
}

/** "1 new person", "12 new people". The count a host reads first. */
function addedLabel(count: number): string {
  return count === 1 ? '1 new person' : `${count.toLocaleString()} new people`
}

function summaryLine(summary: ImportSummary): string {
  return `${addedLabel(summary.added)}, ${summary.updated.toLocaleString()} updated, ${summary.unchanged.toLocaleString()} unchanged.`
}

export default function ImportGuestsDialog({
  event,
  events,
  onClose,
  onImported,
}: {
  /** Set when the dialog opens from an event workspace. */
  event?: EventDoc
  /** Every event, for the picker. Only read when `event` is not set. */
  events: EventDoc[]
  onClose: () => void
  onImported: () => void
}) {
  const host = useHost()
  // The list the preview merges against. Read here rather than passed in, so
  // both doors open the same way and a page that never imports never pays.
  const { data: people, loading } = useAsync((api) => api.listPeople(), [])
  const { mutate, busy, error } = useMutation()

  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [eventKey, setEventKey] = useState(
    event ? event.sourceKey ?? suggestedEventKey(event) : '',
  )
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const keyed = events.filter((e) => e.sourceKey)

  const parsed = useMemo(() => {
    if (!text.trim()) return null
    const { headers, rows } = parseCsvRecords(text)
    if (!headers.includes('email')) return { headers, rows: [] as CsvRow[], skipped: 0, noEmailColumn: true }
    // A row with no email cannot be folded in, because email is the dedupe
    // key. Skipping is kinder than refusing the file: one blank cell in a
    // thousand rows should not cost the other 999.
    const usable = rows.filter((row) => normalizeEmail(row.email ?? ''))
    return { headers, rows: usable, skipped: rows.length - usable.length, noEmailColumn: false }
  }, [text])

  const preview = useMemo(() => {
    if (!parsed || !people || !eventKey.trim() || parsed.rows.length === 0) return null
    // Ids are stripped exactly as both implementations strip them, so the
    // unchanged count here is the unchanged count the import will report.
    const existing = people.map(({ id: _id, ...rest }) => rest)
    return mergeRows(existing, parsed.rows, eventKey.trim(), null, host.uid).summary
  }, [parsed, people, eventKey, host.uid])

  const pickFile = (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    void file.text().then(setText)
  }

  const runImport = () => {
    if (!parsed || parsed.rows.length === 0 || !eventKey.trim()) return
    const key = eventKey.trim()
    void mutate(async (api) => {
      const result = await api.importPeople(parsed.rows, key, host.uid)
      // An event that had no key now has one, so the recap and every later
      // import of the same list land on the same slug without being retyped.
      if (event && !event.sourceKey) await api.updateEvent(event.id, { sourceKey: key })
      track('hp_csv_import_completed', { added: result.added, updated: result.updated })
      setSummary(result)
      onImported()
    })
  }

  if (summary) {
    return (
      <Modal title="Import guests" onClose={onClose} width="max-w-[460px]">
        <p className="text-[13px]">{summaryLine(summary)}</p>
        <Sub className="mb-4">
          They are on the people list now, under {eventKey.trim()}. Importing the same file again
          changes nothing.
        </Sub>
        <Button onClick={onClose}>Done</Button>
      </Modal>
    )
  }

  return (
    <Modal title="Import guests" onClose={onClose} width="max-w-[480px]">
      {event ? (
        <Field
          label="Event key"
          htmlFor="import-key"
          hint={
            event.sourceKey
              ? 'The key this event already stores its list under.'
              : 'Suggested from the date and the title. It joins the same person across events, so keep it stable.'
          }
        >
          <Input
            id="import-key"
            value={eventKey}
            onChange={(e) => setEventKey(e.target.value)}
            disabled={Boolean(event.sourceKey)}
          />
        </Field>
      ) : (
        <>
          {keyed.length > 0 && (
            <Field label="Event" htmlFor="import-event" hint="Or type a key below.">
              <Select
                id="import-event"
                value={keyed.some((e) => e.sourceKey === eventKey) ? eventKey : ''}
                onChange={(e) => setEventKey(e.target.value)}
              >
                <option value="">Pick an event</option>
                {keyed.map((e) => (
                  <option key={e.id} value={e.sourceKey as string}>
                    {e.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label="Event key"
            htmlFor="import-key"
            hint="The slug this list is stored under. It joins the same person across events, so keep it stable."
          >
            <Input
              id="import-key"
              value={eventKey}
              onChange={(e) => setEventKey(e.target.value)}
              placeholder="2026-09-12-sunrise-run"
            />
          </Field>
        </>
      )}

      <Field
        label="Guest export"
        htmlFor="import-csv"
        hint="Paste the CSV your listing page gave you, or pick the file."
        aside={
          <label className="cursor-pointer text-[12.5px] font-medium text-vio transition hover:opacity-70">
            {fileName || 'Choose a file'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </label>
        }
      >
        <Textarea
          id="import-csv"
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setFileName('')
          }}
          placeholder="guest_id,name,email,approval_status"
          className="font-mono !text-[11.5px]"
        />
      </Field>

      {loading && <Loading label="Reading your people list" />}

      {parsed?.noEmailColumn && (
        <p className="mb-2 text-[12px] text-rosek">
          This file has no email column. Export it again with emails included, since email is how
          the same person is matched across events.
        </p>
      )}

      {parsed && !parsed.noEmailColumn && parsed.rows.length === 0 && (
        <p className="mb-2 text-[12px] text-mut">No rows with an email address in that file.</p>
      )}

      {parsed && parsed.rows.length > 0 && (
        <div className="mb-3">
          <Eyebrow className="mb-[5px]">Before you import</Eyebrow>
          {preview ? (
            <p className="text-[13px]">{summaryLine(preview)}</p>
          ) : (
            <p className="text-[12.5px] text-mut">Name the event to see what this changes.</p>
          )}
          {parsed.skipped > 0 && (
            <p className="mt-1 text-[11.5px] text-mut">
              {parsed.skipped === 1 ? '1 row has' : `${parsed.skipped} rows have`} no email address
              and will be skipped.
            </p>
          )}

          <div className="mt-2 grid gap-[3px]">
            {parsed.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
              <div
                key={`${row.email}-${i}`}
                className="flex items-center justify-between gap-2 text-[11.5px]"
              >
                <span className="min-w-0 flex-1 truncate">{row.name || row.email}</span>
                <span className="hidden min-w-0 flex-1 truncate text-mut sm:block">{row.email}</span>
                <Chip tone={row.approval_status === 'approved' ? 'grn' : 'gray'}>
                  {row.approval_status || 'invited'}
                </Chip>
              </div>
            ))}
          </div>
          {parsed.rows.length > PREVIEW_ROWS && (
            <p className="mt-1 text-[11.5px] text-mut">
              And {(parsed.rows.length - PREVIEW_ROWS).toLocaleString()} more.
            </p>
          )}
        </div>
      )}

      {error && <p className="mb-2 text-[12px] text-rosek">That didn't import ({error}).</p>}

      <div className="flex items-center gap-3">
        <Button onClick={runImport} disabled={busy || !preview}>
          {busy ? 'Importing' : 'Import'}
        </Button>
        <GhostButton onClick={onClose} disabled={busy}>
          Cancel
        </GhostButton>
      </div>
    </Modal>
  )
}
