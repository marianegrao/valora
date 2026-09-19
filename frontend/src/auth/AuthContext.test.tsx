import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import * as apiClient from '../lib/apiClient'

vi.mock('../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/apiClient')>()
  return { ...actual, register: vi.fn(), login: vi.fn(), me: vi.fn() }
})

function TestConsumer() {
  const { user, isLoading, login, register, logout } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user ? user.name : 'none'}</span>
      <button
        onClick={() => login('maria@example.com', 'super-secret')}
      >
        login
      </button>
      <button
        onClick={() => register('Maria', 'maria@example.com', 'super-secret')}
      >
        register
      </button>
      <button onClick={() => logout()}>logout</button>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('starts with no user when there is no stored token', async () => {
    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('logs in, stores the user and persists the token', async () => {
    vi.mocked(apiClient.login).mockResolvedValue({
      accessToken: 'token-123',
      user: { id: '1', name: 'Maria', email: 'maria@example.com' },
    })

    renderWithProvider()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await userEvent.click(screen.getByText('login'))

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Maria'))
    expect(localStorage.getItem('valora.accessToken')).toBe('token-123')
  })

  it('registers, stores the user and persists the token', async () => {
    vi.mocked(apiClient.register).mockResolvedValue({
      accessToken: 'token-456',
      user: { id: '2', name: 'Maria', email: 'maria@example.com' },
    })

    renderWithProvider()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await userEvent.click(screen.getByText('register'))

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Maria'))
    expect(localStorage.getItem('valora.accessToken')).toBe('token-456')
  })

  it('restores the session from a stored token on mount', async () => {
    localStorage.setItem('valora.accessToken', 'stored-token')
    vi.mocked(apiClient.me).mockResolvedValue({
      id: '1',
      name: 'Maria',
      email: 'maria@example.com',
    })

    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Maria'))
    expect(apiClient.me).toHaveBeenCalledWith('stored-token')
  })

  it('clears the session when the stored token is invalid', async () => {
    localStorage.setItem('valora.accessToken', 'stored-token')
    vi.mocked(apiClient.me).mockRejectedValue(new apiClient.ApiError(401, 'Unauthorized'))

    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(localStorage.getItem('valora.accessToken')).toBeNull()
  })

  it('logs out and clears the stored token', async () => {
    vi.mocked(apiClient.login).mockResolvedValue({
      accessToken: 'token-123',
      user: { id: '1', name: 'Maria', email: 'maria@example.com' },
    })

    renderWithProvider()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    await userEvent.click(screen.getByText('login'))
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Maria'))

    await userEvent.click(screen.getByText('logout'))

    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(localStorage.getItem('valora.accessToken')).toBeNull()
  })
})
