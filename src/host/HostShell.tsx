import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CalendarDays, House, LogOut, NotebookPen, Sparkles, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth, useHost } from './AuthProvider'
import { Wordmark } from './Wordmark'
import { cx } from '../ui/primitives'
import { initials } from '../data/profiles'
import TodayPage from './pages/TodayPage'
import EventsPage from './pages/EventsPage'
import EventWorkspace from './event/EventWorkspace'
import NewEventPage from './pages/NewEventPage'
import CalendarPage from './pages/CalendarPage'
import PartnersPage from './pages/PartnersPage'
import PartnerDetailPage from './pages/PartnerDetailPage'
import PartnerFormPage from './pages/PartnerFormPage'
import CapturePage from './pages/CapturePage'
import RecapEditorPage from './event/RecapEditorPage'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/app', label: 'Today', icon: House, end: true },
  { to: '/app/events', label: 'Events', icon: Sparkles },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/app/partners', label: 'Partners', icon: Users },
  { to: '/app/capture', label: 'Capture', icon: NotebookPen },
]

/** Capture is the split-view page, so the sidebar gives up its labels there. */
function useRailMode(): boolean {
  return useLocation().pathname.startsWith('/app/capture')
}

function Sidebar() {
  const host = useHost()
  const { signOut } = useAuth()

  return (
    <nav className="hairline flex w-44 shrink-0 flex-col border-0 border-r border-line bg-surface px-3 py-4">
      <div className="mb-5 px-2">
        <Wordmark />
      </div>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cx(
              'mb-[2px] flex items-center gap-[9px] rounded-lg px-[10px] py-[7px] text-[13px] transition',
              isActive ? 'bg-viot font-medium text-vio' : 'text-sec hover:text-ink',
            )
          }
        >
          <Icon size={15} />
          {label}
        </NavLink>
      ))}
      <div className="mt-auto flex items-center gap-2 pt-4">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-av text-[11px] font-medium text-vio">
          {initials(host.displayName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{host.displayName}</span>
          <span className="block truncate text-[11px] text-mut">{host.email}</span>
        </span>
        <button
          onClick={signOut}
          aria-label="Sign out"
          className="shrink-0 text-mut transition hover:text-ink"
        >
          <LogOut size={14} />
        </button>
      </div>
    </nav>
  )
}

function Rail() {
  const host = useHost()

  return (
    <nav className="hairline flex w-[54px] shrink-0 flex-col items-center gap-[6px] border-0 border-r border-line bg-surface py-[14px]">
      <span className="accent-gradient mb-[14px] flex size-[30px] items-center justify-center rounded-[9px] font-display text-sm font-semibold text-white">
        N
      </span>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={label}
          aria-label={label}
          className={({ isActive }) =>
            cx(
              'flex size-[34px] items-center justify-center rounded-[9px] transition',
              isActive ? 'bg-viot text-vio' : 'text-sec hover:text-ink',
            )
          }
        >
          <Icon size={16} />
        </NavLink>
      ))}
      <span className="mt-auto inline-flex size-7 items-center justify-center rounded-full bg-av text-[11px] font-medium text-vio">
        {initials(host.displayName)}
      </span>
    </nav>
  )
}

export default function HostShell() {
  const rail = useRailMode()

  return (
    <div className="flex min-h-screen bg-field">
      {rail ? <Rail /> : <Sidebar />}
      <main className="min-w-0 flex-1">
        <Routes>
          <Route index element={<TodayPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/new" element={<NewEventPage />} />
          <Route path="events/:eventId/recap" element={<RecapEditorPage />} />
          <Route path="events/:eventId/*" element={<EventWorkspace />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="partners" element={<PartnersPage />} />
          <Route path="partners/new" element={<PartnerFormPage />} />
          <Route path="partners/:orgId/edit" element={<PartnerFormPage />} />
          <Route path="partners/:orgId" element={<PartnerDetailPage />} />
          <Route path="capture" element={<CapturePage />} />
          {/* PRD 3.4 called this orgs; the wireframes call it partners. */}
          <Route path="orgs" element={<Navigate to="/app/partners" replace />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>
    </div>
  )
}
