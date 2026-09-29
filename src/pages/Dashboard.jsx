import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ClipboardPlus, AlertTriangle, Users, TrendingUp, UserPlus } from "lucide-react";
import RiskMeter from "../components/RiskMeter";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { getDashboard } from "../api/client";
import { useAuth } from "../context/AuthContext";

function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div
      className="rounded-xl p-4 flex items-center gap-3"
      style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: tint }}>
        <Icon size={18} color="var(--dl-ink)" />
      </div>
      <div>
        <p className="text-2xl font-semibold font-mono-num leading-none">{value}</p>
        <p className="text-xs mt-1" style={{ color: "var(--dl-slate)" }}>{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDashboard(user.id).then(setData).catch((e) => setError(e.message));
  }, [user.id]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Loading dashboard…" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={Users} label="Students supervised" value={data.totalStudents} tint="var(--dl-teal-soft)" />
        <StatCard icon={AlertTriangle} label="High risk" value={data.highRisk} tint="var(--dl-coral-soft)" />
        <StatCard icon={TrendingUp} label="Avg. progress" value={`${data.avgProgress}%`} tint="var(--dl-amber-soft)" />
        <Link
          to="/students/new"
          className="rounded-xl p-4 flex items-center gap-3 transition-transform hover:-translate-y-0.5"
          style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--dl-teal-soft)" }}>
            <UserPlus size={18} color="var(--dl-ink)" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Add Student</p>
            <p className="text-xs mt-1" style={{ color: "var(--dl-slate)" }}>Start tracking</p>
          </div>
        </Link>
        <Link
          to="/add-milestone"
          className="rounded-xl p-4 flex items-center gap-3 transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(247,245,241,0.15)" }}>
            <ClipboardPlus size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Add Milestone</p>
            <p className="text-xs mt-1" style={{ color: "var(--dl-line)" }}>Set a real due date</p>
          </div>
        </Link>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--dl-line)" }}>
          <h2 className="font-display text-base font-semibold">Needs Attention</h2>
          <Link to="/students" className="text-sm inline-flex items-center gap-1" style={{ color: "var(--dl-teal)" }}>
            View all students <ArrowUpRight size={14} />
          </Link>
        </div>

        <div className="divide-y" style={{ borderColor: "var(--dl-line)" }}>
          {data.needsAttention.map((s) => (
            <Link
              key={s.id}
              to={`/students/${s.id}`}
              className="flex items-center justify-between gap-6 px-5 py-4 hover:bg-black/[0.02] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs mb-1" style={{ color: "var(--dl-slate)" }}>
                  AG No. {s.agNumber} · Batch {s.batchYear} · Last active {s.lastActivity}
                </p>
                <p className="font-medium truncate">{s.name}</p>
                <p className="text-sm mt-1 truncate" style={{ color: "var(--dl-ink-soft)" }}>
                  {s.thesisTitle}
                </p>
              </div>
              <div className="w-40 shrink-0">
                <RiskMeter value={s.riskScore} size="sm" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
