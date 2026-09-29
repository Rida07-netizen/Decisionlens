import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  LayoutGrid,
  Users,
  UserCheck,
  CalendarPlus,
  Layers,
  Archive,
  Bot,
  Settings,
  Sparkles,
} from "lucide-react";
import { getSupervisorRequests } from "../api/client";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "/students", label: "My Students", icon: Users },
  { to: "/requests", label: "Requests", icon: UserCheck, badge: true },
  { to: "/add-milestone", label: "Add Milestone", icon: CalendarPlus },
  { to: "/sessions", label: "Sessions", icon: Layers },
  { to: "/history", label: "History", icon: Archive },
  { to: "/assistant", label: "AI Assistant", icon: Bot },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const load = () => getSupervisorRequests(user.id).then((r) => setPendingCount(r.length)).catch(() => {});
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [user?.id]);

  return (
    <aside
      className="hidden md:flex flex-col w-64 shrink-0 h-screen sticky top-0 border-r"
      style={{ borderColor: "var(--dl-line)", background: "var(--dl-paper-raised)" }}
    >
      <Link to="/" className="flex items-center gap-2 px-6 h-16 border-b" style={{ borderColor: "var(--dl-line)" }}>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: "var(--dl-ink)" }}
        >
          <Sparkles size={16} color="var(--dl-paper)" />
        </div>
        <span className="font-display text-lg font-semibold tracking-tight">DecisionLens</span>
      </Link>

      <nav className="flex-1 px-3 py-5 flex flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? "" : "hover:bg-black/[0.03]"
              }`
            }
            style={({ isActive }) => ({
              color: isActive ? "var(--dl-teal)" : "var(--dl-ink-soft)",
              background: isActive ? "var(--dl-teal-soft)" : "transparent",
            })}
          >
            <Icon size={18} strokeWidth={2} />
            <span className="flex-1">{label}</span>
            {badge && pendingCount > 0 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--dl-coral)", color: "var(--dl-paper)" }}
              >
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t text-xs" style={{ borderColor: "var(--dl-line)", color: "var(--dl-slate)" }}>
        <p className="px-2">DecisionLens v0.1</p>
        <p className="px-2">FYP Risk Tracker</p>
      </div>
    </aside>
  );
}
