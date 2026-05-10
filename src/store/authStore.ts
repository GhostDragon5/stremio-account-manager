import { create } from 'zustand'
import { getBackendUrl } from '@/lib/backendConfig'

interface User {
  id: string
  email: string
  created_at: string
  two_factor_enabled: boolean
  is_default_admin?: boolean
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  isLocked: boolean
  encryptionKey: CryptoKey | null
  login: (email: string, password: string, twoFactorCode?: string) => Promise<{ user: User; token: string }>
  logout: () => void
  register: (email: string, password: string) => Promise<{ user: User; token: string }>
  checkAuth: () => void
  initialize: () => void
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  isPasswordSet: () => boolean
  setupMasterPassword: (password: string) => Promise<void>
  resetMasterPassword: () => Promise<void>
  unlock: (password: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isLocked: false,
  encryptionKey: null,

  login: async (email: string, password: string, twoFactorCode?: string) => {
    console.log('=== authStore.login ===')
    console.log('authStore - Starting login process')
    console.log('authStore - Email:', email)
    
    set({ isLoading: true })
    try {
      const response = await fetch(`${getBackendUrl()}/api/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, two_factor_code: twoFactorCode }),
      })

      console.log('authStore - Response status:', response.status)

      if (!response.ok) {
        let error
        try {
          error = await response.json()
        } catch {
          const text = await response.text()
          error = { error: text || 'Login failed' }
        }
        console.error('authStore - Login failed:', error)
        throw new Error(error.error || 'Login failed')
      }

      const data = await response.json()
      console.log('authStore - Backend response data:', data)
      console.log('authStore - User ID:', data.user.id)
      console.log('authStore - User email:', data.user.email)
      console.log('authStore - Token received:', !!data.token)
      
      // CRITICAL: Store user and token in localStorage FIRST
      console.log('authStore - Storing user and token in localStorage...')
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('token', data.token)
      console.log('authStore - User and token stored in localStorage successfully')
      
      // Verify storage
      const storedUser = localStorage.getItem('user')
      const storedToken = localStorage.getItem('token')
      console.log('authStore - Verification - User in localStorage:', storedUser ? 'YES' : 'NO')
      console.log('authStore - Verification - Token in localStorage:', storedToken ? 'YES' : 'NO')
      
      if (!storedUser || !storedToken) {
        console.error('authStore - CRITICAL ERROR: localStorage.setItem failed silently!')
        throw new Error('Login failed - could not store user/token in localStorage')
      }
      
      // Update store SECOND
      console.log('authStore - Updating store...')
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false })
      console.log('authStore - Store updated successfully')
      
      console.log('authStore - Login process completed successfully')
      return data
    } catch (error) {
      console.error('authStore - Login error:', error)
      set({ isLoading: false })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    set({ user: null, token: null, isAuthenticated: false })
  },

  register: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const response = await fetch(`${getBackendUrl()}/api/users/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Registration failed')
      }

      const data = await response.json()
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('token', data.token)
      set({ user: data.user, token: data.token, isAuthenticated: true, isLoading: false })
      return data
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  checkAuth: () => {
    const storedUser = localStorage.getItem('user')
    const storedToken = localStorage.getItem('token')
    if (storedUser && storedToken) {
      try {
        const user = JSON.parse(storedUser)
        console.log('Loaded user from localStorage:', user)
        set({ user, token: storedToken, isAuthenticated: true })
      } catch {
        console.error('Failed to parse user from localStorage')
        localStorage.removeItem('user')
        localStorage.removeItem('token')
      }
    } else {
      console.log('No user or token found in localStorage')
    }
  },

  initialize: () => {
    const storedUser = localStorage.getItem('user')
    const storedToken = localStorage.getItem('token')
    if (storedUser && storedToken) {
      try {
        const user = JSON.parse(storedUser)
        console.log('Initialized auth store with user:', user)
        set({ user, token: storedToken, isAuthenticated: true })
      } catch {
        console.error('Failed to parse user from localStorage')
        localStorage.removeItem('user')
        localStorage.removeItem('token')
      }
    } else {
      console.log('No user or token found in localStorage during initialization')
    }
  },

  isPasswordSet: () => {
    return localStorage.getItem('masterPasswordHash') !== null
  },

  setupMasterPassword: async (password: string) => {
    // Simple implementation - in production, use proper hashing
    const hash = btoa(password)
    localStorage.setItem('masterPasswordHash', hash)
    // Create a simple CryptoKey for compatibility
    const encoder = new TextEncoder()
    const keyData = encoder.encode(hash)
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    )
    set({ isLocked: false, encryptionKey: key })
  },

  resetMasterPassword: async () => {
    localStorage.removeItem('masterPasswordHash')
    set({ isLocked: true, encryptionKey: null })
  },

  unlock: async (password: string) => {
    const storedHash = localStorage.getItem('masterPasswordHash')
    if (storedHash === btoa(password)) {
      // Create a simple CryptoKey for compatibility
      const encoder = new TextEncoder()
      const keyData = encoder.encode(storedHash)
      const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      )
      set({ isLocked: false, encryptionKey: key })
    } else {
      throw new Error('Invalid password')
    }
  },

  setUser: (user: User | null) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user))
      set({ user, isAuthenticated: true })
    } else {
      localStorage.removeItem('user')
      set({ user: null, isAuthenticated: false })
    }
  },

  setToken: (token: string | null) => {
    if (token) {
      localStorage.setItem('token', token)
      set({ token })
    } else {
      localStorage.removeItem('token')
      set({ token: null })
    }
  },
}))