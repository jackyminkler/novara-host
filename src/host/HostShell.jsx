import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from './AuthProvider.jsx'
import EventsPage from './pages/EventsPage.jsx'
import OrgsPage from './pages/OrgsPage.jsx'
import CapturePage from './pages/CapturePage.jsx'

const navLinkClass = ({ isActive }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
    isActive ? 'bg-canvas text-ink' : 'text-ink/60 hover:text-ink'
  }`

export default function HostShell() {
  const { signOut } = useAuth()

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-semibold">Novara host</span>
          <nav className="flex items-center gap-1">
            <NavLink to="/app" end className={navLinkClass}>
              Events
            </NavLink>
            <NavLink to="/app/orgs" className={navLinkClass}>
              Partners
            </NavLink>
            <NavLink to="/app/capture" className={navLinkClass}>
              Capture
            </NavLink>
          </nav>
          <button
            onClick={signOut}
            className="text-ink/60 transition hover:text-ink"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route index element={<EventsPage />} />
          <Route path="orgs" element={<OrgsPage />} />
          <Route path="capture" element={<CapturePage />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </div>
    </div>
  )
}
