import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { useAdminAuth } from "../context/AdminAuthContext";

export default function AdminSignup() {
  const navigate = useNavigate();
  const { signup } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await signup(email, password);
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't create the account — is the API running?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--dl-paper)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ background: "var(--dl-ink)" }}>
            <ShieldCheck size={16} color="var(--dl-paper)" />
          </div>
          <span className="font-display text-xl font-semibold">DecisionLens</span>
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
          <h1 className="font-display text-lg font-semibold mb-1">Set up the admin account</h1>
          <p className="text-sm mb-5" style={{ color: "var(--dl-slate)" }}>
            There's exactly one admin slot, seeded in <code>server/seedData.js</code>. Use that exact
            email (default: <code>admin@decisionlens.local</code>) to register.
          </p>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-sm mb-4" style={{ background: "var(--dl-coral-soft)", color: "var(--dl-coral)" }}>
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@decisionlens.local"
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
        </div>

        <p className="text-center text-sm mt-5" style={{ color: "var(--dl-slate)" }}>
          Already registered?{" "}
          <Link to="/admin/login" className="font-medium" style={{ color: "var(--dl-teal)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
