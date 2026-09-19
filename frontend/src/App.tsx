import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Register } from './pages/Register'
import { Login } from './pages/Login'
import { AccountCreate } from './pages/AccountCreate'

function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold text-gray-900">Valora</h1>
      <Link to="/accounts/new" className="text-sm underline">
        Add an account
      </Link>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/accounts/new" element={<AccountCreate />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
