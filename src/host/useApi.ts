import { useCallback, useEffect, useState } from 'react'
import { getApi, type HostApi } from '../data/api'

/**
 * Load-and-refetch, which is the whole data strategy. Guardrail 3 prefers a
 * simple refetch over realtime listeners wherever either would work, and at
 * five partners on one event, either works everywhere.
 */
export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

export function useAsync<T>(
  run: (api: HostApi) => Promise<T>,
  deps: unknown[] = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  // The caller passes an inline closure, so identity changes every render;
  // the dependency list it supplies is the real trigger.
  const runRef = useCallback(run, deps)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getApi()
      .then(runRef)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err: unknown) => {
        console.error('load failed', err)
        if (!cancelled) setError(describe(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [runRef, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { data, error, loading, reload }
}

/** Firestore errors carry a code; plain ones carry a message. Show whichever exists. */
function describe(err: unknown): string {
  const e = err as { code?: string; message?: string }
  return e?.code ?? e?.message ?? 'unknown'
}

/** Fire a write, then refetch. Returns a busy flag and the last error. */
export function useMutation(onDone?: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutate = useCallback(
    async (work: (api: HostApi) => Promise<unknown>) => {
      setBusy(true)
      setError(null)
      try {
        const api = await getApi()
        await work(api)
        onDone?.()
      } catch (err) {
        console.error('write failed', err)
        setError(describe(err))
      } finally {
        setBusy(false)
      }
    },
    [onDone],
  )

  return { mutate, busy, error }
}
