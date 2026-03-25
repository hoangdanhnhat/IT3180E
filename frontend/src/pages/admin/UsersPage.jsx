import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listUsers, updateUserRole, getUserTickets } from '../../api/admin'
import { StatusBadge } from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import Alert from '../../components/ui/Alert'

const ROLES = ['customer', 'agent', 'admin']

export default function UsersPage() {
  const qc = useQueryClient()

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['admin/users'],
    queryFn: listUsers,
  })

  // Track pending role selections per user
  const [roleSelections, setRoleSelections] = useState({})

  const roleMutation = useMutation({
    mutationFn: ({ id, role }) => updateUserRole(id, role),
    onSuccess: (_, { id }) => {
      // Clear local override so the row re-reads from server data
      setRoleSelections((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      qc.invalidateQueries({ queryKey: ['admin/users'] })
    },
  })

  // Modal: view a user's tickets
  const [viewingUserId, setViewingUserId] = useState(null)
  const { data: userTickets, isLoading: ticketsLoading } = useQuery({
    queryKey: ['admin/users', viewingUserId, 'tickets'],
    queryFn: () => getUserTickets(viewingUserId),
    enabled: !!viewingUserId,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }
  if (error) return <Alert type="error">Failed to load users.</Alert>

  return (
    <div>
      {/* ── Ticket modal ── */}
      {viewingUserId && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setViewingUserId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">User Tickets</h3>
              <button
                onClick={() => setViewingUserId(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-5 overflow-auto">
              {ticketsLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : userTickets?.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No tickets found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                      <th className="pb-2 font-medium pr-4">Ticket #</th>
                      <th className="pb-2 font-medium pr-4">Subject</th>
                      <th className="pb-2 font-medium pr-4">Status</th>
                      <th className="pb-2 font-medium">Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userTickets?.map((t) => (
                      <tr key={t.id} className="border-b border-gray-50">
                        <td className="py-2 pr-4 font-mono text-xs text-gray-500">
                          {t.ticket_number}
                        </td>
                        <td className="py-2 pr-4 text-gray-700">{t.subject}</td>
                        <td className="py-2 pr-4">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="py-2 capitalize text-gray-600">{t.priority}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold text-gray-900 mb-4">Users</h2>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-xs text-gray-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Tickets</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => {
              const selectedRole = roleSelections[u.id] ?? u.role
              const isDirty = selectedRole !== u.role
              return (
                <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.full_name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedRole}
                        onChange={(e) =>
                          setRoleSelections((prev) => ({ ...prev, [u.id]: e.target.value }))
                        }
                        className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      {isDirty && (
                        <button
                          onClick={() => roleMutation.mutate({ id: u.id, role: selectedRole })}
                          disabled={roleMutation.isPending}
                          className="text-xs text-primary font-medium hover:underline disabled:opacity-50"
                        >
                          Save
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.ticket_count}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setViewingUserId(u.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      View Tickets
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
