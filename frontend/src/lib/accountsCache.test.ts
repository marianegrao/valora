import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as apiClient from './apiClient'
import { clearAccountsCache, loadAccounts } from './accountsCache'

vi.mock('./apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apiClient')>()
  return { ...actual, getAccounts: vi.fn() }
})

const accounts: apiClient.Account[] = [{ id: 'acc-1', name: 'Wallet', currency: 'BRL' }]

describe('loadAccounts', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('fetches the accounts and caches them for the user', async () => {
    vi.mocked(apiClient.getAccounts).mockResolvedValue(accounts)

    const result = await loadAccounts('token-123', 'user-1')

    expect(apiClient.getAccounts).toHaveBeenCalledWith('token-123')
    expect(result).toEqual(accounts)
    expect(JSON.parse(localStorage.getItem('valora.accounts.user-1')!)).toEqual(accounts)
  })

  it('falls back to the cached accounts when the server cannot be reached', async () => {
    localStorage.setItem('valora.accounts.user-1', JSON.stringify(accounts))
    vi.mocked(apiClient.getAccounts).mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await loadAccounts('token-123', 'user-1')).toEqual(accounts)
  })

  it("does not use another user's cached accounts", async () => {
    localStorage.setItem('valora.accounts.user-2', JSON.stringify(accounts))
    const offline = new TypeError('Failed to fetch')
    vi.mocked(apiClient.getAccounts).mockRejectedValue(offline)

    await expect(loadAccounts('token-123', 'user-1')).rejects.toBe(offline)
  })

  it('rethrows server errors instead of serving stale cached accounts', async () => {
    localStorage.setItem('valora.accounts.user-1', JSON.stringify(accounts))
    const serverError = new apiClient.ApiError(401, 'Unauthorized')
    vi.mocked(apiClient.getAccounts).mockRejectedValue(serverError)

    await expect(loadAccounts('token-123', 'user-1')).rejects.toBe(serverError)
  })
})

describe('clearAccountsCache', () => {
  it('removes every cached account list and nothing else', () => {
    localStorage.setItem('valora.accounts.user-1', '[]')
    localStorage.setItem('valora.accounts.user-2', '[]')
    localStorage.setItem('valora.accessToken', 'token-123')

    clearAccountsCache()

    expect(localStorage.getItem('valora.accounts.user-1')).toBeNull()
    expect(localStorage.getItem('valora.accounts.user-2')).toBeNull()
    expect(localStorage.getItem('valora.accessToken')).toBe('token-123')
  })
})
