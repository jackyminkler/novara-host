import { useEffect, useState } from 'react'
import { Check, Copy, Printer, RotateCw } from 'lucide-react'
import { BackLink, FocusColumn } from './Page'
import { useAsync, useMutation } from '../useApi'
import { useHost } from '../AuthProvider'
import {
  Button, Card, ErrorState, Eyebrow, Loading, OutlineButton, PageTitle, QuietButton, Sub,
} from '../../ui/primitives'
import { Field, Input } from '../../ui/form'
import { track } from '../../lib/analytics'
import type { HostCard } from '../../data/types'

// The share card, M1. A host meets someone at their own event with a phone in
// one hand and a coffee in the other, and the exchange that actually works is
// "scan this". The card is a guest page like any other: a capability token
// with the `card` scope, served by the same two functions, no account at the
// other end.
//
// Two deliberate separations:
//
// 1. Saving the card never issues a link, and issuing a link never edits the
//    card. A link is a thing that gets printed on something; rotating one as a
//    side effect of fixing a typo would quietly kill a lanyard.
// 2. The QR encoder is loaded on demand rather than imported at the top. It is
//    the only page in the app that needs it, and the host bundle should not
//    carry an encoder for a page most sessions never open.

interface Draft {
  displayName: string
  headline: string
  instagram: string
  linkedin: string
  phone: string
  email: string
  other: string
}

function toDraft(card: HostCard | null, fallbackName: string): Draft {
  return {
    displayName: card?.displayName || fallbackName,
    headline: card?.headline ?? '',
    instagram: card?.methods.instagram ?? '',
    linkedin: card?.methods.linkedin ?? '',
    phone: card?.methods.phone ?? '',
    email: card?.methods.email ?? '',
    other: card?.methods.other ?? '',
  }
}

export default function HostCardPage() {
  const host = useHost()
  const { data, error, loading, reload } = useAsync((api) => api.getHostCard(host.uid), [host.uid])

  if (loading) {
    return (
      <FocusColumn>
        <Loading label="Loading your card" />
      </FocusColumn>
    )
  }

  if (error) {
    return (
      <FocusColumn>
        <ErrorState message={`Your card didn't load (${error}).`} onRetry={reload} />
      </FocusColumn>
    )
  }

  // Keyed on what came back, so the draft starts from saved values exactly
  // once rather than fighting the fields on every refetch.
  return <CardEditor key={data?.updatedAt ?? 'new'} card={data} onSaved={reload} />
}

function CardEditor({ card, onSaved }: { card: HostCard | null; onSaved: () => void }) {
  const host = useHost()
  const { mutate, busy, error } = useMutation(onSaved)
  const [draft, setDraft] = useState<Draft>(() => toDraft(card, host.displayName))
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState<string | null>(null)

  const url = card?.cardTokenId ? `${window.location.origin}/g/${card.cardTokenId}` : null

  useEffect(() => {
    if (!url) {
      setQr(null)
      return
    }
    let cancelled = false
    // Loaded here so the encoder never lands in the main host chunk.
    void import('qrcode')
      .then((qrcode) => qrcode.toDataURL(url, { width: 512, margin: 1 }))
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  const set = (key: keyof Draft) => (value: string) => setDraft((prev) => ({ ...prev, [key]: value }))

  const save = () =>
    void mutate(async (api) => {
      await api.saveHostCard(
        {
          displayName: draft.displayName.trim(),
          headline: draft.headline.trim(),
          // Blank fields drop out rather than saving as empty strings, so a
          // method the host cleared stops appearing on the card.
          methods: {
            ...(draft.instagram.trim() && { instagram: draft.instagram.trim() }),
            ...(draft.linkedin.trim() && { linkedin: draft.linkedin.trim() }),
            ...(draft.phone.trim() && { phone: draft.phone.trim() }),
            ...(draft.email.trim() && { email: draft.email.trim() }),
            ...(draft.other.trim() && { other: draft.other.trim() }),
          },
        },
        host.uid,
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })

  const issue = () => {
    if (url && !window.confirm('The old link stops working right away. Make a new one?')) return
    void mutate(async (api) => {
      await api.issueCardToken(host.uid)
      track('hp_card_link_created', { replaced: Boolean(url) })
    })
  }

  const copy = () => {
    if (!url) return
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      })
      .catch(() => setCopied(false))
  }

  const printable = [
    draft.instagram.trim() && `Instagram ${draft.instagram.trim()}`,
    draft.email.trim(),
    draft.phone.trim(),
  ].filter(Boolean) as string[]

  return (
    <>
      <FocusColumn width="max-w-[520px]">
        <div className="print-hide">
          <BackLink to="/app/capture">Capture</BackLink>
          <PageTitle className="text-[19px]">Your card</PageTitle>
          <Sub className="mb-4">
            One page you can hand to anyone you meet. They scan it, see how to reach you, and can
            leave their details back. No account at their end.
          </Sub>

          <Card className="mb-3">
            <Field label="Name" htmlFor="card-name">
              <Input
                id="card-name"
                value={draft.displayName}
                onChange={(e) => set('displayName')(e.target.value)}
                placeholder="What people call you"
              />
            </Field>
            <Field
              label="Headline"
              htmlFor="card-headline"
              hint="One line about what you run. This is the first thing they read."
            >
              <Input
                id="card-headline"
                value={draft.headline}
                onChange={(e) => set('headline')(e.target.value)}
                placeholder="I run mornings in the city. Come to the next one."
              />
            </Field>
          </Card>

          <Card className="mb-3">
            <Eyebrow className="mb-[10px]">How to reach you</Eyebrow>
            <div className="grid gap-[10px] sm:grid-cols-2">
              <Field label="Instagram" htmlFor="card-instagram" className="!mb-0">
                <Input
                  id="card-instagram"
                  value={draft.instagram}
                  onChange={(e) => set('instagram')(e.target.value)}
                  placeholder="@handle"
                />
              </Field>
              <Field label="LinkedIn" htmlFor="card-linkedin" className="!mb-0">
                <Input
                  id="card-linkedin"
                  value={draft.linkedin}
                  onChange={(e) => set('linkedin')(e.target.value)}
                  placeholder="linkedin.com/in/you"
                />
              </Field>
              <Field label="Phone" htmlFor="card-phone" className="!mb-0">
                <Input
                  id="card-phone"
                  value={draft.phone}
                  onChange={(e) => set('phone')(e.target.value)}
                  placeholder="Only if you want it out there"
                />
              </Field>
              <Field label="Email" htmlFor="card-email" className="!mb-0">
                <Input
                  id="card-email"
                  type="email"
                  value={draft.email}
                  onChange={(e) => set('email')(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
            </div>
            <Field
              label="Anything else"
              htmlFor="card-other"
              hint="A line that is not a link. Shown as it is written."
              className="!mb-0 mt-[10px]"
            >
              <Input
                id="card-other"
                value={draft.other}
                onChange={(e) => set('other')(e.target.value)}
                placeholder="Thursday list, ask me to add you"
              />
            </Field>
          </Card>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button onClick={save} disabled={busy || !draft.displayName.trim()}>
              {busy ? 'Saving' : saved ? 'Saved' : 'Save card'}
            </Button>
            {error && <span className="text-[12.5px] text-rosek">Saving didn't work ({error}).</span>}
          </div>

          <Card>
            <Eyebrow className="mb-[5px]">Your link</Eyebrow>
            {url ? (
              <>
                <p className="mb-[10px] break-all text-[12.5px] text-sec">{url}</p>
                {qr ? (
                  <img
                    src={qr}
                    alt="QR code for your card link"
                    width={148}
                    height={148}
                    className="hairline mb-[10px] rounded-[9px] border-line"
                  />
                ) : (
                  <p className="mb-[10px] text-[12px] text-mut">Drawing the code.</p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <OutlineButton onClick={copy}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied' : 'Copy link'}
                  </OutlineButton>
                  <OutlineButton onClick={() => window.print()} disabled={!qr}>
                    <Printer size={13} />
                    Print a card
                  </OutlineButton>
                  <QuietButton onClick={issue} disabled={busy}>
                    <RotateCw size={13} />
                    New link
                  </QuietButton>
                </div>
                <Sub className="text-[12px]">
                  A new link stops the old one working, including anything already printed.
                </Sub>
              </>
            ) : (
              <>
                <p className="mb-3 text-[13px] text-sec">
                  No link yet. Make one and you get a page and a code you can print.
                </p>
                <Button onClick={issue} disabled={busy || !card}>
                  Create link
                </Button>
                {!card && <Sub className="text-[12px]">Save your card first.</Sub>}
              </>
            )}
          </Card>
        </div>
      </FocusColumn>

      {/* Screen readers and printers only. On paper this is the whole page. */}
      {url && qr && (
        <div className="print-sheet" aria-hidden="true">
          <div className="print-card">
            <div className="print-name">{draft.displayName}</div>
            {draft.headline && <div className="print-headline">{draft.headline}</div>}
            <img src={qr} alt="" className="print-qr" />
            {printable.slice(0, 2).map((line) => (
              <div key={line} className="print-method">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
