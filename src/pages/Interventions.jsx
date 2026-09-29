import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { getStudents, getInterventions, logIntervention } from "../api/client";
import { useAuth } from "../context/AuthContext";

const actionOptions = [
  "Sent reminder email",
  "Scheduled catch-up meeting",
  "Approved deadline extension",
  "Discussed scope change in 1:1",
  "Escalated to department coordinator",
];

export default function Interventions() {
  const { user } = useAuth();
  const [students, setStudents] = useState(null);
  const [log, setLog] = useState(null);
  const [error, setError] = useState(null);
  const [studentId, setStudentId] = useState("");
  const [action, setAction] = useState(actionOptions[0]);
  const [outcome, setOutcome] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justLogged, setJustLogged] = useState(false);

  useEffect(() => {
    Promise.all([getStudents(user.id), getInterventions()])
      .then(([s, allIvs]) => {
        setStudents(s);
        // The API returns interventions system-wide; keep only this
        // supervisor's own students' entries.
        const myIds = new Set(s.map((st) => st.id));
        setLog(allIvs.filter((iv) => myIds.has(iv.studentId)));
        if (s.length) setStudentId(s[0].id);
      })
      .catch((e) => setError(e.message));
  }, [user.id]);

  if (error) return <ErrorState message={error} />;
  if (!students || !log) return <LoadingState label="Loading interventions…" />;

  const studentName = (id) => students.find((s) => s.id === id)?.name || "Unknown";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const entry = await logIntervention({ studentId, action, outcome });
      setLog([entry, ...log]);
      setJustLogged(true);
      setOutcome("");
      setTimeout(() => setJustLogged(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <form onSubmit={handleSubmit} className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <h2 className="font-display text-base font-semibold">Log a new intervention</h2>

        <div>
          <label className="block text-sm font-medium mb-1.5">Student</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Action taken</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          >
            {actionOptions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Outcome / notes</label>
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            rows={2}
            placeholder="Optional — fill in once you know how it went"
            className="w-full rounded-lg px-3 py-2.5 text-sm resize-none"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="self-start px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
        >
          {justLogged && <Check size={15} />}
          {submitting ? "Saving…" : justLogged ? "Logged" : "Log intervention"}
        </button>
      </form>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--dl-line)" }}>
          <h2 className="font-display text-base font-semibold">History</h2>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--dl-line)" }}>
          {log.map((iv) => (
            <div key={iv.id} className="px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{studentName(iv.studentId)}</p>
                <p className="text-xs" style={{ color: "var(--dl-slate)" }}>{iv.date}</p>
              </div>
              <p className="text-sm mt-1">{iv.action}</p>
              <p className="text-sm" style={{ color: "var(--dl-ink-soft)" }}>{iv.outcome}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
