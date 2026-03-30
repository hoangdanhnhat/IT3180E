import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { logout as logoutApi } from '../../api/auth'

const TABS = [
  { to: '/agent/tickets', label: 'My Tickets' },
  { to: '/agent/faq', label: 'FAQ' },
]

export default function AgentLayout() {
  const { logout, user } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await logoutApi()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="text-lg font-bold text-primary">UFMS — Agent Portal</div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.full_name}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto mt-6 px-4">
        <nav className="flex gap-6 border-b border-gray-200 mb-6">
          {TABS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </div>
  )
}
