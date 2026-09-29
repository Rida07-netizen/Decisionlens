import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarPlus, CheckCircle2, AlertCircle, ArrowLeft, X } from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { getStudents, getMilestoneTemplates, addMilestone } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function AddMilestone() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedStudentId = searchParams.get("studentId");
  const [students, setStudents] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loadError, setLoadError] = useState(null);

  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  // Toast: fires clearly on both success and failure, then auto-dismisses.
  const [toast, setToast] = useState(null); // { type: "success" | "error", text }

  useEffect(() => {
    Promise.all([getStudents(user.id), getMilestoneTemplates()])
      .then(([s, t]) => {
        setStudents(s);
        setTemplates(t);
        const preselected = preselectedStudentId && s.some((st) => st.id === preselectedStudentId);
        if (preselected) setStudentId(preselectedStudentId);
        else if (s.length) setStudentId(s[0].id);
      })
      .catch((e) => setLoadError(e.message));
  }, [user.id, preselectedStudentId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (loadError) return <ErrorState message={loadError} />;
  if (!students) return <LoadingState label="Loading students…" />;

  const selectedStudent = students.find((s) => s.id === studentId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated = await addMilestone(studentId, { name, due });
      setResult(updated);
      setToast({ type: "success", text: `"${name}" was added successfully for ${updated.name}.` });
      setName("");
      setDue("");
    } catch (err) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      setToast({ type: "error", text: `Couldn't add the milestone: ${message}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg flex flex-col gap-4 relative">
      {toast && (
        <div
          className="fixed top-5 right-5 z-50 flex items-start gap-2.5 px-4 py-3 rounded-xl shadow-lg max-w-sm animate-[fadeIn_0.15s_ease-out]"
          style={{
            background: toast.type === "success" ? "var(--dl-teal)" : "var(--dl-coral)",
            color: "var(--dl-paper)",
          }}
          role="status"
        >
          {toast.type === "success" ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
          <p className="text-sm font-medium flex-1">{toast.text}</p>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-80 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      <Link to="/students" className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--dl-slate)" }}>
        <ArrowLeft size={14} /> Back to students
      </Link>

      <form onSubmit={handleSubmit} className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <div>
          <h2 className="font-display text-base font-semibold">Add a milestone</h2>
          <p className="text-sm mt-1" style={{ color: "var(--dl-slate)" }}>
            You set the due date — nothing is generated automatically. New requirements stay private
            on your side until you publish them to the student's portal.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Student</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name} — AG No. {s.agNumber}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Milestone name</label>
          <input
            required
            list="milestone-templates"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Literature Review"
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          />
          <datalist id="milestone-templates">
            {templates.map((t) => <option key={t} value={t} />)}
          </datalist>
          <p className="text-xs mt-1" style={{ color: "var(--dl-slate)" }}>
            Pick a suggested name for content analysis to check the right sections, or type your own.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Due date</label>
          <input
            type="date"
            required
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          />
        </div>

        {selectedStudent?.milestones?.length > 0 && (
          <p className="text-xs" style={{ color: "var(--dl-slate)" }}>
            {selectedStudent.name} already has: {selectedStudent.milestones.map((m) => m.name).join(", ")}
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ background: "var(--dl-coral-soft)", color: "var(--dl-coral)" }}>
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {result && (
          <div className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ background: "var(--dl-teal-soft)", color: "var(--dl-teal)" }}>
            <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
            Requirement added privately for {result.name}. <Link to={`/students/${result.id}`} className="underline font-medium">Publish it when ready</Link>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
          style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
        >
          <CalendarPlus size={16} />
          {submitting ? "Adding…" : "Add milestone"}
        </button>
      </form>
    </div>
  );
}
