export const getBackendUrl = (): string => {
  // Use VITE_BACKEND_URL if explicitly set (e.g., for Docker dev or direct backend access)
  // @ts-ignore
  const env = import.meta.env
  if (env?.VITE_BACKEND_URL) {
    // @ts-ignore
    return env.VITE_BACKEND_URL
  }

  // If running on mobile or through nginx proxy, use relative API path
  if (typeof window !== 'undefined') {
    // Use relative URL for API calls when behind proxy
    return ''
  }

  // Fallback for SSR or other edge cases
  return 'http://localhost:5000'
}

export const getApiUrl = (endpoint: string): string => {
  const base = getBackendUrl()
  return base ? `${base}${endpoint}` : endpoint
}
