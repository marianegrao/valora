import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Register } from './Register'
import { AuthProvider } from '../auth/AuthContext'
import * as apiClient from '../lib/apiClient'

vi.mock('../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/apiClient')>()
  return { ...actual, register: vi.fn(), login: vi.fn(), me: vi.fn() }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Register />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Register page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('submits the form and registers the user', async () => {
    vi.mocked(apiClient.register).mockResolvedValue({
      accessToken: 'token-123',
      user: { id: '1', name: 'Maria', email: 'maria@example.com' },
    })

    renderPage()

    await userEvent.type(screen.getByLabelText(/name/i), 'Maria')
    await userEvent.type(screen.getByLabelText(/email/i), 'maria@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'super-secret')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(apiClient.register).toHaveBeenCalledWith({
        name: 'Maria',
        email: 'maria@example.com',
        password: 'super-secret',
      }),
    )
  })

  it('shows a validation error and does not call the API when the password is too short', async () => {
    renderPage()

    await userEvent.type(screen.getByLabelText(/name/i), 'Maria')
    await userEvent.type(screen.getByLabelText(/email/i), 'maria@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'short')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(
      await screen.findByText(/password must be at least 8 characters/i),
    ).toBeInTheDocument()
    expect(apiClient.register).not.toHaveBeenCalled()
  })

  it('shows an error message when registration fails', async () => {
    vi.mocked(apiClient.register).mockRejectedValue(
      new apiClient.ApiError(409, 'Email already in use'),
    )

    renderPage()

    await userEvent.type(screen.getByLabelText(/name/i), 'Maria')
    await userEvent.type(screen.getByLabelText(/email/i), 'maria@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'super-secret')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Email already in use')).toBeInTheDocument()
  })
})
