import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listAssignedTickets } from '../../api/tickets'
import TicketCard from '../../components/TicketCard'
import Spinner from '../../components/ui/Spinner'
import Alert from '../../components/ui/Alert'

export default function AgentTicketsPage() {
  const navigate = useNavigate()
  const {
    data: tickets,
    isLoading,
    error,
  } = useQuery({ queryKey: ['agent-tickets'], queryFn: listAssignedTickets })

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Assigned Tickets</h2>
      </div>

      {tickets?.length === 0 ? (
        <div className="text-center text-gray-500 py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-400">No tickets assigned to you yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets?.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              onClick={() => navigate(`/agent/tickets/${t.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
