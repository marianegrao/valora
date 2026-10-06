import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useData } from '../data/DataContext'
import { ApiError, type PaymentMethod, type TransactionType } from '../lib/apiClient'
import { loadAccounts } from '../lib/accountsCache'
import type { TransactionDoc } from '../lib/db'
import { toMajorUnits, toMinorUnits } from '../lib/money'
import { createTransactionSchema, formatValidationError } from '../lib/validation'

export function Transactions() {
  const { token, user } = useAuth()
  const { transactions: collection, sync, error: dataError } = useData()
  const navigate = useNavigate()
  const userId = user?.id ?? null
  const [accountId, setAccountId] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<TransactionDoc[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState('')
  const [type, setType] = useState<TransactionType>('DEBIT')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !userId) return
    const currentToken = token
    const currentUserId = userId

    async function loadAccount() {
      try {
        const accounts = await loadAccounts(currentToken, currentUserId)
        if (accounts.length === 0) {
          navigate('/accounts/new')
          return
        }
        setAccountId(accounts[0].id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong')
      } finally {
        setIsLoading(false)
      }
    }

    loadAccount()
  }, [token, userId, navigate])

  useEffect(() => {
    if (!collection || !accountId) return
    const subscription = collection.find({ selector: { accountId } }).$.subscribe({
      next: (docs) =>
        setTransactions(
          docs
            .map((doc) => doc.toMutableJSON())
            .sort((a, b) => a.createdAt - b.createdAt),
        ),
      error: () => setError('Could not load local transactions'),
    })
    return () => subscription.unsubscribe()
  }, [collection, accountId])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!collection || !accountId) return
    setError(null)

    const validation = createTransactionSchema.safeParse({
      amount,
      type,
      paymentMethod,
      description: description || undefined,
    })
    if (!validation.success) {
      setError(formatValidationError(validation.error))
      return
    }

    setIsSubmitting(true)
    try {
      // Written locally first; the list updates from the local write and
      // replication reconciles with the backend in the background.
      // updatedAt is bumped on every write: it decides last-write-wins.
      const now = Date.now()
      const fields = {
        description: validation.data.description ?? null,
        value: toMinorUnits(validation.data.amount),
        type: validation.data.type,
        paymentMethod: validation.data.paymentMethod,
        updatedAt: now,
      }
      if (editingId) {
        const doc = await collection.findOne(editingId).exec()
        if (!doc) throw new Error('Transaction no longer exists')
        await doc.incrementalPatch(fields)
      } else {
        await collection.insert({
          id: crypto.randomUUID(),
          accountId,
          createdAt: now,
          ...fields,
        })
      }
      resetForm()
      void sync?.trigger()
    } catch {
      setError('Could not save the transaction')
    } finally {
      setIsSubmitting(false)
    }
  }

  function resetForm() {
    setEditingId(null)
    setAmount('')
    setType('DEBIT')
    setPaymentMethod('PIX')
    setDescription('')
  }

  function startEditing(transaction: TransactionDoc) {
    setError(null)
    setEditingId(transaction.id)
    setAmount(toMajorUnits(transaction.value))
    setType(transaction.type)
    setPaymentMethod(transaction.paymentMethod)
    setDescription(transaction.description ?? '')
  }

  async function confirmDelete() {
    if (!collection || !pendingDeleteId) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    setError(null)
    try {
      const doc = await collection.findOne(id).exec()
      if (!doc) return
      // Soft-delete: the bumped updatedAt travels with _deleted so the
      // deletion wins over older edits made on other devices.
      const touched = await doc.incrementalPatch({ updatedAt: Date.now() })
      await touched.incrementalRemove()
      if (editingId === id) resetForm()
      void sync?.trigger()
    } catch {
      setError('Could not delete the transaction')
    }
  }

  if (dataError) {
    return <p className="p-4 text-sm text-red-600">{dataError}</p>
  }

  if (isLoading || !collection) {
    return null
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Transactions</h1>

      <ul className="flex flex-col gap-2">
        {transactions.map((transaction) => (
          <li
            key={transaction.id}
            className="flex items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2"
          >
            <span className="flex-1">
              {transaction.description || transaction.paymentMethod}
            </span>
            <span>{toMajorUnits(transaction.value)}</span>
            <button
              type="button"
              onClick={() => startEditing(transaction)}
              className="text-sm underline"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setPendingDeleteId(transaction.id)}
              className="text-sm text-red-600 underline"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Amount
          <input
            className="rounded border border-gray-300 px-3 py-2"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Type
          <select
            className="rounded border border-gray-300 px-3 py-2"
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
          >
            <option value="DEBIT">Debit</option>
            <option value="CREDIT">Credit</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Payment method
          <select
            className="rounded border border-gray-300 px-3 py-2"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            <option value="PIX">Pix</option>
            <option value="CREDIT_CARD">Credit card</option>
            <option value="DEBIT_CARD">Debit card</option>
            <option value="CASH">Cash</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Description
          <input
            className="rounded border border-gray-300 px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {editingId ? 'Save changes' : 'Add transaction'}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="rounded border border-gray-300 px-4 py-2"
          >
            Cancel
          </button>
        )}
      </form>

      {pendingDeleteId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-transaction-title"
          className="fixed inset-0 flex items-center justify-center bg-black/30 px-4"
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded bg-white p-4">
            <p id="delete-transaction-title" className="text-sm text-gray-900">
              Delete this transaction?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="rounded border border-gray-300 px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded bg-red-600 px-4 py-2 text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
