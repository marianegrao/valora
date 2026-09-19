import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createAccount,
  createTransaction,
  getAccounts,
  getTransactions,
  login,
  register,
} from './apiClient'

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('register', () => {
    it('posts to /auth/register and returns the parsed response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            accessToken: 'token-123',
            user: { id: '1', name: 'Maria', email: 'maria@example.com' },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      const result = await register({
        name: 'Maria',
        email: 'maria@example.com',
        password: 'super-secret',
      })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            name: 'Maria',
            email: 'maria@example.com',
            password: 'super-secret',
          }),
        }),
      )
      expect(result).toEqual({
        accessToken: 'token-123',
        user: { id: '1', name: 'Maria', email: 'maria@example.com' },
      })
    })

    it('throws an ApiError with the server message when registration fails', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Email already in use' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        register({
          name: 'Maria',
          email: 'maria@example.com',
          password: 'super-secret',
        }),
      ).rejects.toThrow(ApiError)
    })
  })

  describe('login', () => {
    it('posts to /auth/login and returns the parsed response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            accessToken: 'token-123',
            user: { id: '1', name: 'Maria', email: 'maria@example.com' },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      const result = await login({
        email: 'maria@example.com',
        password: 'super-secret',
      })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({ method: 'POST' }),
      )
      expect(result.accessToken).toBe('token-123')
    })

    it('throws an ApiError with 401 when credentials are invalid', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        login({ email: 'maria@example.com', password: 'wrong' }),
      ).rejects.toMatchObject({ status: 401 })
    })
  })

  describe('getAccounts', () => {
    it('sends the bearer token and returns the parsed accounts', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([{ id: 'acc-1', name: 'Wallet', currency: 'BRL' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      const result = await getAccounts('token-123')

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/accounts'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123',
          }),
        }),
      )
      expect(result).toEqual([{ id: 'acc-1', name: 'Wallet', currency: 'BRL' }])
    })
  })

  describe('createAccount', () => {
    it('posts the account payload with the bearer token', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: 'acc-1', name: 'Wallet', currency: 'BRL' }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      const result = await createAccount('token-123', {
        name: 'Wallet',
        currency: 'BRL',
      })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/accounts'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Wallet', currency: 'BRL' }),
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123',
          }),
        }),
      )
      expect(result).toEqual({ id: 'acc-1', name: 'Wallet', currency: 'BRL' })
    })
  })

  describe('getTransactions', () => {
    it('requests transactions for the given account with the bearer token', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: 'tx-1',
              accountId: 'acc-1',
              value: 4599,
              type: 'DEBIT',
              paymentMethod: 'PIX',
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      const result = await getTransactions('token-123', 'acc-1')

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/transactions?accountId=acc-1'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123',
          }),
        }),
      )
      expect(result).toHaveLength(1)
    })
  })

  describe('createTransaction', () => {
    it('posts the transaction payload with the bearer token', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'tx-1',
            accountId: 'acc-1',
            description: 'Groceries',
            value: 4599,
            type: 'DEBIT',
            paymentMethod: 'CREDIT_CARD',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      vi.stubGlobal('fetch', fetchMock)

      const result = await createTransaction('token-123', {
        accountId: 'acc-1',
        description: 'Groceries',
        value: 4599,
        type: 'DEBIT',
        paymentMethod: 'CREDIT_CARD',
      })

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/transactions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            accountId: 'acc-1',
            description: 'Groceries',
            value: 4599,
            type: 'DEBIT',
            paymentMethod: 'CREDIT_CARD',
          }),
        }),
      )
      expect(result.id).toBe('tx-1')
    })
  })
})
