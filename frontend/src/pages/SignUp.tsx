import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/auth/AuthProvider"
import { supabase } from "@/lib/supabase"
import AuthLayout from "@/components/auth/AuthLayout"
import GoogleButton from "@/components/auth/GoogleButton"

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-[#e8ebf5] placeholder:text-[#6b7389] outline-none transition focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/30"

export default function SignUp() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await signUp(email, password)
    if (error) {
      setLoading(false)
      setError(error)
      return
    }


    // If Supabase email confirmation is turned on, no session exists yet.
    const { data } = await supabase.auth.getSession()
    setLoading(false)
    if (data.session) {
      navigate("/dashboard")
    } else {
      setNeedsConfirmation(true)
    }
  }

  if (needsConfirmation) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`We sent a confirmation link to ${email}. Open it, then log in to continue.`}
        footer={
          <>
            Already confirmed?{" "}
            <Link to="/login" className="font-medium text-indigo-300 hover:text-indigo-200">
              Log in
            </Link>
          </>
        }
      >
        <Link
          to="/login"
          className="inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110"
        >
          Go to log in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Sign up, then connect Gmail from your dashboard."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-indigo-300 hover:text-indigo-200">
            Log in
          </Link>
        </>
      }
    >
      <GoogleButton onError={setError} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-[#cdd3e4]">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-[#cdd3e4]">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className={inputClass}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Sign up"}
        </button>
      </form>
    </AuthLayout>
  )
}