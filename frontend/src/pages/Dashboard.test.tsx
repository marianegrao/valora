import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import { AuthProvider } from '../auth/AuthContext'
import { DataContext } from '../data/DataContext'
import * as apiClient from '../lib/apiClient'
import { createTestData, transactionDoc } from '../test/dataHelpers'

vi.mock('../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/apiClient')>()
  return {
    ...actual,
    me: vi.fn(),
    getAccounts: vi.fn(),
  }
})

type TestData = Awaited<ReturnType<typeof createTestData>>

function renderPage(data: TestData) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <DataContext.Provider value={data.value}>
          <Dashboard />
        </DataContext.Provider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Dashboard page', () => {
  let data: TestData

  beforeEach(async () => {
    localStorage.clear()
    localStorage.setItem('valora.accessToken', 'token-123')
    vi.clearAllMocks()
    vi.mocked(apiClient.me).mockResolvedValue({
      id: '1',
      name: 'Maria',
      email: 'maria@example.com',
      encryptionKey: 'key-123',
    })
    vi.mocked(apiClient.getAccounts).mockResolvedValue([
      { id: 'acc-1', name: 'Wallet', currency: 'BRL' },
    ])
    data = await createTestData()
  })

  afterEach(async () => {
    await data.db.close()
  })

  it('shows the balance as credits minus debits of local transactions, in major units', async () => {
    await data.db.transactions.bulkInsert([
      transactionDoc({ value: 10000, type: 'CREDIT' }),
      transactionDoc({ value: 4599, type: 'DEBIT' }),
      transactionDoc({ accountId: 'acc-2', value: 99999, type: 'CREDIT' }),
    ])

    renderPage(data)

    expect(await screen.findByText('54.01')).toBeInTheDocument()
  })

  it('shows a zero balance when there are no transactions', async () => {
    renderPage(data)

    expect(await screen.findByText('0.00')).toBeInTheDocument()
  })

  it('updates the balance as soon as a transaction is written locally', async () => {
    renderPage(data)
    await screen.findByText('0.00')

    await data.db.transactions.insert(transactionDoc({ value: 2500, type: 'CREDIT' }))

    expect(await screen.findByText('25.00')).toBeInTheDocument()
  })

  it('renders from cached accounts when the server is unreachable', async () => {
    localStorage.setItem(
      'valora.accounts.1',
      JSON.stringify([{ id: 'acc-1', name: 'Wallet', currency: 'BRL' }]),
    )
    vi.mocked(apiClient.getAccounts).mockRejectedValue(new TypeError('Failed to fetch'))
    await data.db.transactions.insert(transactionDoc({ value: 700, type: 'CREDIT' }))

    renderPage(data)

    expect(await screen.findByText('7.00')).toBeInTheDocument()
  })
})
