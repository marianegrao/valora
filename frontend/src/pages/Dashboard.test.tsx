import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import { AuthProvider } from '../auth/AuthContext'
import * as apiClient from '../lib/apiClient'

vi.mock('../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/apiClient')>()
  return {
    ...actual,
    me: vi.fn(),
    getAccounts: vi.fn(),
    getTransactions: vi.fn(),
  }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Dashboard page', () => {
  beforeEach(() => {
    localStorage.setItem('valora.accessToken', 'token-123')
    vi.clearAllMocks()
    vi.mocked(apiClient.me).mockResolvedValue({
      id: '1',
      name: 'Maria',
      email: 'maria@example.com',
    })
    vi.mocked(apiClient.getAccounts).mockResolvedValue([
      { id: 'acc-1', name: 'Wallet', currency: 'BRL' },
    ])
  })

  it('shows the balance as credits minus debits, converted to major units', async () => {
    vi.mocked(apiClient.getTransactions).mockResolvedValue([
      {
        id: 'tx-1',
        accountId: 'acc-1',
        value: 10000,
        type: 'CREDIT',
        paymentMethod: 'PIX',
      },
      {
        id: 'tx-2',
        accountId: 'acc-1',
        value: 4599,
        type: 'DEBIT',
        paymentMethod: 'CREDIT_CARD',
      },
    ])

    renderPage()

    await waitFor(() =>
      expect(apiClient.getTransactions).toHaveBeenCalledWith(
        'token-123',
        'acc-1',
      ),
    )
    expect(await screen.findByText('54.01')).toBeInTheDocument()
  })

  it('shows a zero balance when there are no transactions', async () => {
    vi.mocked(apiClient.getTransactions).mockResolvedValue([])

    renderPage()

    expect(await screen.findByText('0.00')).toBeInTheDocument()
  })
})
