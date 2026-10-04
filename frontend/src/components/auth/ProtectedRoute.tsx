import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { useAuth } from "@/auth/AuthProvider"

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return <div>Loading...</div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
