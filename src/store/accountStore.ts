import {
  installAddon as apiInstallAddon,
  removeAddon as apiRemoveAddon,
  getAddons,
  updateAddons,
} from '@/api/addons'
import { loginWithCredentials } from '@/api/auth'
import { decrypt } from '@/lib/crypto'
import { useAuthStore } from '@/store/authStore'
import { useAddonStore } from '@/store/addonStore'
import { accountExportSchema } from '@/lib/validation'
import { loadAddonLibrary, findSavedAddonByUrl } from '@/lib/addon-storage-backend'
import { updateLatestVersions as updateLatestVersionsCoordinator } from '@/lib/store-coordinator'
import { toast } from '@/hooks/use-toast'
import { AccountExport, StremioAccount } from '@/types/account'
import { AddonDescriptor } from '@/types/addon'
import { backendApi } from '@/lib/backendApi'
import { create } from 'zustand'

// We are no longer using localforage for accounts, so we remove the STORAGE_KEY

interface AccountStore {
  accounts: StremioAccount[]
  loading: boolean
  error: string | null

  // Actions
  initialize: () => Promise<void>
  updateLatestVersions: (versions: Record<string, string>) => void
  addAccountByAuthKey: (authKey: string, name: string) => Promise<void>
  addAccountByCredentials: (email: string, password: string, name: string) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  syncAccount: (id: string) => Promise<void>
  syncAllAccounts: () => Promise<void>
  installAddonToAccount: (accountId: string, addonUrl: string) => Promise<void>
  removeAddonFromAccount: (accountId: string, addonId: string) => Promise<void>
  reorderAddons: (accountId: string, newOrder: AddonDescriptor[]) => Promise<void>
  exportAccounts: (includeCredentials: boolean) => Promise<string>
  importAccounts: (json: string) => Promise<void>
  updateAccount: (
    id: string,
    data: { name: string; authKey?: string; email?: string; password?: string }
  ) => Promise<void>
  clearError: () => void
  reset: () => void
}

// Helper function to map backend account to frontend account
const mapBackendAccountToFrontend = (backendAccount: any): StremioAccount => {
  const lastSyncValue =
    backendAccount.last_sync || backendAccount.lastSync || null

  return {
    id: backendAccount.id,
    name: backendAccount.name,
    email: backendAccount.email,
    authKey: backendAccount.auth_key, // Changed from encrypted_auth_key
    password: backendAccount.password, // Changed from encrypted_password
    addons: backendAccount.addons ? JSON.parse(backendAccount.addons) : [],
    lastSync: lastSyncValue,
    status: backendAccount.status,
  }
}

// Helper function to prepare frontend account for backend (stringify addons)
const prepareAccountForBackend = (account: Omit<StremioAccount, 'id'>): any => {
  return {
    name: account.name,
    email: account.email,
    auth_key: account.authKey,
    password: account.password,
    addons: JSON.stringify(account.addons),
    last_sync: account.lastSync,
    status: account.status,
  }
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  accounts: [],
  loading: false,
  error: null,

  initialize: async () => {
    try {
      // Fetch accounts from backend
      const backendAccounts = await backendApi.fetchAccounts()
      const accounts = backendAccounts.map(mapBackendAccountToFrontend)
      set({ accounts })
    } catch (error) {
      console.error('Failed to load accounts from backend:', error)
      set({ error: 'Failed to load accounts' })
    }
  },

  updateLatestVersions: (versions) => {
    updateLatestVersionsCoordinator(versions)
  },

  addAccountByAuthKey: async (authKey, name) => {
    set({ loading: true, error: null })
    try {
      // Validate auth key by fetching addons
      const addons = await getAddons(authKey)

      // Normalize addon manifests
      const normalizedAddons = addons.map((addon) => ({
        ...addon,
        manifest: {
          ...addon.manifest,
          logo: addon.manifest.logo ?? undefined,
          background: addon.manifest.background ?? undefined,
          idPrefixes: addon.manifest.idPrefixes ?? undefined,
        },
      }))

      const account: Omit<StremioAccount, 'id'> = {
        name,
        authKey: authKey, // Store auth key directly without encryption
        addons: normalizedAddons,
        lastSync: new Date().toISOString(),
        status: 'active',
      }

      // Create account in backend and get the ID
      const accountWithId = { ...account, id: (await backendApi.createAccount(prepareAccountForBackend(account))).id }

      // Update state
      set((state) => ({
        accounts: [...state.accounts, accountWithId],
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add account'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  addAccountByCredentials: async (email, password, name) => {
    set({ loading: true, error: null })
    try {
      // Login to get auth key
      const response = await loginWithCredentials(email, password)

      // Fetch addons
      const addons = await getAddons(response.authKey)

      // Normalize addon manifests
      const normalizedAddons = addons.map((addon) => ({
        ...addon,
        manifest: {
          ...addon.manifest,
          logo: addon.manifest.logo ?? undefined,
          background: addon.manifest.background ?? undefined,
          idPrefixes: addon.manifest.idPrefixes ?? undefined,
        },
      }))

      // Store auth key and password directly without encryption
      const account: Omit<StremioAccount, 'id'> = {
        name: name || email,
        email,
        authKey: response.authKey, // Store auth key directly
        password: password, // Store password directly
        addons: normalizedAddons,
        lastSync: new Date().toISOString(),
        status: 'active',
      }

      // Create account in backend and get the ID
      const accountWithId = { ...account, id: (await backendApi.createAccount(prepareAccountForBackend(account))).id }

      // Update state
      set((state) => ({
        accounts: [...state.accounts, accountWithId],
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add account'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  removeAccount: async (id) => {
    set({ loading: true, error: null })
    try {
      // Delete from backend
      await backendApi.deleteAccount(id)
      // Update state
      set((state) => ({
        accounts: state.accounts.filter((acc) => acc.id !== id),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove account'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  syncAccount: async (id) => {
    set({ loading: true, error: null })
    try {
      const account = get().accounts.find((acc) => acc.id === id)
      if (!account) {
        throw new Error('Account not found')
      }

      // Use auth key directly without decryption
      const authKey = account.authKey
      const addons = await getAddons(authKey)

      // Normalize addon manifests
      const normalizedAddons = addons.map((addon) => ({
        ...addon,
        manifest: {
          ...addon.manifest,
          logo: addon.manifest.logo ?? undefined,
          background: addon.manifest.background ?? undefined,
          idPrefixes: addon.manifest.idPrefixes ?? undefined,
        },
      }))

      const updatedAccount = {
        ...account,
        addons: normalizedAddons,
        lastSync: new Date().toISOString(),
        status: 'active' as const,
      }

      // Update account in backend
      await backendApi.updateAccount(id, prepareAccountForBackend(updatedAccount))

      // Update state
      set((state) => ({
        accounts: state.accounts.map((acc) => (acc.id === id ? updatedAccount : acc)),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync account'
      const account = get().accounts.find((acc) => acc.id === id)

      // Mark account as error
      const accounts = get().accounts.map((acc) =>
        acc.id === id ? { ...acc, status: 'error' as const } : acc
      )
      set({ accounts, error: message })

      // Show toast notification
      toast({
        variant: 'destructive',
        title: 'Sync Failed',
        description: `Unable to sync "${account?.name}". Please check your credentials.`,
      })

      throw error
    } finally {
      set({ loading: false })
    }
  },

  syncAllAccounts: async () => {
    set({ loading: true, error: null })
    const accounts = get().accounts

    for (const account of accounts) {
      try {
        // Use auth key directly without decryption
        const authKey = account.authKey
        const addons = await getAddons(authKey)

        // Normalize addon manifests
        const normalizedAddons = addons.map((addon) => ({
          ...addon,
          manifest: {
            ...addon.manifest,
            logo: addon.manifest.logo ?? undefined,
            background: addon.manifest.background ?? undefined,
            idPrefixes: addon.manifest.idPrefixes ?? undefined,
          },
        }))

        const updatedAccount = {
          ...account,
          addons: normalizedAddons,
          lastSync: new Date().toISOString(),
          status: 'active' as const,
        }

        // Update account in backend
        await backendApi.updateAccount(account.id, prepareAccountForBackend(updatedAccount))

        // Update state for this account
        set((state) => ({
          accounts: state.accounts.map((acc) =>
            acc.id === account.id ? updatedAccount : acc
          ),
        }))
      } catch (error) {
        // Mark account as error but continue with others
        const updatedAccounts = get().accounts.map((acc) =>
          acc.id === account.id
            ? { ...acc, status: 'error' as const }
            : acc
        )
        set({ accounts: updatedAccounts })

        // Show toast notification for this account
        toast({
          variant: 'destructive',
          title: 'Sync Failed',
          description: `Unable to sync "${account.name}". Please check your credentials.`,
        })
      }
    }

    // Refetch accounts to ensure state is consistent
    try {
      const freshAccounts = await backendApi.fetchAccounts()
      const mappedAccounts = freshAccounts.map(mapBackendAccountToFrontend)
      set({ accounts: mappedAccounts })
    } catch (error) {
      console.error('Failed to refetch accounts after syncAll:', error)
    }

    set({ loading: false })
  },

  installAddonToAccount: async (accountId, addonUrl) => {
    set({ loading: true, error: null })
    try {
      const account = get().accounts.find((acc) => acc.id === accountId)
      if (!account) {
        throw new Error('Account not found')
      }

      // Use auth key directly without decryption
      const authKey = account.authKey
      const updatedAddons = await apiInstallAddon(authKey, addonUrl)

      // Normalize addon manifests
      const normalizedAddons = updatedAddons.map((addon: AddonDescriptor) => ({
        ...addon,
        manifest: {
          ...addon.manifest,
          logo: addon.manifest.logo ?? undefined,
          background: addon.manifest.background ?? undefined,
          idPrefixes: addon.manifest.idPrefixes ?? undefined,
        },
      }))

      const updatedAccount = {
        ...account,
        addons: normalizedAddons,
        lastSync: new Date().toISOString(),
      }

      // Update account in backend
      await backendApi.updateAccount(accountId, prepareAccountForBackend(updatedAccount))

      // Update state
      set((state) => ({
        accounts: state.accounts.map((acc) =>
          acc.id === accountId ? updatedAccount : acc
        ),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to install addon'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  removeAddonFromAccount: async (accountId, addonId) => {
    set({ loading: true, error: null })
    try {
      const account = get().accounts.find((acc) => acc.id === accountId)
      if (!account) {
        throw new Error('Account not found')
      }

      // Use auth key directly without decryption
      const authKey = account.authKey
      const updatedAddons = await apiRemoveAddon(authKey, addonId)

      // Normalize addon manifests
      const normalizedAddons: AddonDescriptor[] = updatedAddons.map((addon: AddonDescriptor) => ({
        ...addon,
        manifest: {
          ...addon.manifest,
          logo: addon.manifest.logo ?? undefined,
          background: addon.manifest.background ?? undefined,
          idPrefixes: addon.manifest.idPrefixes ?? undefined,
        },
      }))

      const updatedAccount = {
        ...account,
        addons: normalizedAddons,
        lastSync: new Date().toISOString(),
      }

      // Update account in backend
      await backendApi.updateAccount(accountId, prepareAccountForBackend(updatedAccount))

      // Update state
      set((state) => ({
        accounts: state.accounts.map((acc) =>
          acc.id === accountId ? updatedAccount : acc
        ),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove addon'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  reorderAddons: async (accountId, newOrder) => {
    set({ loading: true, error: null })
    try {
      const account = get().accounts.find((acc) => acc.id === accountId)
      if (!account) {
        throw new Error('Account not found')
      }

      // Use auth key directly without decryption
      const authKey = account.authKey
      await updateAddons(authKey, newOrder)

      const updatedAccount = {
        ...account,
        addons: newOrder,
        lastSync: new Date().toISOString(),
      }

      // Update account in backend
      await backendApi.updateAccount(accountId, prepareAccountForBackend(updatedAccount))

      // Update state
      set((state) => ({
        accounts: state.accounts.map((acc) =>
          acc.id === accountId ? updatedAccount : acc
        ),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reorder addons'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  exportAccounts: async (includeCredentials) => {
    try {
      // Load saved addon library
      const addonLibrary = await loadAddonLibrary()
      const savedAddons = Object.values(addonLibrary).map((addon) => ({
        ...addon,
        manifest: {
          ...addon.manifest,
          logo: addon.manifest.logo ?? undefined,
          background: addon.manifest.background ?? undefined,
          idPrefixes: addon.manifest.idPrefixes ?? undefined,
        },
        createdAt: addon.createdAt.toISOString(),
        updatedAt: addon.updatedAt.toISOString(),
        lastUsed: addon.lastUsed?.toISOString(),
      }))

      const data: AccountExport = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        accounts: await Promise.all(
          get().accounts.map(async (acc) => ({
            name: acc.name,
            email: acc.email,
            authKey: includeCredentials ? acc.authKey : undefined,
            password: includeCredentials && acc.password ? acc.password : undefined,
            addons: acc.addons.map((addon) => ({
              ...addon,
              manifest: {
                ...addon.manifest,
                logo: addon.manifest.logo ?? undefined,
                background: addon.manifest.background ?? undefined,
                idPrefixes: addon.manifest.idPrefixes ?? undefined,
              },
            })),
          }))
        ),
        savedAddons: savedAddons.length > 0 ? savedAddons : undefined,
      }

      return JSON.stringify(data, null, 2)
    } catch (error) {
      console.error('Failed to load addon library during export:', error)
      // Fallback: export without saved addons
      const data: AccountExport = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        accounts: await Promise.all(
          get().accounts.map(async (acc) => ({
            name: acc.name,
            email: acc.email,
            authKey: includeCredentials
              ? await decrypt(acc.authKey, useAuthStore.getState().encryptionKey as CryptoKey)
              : undefined,
            password:
              includeCredentials && acc.password
                ? await decrypt(acc.password, useAuthStore.getState().encryptionKey as CryptoKey)
                : undefined,
            addons: acc.addons.map((addon) => ({
              ...addon,
              manifest: {
                ...addon.manifest,
                logo: addon.manifest.logo ?? undefined,
                background: addon.manifest.background ?? undefined,
                idPrefixes: addon.manifest.idPrefixes ?? undefined,
              },
            })),
          }))
        ),
      }

      return JSON.stringify(data, null, 2)
    }
  },

  importAccounts: async (json) => {
    set({ loading: true, error: null })
    try {
      const data = JSON.parse(json)

      // Validate with Zod
      const validated = accountExportSchema.parse(data)

        // Create accounts in backend without encryption
        await Promise.all(
          validated.accounts.map(async (acc) => {
            const account: Omit<StremioAccount, 'id'> = {
              name: acc.name,
              email: acc.email,
              authKey: acc.authKey || '',
              password: acc.password || '',
              addons: acc.addons.map((addon) => ({
                ...addon,
                manifest: {
                  ...addon.manifest,
                  logo: addon.manifest.logo ?? undefined,
                 background: addon.manifest.background ?? undefined,
                 idPrefixes: addon.manifest.idPrefixes ?? undefined,
               },
             })),
             lastSync: new Date().toISOString(),
             status: 'active',
           }

           // Create account in backend (we don't need the result because we refetch)
           await backendApi.createAccount(prepareAccountForBackend(account))
         })
       )

      // Import saved addons if present
        if (validated.savedAddons && validated.savedAddons.length > 0) {
          try {
            const existingLibrary = await loadAddonLibrary()

            for (const savedAddon of validated.savedAddons) {
              if (findSavedAddonByUrl(existingLibrary, savedAddon.installUrl)) {
                continue
              }

              await backendApi.createSavedAddon({
                name: savedAddon.name,
                installUrl: savedAddon.installUrl,
                manifest: savedAddon.manifest,
                tags: savedAddon.tags,
                sourceType: savedAddon.sourceType || 'manual',
                createdAt: savedAddon.createdAt ? new Date(savedAddon.createdAt) : new Date(),
                updatedAt: savedAddon.updatedAt ? new Date(savedAddon.updatedAt) : new Date(),
                lastUsed: savedAddon.lastUsed ? new Date(savedAddon.lastUsed) : undefined,
                health: savedAddon.health,
              })
            }

            try {
              await useAddonStore.getState().initialize()
            } catch (error) {
              console.error('Failed to reload addon library after import:', error)
            }
          } catch (error) {
            console.error('Failed to import saved addons:', error)
            toast({
              variant: 'destructive',
              title: 'Warning',
              description: 'Accounts imported successfully, but saved addons failed to import.',
            })
          }
        }

      // Refetch accounts to ensure state is consistent
      const freshAccounts = await backendApi.fetchAccounts()
      const mappedAccounts = freshAccounts.map(mapBackendAccountToFrontend)
      set({ accounts: mappedAccounts })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import accounts'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  updateAccount: async (id, data) => {
    set({ loading: true, error: null })
    try {
      const account = get().accounts.find((acc) => acc.id === id)
      if (!account) {
        throw new Error('Account not found')
      }

      const updatedAccount = { ...account, name: data.name }

      // If credentials changed, re-validate
      if (data.authKey || (data.email && data.password)) {
        let authKey = ''

        if (data.authKey) {
          authKey = data.authKey
        } else if (data.email && data.password) {
          const response = await loginWithCredentials(data.email, data.password)
          authKey = response.authKey
          updatedAccount.email = data.email
        }

        // Fetch addons with new key
        const addons = await getAddons(authKey)

        // Normalize addon manifests
        const normalizedAddons = addons.map((addon) => ({
          ...addon,
          manifest: {
            ...addon.manifest,
            logo: addon.manifest.logo ?? undefined,
            background: addon.manifest.background ?? undefined,
            idPrefixes: addon.manifest.idPrefixes ?? undefined,
          },
        }))

        updatedAccount.addons = normalizedAddons
        updatedAccount.status = 'active'
        updatedAccount.lastSync = new Date().toISOString()
      }

      // Update account in backend
      await backendApi.updateAccount(id, prepareAccountForBackend(updatedAccount))

      // Update state
      set((state) => ({
        accounts: state.accounts.map((acc) => (acc.id === id ? updatedAccount : acc)),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update account'
      set({ error: message })
      throw error
    } finally {
      set({ loading: false })
    }
  },

  clearError: () => {
    set({ error: null })
  },

  reset: () => {
    set({ accounts: [], loading: false, error: null })
  },
}))
