import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

// Lazy branches keep the guest bundle free of Firebase and host-only code.
// The guest page is the product's first impression for every partner and has
// to load in under two seconds on LTE. One route serves party, crew, and
// recap views; the token's scope decides which, per PRD 3.2.
const HostApp = lazy(() => import('./host/HostApp'))
const GuestPage = lazy(() => import('./guest/GuestPage'))

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
