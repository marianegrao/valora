import { ApiError, getAccounts, type Account } from './apiClient'

/**
 * Minimal read-only offline cache of the user's accounts, refreshed
 * whenever the server is reachable. Accounts are not synced through RxDB;
 * this only lets transaction screens work on an offline page load.
 */
const CACHE_PREFIX = 'valora.accounts.'

function cacheKey(userId: string) {
  return `${CACHE_PREFIX}${userId}`
}

export async function loadAccounts(token: string, userId: string): Promise<Account[]> {
  try {
    const accounts = await getAccounts(token)
    localStorage.setItem(cacheKey(userId), JSON.stringify(accounts))
    return accounts
  } catch (err) {
    // A server answer (e.g. 401) is authoritative; only a network failure
    // falls back to the cache.
    if (err instanceof ApiError) throw err
    const cached = localStorage.getItem(cacheKey(userId))
    if (cached === null) throw err
    return JSON.parse(cached) as Account[]
  }
}

export function clearAccountsCache(): void {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(CACHE_PREFIX))
    .forEach((key) => localStorage.removeItem(key))
}
