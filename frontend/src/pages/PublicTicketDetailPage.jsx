import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPublicTicket, downloadPublicAttachment } from '../api/tickets'
import Spinner from '../components/ui/Spinner'
import Alert from '../components/ui/Alert'
import { STATUS_LABELS, STATUS_BADGE_CLASSES } from '../constants/enums'
import { useAuthStore } from '../store/authStore'
import useTicketCategories from '../hooks/useTicketCategories'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PublicTicketDetailPage() {
  const { ticketNumber } = useParams()
  const { accessToken } = useAuthStore()
  const { categoryLabels } = useTicketCategories()

  const { data: ticket, isLoading, isError } = useQuery({
    queryKey: ['public-ticket', ticketNumber],
    queryFn: () => getPublicTicket(ticketNumber),
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <Link to="/public" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to Public Tickets
          </Link>
          {!accessToken && (
            <Link to="/login" className="text-sm font-medium text-primary hover:underline">
              Log in to submit a ticket →
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        )}

        {isError && (
          <Alert type="error">Ticket not found or unavailable.</Alert>
        )}

        {ticket && (
          <div className="space-y-4">
            {/* Ticket header card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-mono">{ticket.ticket_number}</p>
                  <h1 className="text-xl font-bold text-gray-900 mt-1">{ticket.subject}</h1>
                  <p className="text-sm text-primary font-medium mt-1">
                    {categoryLabels[ticket.category] ?? ticket.category}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASSES[ticket.status]}`}>
                    {STATUS_LABELS[ticket.status] ?? ticket.status}
                  </span>
                  <p className="text-xs text-gray-400">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
            </div>

            {/* Attachments */}
            {ticket.attachments.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">
                  Attachments ({ticket.attachments.length})
                </h2>
                <div className="space-y-2">
                  {ticket.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-4 border border-gray-100 rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{att.filename}</p>
                        <p className="text-xs text-gray-400">{formatBytes(att.file_size)}</p>
                      </div>
                      <button
                        onClick={() => downloadPublicAttachment(ticket.ticket_number, att.id, att.filename)}
                        className="text-xs font-medium text-primary hover:underline shrink-0"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages thread */}
            {ticket.messages.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">
                  Replies ({ticket.messages.length})
                </h2>
                <div className="space-y-4">
                  {ticket.messages.map((msg, i) => (
                    <div key={i} className="border-t border-gray-100 pt-4 first:border-0 first:pt-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-semibold ${msg.sender_role === 'customer' ? 'text-gray-600' : 'text-primary'}`}>
                          {msg.sender_role === 'customer' ? 'User' : 'Agent'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
