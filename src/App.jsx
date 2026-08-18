import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

// Lazy branches keep the guest bundle free of Firebase and host-only code.
const HostApp = lazy(() => import('./host/HostApp.jsx'))
const GuestPage = lazy(() => import('./guest/GuestPage.jsx'))

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/app/*" element={<HostApp />} />
        <Route path="/g/:token" element={<GuestPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Suspense>
  )
}
