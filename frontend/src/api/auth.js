import client from './client'

export const login = (email, password) =>
  client.post('/auth/login', { email, password }).then((r) => r.data)

export const register = (email, password, fullName) =>
  client
    .post('/auth/register', { email, password, full_name: fullName })
    .then((r) => r.data)

export const logout = () =>
  client.post('/auth/logout').catch(() => {}) // best-effort; client always clears tokens

export const getMe = () => client.get('/auth/me').then((r) => r.data)
