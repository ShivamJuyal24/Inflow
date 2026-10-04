import type { ReactNode } from "react"
import { Link } from "react-router-dom"

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

/**
 * Shared shell for the Login and Sign up pages.
 * Matches the landing page: dark background, indigo/violet glow, gradient accent.
 */
export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#07090f] px-4 py-12 text-[#e8ebf5]">
      {/* Background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{
          background:
            "radial-gradient(520px 280px at 30% 15%, rgba(99,102,241,0.28), transparent 70%), radial-gradient(460px 260px at 75% 10%, rgba(34,211,238,0.14), transparent 70%), radial-gradient(460px 280px at 55% 45%, rgba(139,92,246,0.16), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-md">
        <Link
          to="/"
          aria-label="Inflow home"
          className="mx-auto mb-8 flex w-fit items-center gap-2.5 text-lg font-bold tracking-tight"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/40">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 12h10M10 6l6 6-6 6" />
            </svg>
          </span>
          Inflow
        </Link>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-8 shadow-2xl shadow-black/50 backdrop-blur">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-[#9aa3b8]">{subtitle}</p>
          <div className="mt-7">{children}</div>
        </div>

        <p className="mt-6 text-center text-sm text-[#9aa3b8]">{footer}</p>
      </div>
    </div>
  )
}