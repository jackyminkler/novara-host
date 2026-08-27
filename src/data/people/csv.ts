/**
 * RFC 4180 CSV reader.
 *
 * Not optional here: a Luma export can have column *names* containing commas
 * and newlines (a question wrapping across two lines inside its quotes), so
 * splitting on commas corrupts both the header and every row after it.
 *
 * Lives under src so the seed importer and the in-app importer parse the same
 * way. It was `seed/csv.ts` first; two copies of a parser this fussy would
 * disagree the first time one of them was fixed. Pure, no imports at all, so
 * the seed scripts can load it directly under Node's type stripping.
 */

/** Parse a whole CSV into rows of raw cells. Handles "" escapes and quoted newlines. */
export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM: Luma exports carry one, and it would otherwise ride
  // along on the first header name and break every lookup of "guest_id".
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (quoted) {
      if (ch !== '"') { cell += ch; continue }
      // A doubled quote is a literal quote; a lone one closes the field.
      if (text[i + 1] === '"') { cell += '"'; i++ } else { quoted = false }
      continue
    }

    if (ch === '"') { quoted = true; continue }
    if (ch === ',') { row.push(cell); cell = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
    cell += ch
  }

  // A file with no trailing newline still has one row left in hand.
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

export type CsvRow = Record<string, string>

/**
 * Parse into keyed records. Header names are whitespace-collapsed, because a
 * question that wrapped across lines in the export would otherwise become a
 * Firestore map key with a newline inside it.
 */
export function parseCsvRecords(text: string): { headers: string[]; rows: CsvRow[] } {
  const raw = parseCsv(text)
  if (!raw.length) return { headers: [], rows: [] }

  const headers = raw[0].map((h) => h.replace(/\s+/g, ' ').trim())
  const rows = raw.slice(1)
    // Trailing blank lines parse to a single empty cell; drop them.
    .filter((cells) => cells.some((c) => c.trim() !== ''))
    .map((cells) => {
      const rec: CsvRow = {}
      headers.forEach((h, i) => { rec[h] = (cells[i] ?? '').trim() })
      return rec
    })

  return { headers, rows }
}
