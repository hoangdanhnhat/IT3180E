import client from './client'

/**
 * GET /faq — list active FAQs, with optional keyword search + category filter
 */
export function listFaqs({ q, category } = {}) {
  const params = {}
  if (q)        params.q        = q
  if (category) params.category = category
  return client.get('/faq', { params }).then((r) => r.data)
}

/**
 * GET /faq/categories — distinct category list
 */
export function listFaqCategories() {
  return client.get('/faq/categories').then((r) => r.data)
}

/**
 * GET /faq/:id — detail + increments view_count
 */
export function getFaq(id) {
  return client.get(`/faq/${id}`).then((r) => r.data)
}

export function upvoteFaq(id) {
  return client.post(`/faq/${id}/upvote`).then((r) => r.data)
}

export function removeFaqUpvote(id) {
  return client.delete(`/faq/${id}/upvote`).then((r) => r.data)
}

/**
 * POST /faq — create (admin only)
 */
export function createFaq(body) {
  return client.post('/faq', body).then((r) => r.data)
}

/**
 * POST /faq/import — bulk import FAQs (admin only)
 */
export function importFaqs(items) {
  return client.post('/faq/import', { items }).then((r) => r.data)
}

/**
 * DELETE /faq/:id — hard delete (admin only)
 */
export function deleteFaq(id) {
  return client.delete(`/faq/${id}`)
}
