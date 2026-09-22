import { describe, expect, it } from 'vitest'
import {
  createAccountSchema,
  createTransactionSchema,
  formatValidationError,
  loginSchema,
  registerSchema,
} from './validation'

describe('loginSchema', () => {
  it('accepts a valid email and non-empty password', () => {
    const result = loginSchema.safeParse({
      email: 'maria@example.com',
      password: 'super-secret',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'super-secret',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(formatValidationError(result.error)).toMatch(/email/i)
    }
  })

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({
      email: 'maria@example.com',
      password: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(formatValidationError(result.error)).toMatch(/password/i)
    }
  })
})

describe('registerSchema', () => {
  it('accepts a valid name, email and password', () => {
    const result = registerSchema.safeParse({
      name: 'Maria',
      email: 'maria@example.com',
      password: 'super-secret',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = registerSchema.safeParse({
      name: '',
      email: 'maria@example.com',
      password: 'super-secret',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(formatValidationError(result.error)).toMatch(/name/i)
    }
  })

  it('rejects a password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({
      name: 'Maria',
      email: 'maria@example.com',
      password: 'short',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(formatValidationError(result.error)).toMatch(/8/)
    }
  })
})

describe('createAccountSchema', () => {
  it('accepts a valid name and currency', () => {
    const result = createAccountSchema.safeParse({
      name: 'Wallet',
      currency: 'BRL',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty name', () => {
    const result = createAccountSchema.safeParse({ name: '', currency: 'BRL' })
    expect(result.success).toBe(false)
  })

  it('rejects an unsupported currency', () => {
    const result = createAccountSchema.safeParse({
      name: 'Wallet',
      currency: 'EUR',
    })
    expect(result.success).toBe(false)
  })
})

describe('createTransactionSchema', () => {
  it('accepts a valid decimal amount', () => {
    const result = createTransactionSchema.safeParse({
      amount: '10.50',
      type: 'DEBIT',
      paymentMethod: 'PIX',
      description: 'Coffee',
    })
    expect(result.success).toBe(true)
  })

  it('rejects an empty amount', () => {
    const result = createTransactionSchema.safeParse({
      amount: '',
      type: 'DEBIT',
      paymentMethod: 'PIX',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-numeric amount', () => {
    const result = createTransactionSchema.safeParse({
      amount: 'abc',
      type: 'DEBIT',
      paymentMethod: 'PIX',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a zero amount', () => {
    const result = createTransactionSchema.safeParse({
      amount: '0',
      type: 'DEBIT',
      paymentMethod: 'PIX',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a negative amount', () => {
    const result = createTransactionSchema.safeParse({
      amount: '-5',
      type: 'DEBIT',
      paymentMethod: 'PIX',
    })
    expect(result.success).toBe(false)
  })
})
