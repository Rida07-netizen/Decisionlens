import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, RotateCcw } from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { getStudents, reactivateStudent } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { bandFor } from "../components/RiskMeter";

// Students marked "completed" (graduated / finished their thesis) land
// here instead of the main dashboard/roster/sessions views, but their
// full record is still one click away via StudentDetail.
export default function History() {
  const { user } = useAuth();
  const [students, setStudents] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    getStudents(user.id, "completed").then(setStudents).catch((e) => setError(e.message));
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReactivate = async (id) => {
    setBusyId(id);
    try {
      await reactivateStudent(id);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't reactivate that student — is the API running?");
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <ErrorState message={error} />;
  if (!students) return <LoadingState label="Loading history…" />;

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Archive size={18} style={{ color: "var(--dl-teal)" }} />
        <h2 className="font-display text-lg font-semibold">History</h2>
      </div>
      <p className="text-sm -mt-2" style={{ color: "var(--dl-slate)" }}>
        Students marked as completed. They don't count toward your active dashboard, roster, or
        sessions — reactivate one here if that changes.
      </p>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <div className="divide-y" style={{ borderColor: "var(--dl-line)" }}>
          {students.map((s) => {
            const band = bandFor(s.riskScore);
            return (
              <div key={s.id} className="flex items-center justify-between gap-6 px-5 py-4">
                <Link to={`/students/${s.id}`} className="min-w-0 flex-1">
                  <p className="text-xs mb-1" style={{ color: "var(--dl-slate)" }}>
                    AG No. {s.agNumber} · Batch {s.batchYear} · Completed {s.completedAt || "—"}
                  </p>
                  <p className="font-medium truncate">{s.name}</p>
                  <p className="text-sm mt-1 truncate" style={{ color: "var(--dl-ink-soft)" }}>{s.thesisTitle}</p>
                </Link>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0"
                  style={{ background: band.soft, color: band.color }}
                >
                  {s.riskScore} · {band.label}
                </span>
                <button
                  onClick={() => handleReactivate(s.id)}
                  disabled={busyId === s.id}
                  title="Move back to the active roster"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 shrink-0"
                  style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}
                >
                  <RotateCcw size={13} /> Reactivate
                </button>
              </div>
            );
          })}
          {students.length === 0 && (
            <p className="px-5 py-8 text-sm text-center" style={{ color: "var(--dl-slate)" }}>
              No completed students yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
