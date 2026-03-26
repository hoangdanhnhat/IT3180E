import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { createTicket, uploadAttachment } from '../../api/tickets'
import FileDropZone from '../../components/FileDropZone'
import Button from '../../components/ui/Button'
import Alert from '../../components/ui/Alert'
import { CATEGORY_LABELS } from '../../constants/enums'

const INPUT = [
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm',
  'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
].join(' ')

export default function NewTicketPage() {
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { priority: 'normal', is_public: false } })

  const [files, setFiles] = useState([])
  const [error, setError] = useState('')

  async function onSubmit(data) {
    setError('')
    try {
      const ticket = await createTicket({
        subject: data.subject,
        description: data.description,
        category: data.category,
        priority: data.priority,
        is_public: !!data.is_public,
      })
      for (const file of files) {
        await uploadAttachment(ticket.id, file)
      }
      navigate(`/dashboard/tickets/${ticket.id}`, { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to submit ticket. Please try again.')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Submit a New Ticket</h2>

      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            className={INPUT}
            {...register('category', { required: 'Category is required' })}
          >
            <option value="">Select…</option>
            {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
          {errors.category && (
            <p className="text-xs text-red-600 mt-1">{errors.category.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <input
            type="text"
            placeholder="Briefly describe your issue"
            className={INPUT}
            {...register('subject', {
              required: 'Subject is required',
              maxLength: { value: 255, message: 'Max 255 characters' },
            })}
          />
          {errors.subject && (
            <p className="text-xs text-red-600 mt-1">{errors.subject.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            rows={5}
            placeholder="Describe your issue in detail…"
            className={`${INPUT} resize-none`}
            {...register('description', { required: 'Description is required' })}
          />
          {errors.description && (
            <p className="text-xs text-red-600 mt-1">{errors.description.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Attachments (optional)
          </label>
          <FileDropZone files={files} setFiles={setFiles} />
        </div>

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="is_public"
            className="mt-0.5 rounded"
            {...register('is_public')}
          />
          <label htmlFor="is_public" className="text-sm text-gray-600">
            Allow my resolved ticket to appear in the public ticket browser (your name will be
            hidden)
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Submit Ticket
          </Button>
        </div>
      </form>
    </div>
  )
}
