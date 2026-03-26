import client from './client'

export const createTicket = (data) =>
  client.post('/tickets', data).then((r) => r.data)

export const listTickets = () => client.get('/tickets').then((r) => r.data)

export const getTicket = (id) =>
  client.get(`/tickets/${id}`).then((r) => r.data)

export const addMessage = (id, content, isInternal = false) =>
  client
    .post(`/tickets/${id}/messages`, { content, is_internal: isInternal })
    .then((r) => r.data)

export const uploadAttachment = (id, file) => {
  const form = new FormData()
  form.append('file', file)
  return client
    .post(`/tickets/${id}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
}

export const updateStatus = (id, status, note = '') =>
  client.patch(`/tickets/${id}/status`, { status, note }).then((r) => r.data)

export const assignTicket = (id, agentId) =>
  client
    .patch(`/tickets/${id}/assign`, { agent_id: agentId })
    .then((r) => r.data)

export const getPublicTickets = (q = '') =>
  client
    .get('/tickets/public', { params: q ? { q } : {} })
    .then((r) => r.data)

export const listAssignedTickets = () =>
  client.get('/agent/tickets').then((r) => r.data)
