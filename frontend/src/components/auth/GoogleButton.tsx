import { useState } from "react"
import { useAuth } from "@/auth/AuthProvider"

interface GoogleButtonProps {
  onError: (message: string) => void
}

/**
 * "Continue with Google" button plus an "or" divider.
 * Place it above the email/password form.
 */
export default function GoogleButton({ onError }: GoogleButtonProps) {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const { error } = await signInWithGoogle()
    // On success the browser navigates to Google, so we only handle the failure case.
    if (error) {
      setLoading(false)
      onError(error)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-[#e8ebf5] transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Redirecting to Google..." : "Continue with Google"}
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-[#6b7389]" aria-hidden="true">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </>
  )
}