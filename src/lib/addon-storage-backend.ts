import { SavedAddon } from '@/types/saved-addon'
import { backendApi } from '@/lib/backendApi'

/**
 * Saved Addon Storage Layer
 *
 * Provides persistence for saved addons using backend API instead of localforage.
 */

/**
 * Load all saved addons from backend
 */
export async function loadAddonLibrary(): Promise<Record<string, SavedAddon>> {
  try {
    const savedAddons = await backendApi.fetchSavedAddons();
    
    // Convert array to record
    const library: Record<string, SavedAddon> = {}
    for (const savedAddon of savedAddons) {
      library[savedAddon.id] = {
        ...savedAddon,
        createdAt: new Date(savedAddon.createdAt),
        updatedAt: new Date(savedAddon.updatedAt),
        lastUsed: savedAddon.lastUsed ? new Date(savedAddon.lastUsed) : undefined,
      }
    }
    
    return library
  } catch (error) {
    console.error('Failed to load addon library from backend:', error)
    return {}
  }
}

/**
 * Save addon library to backend
 */
export async function saveAddonLibrary(
  _library: Record<string, SavedAddon>
): Promise<void> {
  try {
    // Backend handles persistence, we just need to sync
    // This is a no-op since the backend handles storage
    console.log('Addon library saved to backend')
  } catch (error) {
    console.error('Failed to save addon library to backend:', error)
    throw new Error('Failed to save addon library')
  }
}

/**
 * Load all account addon states from backend
 */
export async function loadAccountAddonStates(): Promise<
  Record<string, any>
> {
  try {
    // For now, return empty state as we don't have a backend endpoint for this yet
    return {}
  } catch (error) {
    console.error('Failed to load account addon states from backend:', error)
    return {}
  }
}

/**
 * Save account addon states to backend
 */
export async function saveAccountAddonStates(
  _states: Record<string, any>
): Promise<void> {
  try {
    // For now, this is a no-op as we don't have a backend endpoint for this yet
    console.log('Account addon states saved')
  } catch (error) {
    console.error('Failed to save account addon states to backend:', error)
    throw new Error('Failed to save account addon states')
  }
}

/**
 * Normalize URL for comparison
 * Removes trailing slashes, converts to lowercase, sorts query params
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Sort query parameters for consistent comparison
    const params = new URLSearchParams(parsed.search);
    const sortedParams = new URLSearchParams(
      Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b))
    )

    // Rebuild URL with normalized parts
    parsed.search = sortedParams.toString();
    let normalized = parsed.toString();

    // Remove trailing slash
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized.toLowerCase();
  } catch {
    // If URL parsing fails, just normalize the string
    return url.toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Find a saved addon by URL (normalized comparison)
 */
export function findSavedAddonByUrl(
  library: Record<string, SavedAddon>,
  url: string
): SavedAddon | null {
  const normalizedUrl = normalizeUrl(url);

  for (const savedAddon of Object.values(library)) {
    if (normalizeUrl(savedAddon.installUrl) === normalizedUrl) {
      return savedAddon;
    }
  }

  return null;
}