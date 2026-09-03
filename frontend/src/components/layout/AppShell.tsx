import { useState, type ReactNode } from "react"
import NavRail, { type NavCategory } from "./NavRail"
import CommandSidebar from "@/components/ai/CommandSidebar"
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"

interface AppShellProps {
  activeCategory: NavCategory
  onCategoryChange: (category: NavCategory) => void
  headerActions?: ReactNode
  children: ReactNode
}

export default function AppShell({
  activeCategory,
  onCategoryChange,
  headerActions,
  children,
}: AppShellProps) {
  const [assistantOpen, setAssistantOpen] = useState(false)

  return (
    <div className="flex h-screen w-full bg-background">
      <NavRail active={activeCategory} onChange={onCategoryChange} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 bg-background">
          <div className="flex items-center gap-2">{headerActions}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssistantOpen(true)}
            className="gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Assistant
          </Button>
        </header>

        {/* Subtle gradient on the main content area */}
        <main className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-background to-muted/20">
          {children}
        </main>
      </div>

      <CommandSidebar open={assistantOpen} onOpenChange={setAssistantOpen} />
    </div>
  )
}