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

export const listTicketCategoriesAdmin = () =>
  client.get('/admin/ticket-categories').then((r) => r.data)

export const createTicketCategory = (data) =>
  client.post('/admin/ticket-categories', data).then((r) => r.data)

export const updateTicketCategory = (key, data) =>
  client.patch(`/admin/ticket-categories/${key}`, data).then((r) => r.data)

export const deleteTicketCategory = (key) =>
  client.delete(`/admin/ticket-categories/${key}`)
