import { useNavigate } from 'react-router-dom'
import { STATUS_LABELS, STATUS_BADGE_CLASSES } from '../constants/enums'
import useTicketCategories from '../hooks/useTicketCategories'

export default function PublicTicketCard({ ticket }) {
  const navigate = useNavigate()
  const { categoryLabels } = useTicketCategories()
  return (
    <div
      onClick={() => navigate(`/public/${ticket.ticket_number}`)}
      className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-primary hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-mono">{ticket.ticket_number}</p>
          <h3 className="font-semibold text-gray-900 truncate mt-0.5">{ticket.subject}</h3>
          <p className="text-sm text-primary font-medium mt-1">
            {categoryLabels[ticket.category] ?? ticket.category}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASSES[ticket.status]}`}>
            {STATUS_LABELS[ticket.status] ?? ticket.status}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 11v9M7 11H4.5A1.5 1.5 0 003 12.5v6A1.5 1.5 0 004.5 20H7m0-9l4.4-7.2A1.5 1.5 0 0114.2 5v4h4.3a1.5 1.5 0 011.47 1.79l-1.2 6A4 4 0 0114.85 20H7" />
            </svg>
            {ticket.public_upvote_count ?? 0}
          </span>
          <p className="text-xs text-gray-400">
            {new Date(ticket.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
      <p className="text-sm text-gray-600 mt-3 line-clamp-3">{ticket.description}</p>
    </div>
  )
}
