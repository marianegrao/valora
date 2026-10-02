import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useData } from '../data/DataContext'
import { ApiError } from '../lib/apiClient'
import { loadAccounts } from '../lib/accountsCache'
import type { TransactionDoc } from '../lib/db'
import { toMajorUnits } from '../lib/money'

function computeBalance(transactions: TransactionDoc[]): number {
  return transactions.reduce((total, transaction) => {
    return transaction.type === 'CREDIT'
      ? total + transaction.value
      : total - transaction.value
  }, 0)
}

export function Dashboard() {
  const { token, user } = useAuth()
  const { transactions: collection, error: dataError } = useData()
  const navigate = useNavigate()
  const userId = user?.id ?? null
  const [accountId, setAccountId] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      }
    }

    loadAccount()
  }, [token, userId, navigate])

  useEffect(() => {
    if (!collection || !accountId) return
    // Live query: the balance follows local writes without waiting on sync.
    const subscription = collection.find({ selector: { accountId } }).$.subscribe({
      next: (docs) => setBalance(computeBalance(docs.map((doc) => doc.toMutableJSON()))),
      error: () => setError('Could not load local transactions'),
    })
    return () => subscription.unsubscribe()
  }, [collection, accountId])

  const visibleError = dataError ?? error
  if (!visibleError && balance === null) {
    return null
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-2 px-4">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      {visibleError ? (
        <p className="text-sm text-red-600">{visibleError}</p>
      ) : (
        <>
          <p className="text-sm text-gray-600">Balance</p>
          <p className="text-3xl font-bold text-gray-900">
            {toMajorUnits(balance ?? 0)}
          </p>
        </>
      )}
    </main>
  )
}
