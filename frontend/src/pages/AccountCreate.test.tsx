import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountCreate } from './AccountCreate'
import { AuthProvider } from '../auth/AuthContext'
import * as apiClient from '../lib/apiClient'

vi.mock('../lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/apiClient')>()
  return {
    ...actual,
    me: vi.fn(),
    createAccount: vi.fn(),
  }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AccountCreate />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AccountCreate page', () => {
  beforeEach(() => {
    localStorage.setItem('valora.accessToken', 'token-123')
    vi.clearAllMocks()
    vi.mocked(apiClient.me).mockResolvedValue({
      id: '1',
      name: 'Maria',
      email: 'maria@example.com',
    })
  })

  it('submits the form and creates the account', async () => {
    vi.mocked(apiClient.createAccount).mockResolvedValue({
      id: 'acc-1',
      name: 'Wallet',
      currency: 'BRL',
    })

    renderPage()
    await waitFor(() => expect(apiClient.me).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText(/name/i), 'Wallet')
    await userEvent.selectOptions(screen.getByLabelText(/currency/i), 'BRL')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(apiClient.createAccount).toHaveBeenCalledWith('token-123', {
        name: 'Wallet',
        currency: 'BRL',
      }),
    )
  })

  it('shows an error message when creation fails', async () => {
    vi.mocked(apiClient.createAccount).mockRejectedValue(
      new apiClient.ApiError(400, 'Something went wrong'),
    )

    renderPage()
    await waitFor(() => expect(apiClient.me).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText(/name/i), 'Wallet')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
  })
})
