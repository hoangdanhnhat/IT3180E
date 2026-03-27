import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listAllTickets, updateTicketPriority } from '../../api/admin'
import { listUsers } from '../../api/admin'
import { assignTicket } from '../../api/tickets'
import { StatusBadge, PriorityBadge } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '../../constants/enums'

export default function AdminTicketsPage() {
  const qc = useQueryClient()

  const { data: tickets, isLoading: ticketsLoading, error: ticketsError } = useQuery({
    queryKey: ['admin/tickets'],
    queryFn: listAllTickets,
  })

  const { data: users } = useQuery({
    queryKey: ['admin/users'],
    queryFn: listUsers,
  })

  // Track pending priority and assignee selections per ticket
  const [pendingPriority, setPendingPriority] = useState({})
  const [pendingAssignee, setPendingAssignee] = useState({})
  const [rowError, setRowError] = useState({})

  const PAGE_SIZE = 15
  const [currentPage, setCurrentPage] = useState(1)

  const [filterSearch, setFilterSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPublic, setFilterPublic] = useState('')

  const handleFilterChange = (setter) => (e) => {
    setter(e.target.value)
    setCurrentPage(1)
  }

  const agents = (users ?? []).filter((u) => u.role === 'agent')

  const priorityMutation = useMutation({
    mutationFn: ({ ticketId, priority }) => updateTicketPriority(ticketId, priority),
    onSuccess: (_, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['admin/tickets'] })
      setPendingPriority((prev) => {
        const next = { ...prev }
        delete next[ticketId]
        return next
      })
    },
    onError: (_, { ticketId }) =>
      setRowError((prev) => ({ ...prev, [ticketId]: 'Failed to update priority.' })),
  })

  const assignMutation = useMutation({
    mutationFn: ({ ticketId, agentId }) => assignTicket(ticketId, agentId),
    onSuccess: (_, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['admin/tickets'] })
      setPendingAssignee((prev) => {
        const next = { ...prev }
        delete next[ticketId]
        return next
      })
    },
    onError: (_, { ticketId }) =>
      setRowError((prev) => ({ ...prev, [ticketId]: 'Failed to assign ticket.' })),
  })

  if (ticketsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (ticketsError) {
    return <Alert type="error">Failed to load tickets.</Alert>
  }

  const filteredTickets = (tickets ?? []).filter((t) => {
    if (filterStatus && t.status !== filterStatus) return false
    if (filterPriority && t.priority !== filterPriority) return false
    if (filterCategory && t.category !== filterCategory) return false
    if (filterPublic === 'public' && !t.is_public) return false
    if (filterPublic === 'private' && t.is_public) return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      if (
        !t.ticket_number?.toLowerCase().includes(q) &&
        !t.subject?.toLowerCase().includes(q) &&
        !t.submitter_name?.toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">All Tickets</h2>

      {/* Filter toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Search ticket #, subject, submitter…"
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-[220px] flex-1"
          value={filterSearch}
          onChange={handleFilterChange(setFilterSearch)}
        />
        <select
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={filterStatus}
          onChange={handleFilterChange(setFilterStatus)}
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={filterPriority}
          onChange={handleFilterChange(setFilterPriority)}
        >
          <option value="">All Priorities</option>
          {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={filterCategory}
          onChange={handleFilterChange(setFilterCategory)}
        >
          <option value="">All Categories</option>
          {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          value={filterPublic}
          onChange={handleFilterChange(setFilterPublic)}
        >
          <option value="">Public &amp; Private</option>
          <option value="public">Public only</option>
          <option value="private">Private only</option>
        </select>
        {(filterSearch || filterStatus || filterPriority || filterCategory || filterPublic) && (
          <button
            className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm text-gray-600 hover:bg-gray-50"
            onClick={() => {
              setFilterSearch('')
              setFilterStatus('')
              setFilterPriority('')
              setFilterCategory('')
              setFilterPublic('')
              setCurrentPage(1)
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {filteredTickets.length === 0 ? (
        <p className="text-sm text-gray-500">No tickets match the current filters.</p>
      ) : (() => {
        const totalPages = Math.ceil(filteredTickets.length / PAGE_SIZE)
        const pagedTickets = filteredTickets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
        return (
        <>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Ticket #</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Submitter</th>
                <th className="px-4 py-3">Assigned Agent</th>
                <th className="px-4 py-3">Public</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedTickets.map((ticket) => {
                const tid = ticket.id
                const currentPriority = pendingPriority[tid] ?? ticket.priority
                const priorityDirty = pendingPriority[tid] !== undefined
                const currentAssignee = pendingAssignee[tid] !== undefined
                  ? pendingAssignee[tid]
                  : (ticket.assigned_to ?? '')
                const assigneeDirty = pendingAssignee[tid] !== undefined

                return (
                  <tr key={tid} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                      {ticket.ticket_number}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="font-medium text-gray-800 line-clamp-2">
                        {ticket.subject}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <select
                          className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                          value={currentPriority}
                          onChange={(e) =>
                            setPendingPriority((prev) => ({ ...prev, [tid]: e.target.value }))
                          }
                        >
                          {Object.entries(PRIORITY_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          ))}
                        </select>
                        {priorityDirty && (
                          <Button
                            size="xs"
                            loading={priorityMutation.isPending}
                            onClick={() =>
                              priorityMutation.mutate({ ticketId: tid, priority: currentPriority })
                            }
                          >
                            Save
                          </Button>
                        )}
                      </div>
                      {rowError[tid] && (
                        <p className="text-xs text-red-600 mt-0.5">{rowError[tid]}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                      {ticket.submitter_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <select
                          className="border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                          value={currentAssignee}
                          onChange={(e) =>
                            setPendingAssignee((prev) => ({ ...prev, [tid]: e.target.value }))
                          }
                        >
                          <option value="">— Unassigned —</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.full_name}
                            </option>
                          ))}
                        </select>
                        {assigneeDirty && (
                          <Button
                            size="xs"
                            loading={assignMutation.isPending}
                            onClick={() =>
                              assignMutation.mutate({
                                ticketId: tid,
                                agentId: currentAssignee || null,
                              })
                            }
                          >
                            Save
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <input
                        type="checkbox"
                        readOnly
                        checked={ticket.is_public}
                        className="h-4 w-4 accent-primary cursor-default"
                      />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        to={`/dashboard/tickets/${tid}`}
                        className="inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>
            Page {currentPage} of {totalPages} ({filteredTickets.length} tickets total)
          </span>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage === 1}
            >
              ← Prev
            </button>
            <button
              className="px-3 py-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        </div>
        </>
        )
      })()}
    </div>
  )
}
