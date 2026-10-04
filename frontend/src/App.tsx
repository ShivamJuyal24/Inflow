import type { ReactNode } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import ProtectedRoute from "./components/auth/ProtectedRoute"
import { useAuth } from "./auth/AuthProvider"
import Dashboard from "./pages/Dashboard"
import Drafts from "./pages/Drafts"
import Landing from "./pages/Landing"
import Login from "./pages/Login"
import SignUp from "./pages/SignUp"

function GuestRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestRoute>
              <SignUp />
            </GuestRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drafts"
          element={
            <ProtectedRoute>
              <Drafts />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
