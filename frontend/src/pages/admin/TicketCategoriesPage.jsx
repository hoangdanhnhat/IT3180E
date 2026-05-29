import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTicketCategory,
  deleteTicketCategory,
  listTicketCategoriesAdmin,
  updateTicketCategory,
} from '../../api/admin'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import Spinner from '../../components/ui/Spinner'

export default function TicketCategoriesPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ label: '', key: '' })
  const [error, setError] = useState('')

  const { data: categories, isLoading, isError } = useQuery({
    queryKey: ['admin/ticket-categories'],
    queryFn: listTicketCategoriesAdmin,
  })

  const createMutation = useMutation({
    mutationFn: createTicketCategory,
    onSuccess: () => {
      setForm({ label: '', key: '' })
      setError('')
      qc.invalidateQueries({ queryKey: ['admin/ticket-categories'] })
      qc.invalidateQueries({ queryKey: ['ticket-categories'] })
    },
    onError: (err) => setError(err.response?.data?.detail ?? 'Failed to create category.'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ key, data }) => updateTicketCategory(key, data),
    onSuccess: () => {
      setError('')
      qc.invalidateQueries({ queryKey: ['admin/ticket-categories'] })
      qc.invalidateQueries({ queryKey: ['ticket-categories'] })
    },
    onError: (err) => setError(err.response?.data?.detail ?? 'Failed to update category.'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTicketCategory,
    onSuccess: () => {
      setError('')
      qc.invalidateQueries({ queryKey: ['admin/ticket-categories'] })
      qc.invalidateQueries({ queryKey: ['ticket-categories'] })
    },
    onError: (err) => setError(err.response?.data?.detail ?? 'Failed to delete category.'),
  })

  function handleCreate(e) {
    e.preventDefault()
    if (!form.label.trim()) {
      setError('Category label is required.')
      return
    }
    createMutation.mutate({
      label: form.label.trim(),
      key: form.key.trim() || null,
      is_active: true,
    })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) return <Alert type="error">Failed to load categories.</Alert>

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Ticket Categories</h2>
      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Category label"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            placeholder="Optional key"
            value={form.key}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex justify-end mt-3">
          <Button type="submit" loading={createMutation.isPending}>Add Category</Button>
        </div>
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Key</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(categories ?? []).map((category) => (
              <tr key={category.key}>
                <td className="px-4 py-3 font-medium text-gray-900">{category.label}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{category.key}</td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={category.is_active}
                    onChange={(e) =>
                      updateMutation.mutate({
                        key: category.key,
                        data: { is_active: e.target.checked },
                      })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="danger"
                    loading={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(category.key)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
