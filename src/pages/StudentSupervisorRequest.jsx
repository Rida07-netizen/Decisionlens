import { useCallback, useEffect, useState } from "react";
import { GraduationCap, LogOut, Send, Clock, XCircle, Building2 } from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { getPublicSupervisors, requestSupervisor } from "../api/client";
import { useStudentAuth } from "../context/StudentAuthContext";

// Shown to a logged-in student who has no supervisor yet — either because
// they self-registered, or a prior request was declined. They pick a
// supervisor here and wait for that supervisor to accept from their side.
export default function StudentSupervisorRequest({ student, onRequested }) {
  const { logout } = useStudentAuth();
  const [supervisors, setSupervisors] = useState(null);
  const [error, setError] = useState(null);
  const [requestingId, setRequestingId] = useState(null);

  const load = useCallback(() => {
    getPublicSupervisors()
      .then(setSupervisors)
      .catch((e) => setError(e.response?.data?.error || e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRequest = async (supervisorId) => {
    setRequestingId(supervisorId);
    setError(null);
    try {
      await requestSupervisor(student.id, supervisorId);
      onRequested();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't send the request — is the API running?");
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--dl-paper)" }}>
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "var(--dl-ink)" }}>
            <GraduationCap size={15} color="var(--dl-paper)" />
          </div>
          <span className="font-display text-base font-semibold">DecisionLens · Student</span>
        </div>
        <button onClick={logout} className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--dl-slate)" }}>
          <LogOut size={14} /> Log out
        </button>
      </header>

      <main className="max-w-lg mx-auto px-6 py-10">
        <h1 className="font-display text-xl font-semibold mb-1">Hi {student.name.split(" ")[0]}, pick a supervisor</h1>
        <p className="text-sm mb-6" style={{ color: "var(--dl-slate)" }}>
          You don't have a supervisor yet. Send a request below — your portal unlocks once they accept.
        </p>

        {student.requestStatus === "pending" && (
          <div className="flex items-start gap-2 p-3 rounded-lg text-sm mb-5" style={{ background: "var(--dl-amber-soft)", color: "var(--dl-amber)" }}>
            <Clock size={15} className="shrink-0 mt-0.5" />
            Your request is waiting for your supervisor to accept it.
          </div>
        )}
        {student.requestStatus === "rejected" && (
          <div className="flex items-start gap-2 p-3 rounded-lg text-sm mb-5" style={{ background: "var(--dl-coral-soft)", color: "var(--dl-coral)" }}>
            <XCircle size={15} className="shrink-0 mt-0.5" />
            Your last request wasn't accepted. You can request a different supervisor below.
          </div>
        )}
        {error && (
          <div className="p-3 rounded-lg text-sm mb-5" style={{ background: "var(--dl-coral-soft)", color: "var(--dl-coral)" }}>
            {error}
          </div>
        )}

        {!supervisors && !error && <LoadingState label="Loading supervisors…" />}
        {error && !supervisors && <ErrorState message={error} />}

        {supervisors && (
          <div className="flex flex-col gap-3">
            {supervisors.length === 0 && (
              <p className="text-sm" style={{ color: "var(--dl-slate)" }}>No supervisors are available yet.</p>
            )}
            {supervisors.map((s) => {
              const isRequested = student.requestedSupervisorId === s.id && student.requestStatus === "pending";
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl p-4"
                  style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}
                >
                  <div>
                    <p className="text-sm font-semibold">{s.name}</p>
                    {(s.department || s.institution) && (
                      <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--dl-slate)" }}>
                        <Building2 size={12} /> {[s.department, s.institution].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRequest(s.id)}
                    disabled={requestingId === s.id || student.requestStatus === "pending"}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 shrink-0"
                    style={{
                      background: isRequested ? "var(--dl-teal-soft)" : "var(--dl-ink)",
                      color: isRequested ? "var(--dl-teal)" : "var(--dl-paper)",
                    }}
                  >
                    <Send size={13} />
                    {isRequested ? "Requested" : requestingId === s.id ? "Sending…" : "Request"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
