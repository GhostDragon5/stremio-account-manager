import { StremioAccount } from '@/types/account'
import { SavedAddon } from '@/types/saved-addon'
import { useAuthStore } from '@/store/authStore'
import { getBackendUrl } from '@/lib/backendConfig'

// Helper function to get auth headers
const getAuthHeaders = () => {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

const getUrl = (endpoint: string): string => {
  const base = getBackendUrl()
  return base ? `${base}${endpoint}` : endpoint
}

export const backendApi = {
  // Fetch all accounts
  async fetchAccounts(): Promise<StremioAccount[]> {
    const response = await fetch(getUrl('/api/accounts'), {
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch accounts: ${response.status}`)
    }
    return response.json()
  },

  // Create a new account
  async createAccount(account: Omit<StremioAccount, 'id'>): Promise<StremioAccount> {
    const response = await fetch(getUrl('/api/accounts'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(account),
    })
    if (!response.ok) {
      throw new Error(`Failed to create account: ${response.status}`)
    }
    const created = await response.json()
    return { ...account, id: created.id }
  },

  // Update an existing account
  async updateAccount(id: string, account: Partial<StremioAccount>): Promise<void> {
    const response = await fetch(getUrl(`/api/accounts/${id}`), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(account),
    })
    if (!response.ok) {
      throw new Error(`Failed to update account: ${response.status}`)
    }
  },

  // Delete an account
  async deleteAccount(id: string): Promise<void> {
    const response = await fetch(getUrl(`/api/accounts/${id}`), {
      method: 'DELETE',
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      throw new Error(`Failed to delete account: ${response.status}`)
    }
  },

  // Fetch all saved addons
  async fetchSavedAddons(): Promise<SavedAddon[]> {
    const response = await fetch(getUrl('/api/saved-addons'), {
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch saved addons: ${response.status}`)
    }
    return response.json()
  },

  // Create a new saved addon
  async createSavedAddon(addon: Omit<SavedAddon, 'id'>): Promise<SavedAddon> {
    const response = await fetch(getUrl('/api/saved-addons'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(addon),
    })
    if (!response.ok) {
      throw new Error(`Failed to create saved addon: ${response.status}`)
    }
    return response.json()
  },

  // Update a saved addon
  async updateSavedAddon(id: string, addon: Partial<SavedAddon>): Promise<SavedAddon> {
    const response = await fetch(getUrl(`/api/saved-addons/${id}`), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(addon),
    })
    if (!response.ok) {
      throw new Error(`Failed to update saved addon: ${response.status}`)
    }
    return response.json()
  },

  // Delete a saved addon
  async deleteSavedAddon(id: string): Promise<void> {
    const response = await fetch(getUrl(`/api/saved-addons/${id}`), {
      method: 'DELETE',
      headers: getAuthHeaders()
    })
    if (!response.ok) {
      throw new Error(`Failed to delete saved addon: ${response.status}`)
    }
  },
}
