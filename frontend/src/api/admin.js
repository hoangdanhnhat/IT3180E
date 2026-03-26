import client from './client'

export const listUsers = () => client.get('/admin/users').then((r) => r.data)

export const getUserTickets = (userId) =>
  client.get(`/admin/users/${userId}/tickets`).then((r) => r.data)

export const createUser = (data) =>
  client.post('/admin/users', data).then((r) => r.data)

export const updateUserRole = (userId, role) =>
  client.patch(`/admin/users/${userId}/role`, { role }).then((r) => r.data)

export const listAllTickets = () => client.get('/admin/tickets').then((r) => r.data)

export const updateTicketPriority = (ticketId, priority) =>
  client.patch(`/admin/tickets/${ticketId}/priority`, { priority }).then((r) => r.data)
