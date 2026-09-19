import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Transactions } from './Transactions'
import { AuthProvider } from '../auth/AuthContext'
import * as apiClient from '../lib/apiClient'

vi.mock('../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/apiClient')>()
  return {
    ...actual,
    me: vi.fn(),
    getAccounts: vi.fn(),
    getTransactions: vi.fn(),
    createTransaction: vi.fn(),
  }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Transactions />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Transactions page', () => {
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

  it('lists the transactions for the first account, converted to major units', async () => {
    vi.mocked(apiClient.getTransactions).mockResolvedValue([
      {
        id: 'tx-1',
        accountId: 'acc-1',
        description: 'Groceries',
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
    expect(await screen.findByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('45.99')).toBeInTheDocument()
  })

  it('submits a new transaction converting the amount to minor units', async () => {
    vi.mocked(apiClient.getTransactions).mockResolvedValue([])
    vi.mocked(apiClient.createTransaction).mockResolvedValue({
      id: 'tx-2',
      accountId: 'acc-1',
      description: 'Coffee',
      value: 1050,
      type: 'DEBIT',
      paymentMethod: 'PIX',
    })

    renderPage()
    await waitFor(() =>
      expect(apiClient.getTransactions).toHaveBeenCalled(),
    )

    await userEvent.type(screen.getByLabelText(/amount/i), '10.50')
    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'DEBIT')
    await userEvent.selectOptions(
      screen.getByLabelText(/payment method/i),
      'PIX',
    )
    await userEvent.type(screen.getByLabelText(/description/i), 'Coffee')
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }))

    await waitFor(() =>
      expect(apiClient.createTransaction).toHaveBeenCalledWith('token-123', {
        accountId: 'acc-1',
        description: 'Coffee',
        value: 1050,
        type: 'DEBIT',
        paymentMethod: 'PIX',
      }),
    )
  })
})
