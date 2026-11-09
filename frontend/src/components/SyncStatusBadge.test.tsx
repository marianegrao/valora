import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BehaviorSubject } from 'rxjs'
import { DataContext } from '../data/DataContext'
import type { SyncController, SyncStatus } from '../lib/sync'
import { SyncStatusBadge } from './SyncStatusBadge'

function renderBadge(sync: SyncController | null) {
  return render(
    <DataContext.Provider value={{ transactions: null, sync, error: null }}>
      <SyncStatusBadge />
    </DataContext.Provider>,
  )
}

function fakeSync(status$: BehaviorSubject<SyncStatus>): SyncController {
  return {
    status$,
    trigger: vi.fn(),
    markOffline: vi.fn(),
    dispose: vi.fn(),
  }
}

describe('SyncStatusBadge', () => {
  it('follows the replication status as it toggles', () => {
    const status$ = new BehaviorSubject<SyncStatus>('offline')
    renderBadge(fakeSync(status$))

    expect(screen.getByRole('status')).toHaveTextContent('Offline')

    act(() => status$.next('online'))
    expect(screen.getByRole('status')).toHaveTextContent('Online')

    act(() => status$.next('offline'))
    expect(screen.getByRole('status')).toHaveTextContent('Offline')
  })

  it('renders nothing while there is no sync session', () => {
    renderBadge(null)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
