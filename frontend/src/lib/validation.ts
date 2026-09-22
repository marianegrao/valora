import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const createAccountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  currency: z.enum(['BRL', 'USD'], { message: 'Select a valid currency' }),
})

export const createTransactionSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((value) => /^\d+([.,]\d{1,2})?$/.test(value), {
      message: 'Enter a valid amount',
    })
    .refine((value) => Number(value.replace(',', '.')) > 0, {
      message: 'Amount must be greater than zero',
    }),
  type: z.enum(['DEBIT', 'CREDIT']),
  paymentMethod: z.enum(['PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'CASH']),
  description: z.string().optional(),
})

export function formatValidationError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input'
}
