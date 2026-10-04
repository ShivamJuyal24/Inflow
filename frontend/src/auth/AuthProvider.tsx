import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong"
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? getErrorMessage(error) : null }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error ? getErrorMessage(error) : null }
  }, [])

  // Sign in with a Google account through Supabase Auth.
  // This is separate from "Connect Gmail", which grants inbox access to the backend.
  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    return { error: error ? getErrorMessage(error) : null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
    }),
    [session, loading, signIn, signUp, signInWithGoogle, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return ctx
}