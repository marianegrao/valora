import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ApiError, createAccount, type Currency } from '../lib/apiClient'

export function AccountCreate() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<Currency>('BRL')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setError(null)
    setIsSubmitting(true)
    try {
      await createAccount(token, { name, currency })
      navigate('/transactions')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">
        Create account
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Name
          <input
            className="rounded border border-gray-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Currency
          <select
            className="rounded border border-gray-300 px-3 py-2"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </select>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Create account
        </button>
      </form>
    </main>
  )
}
