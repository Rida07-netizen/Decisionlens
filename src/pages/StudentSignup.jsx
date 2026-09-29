import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap, AlertCircle } from "lucide-react";
import { useStudentAuth } from "../context/StudentAuthContext";
import { DEGREE_LEVELS, DEPARTMENT_GROUPS } from "../data/academicPrograms";

const MODES = {
  ADDED: "added",       // supervisor already added this student — just set a password
  REGISTER: "register", // student creates their own account from scratch
};

export default function StudentSignup() {
  const navigate = useNavigate();
  const { signup, register } = useStudentAuth();
  const [mode, setMode] = useState(MODES.ADDED);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // "Already added" fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // "Register myself" fields
  const [form, setForm] = useState({
    name: "", agNumber: "", batchYear: "", thesisTitle: "",
    degree: "", department: "", email: "", password: "", confirm: "",
  });
  const [customDepartment, setCustomDepartment] = useState("");
  const setField = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleAddedSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await signup(email, password);
      navigate("/student/portal");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't create your account — is the API running?");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("Passwords don't match");
      return;
    }
    if (!form.degree) {
      setError("Select your degree program");
      return;
    }
    const department = form.department === "Other" ? customDepartment.trim() : form.department;
    if (!department) {
      setError("Select (or enter) your department");
      return;
    }
    setSubmitting(true);
    try {
      const { confirm, degree, department: _dept, ...payload } = form;
      await register({ ...payload, program: `${degree} ${department}` });
      navigate("/student/portal");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't create your account — is the API running?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-10" style={{ background: "var(--dl-paper)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: "var(--dl-ink)" }}>
            <GraduationCap size={16} color="var(--dl-paper)" />
          </div>
          <span className="font-display text-xl font-semibold">DecisionLens</span>
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
          <h1 className="font-display text-lg font-semibold mb-1">Set up your account</h1>

          <div className="flex gap-1 p-1 rounded-lg mb-4 mt-3" style={{ background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}>
            <button
              type="button"
              onClick={() => { setMode(MODES.ADDED); setError(null); }}
              className="flex-1 text-xs font-medium py-2 rounded-md transition-colors"
              style={{
                background: mode === MODES.ADDED ? "var(--dl-teal-soft)" : "transparent",
                color: mode === MODES.ADDED ? "var(--dl-teal)" : "var(--dl-slate)",
              }}
            >
              My supervisor added me
            </button>
            <button
              type="button"
              onClick={() => { setMode(MODES.REGISTER); setError(null); }}
              className="flex-1 text-xs font-medium py-2 rounded-md transition-colors"
              style={{
                background: mode === MODES.REGISTER ? "var(--dl-teal-soft)" : "transparent",
                color: mode === MODES.REGISTER ? "var(--dl-teal)" : "var(--dl-slate)",
              }}
            >
              I'm registering myself
            </button>
          </div>

          {mode === MODES.ADDED ? (
            <p className="text-sm mb-5" style={{ color: "var(--dl-slate)" }}>
              Use the exact email your supervisor added you with. If it's not on file yet, ask them
              to add you from their dashboard first.
            </p>
          ) : (
            <p className="text-sm mb-5" style={{ color: "var(--dl-slate)" }}>
              No supervisor has added you yet — create your own account, then request a supervisor
              from your portal. They'll need to accept before your requirements appear.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: "var(--dl-coral-soft)", color: "var(--dl-coral)" }}>
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {mode === MODES.ADDED ? (
            <form onSubmit={handleAddedSubmit} className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@student.edu.pk"
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Confirm password</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
              >
                {submitting ? "Creating account…" : "Create account"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Full name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setField({ name: e.target.value })}
                  placeholder="e.g. Nimra Aslam"
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setField({ email: e.target.value })}
                  placeholder="you@student.edu.pk"
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">AG Number</label>
                <input
                  required
                  value={form.agNumber}
                  onChange={(e) => setField({ agNumber: e.target.value })}
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
                    onChange={(e) => setField({ batchYear: e.target.value })}
                    placeholder="e.g. 2022"
                    className="w-full rounded-lg px-3 py-2.5 text-sm"
                    style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Degree Program</label>
                  <select
                    required
                    value={form.degree}
                    onChange={(e) => setField({ degree: e.target.value })}
                    className="w-full rounded-lg px-3 py-2.5 text-sm"
                    style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                  >
                    <option value="" disabled>Select…</option>
                    {DEGREE_LEVELS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Department</label>
                <select
                  required
                  disabled={!form.degree}
                  value={form.department}
                  onChange={(e) => setField({ department: e.target.value })}
                  className="w-full rounded-lg px-3 py-2.5 text-sm disabled:opacity-50"
                  style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                >
                  <option value="" disabled>{form.degree ? "Select…" : "Choose a degree program first"}</option>
                  {DEPARTMENT_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="Other">Other…</option>
                </select>
                {form.department === "Other" && (
                  <input
                    required
                    value={customDepartment}
                    onChange={(e) => setCustomDepartment(e.target.value)}
                    placeholder="Enter your department"
                    className="w-full rounded-lg px-3 py-2.5 text-sm mt-2"
                    style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                  />
                )}
                {form.degree && form.department && form.department !== "Other" && (
                  <p className="text-xs mt-1.5" style={{ color: "var(--dl-slate)" }}>
                    Your program will be recorded as "{form.degree} {form.department}".
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Thesis / FYP title</label>
                <input
                  required
                  value={form.thesisTitle}
                  onChange={(e) => setField({ thesisTitle: e.target.value })}
                  placeholder="e.g. Predictive Maintenance Using Sensor Data"
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setField({ password: e.target.value })}
                  placeholder="At least 6 characters"
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Confirm password</label>
                <input
                  type="password"
                  required
                  value={form.confirm}
                  onChange={(e) => setField({ confirm: e.target.value })}
                  placeholder="••••••••"
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
                style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
              >
                {submitting ? "Creating account…" : "Create account"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm mt-5" style={{ color: "var(--dl-slate)" }}>
          Already registered?{" "}
          <Link to="/student/login" className="font-medium" style={{ color: "var(--dl-teal)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
