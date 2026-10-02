import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Transactions } from './Transactions'
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
          <Transactions />
        </DataContext.Provider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Transactions page', () => {
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

  it('lists the local transactions of the first account, converted to major units', async () => {
    await data.db.transactions.bulkInsert([
      transactionDoc({ description: 'Groceries', value: 4599 }),
      transactionDoc({ accountId: 'acc-2', description: 'Elsewhere' }),
    ])

    renderPage(data)

    expect(await screen.findByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('45.99')).toBeInTheDocument()
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument()
  })

  it('still lists transactions from cached accounts when the server is unreachable', async () => {
    localStorage.setItem(
      'valora.accounts.1',
      JSON.stringify([{ id: 'acc-1', name: 'Wallet', currency: 'BRL' }]),
    )
    vi.mocked(apiClient.getAccounts).mockRejectedValue(new TypeError('Failed to fetch'))
    await data.db.transactions.insert(transactionDoc({ description: 'Coffee' }))

    renderPage(data)

    expect(await screen.findByText('Coffee')).toBeInTheDocument()
  })

  it('shows a validation error and writes nothing when the amount is not a valid number', async () => {
    renderPage(data)
    await screen.findByRole('button', { name: /add transaction/i })

    await userEvent.type(screen.getByLabelText(/amount/i), 'abc')
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }))

    expect(await screen.findByText(/enter a valid amount/i)).toBeInTheDocument()
    expect(await data.db.transactions.count().exec()).toBe(0)
    expect(data.sync.trigger).not.toHaveBeenCalled()
  })

  it('saves a new transaction locally in minor units, shows it and triggers a sync', async () => {
    renderPage(data)
    await screen.findByRole('button', { name: /add transaction/i })

    await userEvent.type(screen.getByLabelText(/amount/i), '10.50')
    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'CREDIT')
    await userEvent.selectOptions(screen.getByLabelText(/payment method/i), 'CASH')
    await userEvent.type(screen.getByLabelText(/description/i), 'Coffee')
    await userEvent.click(screen.getByRole('button', { name: /add transaction/i }))

    expect(await screen.findByText('Coffee')).toBeInTheDocument()
    expect(screen.getByText('10.50')).toBeInTheDocument()
    const [saved] = await data.db.transactions.find().exec()
    expect(saved.toJSON()).toEqual(
      expect.objectContaining({
        accountId: 'acc-1',
        description: 'Coffee',
        value: 1050,
        type: 'CREDIT',
        paymentMethod: 'CASH',
      }),
    )
    expect(saved.updatedAt).toBe(saved.createdAt)
    await waitFor(() => expect(data.sync.trigger).toHaveBeenCalled())
  })

  describe('editing', () => {
    it('updates the transaction locally, bumping updatedAt, and triggers a sync', async () => {
      const doc = transactionDoc({ description: 'Groceries', value: 4599 })
      await data.db.transactions.insert(doc)
      renderPage(data)
      const row = (await screen.findByText('Groceries')).closest('li')!

      await userEvent.click(within(row).getByRole('button', { name: /edit/i }))
      const amountInput = screen.getByLabelText(/amount/i)
      expect(amountInput).toHaveValue('45.99')
      await userEvent.clear(amountInput)
      await userEvent.type(amountInput, '50.00')
      await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

      expect(await screen.findByText('50.00')).toBeInTheDocument()
      const saved = await data.db.transactions.findOne(doc.id).exec()
      expect(saved?.value).toBe(5000)
      expect(saved?.description).toBe('Groceries')
      expect(saved!.updatedAt).toBeGreaterThan(doc.updatedAt)
      expect(screen.getByRole('button', { name: /add transaction/i })).toBeInTheDocument()
      await waitFor(() => expect(data.sync.trigger).toHaveBeenCalled())
    })

    it('can be cancelled without changing the transaction', async () => {
      const doc = transactionDoc({ description: 'Groceries', value: 4599 })
      await data.db.transactions.insert(doc)
      renderPage(data)
      const row = (await screen.findByText('Groceries')).closest('li')!

      await userEvent.click(within(row).getByRole('button', { name: /edit/i }))
      await userEvent.clear(screen.getByLabelText(/amount/i))
      await userEvent.type(screen.getByLabelText(/amount/i), '1.00')
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.getByLabelText(/amount/i)).toHaveValue('')
      expect((await data.db.transactions.findOne(doc.id).exec())?.value).toBe(4599)
    })
  })

  describe('deleting', () => {
    it('asks for confirmation and keeps the transaction when cancelled', async () => {
      const doc = transactionDoc({ description: 'Groceries' })
      await data.db.transactions.insert(doc)
      renderPage(data)
      const row = (await screen.findByText('Groceries')).closest('li')!

      await userEvent.click(within(row).getByRole('button', { name: /delete/i }))
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent(/delete this transaction/i)
      await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Groceries')).toBeInTheDocument()
      expect(await data.db.transactions.findOne(doc.id).exec()).not.toBeNull()
    })

    it('soft-deletes after confirmation, bumping updatedAt, and triggers a sync', async () => {
      const doc = transactionDoc({ description: 'Groceries' })
      await data.db.transactions.insert(doc)
      renderPage(data)
      const row = (await screen.findByText('Groceries')).closest('li')!

      await userEvent.click(within(row).getByRole('button', { name: /delete/i }))
      await userEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }),
      )

      await waitFor(() => expect(screen.queryByText('Groceries')).not.toBeInTheDocument())
      expect(await data.db.transactions.findOne(doc.id).exec()).toBeNull()
      const [stored] = await data.db.transactions.storageInstance.findDocumentsById(
        [doc.id],
        true,
      )
      expect(stored._deleted).toBe(true)
      expect(stored.updatedAt).toBeGreaterThan(doc.updatedAt)
      await waitFor(() => expect(data.sync.trigger).toHaveBeenCalled())
    })
  })
})
