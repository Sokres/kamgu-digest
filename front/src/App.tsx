import { useState } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/AppLayout'
import { getApiBaseUrl } from '@/lib/settings'
import { DigestPage } from '@/pages/DigestPage'
import { MonthlyPage } from '@/pages/MonthlyPage'
import { TrendsPage } from '@/pages/TrendsPage'

function Layout() {
  const [apiBase, setApiBase] = useState(getApiBaseUrl)

  return (
    <AppLayout apiBase={apiBase} onApiBaseChange={setApiBase}>
      <Outlet context={{ apiBase }} />
    </AppLayout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DigestPage />} />
          <Route path="monthly" element={<MonthlyPage />} />
          <Route path="trends" element={<TrendsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
