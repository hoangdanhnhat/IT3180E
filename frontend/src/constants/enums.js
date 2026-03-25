export const UserRole = {
  CUSTOMER: 'customer',
  AGENT: 'agent',
  ADMIN: 'admin',
}

export const TicketStatus = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  PENDING_CUSTOMER: 'pending_customer',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
}

export const TicketPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
}

export const TicketCategory = {
  BILLING: 'billing',
  DELAYS: 'delays',
  LOST_FOUND: 'lost_found',
  ROUTE: 'route',
  OTHER: 'other',
}

export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_customer: 'Pending Customer',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const PRIORITY_LABELS = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

export const CATEGORY_LABELS = {
  billing: 'Billing & Payments',
  delays: 'Delays & Cancellations',
  lost_found: 'Lost & Found',
  route: 'Route Enquiry',
  other: 'Other',
}

export const STATUS_BADGE_CLASSES = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  pending_customer: 'bg-orange-100 text-orange-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
}

export const PRIORITY_BADGE_CLASSES = {
  low: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
}
