import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  ApiError,
  createTransaction,
  getAccounts,
  getTransactions,
  type PaymentMethod,
  type Transaction,
  type TransactionType,
} from '../lib/apiClient'
import { toMajorUnits, toMinorUnits } from '../lib/money'
import { createTransactionSchema, formatValidationError } from '../lib/validation'

export function Transactions() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [accountId, setAccountId] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState('')
  const [type, setType] = useState<TransactionType>('DEBIT')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!token) return
    const currentToken = token

    async function loadTransactions() {
      try {
        const accounts = await getAccounts(currentToken)
        if (accounts.length === 0) {
          navigate('/accounts/new')
          return
        }
        const firstAccountId = accounts[0].id
        setAccountId(firstAccountId)
        const data = await getTransactions(currentToken, firstAccountId)
        setTransactions(data)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong')
      } finally {
        setIsLoading(false)
      }
    }

    loadTransactions()
  }, [token, navigate])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token || !accountId) return
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
      const created = await createTransaction(token, {
        accountId,
        description: validation.data.description,
        value: toMinorUnits(validation.data.amount),
        type: validation.data.type,
        paymentMethod: validation.data.paymentMethod,
      })
      setTransactions((current) => [...current, created])
      setAmount('')
      setDescription('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return null
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Transactions</h1>

      <ul className="flex flex-col gap-2">
        {transactions.map((transaction) => (
          <li
            key={transaction.id}
            className="flex justify-between rounded border border-gray-200 px-3 py-2"
          >
            <span>{transaction.description || transaction.paymentMethod}</span>
            <span>{toMajorUnits(transaction.value)}</span>
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
          Add transaction
        </button>
      </form>
    </main>
  )
}
