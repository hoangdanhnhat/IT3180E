import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listAssignedTickets } from '../../api/tickets'
import TicketCard from '../../components/TicketCard'
import Spinner from '../../components/ui/Spinner'
import Alert from '../../components/ui/Alert'
import { useAuthStore } from '../../store/authStore'
import useTicketCategories from '../../hooks/useTicketCategories'

export default function AgentTicketsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [category, setCategory] = useState('')
  const { categories } = useTicketCategories()
  const {
    data: tickets,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['agent-tickets', category],
    queryFn: () => listAssignedTickets(category),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) return <Alert type="error">Failed to load tickets. Please refresh.</Alert>

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Staff Ticket Queue</h2>
          <p className="text-sm text-gray-500">All tickets are visible to staff. Follow a ticket to work on it.</p>
        </div>
        <select
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.key} value={cat.key}>{cat.label}</option>
          ))}
        </select>
      </div>

      {tickets?.length === 0 ? (
        <div className="text-center text-gray-500 py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-400">No tickets match this category.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets?.map((t) => (
            <div key={t.id} className="relative">
              <TicketCard
                ticket={t}
                onClick={() => navigate(`/agent/tickets/${t.id}`)}
              />
              <span className={`absolute right-4 bottom-4 text-xs font-medium ${
                t.assigned_to === user?.id ? 'text-emerald-700' : 'text-gray-400'
              }`}>
                {t.assigned_to === user?.id ? 'Following' : t.assigned_to ? 'Followed' : 'Unfollowed'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
