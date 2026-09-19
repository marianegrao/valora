import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { Register } from './pages/Register'
import { Login } from './pages/Login'

function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold text-gray-900">Valora</h1>
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
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
