import { useAccountStore } from '@/store/accountStore'

export function useAddons(accountId?: string) {
  const installAddon = useAccountStore((state: any) => state.installAddonToAccount)
  const removeAddon = useAccountStore((state: any) => state.removeAddonFromAccount)
  const loading = useAccountStore((state: any) => state.loading)
  const error = useAccountStore((state: any) => state.error)

  const account = useAccountStore((state: any) =>
    accountId ? state.accounts.find((acc: any) => acc.id === accountId) : null
  )

  const addons = account?.addons || []

  return {
    addons,
    loading,
    error,
    installAddon,
    removeAddon,
  }
}