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

export const downloadAttachment = async (ticketId, attachmentId, filename) => {
  const res = await client.get(
    `/tickets/${ticketId}/attachments/${attachmentId}/download`,
    { responseType: 'blob' },
  )
  const url = window.URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export const viewAttachment = async (ticketId, attachmentId) => {
  const res = await client.get(
    `/tickets/${ticketId}/attachments/${attachmentId}/download`,
    { responseType: 'blob' },
  )
  const url = window.URL.createObjectURL(res.data)
  window.open(url, '_blank')
}

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
