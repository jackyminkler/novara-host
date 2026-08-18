import { Routes, Route, Navigate } from 'react-router-dom'
import HostApp from './host/HostApp.jsx'
import GuestPage from './guest/GuestPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/app/*" element={<HostApp />} />
      <Route path="/g/:token" element={<GuestPage />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
