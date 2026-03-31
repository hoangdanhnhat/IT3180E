import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { getMe } from './api/auth'
import client from './api/client'
import ProtectedRoute from './components/ProtectedRoute'
import Spinner from './components/ui/Spinner'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminTicketsPage from './pages/admin/AdminTicketsPage'
import CreateUserPage from './pages/admin/CreateUserPage'
import UsersPage from './pages/admin/UsersPage'
import AgentLayout from './pages/agent/AgentLayout'
import AgentTicketsPage from './pages/agent/AgentTicketsPage'
import DashboardLayout from './pages/dashboard/DashboardLayout'
import FaqPage from './pages/dashboard/FaqPage'
import MyTicketsPage from './pages/dashboard/MyTicketsPage'
import NewTicketPage from './pages/dashboard/NewTicketPage'
import OverviewPage from './pages/dashboard/OverviewPage'
import TicketDetailPage from './pages/dashboard/TicketDetailPage'
import PublicTicketsPage from './pages/PublicTicketsPage'
import PublicTicketDetailPage from './pages/PublicTicketDetailPage'
import { useAuthStore } from './store/authStore'

export default function App() {
  const { accessToken, refreshToken, login, logout, setUser } = useAuthStore()
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    async function init() {
      if (!accessToken) {
        setInitializing(false)
        return
      }
      try {
        const user = await getMe()
        setUser(user)
      } catch (err) {
        // Try refresh if the stored access token expired
        if (err.response?.status === 401 && refreshToken) {
          try {
            const { data } = await client.post('/auth/refresh', {
              refresh_token: refreshToken,
            })
            login(data, null)
            const user = await getMe()
            setUser(user)
          } catch {
            logout()
          }
        } else {
          logout()
        }
      } finally {
        setInitializing(false)
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Customer / Agent routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="my-tickets" element={<MyTicketsPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route path="new-ticket" element={<NewTicketPage />} />
          <Route path="faq" element={<FaqPage />} />
        </Route>
      </Route>

      {/* Agent portal routes */}
      <Route element={<ProtectedRoute requireAgentOrAdmin />}>
        <Route path="/agent" element={<AgentLayout />}>
          <Route index element={<Navigate to="tickets" replace />} />
          <Route path="tickets" element={<AgentTicketsPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route path="faq" element={<FaqPage />} />
        </Route>
      </Route>

      {/* Admin-only routes */}
      <Route element={<ProtectedRoute requireAdmin />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="create-user" element={<CreateUserPage />} />
          <Route path="tickets" element={<AdminTicketsPage />} />
          <Route path="faq" element={<FaqPage />} />
        </Route>
      </Route>

      <Route path="/public" element={<PublicTicketsPage />} />
      <Route path="/public/:ticketNumber" element={<PublicTicketDetailPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
