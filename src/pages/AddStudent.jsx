import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { UserPlus, AlertCircle, ArrowLeft } from "lucide-react";
import { addStudent } from "../api/client";
import { useAuth } from "../context/AuthContext";

// Grouped by faculty so the dropdown stays scannable even with a lot of
// programs in it. "Other" reveals a free-text field, since no fixed list
// can cover every department at every institution.
const PROGRAM_GROUPS = [
  {
    label: "Engineering & Computing",
    options: [
      "BS Computer Science",
      "BS Software Engineering",
      "BS Information Technology",
      "BS Computer Engineering",
      "BS Artificial Intelligence",
      "BS Data Science",
      "BS Cyber Security",
      "BS Electrical Engineering",
      "BS Electronics Engineering",
      "BS Mechanical Engineering",
      "BS Civil Engineering",
      "BS Chemical Engineering",
      "BS Biomedical Engineering",
      "BS Architecture",
    ],
  },
  {
    label: "Business & Social Sciences",
    options: [
      "BBA (Business Administration)",
      "BS Accounting & Finance",
      "BS Economics",
      "BS Commerce",
      "BS Public Administration",
      "BS Psychology",
      "BS Sociology",
      "BS Mass Communication",
      "LLB (Law)",
    ],
  },
  {
    label: "Natural & Applied Sciences",
    options: [
      "BS Mathematics",
      "BS Physics",
      "BS Chemistry",
      "BS Biotechnology",
      "BS Environmental Science",
      "PharmD (Pharmacy)",
    ],
  },
  {
    label: "Humanities & Arts",
    options: [
      "BS English",
      "BS Education",
      "BFA (Fine Arts)",
      "BS Fashion Design",
    ],
  },
];

export default function AddStudent() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: "",
    agNumber: "",
    batchYear: "",
    email: "",
    thesisTitle: "",
    program: "BS Computer Science",
    meetingsScheduled: 6,
  });
  const [customProgram, setCustomProgram] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.program === "Other" && !customProgram.trim()) {
      setError("Enter the department/program name");
      return;
    }
    setSubmitting(true);
    try {
      const program = form.program === "Other" ? customProgram.trim() : form.program;
      const student = await addStudent({ ...form, program, supervisorId: user.id });
      navigate(`/students/${student.id}`);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't add student — is the API running?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg flex flex-col gap-4">
      <Link to="/students" className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--dl-slate)" }}>
        <ArrowLeft size={14} /> Back to students
      </Link>

      <form onSubmit={handleSubmit} className="rounded-xl p-5 flex flex-col gap-4" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <h2 className="font-display text-base font-semibold">Add a new student</h2>
        <p className="text-sm -mt-2" style={{ color: "var(--dl-slate)" }}>
          They'll start with no milestones and a risk score of 0. Add milestones with real due dates
          from the "Add Milestone" page once you've set expectations with the student. Their email
          lets them sign up for their own portal at <code>/student/signup</code> — only emails you've
          added here can register.
        </p>

        <div>
          <label className="block text-sm font-medium mb-1.5">Full name</label>
          <input
            required
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Nimra Aslam"
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Student email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            placeholder="student@example.com"
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">AG Number</label>
          <input
            required
            value={form.agNumber}
            onChange={(e) => set({ agNumber: e.target.value })}
            placeholder="e.g. AG-2022-0051"
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1.5">Batch Year</label>
            <input
              required
              value={form.batchYear}
              onChange={(e) => set({ batchYear: e.target.value })}
              placeholder="e.g. 2022"
              className="w-full rounded-lg px-3 py-2.5 text-sm"
              style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Program</label>
            <select
              value={form.program}
              onChange={(e) => set({ program: e.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm"
              style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
            >
              {PROGRAM_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </optgroup>
              ))}
              <option value="Other">Other (type below)</option>
            </select>
            {form.program === "Other" && (
              <input
                type="text"
                value={customProgram}
                onChange={(e) => setCustomProgram(e.target.value)}
                placeholder="e.g. BS Robotics"
                className="w-full rounded-lg px-3 py-2.5 text-sm mt-2"
                style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
              />
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Thesis / FYP title</label>
          <input
            required
            value={form.thesisTitle}
            onChange={(e) => set({ thesisTitle: e.target.value })}
            placeholder="e.g. Predictive Maintenance Using Sensor Data"
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Meetings scheduled so far</label>
          <input
            type="number"
            min="0"
            value={form.meetingsScheduled}
            onChange={(e) => set({ meetingsScheduled: e.target.value })}
            className="w-full rounded-lg px-3 py-2.5 text-sm"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ background: "var(--dl-coral-soft)", color: "var(--dl-coral)" }}>
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
          style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
        >
          <UserPlus size={16} />
          {submitting ? "Adding…" : "Add student"}
        </button>
      </form>
    </div>
  );
}
