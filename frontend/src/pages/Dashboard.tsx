import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getAccounts, getTransactions, type Transaction } from '../lib/apiClient'
import { toMajorUnits } from '../lib/money'

function computeBalance(transactions: Transaction[]): number {
  return transactions.reduce((total, transaction) => {
    return transaction.type === 'CREDIT'
      ? total + transaction.value
      : total - transaction.value
  }, 0)
}

export function Dashboard() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [balance, setBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    getAccounts(token)
      .then((accounts) => {
        if (accounts.length === 0) {
          navigate('/accounts/new')
          return
        }
        return getTransactions(token, accounts[0].id).then((transactions) => {
          setBalance(computeBalance(transactions))
        })
      })
      .finally(() => setIsLoading(false))
  }, [token, navigate])

  if (isLoading) {
    return null
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-2 px-4">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      <p className="text-sm text-gray-600">Balance</p>
      <p className="text-3xl font-bold text-gray-900">
        {toMajorUnits(balance)}
      </p>
    </main>
  )
}
