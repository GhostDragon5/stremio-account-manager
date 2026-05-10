import { decrypt } from '@/lib/crypto'
import { useAuthStore } from '@/store/authStore'

export async function resolveAccountAuthKey(accountAuthKey: string): Promise<string> {
  const encryptionKey = useAuthStore.getState().encryptionKey
  if (!encryptionKey) {
    return accountAuthKey
  }

  try {
    return await decrypt(accountAuthKey, encryptionKey)
  } catch (error) {
    console.warn('Failed to decrypt account auth key, falling back to stored value', error)
    return accountAuthKey
  }
}
