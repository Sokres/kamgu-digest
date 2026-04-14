import { useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/AppLayout'
import { RequireAuth } from '@/components/RequireAuth'
import { AuthProvider } from '@/context/AuthContext'
import { getApiBaseUrl } from '@/lib/settings'
import { DigestPage } from '@/pages/DigestPage'
import { LoginPage } from '@/pages/LoginPage'
import { MonthlyPage } from '@/pages/MonthlyPage'
import { TrendsPage } from '@/pages/TrendsPage'

function AppShell(props: { apiBase: string; onApiBaseChange: (url: string) => void }) {
  const { apiBase, onApiBaseChange } = props
  return (
    <AppLayout apiBase={apiBase} onApiBaseChange={onApiBaseChange}>
      <Outlet context={{ apiBase }} />
    </AppLayout>
  )
}

export default function App() {
  const [apiBase, setApiBase] = useState(() => getApiBaseUrl())

  return (
    <BrowserRouter>
      <AuthProvider apiBase={apiBase}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<AppShell apiBase={apiBase} onApiBaseChange={setApiBase} />}>
              <Route index element={<DigestPage />} />
              <Route path="monthly" element={<MonthlyPage />} />
              <Route path="trends" element={<TrendsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
