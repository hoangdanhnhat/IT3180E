import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { getTicket, addMessage, updateStatus } from '../../api/tickets'
import { useAuthStore } from '../../store/authStore'
import MessageBubble from '../../components/MessageBubble'
import { StatusBadge, PriorityBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'
import { CATEGORY_LABELS, STATUS_LABELS } from '../../constants/enums'

// Valid status transitions (matches backend state machine)
const TRANSITIONS = {
  open: ['in_progress'],
  in_progress: ['pending_customer', 'resolved'],
  pending_customer: ['in_progress'],
  resolved: ['closed', 'open'],
  closed: [],
}

export default function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const isAgentOrAdmin = user?.role === 'agent' || user?.role === 'admin'

  const {
    data: ticket,
    isLoading,
    error,
  } = useQuery({ queryKey: ['ticket', id], queryFn: () => getTicket(id) })

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm()
  const [msgError, setMsgError] = useState('')

  const replyMutation = useMutation({
    mutationFn: ({ content }) => addMessage(id, content, false),
    onSuccess: () => {
      reset()
      qc.invalidateQueries({ queryKey: ['ticket', id] })
    },
    onError: () => setMsgError('Failed to send. Please try again.'),
  })

  const [statusNote, setStatusNote] = useState('')
  const statusMutation = useMutation({
    mutationFn: (newStatus) => updateStatus(id, newStatus, statusNote),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }
  if (error) return <Alert type="error">Failed to load ticket.</Alert>

  const messages = (ticket.messages ?? []).filter(
    (m) => !m.is_internal || isAgentOrAdmin
  )
  const nextStatuses = TRANSITIONS[ticket.status] ?? []

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-500 hover:text-gray-700 mb-5 flex items-center gap-1"
      >
        ← Back
      </button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ── Left panel: thread ── */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 text-lg">{ticket.subject}</h2>
            <p className="text-xs font-mono text-gray-400 mt-0.5">{ticket.ticket_number}</p>
            <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {messages.length > 0 && (
            <div className="space-y-3">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} currentUserId={user?.id} />
              ))}
            </div>
          )}

          {ticket.status !== 'closed' && (
            <form
              onSubmit={handleSubmit((d) => replyMutation.mutateAsync(d))}
              className="bg-white rounded-xl border border-gray-200 p-4 space-y-3"
            >
              {msgError && <Alert type="error">{msgError}</Alert>}
              <textarea
                rows={3}
                placeholder="Write a reply…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                {...register('content', { required: true })}
              />
              <div className="flex justify-end">
                <Button type="submit" loading={isSubmitting}>
                  Send Reply
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* ── Right panel: metadata ── */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Details</h3>
            <dl className="space-y-2 text-sm">
              {[
                { label: 'Status', value: <StatusBadge status={ticket.status} /> },
                { label: 'Priority', value: <PriorityBadge priority={ticket.priority} /> },
                {
                  label: 'Category',
                  value: CATEGORY_LABELS[ticket.category] ?? ticket.category,
                },
                {
                  label: 'Opened',
                  value: new Date(ticket.created_at).toLocaleDateString(),
                },
                ...(ticket.submitter
                  ? [{ label: 'Submitted by', value: ticket.submitter.full_name }]
                  : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center gap-2">
                  <dt className="text-gray-500 shrink-0">{label}</dt>
                  <dd className="text-gray-800 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {isAgentOrAdmin && nextStatuses.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Update Status</h3>
              <input
                type="text"
                placeholder="Optional note…"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="space-y-1.5">
                {nextStatuses.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    className="w-full justify-start"
                    loading={statusMutation.isPending}
                    onClick={() => statusMutation.mutate(s)}
                  >
                    → {STATUS_LABELS[s]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {ticket.status_history?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">History</h3>
              <ol className="space-y-2.5">
                {ticket.status_history.map((h) => (
                  <li key={h.id} className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">
                      {STATUS_LABELS[h.old_status]} → {STATUS_LABELS[h.new_status]}
                    </span>
                    <br />
                    {new Date(h.changed_at).toLocaleString()}
                    {h.note && <p className="italic mt-0.5 text-gray-400">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
