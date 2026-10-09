import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/auth/AuthProvider"
import {
  Inbox,
  Star,
  Reply,
  Calendar,
  Info,
  ArrowDownCircle,
  ShieldAlert,
  AlertCircle,
  Filter,
} from "lucide-react"

export type NavCategory =
  | "ACTIONABLE"
  | "ALL"
  | "NEEDS_ATTENTION"
  | "IMPORTANT"
  | "REQUIRES_REPLY"
  | "MEETING"
  | "INFORMATIONAL"
  | "LOW_PRIORITY"
  | "SPAM";

interface NavRailProps {
  active: NavCategory;
  onChange: (category: NavCategory) => void;
}

// 🎨 Icon color mapping – export so other components can use it
export const ICON_COLORS: Record<NavCategory, string> = {
  ACTIONABLE: "text-primary",
  ALL: "text-slate-400",
  NEEDS_ATTENTION: "text-orange-500",
  IMPORTANT: "text-red-500",
  REQUIRES_REPLY: "text-amber-500",
  MEETING: "text-violet-500",
  INFORMATIONAL: "text-blue-500",
  LOW_PRIORITY: "text-slate-400",
  SPAM: "text-rose-400",
};

// 📛 Optional: category labels for reuse
export const CATEGORY_LABELS: Record<NavCategory, string> = {
  ACTIONABLE: "Inbox",
  ALL: "Everything",
  NEEDS_ATTENTION: "Needs attention",
  IMPORTANT: "Important",
  REQUIRES_REPLY: "Reply needed",
  MEETING: "Meetings",
  INFORMATIONAL: "Informational",
  LOW_PRIORITY: "Low priority",
  SPAM: "Spam",
};

const NAV_ITEMS = [
  { key: "ACTIONABLE" as NavCategory, label: "Inbox", icon: Inbox },
  { key: "ALL" as NavCategory, label: "Everything", icon: Filter },
] as const;

const CATEGORY_ITEMS: { key: NavCategory; label: string; icon: React.ElementType }[] = [
  { key: "NEEDS_ATTENTION", label: "Needs attention", icon: AlertCircle },
  { key: "IMPORTANT", label: "Important", icon: Star },
  { key: "REQUIRES_REPLY", label: "Reply needed", icon: Reply },
  { key: "MEETING", label: "Meetings", icon: Calendar },
  { key: "INFORMATIONAL", label: "Informational", icon: Info },
  { key: "LOW_PRIORITY", label: "Low priority", icon: ArrowDownCircle },
  { key: "SPAM", label: "Spam", icon: ShieldAlert },
];

function NavButton({
  item,
  active,
  onChange,
}: {
  item: { key: NavCategory; label: string; icon: React.ElementType };
  active: NavCategory;
  onChange: (c: NavCategory) => void;
}) {
  const Icon = item.icon;
  const isActive = active === item.key;
  const iconColor = ICON_COLORS[item.key];

  return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      className={`
        w-full justify-start gap-2 px-3
        ${isActive ? "border-l-2 border-primary pl-2" : ""}
      `}
      onClick={() => onChange(item.key)}
    >
      <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
      <span className="truncate">{item.label}</span>
    </Button>
  );
}

export default function NavRail({ active, onChange }: NavRailProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-border bg-background p-3">
      <h2 className="px-3 pb-2 text-lg font-semibold tracking-tight">Inflow</h2>

      {NAV_ITEMS.map((item) => (
        <NavButton
          key={item.key}
          item={item}
          active={active}
          onChange={onChange}
        />
      ))}

      <Separator className="my-2" />
      <p className="px-3 pb-1 text-xs font-medium uppercase text-muted-foreground">
        Categories
      </p>

      {CATEGORY_ITEMS.map((item) => (
        <NavButton key={item.key} item={item} active={active} onChange={onChange} />
      ))}

      <Separator className="my-2" />
      <Link to="/drafts" className="w-full">
        <Button variant="ghost" className="w-full justify-start gap-2 px-3">
          Drafts
        </Button>
      </Link>
      <Button variant="ghost" className="w-full justify-start gap-2 px-3" onClick={handleSignOut}>
        Sign out
      </Button>
    </nav>
  );
}