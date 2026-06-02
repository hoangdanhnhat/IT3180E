import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPublicTickets } from '../api/tickets'
import PublicTicketCard from '../components/PublicTicketCard'
import Spinner from '../components/ui/Spinner'
import Alert from '../components/ui/Alert'
import { useAuthStore } from '../store/authStore'
import useTicketCategories from '../hooks/useTicketCategories'

const DEBOUNCE_MS = 350

export default function PublicTicketsPage() {
  const [searchParams] = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''
  const [rawQ, setRawQ] = useState(initialQ)
  const [q, setQ] = useState(initialQ.trim())
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

  const createTicketHref = accessToken ? '/dashboard/new-ticket' : '/login'

  function CreateTicketCta({ compact = false }) {
    return (
      <div className={`${compact ? 'mt-4' : 'mt-6'} rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-950">Still no valuable match?</p>
            <p className="mt-0.5 text-sm text-emerald-800">
              Create a new ticket and include what you already searched so support can help faster.
            </p>
          </div>
          <Link
            to={createTicketHref}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            {accessToken ? 'Create new ticket' : 'Log in to create ticket'}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Public Tickets</h1>
            <p className="text-sm text-gray-500 mt-0.5">Browse resolved support tickets before creating a new request</p>
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
            <div className="mx-auto max-w-xl px-4">
              <CreateTicketCta compact />
            </div>
          </div>
        )}

        {!isLoading && !isError && tickets?.length > 0 && (
          <>
            <div className="space-y-3">
              {tickets.map((t) => (
                <PublicTicketCard key={t.ticket_number} ticket={t} />
              ))}
            </div>
            <CreateTicketCta />
          </>
        )}
      </main>
    </div>
  )
}
