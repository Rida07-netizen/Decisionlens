import { useCallback, useEffect, useState } from "react";
import { UserCheck, Check, X } from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { getSupervisorRequests, acceptStudentRequest, rejectStudentRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function SupervisorRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    getSupervisorRequests(user.id).then(setRequests).catch((e) => setError(e.message));
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (studentId, action) => {
    setBusyId(studentId);
    setError(null);
    try {
      if (action === "accept") await acceptStudentRequest(studentId);
      else await rejectStudentRequest(studentId);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't update that request — is the API running?");
    } finally {
      setBusyId(null);
    }
  };

  if (error && !requests) return <ErrorState message={error} />;
  if (!requests) return <LoadingState label="Loading requests…" />;

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center gap-2">
        <UserCheck size={18} style={{ color: "var(--dl-teal)" }} />
        <h2 className="font-display text-base font-semibold">Student requests</h2>
      </div>
      <p className="text-sm -mt-2" style={{ color: "var(--dl-slate)" }}>
        Students who registered themselves and asked you to supervise them. Accepting adds them to
        your roster exactly like "Add Student" would; rejecting leaves them free to request someone else.
      </p>

      {error && (
        <div className="p-3 rounded-lg text-sm" style={{ background: "var(--dl-coral-soft)", color: "var(--dl-coral)" }}>
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="rounded-xl p-6 text-sm text-center" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)", color: "var(--dl-slate)" }}>
          No pending requests right now.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl p-4"
              style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}
            >
              <div>
                <p className="text-sm font-semibold">{r.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--dl-slate)" }}>
                  {r.program} · Batch {r.batchYear} · AG No. {r.agNumber}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--dl-slate)" }}>{r.email}</p>
                {r.thesisTitle && <p className="text-xs mt-1 italic" style={{ color: "var(--dl-ink-soft)" }}>“{r.thesisTitle}”</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => respond(r.id, "accept")}
                  disabled={busyId === r.id}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}
                >
                  <Check size={14} /> Accept
                </button>
                <button
                  onClick={() => respond(r.id, "reject")}
                  disabled={busyId === r.id}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ color: "var(--dl-coral)", background: "var(--dl-coral-soft)" }}
                >
                  <X size={14} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
