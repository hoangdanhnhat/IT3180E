import { STATUS_BADGE_CLASSES, STATUS_LABELS, PRIORITY_BADGE_CLASSES, PRIORITY_LABELS } from '../../constants/enums'

export function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        STATUS_BADGE_CLASSES[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function PriorityBadge({ priority }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        PRIORITY_BADGE_CLASSES[priority] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  )
}
