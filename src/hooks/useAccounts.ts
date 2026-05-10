import { useAccountStore } from '@/store/accountStore'
import type { StremioAccount } from '@/types/account'

export function useAccounts() {
  const accounts = useAccountStore((state: { accounts: StremioAccount[] }) => state.accounts)
  const loading = useAccountStore((state: { loading: boolean }) => state.loading)
  const error = useAccountStore((state: { error: string | null }) => state.error)

  const addAccountByAuthKey = useAccountStore((state: { addAccountByAuthKey: (authKey: string, name: string) => Promise<void> }) => state.addAccountByAuthKey)
  const addAccountByCredentials = useAccountStore((state: { addAccountByCredentials: (email: string, password: string, name: string) => Promise<void> }) => state.addAccountByCredentials)
  const removeAccount = useAccountStore((state: { removeAccount: (id: string) => Promise<void> }) => state.removeAccount)
  const syncAccount = useAccountStore((state: { syncAccount: (id: string) => Promise<void> }) => state.syncAccount)
  const syncAllAccounts = useAccountStore((state: { syncAllAccounts: () => Promise<void> }) => state.syncAllAccounts)
  const clearError = useAccountStore((state: { clearError: () => void }) => state.clearError)

  return {
    accounts,
    loading,
    error,
    addAccountByAuthKey,
    addAccountByCredentials,
    removeAccount,
    syncAccount,
    syncAllAccounts,
    updateAccount: useAccountStore((state: { updateAccount: (id: string, data: { name: string; authKey?: string; email?: string; password?: string }) => Promise<void> }) => state.updateAccount),
    clearError,
  }
}
