import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { useAdminAuth } from "../context/AdminAuthContext";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't sign in — is the API running?");
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
          <h1 className="font-display text-lg font-semibold mb-1">Admin sign in</h1>
          <p className="text-sm mb-5" style={{ color: "var(--dl-slate)" }}>
            Manage supervisors and students across the whole system.
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: "var(--dl-slate)" }}>
          First time here?{" "}
          <Link to="/admin/signup" className="font-medium" style={{ color: "var(--dl-teal)" }}>
            Set up the admin account
          </Link>
        </p>
        <p className="text-center text-sm mt-2" style={{ color: "var(--dl-slate)" }}>
          Not an admin?{" "}
          <Link to="/login" className="font-medium" style={{ color: "var(--dl-teal)" }}>
            Supervisor sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
