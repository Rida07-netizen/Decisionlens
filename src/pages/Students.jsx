import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Filter, UserPlus } from "lucide-react";
import RiskMeter from "../components/RiskMeter";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { getStudents } from "../api/client";
import { useAuth } from "../context/AuthContext";

const LEVELS = ["All", "High", "Moderate", "Low"];

export default function Students() {
  const { user } = useAuth();
  const [students, setStudents] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    getStudents(user.id).then(setStudents).catch((e) => setError(e.message));
  }, [user.id]);

  if (error) return <ErrorState message={error} />;
  if (!students) return <LoadingState label="Loading students…" />;

  const filtered = filter === "All" ? students : students.filter((s) => s.riskLevel === filter);

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={15} style={{ color: "var(--dl-slate)" }} />
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setFilter(l)}
              className="px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: filter === l ? "var(--dl-ink)" : "var(--dl-paper-raised)",
                color: filter === l ? "var(--dl-paper)" : "var(--dl-ink-soft)",
                border: "1px solid var(--dl-line)",
              }}
            >
              {l} {l !== "All" && `risk`}
            </button>
          ))}
        </div>
        <Link
          to="/students/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
        >
          <UserPlus size={14} /> Add Student
        </Link>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <div className="divide-y" style={{ borderColor: "var(--dl-line)" }}>
          {filtered.map((s) => (
            <Link
              key={s.id}
              to={`/students/${s.id}`}
              className="flex items-center justify-between gap-6 px-5 py-4 hover:bg-black/[0.02] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs mb-1" style={{ color: "var(--dl-slate)" }}>
                  AG No. {s.agNumber} · Batch {s.batchYear} · {s.progressPct}% complete · Last active {s.lastActivity}
                </p>
                <p className="font-medium truncate">{s.name}</p>
                <p className="text-sm mt-1 truncate" style={{ color: "var(--dl-ink-soft)" }}>{s.thesisTitle}</p>
              </div>
              <div className="w-40 shrink-0">
                <RiskMeter value={s.riskScore} size="sm" />
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--dl-slate)" }}>
              No students at this risk level.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
