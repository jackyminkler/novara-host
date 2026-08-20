import { useCallback, useEffect, useState } from 'react'

// The rail is a toggle available on every page, not a split-view special
// case. The choice persists per user, split-view pages default to collapsed,
// and below tablet width the app collapses on its own so nobody has to hunt
// for the control on a small screen.

const KEY = 'novara-hosts-sidebar'
const AUTO_COLLAPSE = '(max-width: 900px)'

type Preference = 'expanded' | 'collapsed'

function readPreference(): Preference | null {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'expanded' || stored === 'collapsed' ? stored : null
  } catch {
    // Private browsing just means the choice does not persist.
    return null
  }
}

export interface SidebarState {
  collapsed: boolean
  /** False while the width rule is forcing the rail, which hides the toggle. */
  canToggle: boolean
  toggle: () => void
}

export function useSidebar(splitView: boolean): SidebarState {
  const [preference, setPreference] = useState<Preference | null>(readPreference)
  const [narrow, setNarrow] = useState(() => window.matchMedia(AUTO_COLLAPSE).matches)

  useEffect(() => {
    const query = window.matchMedia(AUTO_COLLAPSE)
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // Without an explicit choice, split-view pages start collapsed to buy the
  // list and detail panes their width.
  const fallback: Preference = splitView ? 'collapsed' : 'expanded'
  const collapsed = narrow || (preference ?? fallback) === 'collapsed'

  const toggle = useCallback(() => {
    setPreference((current) => {
      const effective = current ?? fallback
      const next: Preference = effective === 'collapsed' ? 'expanded' : 'collapsed'
      try {
        localStorage.setItem(KEY, next)
      } catch {
        // Not persisting is survivable; the toggle still works this session.
      }
      return next
    })
  }, [fallback])

  return { collapsed, canToggle: !narrow, toggle }
}
