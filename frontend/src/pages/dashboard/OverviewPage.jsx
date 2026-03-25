import { useAuthStore } from '../../store/authStore'

const ROLE_LABELS = { customer: 'Customer', agent: 'Support Agent', admin: 'Administrator' }

export default function OverviewPage() {
  const { user } = useAuthStore()

  if (!user) return null

  const fields = [
    { label: 'Full name', value: user.full_name },
    { label: 'Email', value: user.email },
    { label: 'Role', value: ROLE_LABELS[user.role] ?? user.role },
    { label: 'Member since', value: new Date(user.created_at).toLocaleDateString() },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile</h2>
      <dl className="space-y-3">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</dt>
            <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
