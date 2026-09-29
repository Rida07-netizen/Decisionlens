import { useEffect, useState } from "react";
import { Check, AlertCircle } from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { getProfile, updateProfile } from "../api/client";
import { useAuth } from "../context/AuthContext";

function Field({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <input
        className="w-full rounded-lg px-3 py-2.5 text-sm"
        style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
        {...props}
      />
    </div>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs" style={{ color: "var(--dl-slate)" }}>{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="w-10 h-6 rounded-full relative transition-colors shrink-0"
        style={{ background: checked ? "var(--dl-teal)" : "var(--dl-line)" }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
          style={{ left: checked ? 18 : 2 }}
        />
      </button>
    </div>
  );
}

export default function Settings() {
  const { user, updateLocalUser } = useAuth();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    getProfile(user.id).then(setForm).catch((e) => setError(e.message));
  }, [user.id]);

  if (error) return <ErrorState message={error} />;
  if (!form) return <LoadingState label="Loading settings…" />;

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const updated = await updateProfile({ ...form, supervisorId: form.id });
      setForm(updated);
      updateLocalUser({ name: updated.name, email: updated.email, institution: updated.institution });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(err.response?.data?.error || "Couldn't save — is the API running?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-lg">
      <section className="rounded-xl p-5" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <h2 className="font-display text-base font-semibold mb-4">Profile</h2>
        <div className="flex flex-col gap-3">
          <Field label="Full name" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          <Field label="Email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          <Field label="Institution" value={form.institution} onChange={(e) => set({ institution: e.target.value })} />
          <div>
            <label className="block text-sm font-medium mb-1.5">Department</label>
            <select
              value={form.department}
              onChange={(e) => set({ department: e.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm"
              style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
            >
              <option>Computer Science</option>
              <option>Software Engineering</option>
              <option>Information Technology</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl p-5" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <h2 className="font-display text-base font-semibold mb-2">Preferences</h2>
        <div className="divide-y" style={{ borderColor: "var(--dl-line)" }}>
          <Toggle
            label="Email alerts"
            description="Get notified when a student crosses into high risk"
            checked={form.emailAlerts}
            onChange={(v) => set({ emailAlerts: v })}
          />
          <Toggle
            label="Auto-expand risk factors"
            description="Show the full risk breakdown by default on student detail"
            checked={form.autoExpandFactors}
            onChange={(v) => set({ autoExpandFactors: v })}
          />
        </div>
      </section>

      {saveError && (
        <div className="flex items-start gap-2 p-3 rounded-lg text-sm" style={{ background: "var(--dl-coral-soft)", color: "var(--dl-coral)" }}>
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          {saveError}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="self-start px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
        style={{ background: saved ? "var(--dl-teal)" : "var(--dl-ink)", color: "var(--dl-paper)" }}
      >
        {saved && <Check size={15} />}
        {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
      </button>
    </form>
  );
}
