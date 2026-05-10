import { AddonDescriptor } from '@/types/addon'
import axios, { AxiosInstance } from 'axios'
import { getBackendUrl } from '@/lib/backendConfig'
import { useAuthStore } from '@/store/authStore'

// API endpoint - we'll test CORS first, may need to use a proxy
const API_BASE = 'https://api.strem.io'

const getAuthHeaders = () => {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

export interface LoginResponse {
  authKey: string
  user: {
    _id: string
    email: string
    avatar?: string
  }
}

export interface AddonCollectionResponse {
  addons: AddonDescriptor[]
  lastModified: number
}

export class StremioClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    })
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const response = await this.client.post('/api/login', {
        type: 'Auth',
        email,
        password,
      })

      if (response.data?.error) {
        throw new Error(response.data.error.message || 'Login failed')
      }

      if (!response.data?.result?.authKey) {
        throw new Error('Invalid login response - no auth key')
      }

      return response.data.result
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid email or password')
        }
        if (error.code === 'ERR_NETWORK') {
          throw new Error('Network error - check your internet connection or CORS configuration')
        }
        throw new Error(error.response?.data?.error || error.message || 'Login failed')
      }
      throw error
    }
  }

  /**
   * Get user's addon collection
   */
  async getAddonCollection(authKey: string): Promise<AddonDescriptor[]> {
    try {
      const response = await this.client.post('/api/addonCollectionGet', {
        type: 'AddonCollectionGet',
        authKey,
        update: true,
      })

      if (response.data?.error) {
        throw new Error(response.data.error.message || 'Failed to get addon collection')
      }

      if (!response.data?.result?.addons) {
        // If no addons, return empty array
        return []
      }

      return response.data.result.addons
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid or expired auth key')
        }
        if (error.code === 'ERR_NETWORK') {
          throw new Error('Network error - check your internet connection or CORS configuration')
        }
        throw new Error(
          error.response?.data?.error || error.message || 'Failed to get addon collection'
        )
      }
      throw error
    }
  }

  /**
   * Update user's addon collection
   */
  async setAddonCollection(authKey: string, addons: AddonDescriptor[]): Promise<void> {
    try {
      const response = await this.client.post('/api/addonCollectionSet', {
        type: 'AddonCollectionSet',
        authKey,
        addons,
      })

      if (response.data?.error) {
        throw new Error(response.data.error.message || 'Failed to set addon collection')
      }

      if (!response.data?.success && response.data?.result?.success === false) {
        throw new Error('Failed to update addon collection')
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid or expired auth key')
        }
        if (error.code === 'ERR_NETWORK') {
          throw new Error('Network error - check your internet connection or CORS configuration')
        }
        throw new Error(
          error.response?.data?.error || error.message || 'Failed to set addon collection'
        )
      }
      throw error
    }
  }

  /**
   * Domains that should be fetched directly without using the proxy
   * Add domains here that have proper CORS headers or are official Stremio services
   */
  private readonly DIRECT_FETCH_DOMAINS = ['v3-cinemeta.strem.io', 'cinemeta.strem.io', 'strem.io']

  /**
   * Fetch addon manifest from URL
   * Uses CORS proxy to avoid cross-origin issues with addon servers
   * Some domains (like official Stremio services) are fetched directly
   */
  async fetchAddonManifest(transportUrl: string, retries = 2): Promise<AddonDescriptor> {
    // Determine the manifest URL
    let manifestUrl: string
    if (transportUrl.endsWith('/manifest.json') || transportUrl.includes('/manifest.json?')) {
      manifestUrl = transportUrl
    } else {
      // Try to append /manifest.json
      manifestUrl = transportUrl.endsWith('/')
        ? `${transportUrl}manifest.json`
        : `${transportUrl}/manifest.json`
    }

    // Add a 5-minute cache buster (300000ms = 5 minutes)
    const fiveMinuteInterval = Math.floor(Date.now() / 300000)
    const cacheBuster = `cb=${fiveMinuteInterval}`
    const separator = manifestUrl.includes('?') ? '&' : '?'
    const finalManifestUrl = `${manifestUrl}${separator}${cacheBuster}`

    const shouldFetchDirectly = this.DIRECT_FETCH_DOMAINS.some((domain) =>
      manifestUrl.includes(domain)
    )

    const fetchViaProxy = async (): Promise<AddonDescriptor> => {
      // Determine fallback URL (proxy or direct)
      const fetchUrl = shouldFetchDirectly
        ? finalManifestUrl
        : `https://api.allorigins.win/raw?url=${encodeURIComponent(finalManifestUrl)}`

      let lastError: unknown
      for (let i = 0; i <= retries; i++) {
        try {
          if (i > 0) {
            console.log(`[Manifest Fetch] Retrying (${i}/${retries}) for: ${manifestUrl}`)
            await new Promise((resolve) => setTimeout(resolve, 1000 * i))
          } else {
            console.log(
              `[Manifest Fetch] Fetching ${shouldFetchDirectly ? 'directly' : 'via proxy'}: ${manifestUrl}`
            )
          }

          const response = await axios.get(fetchUrl, { timeout: 5000 })
          let manifestData = response.data
          if (typeof manifestData === 'string') {
            try {
              manifestData = JSON.parse(manifestData)
            } catch {
              console.error(
                `[Manifest Fetch] Failed to parse JSON for ${manifestUrl}:`,
                response.data
              )
              throw new Error('Invalid addon manifest - could not parse JSON')
            }
          }

          if (!manifestData?.id || !manifestData?.name || !manifestData?.version) {
            console.error(`[Manifest Fetch] Missing fields for ${manifestUrl}:`, manifestData)
            throw new Error('Invalid addon manifest - missing required fields')
          }

          return {
            transportUrl,
            manifest: manifestData,
          }
        } catch (error) {
          lastError = error
          console.warn(
            `[Manifest Fetch] Attempt ${i + 1} failed for ${manifestUrl}:`,
            error instanceof Error ? error.message : error
          )

          if (axios.isAxiosError(error) && error.response?.status === 404) {
            throw new Error('Addon manifest not found at this URL')
          }
        }
      }

      if (axios.isAxiosError(lastError)) {
        throw new Error(
          lastError.message || 'Failed to fetch addon manifest after retries'
        )
      }
      throw lastError
    }

    const fetchViaBackend = async (): Promise<AddonDescriptor> => {
      const response = await axios.post(
        `${getBackendUrl()}/api/addon-manifest`,
        { url: finalManifestUrl },
        {
          headers: getAuthHeaders(),
          timeout: 20000,
        }
      )
      const manifestData = response.data?.manifest
      if (!manifestData) {
        throw new Error('Backend manifest proxy returned empty data')
      }
      return {
        transportUrl,
        manifest: manifestData,
      }
    }

    try {
      return await fetchViaBackend()
    } catch (backendError) {
      console.warn(
        `[Manifest Fetch] Backend manifest proxy failed for ${manifestUrl}:`,
        backendError instanceof Error ? backendError.message : backendError
      )
      return await fetchViaProxy()
    }
  }

  /**
   * Test CORS access to the API
   */
  async testCORS(): Promise<boolean> {
    try {
      await this.client.post('/api/addonCollectionGet', {
        type: 'AddonCollectionGet',
        authKey: 'test',
      })
      return true
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // If we get a response (even error response), CORS is working
        if (error.response) {
          return true
        }
        // Network error likely means CORS issue
        if (error.code === 'ERR_NETWORK') {
          return false
        }
      }
      return false
    }
  }
}

export const stremioClient = new StremioClient()
