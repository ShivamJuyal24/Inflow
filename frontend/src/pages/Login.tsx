import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/auth/AuthProvider"
import AuthLayout from "@/components/auth/AuthLayout"
import GoogleButton from "@/components/auth/GoogleButton"

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-[#e8ebf5] placeholder:text-[#6b7389] outline-none transition focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/30"

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError(error)
      return
    }
    navigate("/dashboard")
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to review your triaged inbox and drafts."
      footer={
        <>
          No account?{" "}
          <Link to="/signup" className="font-medium text-indigo-300 hover:text-indigo-200">
            Sign up
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
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
    </AuthLayout>
  )
}