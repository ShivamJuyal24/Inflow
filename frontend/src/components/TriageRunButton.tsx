import { useState } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { runTriage } from "@/lib/triageApi"

interface TriageRunButtonProps {
  onComplete: () => void
}

export default function TriageRunButton({ onComplete }: TriageRunButtonProps) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleClick = async () => {
    if (running) return
    setRunning(true)
    setResult(null)
    try {
      const res = await runTriage()
      const s = res.summary
      setResult(
        `Processed ${s.emailsFetched} emails; created ${s.draftsCreated} reply drafts.`
      )
      onComplete()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Triage run failed"
      setResult(msg.includes("already in progress") ? "Triage already running..." : msg)
    } finally {
      setRunning(false)
      setTimeout(() => setResult(null), 4000)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-muted-foreground">{result}</span>}
      <Button variant="outline" size="sm" onClick={handleClick} disabled={running} className="gap-2">
        <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
        {running ? "Running..." : "Run triage"}
      </Button>
    </div>
  )
}