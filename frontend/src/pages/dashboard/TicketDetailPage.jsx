import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  getTicket,
  addMessage,
  updateStatus,
  downloadAttachment,
  viewAttachment,
  followTicket,
  transferTicketCategory,
} from '../../api/tickets'
import { useAuthStore } from '../../store/authStore'
import MessageBubble from '../../components/MessageBubble'
import { StatusBadge, PriorityBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'
import { STATUS_LABELS } from '../../constants/enums'
import useTicketCategories from '../../hooks/useTicketCategories'

// Valid status transitions per role (must match backend state machine)
const AGENT_TRANSITIONS = {
  open: ['in_progress'],
  in_progress: ['pending_customer', 'resolved'],
  pending_customer: ['in_progress'],
  resolved: [],   // agents cannot close/reopen; only customers can
  closed: [],
}

const CUSTOMER_TRANSITIONS = {
  open: [],
  in_progress: [],
  pending_customer: [],
  resolved: ['closed', 'open'],  // customer may close or reopen
  closed: [],
}

export default function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const isAgentOrAdmin = user?.role === 'agent' || user?.role === 'admin'
  const { categories, categoryLabels } = useTicketCategories()

  const {
    data: ticket,
    isLoading,
    error,
  } = useQuery({ queryKey: ['ticket', id], queryFn: () => getTicket(id) })

  // Agents can only interact with tickets assigned to them; admins can interact with all
  const isAssignedAgent =
    user?.role === 'agent' ? ticket?.assigned_to === user?.id : true

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm()
  const [msgError, setMsgError] = useState('')
  const [transferCategory, setTransferCategory] = useState('')

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

  const followMutation = useMutation({
    mutationFn: () => followTicket(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', id] })
      qc.invalidateQueries({ queryKey: ['agent-tickets'] })
      qc.invalidateQueries({ queryKey: ['admin/tickets'] })
    },
  })

  const categoryMutation = useMutation({
    mutationFn: (category) => transferTicketCategory(id, category),
    onSuccess: () => {
      setTransferCategory('')
      qc.invalidateQueries({ queryKey: ['ticket', id] })
      qc.invalidateQueries({ queryKey: ['agent-tickets'] })
      qc.invalidateQueries({ queryKey: ['admin/tickets'] })
    },
  })

  useEffect(() => {
    setTransferCategory('')
  }, [id])

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }
  if (error) return <Alert type="error">Failed to load ticket.</Alert>

  const messages = (ticket.messages ?? [])
    .filter((m) => !m.is_internal || isAgentOrAdmin)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  const canViewAttachments =
    isAgentOrAdmin ||
    ticket.user_id === user?.id ||
    (user?.role === 'agent' && ticket.assigned_to === user?.id)

  const transitionMap = isAgentOrAdmin ? AGENT_TRANSITIONS : CUSTOMER_TRANSITIONS
  const nextStatuses = transitionMap[ticket.status] ?? []
  const selectedTransferCategory = transferCategory || ticket.category
  const transferDirty = selectedTransferCategory !== ticket.category
  const transferCategories = categories.some((cat) => cat.key === ticket.category)
    ? categories
    : [{ key: ticket.category, label: categoryLabels[ticket.category] ?? ticket.category }, ...categories]

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

          {ticket.status !== 'closed' && isAgentOrAdmin && !isAssignedAgent && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <Alert type="info">
                You must be assigned to this ticket to reply or update its status.
              </Alert>
            </div>
          )}

          {/* Resolved notification — shown to customers only */}
          {!isAgentOrAdmin && ticket.status === 'resolved' && (
            <Alert type="warning">
              Your ticket has been resolved and will be automatically closed after 7 days. If you
              have any further questions or the issue persists, please reopen your ticket or submit
              a new one. Thank you!
            </Alert>
          )}

          {/* Reply form — hidden for customers when ticket is resolved or closed */}
          {ticket.status !== 'closed'
            && (isAgentOrAdmin ? isAssignedAgent : ticket.status !== 'resolved')
            && (
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
                  value: categoryLabels[ticket.category] ?? ticket.category,
                },
                {
                  label: 'Opened',
                  value: new Date(ticket.created_at).toLocaleDateString(),
                },
                ...(ticket.submitter
                  ? [{ label: 'Submitted by', value: ticket.submitter.full_name }]
                  : []),
                ...(isAgentOrAdmin
                  ? [{
                      label: 'Staff follow',
                      value: ticket.assigned_to === user?.id
                        ? 'You'
                        : ticket.assigned_to
                          ? 'Another staff member'
                          : 'Not followed',
                    }]
                  : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center gap-2">
                  <dt className="text-gray-500 shrink-0">{label}</dt>
                  <dd className="text-gray-800 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {isAgentOrAdmin && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Staff Actions</h3>
              <Button
                className="w-full justify-center"
                variant={ticket.assigned_to === user?.id ? 'outline' : 'primary'}
                loading={followMutation.isPending}
                disabled={ticket.assigned_to === user?.id}
                onClick={() => followMutation.mutate()}
              >
                {ticket.assigned_to === user?.id ? 'Following' : 'Follow Ticket'}
              </Button>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-500">Transfer category</label>
                <div className="flex gap-2">
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    value={selectedTransferCategory}
                    onChange={(e) => setTransferCategory(e.target.value)}
                  >
                    {transferCategories.map((cat) => (
                      <option key={cat.key} value={cat.key}>{cat.label}</option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    loading={categoryMutation.isPending}
                    disabled={!transferDirty}
                    onClick={() => categoryMutation.mutate(selectedTransferCategory)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}

          {(isAgentOrAdmin ? isAssignedAgent : true) && nextStatuses.length > 0 && (
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

          {/* Attachments */}
          {canViewAttachments && ticket.attachments?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Attachments</h3>
              <ul className="space-y-2">
                {ticket.attachments.map((att) => {
                  const isImage = att.mime_type?.startsWith('image/')
                  const sizeKB = (att.file_size / 1024).toFixed(1)
                  const sizeLabel = att.file_size >= 1048576
                    ? `${(att.file_size / 1048576).toFixed(1)} MB`
                    : `${sizeKB} KB`
                  return (
                    <li key={att.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-gray-400">
                          {isImage ? '🖼️' : '📄'}
                        </span>
                        <span className="text-gray-700 truncate" title={att.filename}>
                          {att.filename}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">{sizeLabel}</span>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {isImage && (
                          <button
                            onClick={() => viewAttachment(ticket.id, att.id)}
                            className="px-2.5 py-1 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                          >
                            View
                          </button>
                        )}
                        <button
                          onClick={() => downloadAttachment(ticket.id, att.id, att.filename)}
                          className="px-2.5 py-1 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                        >
                          Download
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
