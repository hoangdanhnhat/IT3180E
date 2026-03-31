import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { logout as logoutApi } from '../../api/auth'

const TABS = [
  { to: '/dashboard', label: 'Overview', end: true },
  { to: '/dashboard/my-tickets', label: 'My Tickets' },
  { to: '/dashboard/new-ticket', label: 'New Ticket' },
  { to: '/dashboard/faq', label: 'FAQ' },
  { to: '/public', label: 'Public Tickets', external: true },
]

export default function DashboardLayout() {
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
        <div className="text-lg font-bold text-primary">UFMS</div>
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

      <div className="max-w-4xl mx-auto mt-6 px-4">
        <nav className="flex gap-6 border-b border-gray-200 mb-6">
          {TABS.map(({ to, label, end, external }) =>
            external ? (
              <Link
                key={to}
                to={to}
                className="pb-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 -mb-px transition-colors"
              >
                {label}
              </Link>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={end}
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
            )
          )}
        </nav>
        <Outlet />
      </div>
    </div>
  )
}
