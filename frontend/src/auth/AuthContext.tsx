import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import * as apiClient from '../lib/apiClient'
import type { AuthenticatedUser } from '../lib/apiClient'

const TOKEN_STORAGE_KEY = 'valora.accessToken'

interface AuthContextValue {
  user: AuthenticatedUser | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!storedToken) {
      setIsLoading(false)
      return
    }

    apiClient
      .me(storedToken)
      .then((restoredUser) => {
        setToken(storedToken)
        setUser(restoredUser)
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY)
      })
      .finally(() => setIsLoading(false))
  }, [])

  function persistSession(result: apiClient.AuthResult) {
    localStorage.setItem(TOKEN_STORAGE_KEY, result.accessToken)
    setToken(result.accessToken)
    setUser(result.user)
  }

  async function login(email: string, password: string) {
    const result = await apiClient.login({ email, password })
    persistSession(result)
  }

  async function register(name: string, email: string, password: string) {
    const result = await apiClient.register({ name, email, password })
    persistSession(result)
  }

  function logout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
