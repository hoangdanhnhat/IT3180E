import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPublicTickets } from '../api/tickets'
import PublicTicketCard from '../components/PublicTicketCard'
import Spinner from '../components/ui/Spinner'
import Alert from '../components/ui/Alert'
import { useAuthStore } from '../store/authStore'
import useTicketCategories from '../hooks/useTicketCategories'

const DEBOUNCE_MS = 350

export default function PublicTicketsPage() {
  const [rawQ, setRawQ] = useState('')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const { accessToken } = useAuthStore()
  const { categories } = useTicketCategories()

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => setQ(rawQ.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [rawQ])

  const { data: tickets, isLoading, isError } = useQuery({
    queryKey: ['public-tickets', { q, category }],
    queryFn: () => getPublicTickets(q, category),
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Public Tickets</h1>
            <p className="text-sm text-gray-500 mt-0.5">Browse resolved support tickets</p>
          </div>
          {!accessToken && (
            <Link
              to="/login"
              className="text-sm font-medium text-primary hover:underline"
            >
              Log in to submit a ticket →
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="text"
            placeholder="Search tickets…"
            value={rawQ}
            onChange={(e) => setRawQ(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.key} value={cat.key}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Results */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        )}

        {isError && (
          <Alert type="error">Failed to load tickets. Please refresh.</Alert>
        )}

        {!isLoading && !isError && tickets?.length === 0 && (
          <div className="text-center text-gray-500 py-16 bg-white rounded-xl border border-gray-200">
            <p className="font-medium">No tickets found</p>
            <p className="text-sm mt-1">Try adjusting your search or filter.</p>
          </div>
        )}

        {!isLoading && !isError && tickets?.length > 0 && (
          <div className="space-y-3">
            {tickets.map((t) => (
              <PublicTicketCard key={t.ticket_number} ticket={t} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
