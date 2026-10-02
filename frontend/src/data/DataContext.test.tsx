import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BehaviorSubject } from 'rxjs'
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory'
import { AuthProvider, useAuth } from '../auth/AuthContext'
import * as apiClient from '../lib/apiClient'
import { closeUserDatabases } from '../lib/db'
import { createSyncController, type SyncController, type SyncStatus } from '../lib/sync'
import { DataProvider, useData } from './DataContext'

vi.mock('../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/apiClient')>()
  return { ...actual, me: vi.fn() }
})

vi.mock('../lib/sync', () => ({ createSyncController: vi.fn() }))

function fakeSync(): SyncController {
  return {
    status$: new BehaviorSubject<SyncStatus>('offline'),
    trigger: vi.fn().mockResolvedValue(undefined),
    markOffline: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
}

function Consumer() {
  const { transactions } = useData()
  const { logout } = useAuth()
  return (
    <div>
      <span data-testid="db">{transactions ? 'ready' : 'none'}</span>
      <button onClick={logout}>logout</button>
    </div>
  )
}

const storage = getRxStorageMemory()

function renderWithProviders() {
  return render(
    <AuthProvider>
      <DataProvider storage={storage}>
        <Consumer />
      </DataProvider>
    </AuthProvider>,
  )
}

describe('DataProvider', () => {
  let sync: SyncController

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    sync = fakeSync()
    vi.mocked(createSyncController).mockReturnValue(sync)
    vi.mocked(apiClient.me).mockResolvedValue({
      id: crypto.randomUUID(),
      name: 'Maria',
      email: 'maria@example.com',
      encryptionKey: 'k'.repeat(64),
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await closeUserDatabases()
  })

  it('provides no database while signed out', async () => {
    renderWithProviders()

    await waitFor(() => expect(apiClient.me).not.toHaveBeenCalled())
    expect(screen.getByTestId('db')).toHaveTextContent('none')
    expect(createSyncController).not.toHaveBeenCalled()
  })

  it('opens the local database and syncs on start once signed in', async () => {
    localStorage.setItem('valora.accessToken', 'token-123')

    renderWithProviders()

    await waitFor(() => expect(screen.getByTestId('db')).toHaveTextContent('ready'))
    expect(createSyncController).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'token-123' }),
    )
    expect(sync.trigger).toHaveBeenCalledTimes(1)
  })

  it('does not sync on start while the browser is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    localStorage.setItem('valora.accessToken', 'token-123')

    renderWithProviders()

    await waitFor(() => expect(screen.getByTestId('db')).toHaveTextContent('ready'))
    expect(sync.trigger).not.toHaveBeenCalled()
  })

  it('syncs again whenever the browser comes back online', async () => {
    localStorage.setItem('valora.accessToken', 'token-123')
    renderWithProviders()
    await waitFor(() => expect(screen.getByTestId('db')).toHaveTextContent('ready'))

    act(() => {
      window.dispatchEvent(new Event('online'))
    })

    expect(sync.trigger).toHaveBeenCalledTimes(2)
  })

  it('marks sync offline when the browser goes offline', async () => {
    localStorage.setItem('valora.accessToken', 'token-123')
    renderWithProviders()
    await waitFor(() => expect(screen.getByTestId('db')).toHaveTextContent('ready'))

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })

    expect(sync.markOffline).toHaveBeenCalled()
  })

  it('stops syncing and releases the database on logout', async () => {
    localStorage.setItem('valora.accessToken', 'token-123')
    renderWithProviders()
    await waitFor(() => expect(screen.getByTestId('db')).toHaveTextContent('ready'))

    await userEvent.click(screen.getByText('logout'))

    await waitFor(() => expect(screen.getByTestId('db')).toHaveTextContent('none'))
    expect(sync.dispose).toHaveBeenCalled()
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(sync.trigger).toHaveBeenCalledTimes(1)
  })
})
