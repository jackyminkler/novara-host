import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquarePlus } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Textarea } from '../ui/form'
import { Button, Sub, cx } from '../ui/primitives'
import { useHost } from './AuthProvider'
import { useMutation } from './useApi'

/**
 * Step 4: a tester can say what is missing without leaving the app.
 *
 * One write and no read, on purpose. The host reads these out of the console.
 * A feedback inbox, replies, and statuses are a whole product, and none of it
 * is what a friends-and-family test needs.
 */
export function FeedbackButton({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [text, setText] = useState('')
  const host = useHost()
  const location = useLocation()
  const { mutate, busy, error } = useMutation()

  function close() {
    setOpen(false)
    // Reset after the dialog is gone, so it does not flicker back to the form.
    setTimeout(() => {
      setSent(false)
      setText('')
    }, 200)
  }

  async function send() {
    const body = text.trim()
    if (!body) return
    // The route rides along so a note like "this is confusing" is still
    // actionable a week later.
    await mutate((api) => api.sendFeedback({ text: body, route: location.pathname }, host.uid))
    setSent(true)
  }

  return (
    <>
      <div className="group relative">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Send feedback"
          className={cx(
            'hairline flex items-center rounded-[9px] border-line text-sec transition hover:text-ink',
            collapsed ? 'size-[34px] justify-center' : 'w-full gap-2 px-[10px] py-[6px] text-xs font-medium',
          )}
        >
          <MessageSquarePlus size={15} className="shrink-0" />
          {!collapsed && 'Feedback'}
        </button>
        {collapsed && (
          <span className="pointer-events-none absolute left-full top-1/2 z-40 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
            Feedback
          </span>
        )}
      </div>

      {open && (
        <Modal title={sent ? 'Thanks' : 'Send feedback'} onClose={close} width="max-w-[460px]">
          {sent ? (
            <>
              <Sub className="mb-3">That came through. Send another any time.</Sub>
              <Button onClick={close}>Close</Button>
            </>
          ) : (
            <>
              <Sub className="mb-2">
                What is missing, what got confusing, what you wish this did. Every note gets read.
              </Sub>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                autoFocus
                aria-label="Your feedback"
                placeholder="Type anything"
              />
              {error && <Sub className="mt-1 text-[11.5px]">That didn't send ({error}). Try again.</Sub>}
              <div className="mt-3 flex justify-end">
                <Button onClick={send} disabled={busy || !text.trim()}>
                  {busy ? 'Sending' : 'Send'}
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
