const API_URL = import.meta.env.VITE_API_URL

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
}

export interface AuthResult {
  accessToken: string
  user: AuthenticatedUser
}

async function apiFetch<T>(
  path: string,
  options: { method: string; body?: unknown; token?: string },
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const data = await response.json().catch(() => undefined)

  if (!response.ok) {
    const message =
      (data && typeof data.message === 'string' && data.message) ||
      (data && Array.isArray(data.message) && data.message.join(', ')) ||
      'Request failed'
    throw new ApiError(response.status, message)
  }

  return data as T
}

export function register(input: {
  name: string
  email: string
  password: string
}): Promise<AuthResult> {
  return apiFetch<AuthResult>('/auth/register', { method: 'POST', body: input })
}

export function login(input: {
  email: string
  password: string
}): Promise<AuthResult> {
  return apiFetch<AuthResult>('/auth/login', { method: 'POST', body: input })
}

export function me(token: string): Promise<AuthenticatedUser> {
  return apiFetch<AuthenticatedUser>('/auth/me', { method: 'GET', token })
}
