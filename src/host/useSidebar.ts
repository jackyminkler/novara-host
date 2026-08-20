import { useCallback, useEffect, useState } from "react";

// The rail is a toggle available on every page, not a split-view special
// case. The choice persists per user, split-view pages default to collapsed,
// and below tablet width the app collapses on its own so nobody has to hunt
// for the control on a small screen.

const KEY = "novara-hosts-sidebar";
const AUTO_COLLAPSE = "(max-width: 900px)";

type Preference = "expanded" | "collapsed";

function readPreference(): Preference | null {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "expanded" || stored === "collapsed" ? stored : null;
  } catch {
    // Private browsing just means the choice does not persist.
    return null;
  }
}

export interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

export function useSidebar(splitView: boolean): SidebarState {
  const [preference, setPreference] = useState<Preference | null>(
    readPreference,
  );
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(AUTO_COLLAPSE).matches,
  );
  // A narrow screen collapses by default, but the host can still open the
  // sidebar. That choice lasts the session rather than persisting, since a
  // stored "expanded" would be wrong the next time they open a small window.
  const [openedWhileNarrow, setOpenedWhileNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(AUTO_COLLAPSE);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Growing past the breakpoint hands control back to the stored choice.
  useEffect(() => {
    if (!narrow) setOpenedWhileNarrow(false);
  }, [narrow]);

  // Without an explicit choice, split-view pages start collapsed to buy the
  // list and detail panes their width.
  const fallback: Preference = splitView ? "collapsed" : "expanded";
  const collapsed = narrow
    ? !openedWhileNarrow
    : (preference ?? fallback) === "collapsed";

  const toggle = useCallback(() => {
    if (narrow) {
      setOpenedWhileNarrow((open) => !open);
      return;
    }
    setPreference((current) => {
      const effective = current ?? fallback;
      const next: Preference =
        effective === "collapsed" ? "expanded" : "collapsed";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Not persisting is survivable; the toggle still works this session.
      }
      return next;
    });
  }, [narrow, fallback]);

  return { collapsed, toggle };
}
