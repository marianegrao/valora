import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Login } from './Login'
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
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Login page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('submits the form and logs the user in', async () => {
    vi.mocked(apiClient.login).mockResolvedValue({
      accessToken: 'token-123',
      user: { id: '1', name: 'Maria', email: 'maria@example.com' },
    })

    renderPage()

    await userEvent.type(screen.getByLabelText(/email/i), 'maria@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'super-secret')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() =>
      expect(apiClient.login).toHaveBeenCalledWith({
        email: 'maria@example.com',
        password: 'super-secret',
      }),
    )
  })

  it('shows an error message when credentials are invalid', async () => {
    vi.mocked(apiClient.login).mockRejectedValue(
      new apiClient.ApiError(401, 'Invalid credentials'),
    )

    renderPage()

    await userEvent.type(screen.getByLabelText(/email/i), 'maria@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
  })
})
