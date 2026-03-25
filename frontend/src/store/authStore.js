import { create } from 'zustand'

const TOKEN_KEY = 'ufms_tokens'

function loadTokens() {
  try {
    const saved = localStorage.getItem(TOKEN_KEY)
    return saved ? JSON.parse(saved) : { accessToken: null, refreshToken: null }
  } catch {
    return { accessToken: null, refreshToken: null }
  }
}

export const useAuthStore = create((set) => ({
  user: null,
  ...loadTokens(),

  login: (tokens, user) => {
    localStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      })
    )
    set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      user,
    })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ user: null, accessToken: null, refreshToken: null })
  },

  setUser: (user) => set({ user }),

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken, refreshToken }))
    set({ accessToken, refreshToken })
  },
}))
