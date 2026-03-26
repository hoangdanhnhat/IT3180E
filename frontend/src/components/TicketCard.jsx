import { useNavigate } from 'react-router-dom'
import { StatusBadge, PriorityBadge } from './ui/Badge'
import { CATEGORY_LABELS } from '../constants/enums'

export default function TicketCard({ ticket, onClick }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={onClick ?? (() => navigate(`/dashboard/tickets/${ticket.id}`))}
      className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-primary hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-mono">{ticket.ticket_number}</p>
          <h3 className="font-semibold text-gray-900 truncate mt-0.5">{ticket.subject}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {CATEGORY_LABELS[ticket.category] ?? ticket.category}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        {new Date(ticket.created_at).toLocaleDateString()}
      </p>
    </div>
  )
}
