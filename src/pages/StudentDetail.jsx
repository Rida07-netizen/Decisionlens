import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import {
  AlertTriangle, ArrowLeft, Archive, CalendarPlus, Check, CheckCircle2, Clock, Download,
  GraduationCap, History, MessageSquare, Send, Pencil, RotateCcw, Copy, Trash2, Undo2, X, XCircle,
} from "lucide-react";
import RiskMeter, { bandFor } from "../components/RiskMeter";
import { LoadingState, ErrorState } from "../components/LoadingState";
import {
  allowResubmission, getStudent, publishMilestone, unpublishMilestone, updateMilestone,
  deleteMilestone, saveMilestoneComment, getMilestoneFileUrl,
  overrideMilestoneCompleteness, overrideRiskScore, clearRiskOverride,
  markStudentCompleted, reactivateStudent, removeStudent, updateStudentProfile,
} from "../api/client";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const TABS = ["Explanation", "Risk Factors"];

const statusIcon = {
  "On time": { Icon: CheckCircle2, color: "var(--dl-teal)" },
  "Early": { Icon: CheckCircle2, color: "var(--dl-teal)" },
  "Late": { Icon: Clock, color: "var(--dl-amber)" },
  "Overdue": { Icon: XCircle, color: "var(--dl-coral)" },
  "Upcoming": { Icon: Clock, color: "var(--dl-slate)" },
};

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(TABS[0]);
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showStatusLog, setShowStatusLog] = useState(false);

  const load = useCallback(() => {
    getStudent(id)
      .then((s) => {
        setStudent(s);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    setStudent(null);
    load();
  }, [id, load]);

  if (error) return <ErrorState message={error} />;
  if (!student) return <LoadingState label="Loading student…" />;

  const handleMarkCompleted = async () => {
    if (!window.confirm(`Mark ${student.name} as completed? They'll move to History and drop off your active dashboard, roster, and sessions.`)) return;
    setStatusBusy(true);
    try {
      await markStudentCompleted(student.id);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't update that student — is the API running?");
    } finally {
      setStatusBusy(false);
    }
  };

  const handleReactivate = async () => {
    setStatusBusy(true);
    try {
      await reactivateStudent(student.id);
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't update that student — is the API running?");
    } finally {
      setStatusBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(`Permanently remove ${student.name}? This deletes their milestones, submitted documents, and interventions. This can't be undone.`)) return;
    setStatusBusy(true);
    try {
      await removeStudent(student.id);
      navigate("/students");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't remove that student — is the API running?");
      setStatusBusy(false);
    }
  };

  const band = bandFor(student.riskScore);

  const chartData = {
    labels: student.factors.map((f) => f.name.split(" ").slice(0, 2).join(" ")),
    datasets: [
      {
        data: student.factors.map((f) => f.weight),
        backgroundColor: "var(--dl-ink)",
        borderRadius: 6,
        maxBarThickness: 56,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: "#E4E1D8" }, ticks: { color: "#5B6478" } },
      x: { grid: { display: false }, ticks: { color: "#3B4664", font: { size: 11 } } },
    },
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <Link to="/students" className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--dl-slate)" }}>
        <ArrowLeft size={14} /> Back to students
      </Link>

      <div className="rounded-xl p-6" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs mb-1.5" style={{ color: "var(--dl-slate)" }}>
              AG No. {student.agNumber} · Batch {student.batchYear} · {student.program}
            </p>
            <h2 className="font-display text-2xl font-semibold mb-1">{student.name}</h2>
            <p className="text-sm mb-1" style={{ color: "var(--dl-ink-soft)" }}>{student.thesisTitle}</p>
            {student.status === "completed" && (
              <span
                className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: "var(--dl-teal-soft)", color: "var(--dl-teal)" }}
              >
                <GraduationCap size={12} /> Completed {student.completedAt ? `· ${student.completedAt}` : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowEditForm((v) => !v)}
              title="Correct anything wrong in this student's profile"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{ color: "var(--dl-ink-soft)", background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}
            >
              <Pencil size={13} /> Edit profile
            </button>
            {student.status === "completed" ? (
              <button
                onClick={handleReactivate}
                disabled={statusBusy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}
              >
                <RotateCcw size={13} /> Reactivate
              </button>
            ) : (
              <button
                onClick={handleMarkCompleted}
                disabled={statusBusy}
                title="Move to History — drops off the active dashboard, roster, and sessions"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}
              >
                <Archive size={13} /> Mark completed
              </button>
            )}
            <button
              onClick={handleRemove}
              disabled={statusBusy}
              title="Permanently delete this student"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ color: "var(--dl-coral)", background: "var(--dl-coral-soft)" }}
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>

        {showEditForm && (
          <EditProfileForm
            student={student}
            onCancel={() => setShowEditForm(false)}
            onSaved={() => { setShowEditForm(false); load(); }}
          />
        )}

        {student.statusLog?.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowStatusLog((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: "var(--dl-slate)" }}
            >
              <History size={12} /> {showStatusLog ? "Hide" : "Show"} status history ({student.statusLog.length})
            </button>
            {showStatusLog && (
              <div className="mt-2 rounded-lg p-3 flex flex-col gap-2" style={{ background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}>
                {[...student.statusLog].reverse().map((entry, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium" style={{ color: "var(--dl-ink-soft)" }}>
                      {new Date(entry.at).toLocaleString()} —{" "}
                      {{
                        completed: "Marked completed",
                        reactivated: "Reactivated",
                        new_degree_started: "Started a new degree",
                        profile_edited: "Profile edited",
                      }[entry.action] || entry.action}
                    </span>
                    {entry.note && <p style={{ color: "var(--dl-slate)" }}>{entry.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {student.riskLevel === "High" && (
          <div className="rounded-lg p-4 mt-4 mb-5 flex items-start gap-3" style={{ background: band.soft }}>
            <AlertTriangle size={20} color={band.color} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold mb-0.5" style={{ color: band.color }}>
                Recommended: reach out soon
              </p>
              <p className="text-sm" style={{ color: "var(--dl-ink-soft)" }}>
                Last active {student.lastActivity} · {student.progressPct}% of thesis complete
              </p>
            </div>
          </div>
        )}

        <RiskMeter value={student.riskScore} />
        <RiskOverrideControl student={student} onChange={load} />

        {student.pastDegrees?.length > 0 && (
          <div className="rounded-lg p-4 mt-5" style={{ background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}>
            <p className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: "var(--dl-slate)" }}>
              <History size={12} className="inline mr-1 -mt-0.5" /> Degrees completed here before
            </p>
            <div className="flex flex-col gap-2">
              {student.pastDegrees.map((d, i) => (
                <div key={i} className="text-sm">
                  <p className="font-medium">{d.program} — {d.thesisTitle}</p>
                  <p className="text-xs" style={{ color: "var(--dl-slate)" }}>
                    AG No. {d.agNumber} · Batch {d.batchYear} · Completed {d.completedAt || "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl p-6" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <div className="mb-4">
          <h3 className="font-display text-base font-semibold mb-1">Document Requirements</h3>
          <p className="text-sm" style={{ color: "var(--dl-slate)" }}>
            Publish or revise requirements, review submitted documents, and send feedback — right here, no separate page needed.
          </p>
        </div>
        {student.milestones.length === 0 ? (
          <p className="text-sm mb-4" style={{ color: "var(--dl-slate)" }}>
            No milestones yet. Add one with a real due date to start tracking.
          </p>
        ) : (
          <div className="flex flex-col gap-5 mb-5">
            {student.milestones.map((m) => (
              <MilestoneRow key={m.name} milestone={m} studentId={student.id} onChange={load} />
            ))}
          </div>
        )}
        <Link
          to={`/add-milestone?studentId=${student.id}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
        >
          <CalendarPlus size={15} /> Add Milestone
        </Link>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <div className="flex border-b" style={{ borderColor: "var(--dl-line)" }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-3 text-sm font-medium relative"
              style={{ color: tab === t ? "var(--dl-ink)" : "var(--dl-slate)" }}
            >
              {t}
              {tab === t && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5" style={{ background: "var(--dl-teal)" }} />
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "Explanation" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-relaxed" style={{ color: "var(--dl-ink-soft)" }}>
                {student.explanation}
              </p>
              {student.isRiskOverridden && (
                <p className="text-xs" style={{ color: "var(--dl-slate)" }}>
                  This explanation reflects the AI's own reasoning. The active risk score above has
                  been manually set by the supervisor to {student.riskScore} ({student.riskLevel}) —
                  see the note near the risk meter.
                </p>
              )}
            </div>
          )}

          {tab === "Risk Factors" && (
            <div className="flex flex-col gap-4">
              <Bar data={chartData} options={chartOptions} />
              {student.factors.map((f) => (
                <div key={f.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className="text-xs font-mono-num" style={{ color: "var(--dl-slate)" }}>{f.weight}% weight</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: "var(--dl-line)" }}>
                    <div className="h-full rounded-full" style={{ width: `${f.weight}%`, background: "var(--dl-ink)" }} />
                  </div>
                  <p className="text-xs" style={{ color: "var(--dl-slate)" }}>{f.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EditProfileForm({ student, onCancel, onSaved }) {
  const [form, setForm] = useState({
    name: student.name,
    email: student.email,
    agNumber: student.agNumber,
    batchYear: student.batchYear,
    program: student.program,
    thesisTitle: student.thesisTitle,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updateStudentProfile(student.id, form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't save those changes — is the API running?");
    } finally {
      setSubmitting(false);
    }
  };

  const fields = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email", type: "email" },
    { key: "agNumber", label: "AG Number" },
    { key: "batchYear", label: "Batch Year" },
    { key: "program", label: "Program" },
    { key: "thesisTitle", label: "Thesis Title" },
  ];

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 rounded-lg flex flex-col gap-3" style={{ background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--dl-ink-soft)" }}>
        Correct this student's info — useful if they entered something wrong at signup, or you made a typo adding them.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ key, label, type }) => (
          <div key={key} className={key === "program" || key === "thesisTitle" ? "col-span-2" : ""}>
            <label className="block text-xs font-medium mb-1">{label}</label>
            <input
              type={type || "text"}
              required
              value={form[key]}
              onChange={(e) => set({ [key]: e.target.value })}
              className="w-full rounded-lg px-2.5 py-2 text-xs"
              style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
            />
          </div>
        ))}
      </div>
      {error && <p className="text-xs" style={{ color: "var(--dl-coral)" }}>{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2 text-xs font-medium" style={{ color: "var(--dl-slate)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RiskOverrideControl({ student, onChange }) {
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(student.riskScore);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await overrideRiskScore(student.id, Number(score), note);
      setEditing(false);
      setNote("");
      onChange();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    setSaving(true);
    try {
      await clearRiskOverride(student.id);
      onChange();
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="mt-4 rounded-lg p-4" style={{ background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}>
        <p className="text-sm font-medium mb-2">Set the risk score manually</p>
        <p className="text-xs mb-3" style={{ color: "var(--dl-slate)" }}>
          AI currently computes {student.aiRiskScore} ({student.aiRiskLevel}). The AI keeps computing
          in the background — this just overrides which number is shown as active.
        </p>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number"
            min="0"
            max="100"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="w-20 rounded-lg px-2 py-1.5 text-sm font-mono-num"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
          />
          <span className="text-sm" style={{ color: "var(--dl-slate)" }}>/ 100</span>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why are you overriding it? (visible in the explanation)"
          rows={2}
          className="w-full rounded-lg px-3 py-2 text-sm mb-2"
          style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
        />
        {error && <p className="text-xs mb-2" style={{ color: "var(--dl-coral)" }}>{error}</p>}
        <div className="flex items-center gap-2">
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
            style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}>
            {saving ? "Saving…" : "Save override"}
          </button>
          <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: "var(--dl-slate)" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-3 flex-wrap">
      {student.isRiskOverridden ? (
        <>
          <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ color: "var(--dl-amber)", background: "var(--dl-amber-soft)" }}>
            Manually set — AI suggests {student.aiRiskScore} ({student.aiRiskLevel})
          </span>
          {student.riskOverrideNote && <span className="text-xs" style={{ color: "var(--dl-slate)" }}>"{student.riskOverrideNote}"</span>}
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--dl-teal)" }}>
            <Pencil size={12} /> Edit
          </button>
          <button onClick={handleRevert} disabled={saving} className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--dl-slate)" }}>
            <RotateCcw size={12} /> Revert to AI score
          </button>
        </>
      ) : (
        <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--dl-teal)" }}>
          <Pencil size={12} /> Override this score
        </button>
      )}
    </div>
  );
}

function MilestoneRow({ milestone: m, studentId, onChange }) {
  const { Icon, color } = statusIcon[m.status] || statusIcon["Upcoming"];
  const a = m.analysis;
  const versionCount = (m.versions?.length || 0) + (m.submitted ? 1 : 0);

  // Completeness-score override (existing behavior).
  const [overriding, setOverriding] = useState(false);
  const [score, setScore] = useState(a?.completenessScore ?? 50);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Requirement editing (name/due), publish state, and comments — merged in
  // from the old separate "Manage requirements" table so everything lives
  // on this one screen.
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.name);
  const [due, setDue] = useState(m.due);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState(m.supervisorComment || "");
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState(null);

  const run = async (action) => {
    setRowBusy(true);
    setRowError(null);
    try {
      await action();
      setEditing(false);
      setCommenting(false);
      onChange();
    } catch (err) {
      setRowError(err.response?.data?.error || err.message);
    } finally {
      setRowBusy(false);
    }
  };
  const resetEdit = () => { setName(m.name); setDue(m.due); setEditing(false); setRowError(null); };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await overrideMilestoneCompleteness(studentId, m.name, Number(score), note);
      setOverriding(false);
      setNote("");
      onChange();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg p-4" style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}>
      <div className="flex items-start gap-3">
        <Icon size={17} color={color} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <input value={name} onChange={(e) => setName(e.target.value)} className="rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--dl-line)" }} />
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--dl-line)" }} />
              <button onClick={() => run(() => updateMilestone(studentId, m.name, { name, due }))} disabled={rowBusy} title="Save changes" className="p-1.5" style={{ color: "var(--dl-teal)" }}><Check size={15} /></button>
              <button onClick={resetEdit} title="Cancel" className="p-1.5" style={{ color: "var(--dl-slate)" }}><X size={15} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-medium">{m.name}</p>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0" style={{ color, background: `${color}1a` }}>{m.status}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: m.published ? "var(--dl-teal)" : "var(--dl-slate)", background: m.published ? "var(--dl-teal-soft)" : "var(--dl-paper-raised)" }}>
                {m.published ? "Published" : "Private"}
              </span>
            </div>
          )}
          <p className="text-xs" style={{ color: "var(--dl-slate)" }}>
            Due {m.due}{m.submitted ? ` · Submitted ${m.submitted}${m.fileName ? ` · ${m.fileName}` : ""}` : " · Not submitted"}
          </p>
          {m.submitted && (
            <p className="text-xs mt-0.5" style={{ color: "var(--dl-teal)" }}>
              Version {versionCount} · {versionCount > 1 ? `${versionCount - 1} earlier version${versionCount > 2 ? "s" : ""} saved` : "Latest submission"}
            </p>
          )}
          {m.submitted && (
            <p className="text-xs mt-0.5 font-medium" style={{ color: m.allowResubmit ? "var(--dl-teal)" : "var(--dl-slate)" }}>
              {m.allowResubmit ? "Resubmission open for student" : "Upload form locked for student"}
            </p>
          )}
          {rowError && <p className="text-xs mt-1" style={{ color: "var(--dl-coral)" }}>{rowError}</p>}
        </div>
      </div>

      {/* Action bar — publish, edit, view versions, download, comment, delete.
          All buttons share the same pill styling so none stands out oddly. */}
      <div className="flex items-center gap-2 flex-wrap mt-3 ml-8">
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            title="Edit requirement"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium underline"
            style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}
          >
            <Pencil size={13} /> Edit
          </button>
        )}
        <button
          onClick={() => run(() => (m.published ? unpublishMilestone(studentId, m.name) : publishMilestone(studentId, m.name)))}
          disabled={rowBusy}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium underline disabled:opacity-50"
          style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}
        >
          {m.published ? <Undo2 size={13} /> : <Send size={13} />}
          {rowBusy ? "Working…" : m.published ? "Unpublish" : "Publish"}
        </button>
        {m.submitted && (
          <>
            <Link
              to={`/students/${studentId}/requirements/${encodeURIComponent(m.name)}/review`}
              title="View submission, manage versions, and leave feedback"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium underline"
              style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}
            >
              <History size={13} /> View{versionCount > 1 ? ` (${versionCount})` : ""}
            </Link>
            {m.storedFile && (
              <a
                href={getMilestoneFileUrl(studentId, m.name)}
                title="Download document"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium underline"
                style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}
              >
                <Download size={13} /> Download
              </a>
            )}
            {!m.allowResubmit && (
              <button
                onClick={() => run(() => allowResubmission(studentId, m.name))}
                disabled={rowBusy}
                title="Reopen the upload form for this student"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium underline disabled:opacity-50"
                style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}
              >
                <RotateCcw size={13} /> Resubmit
              </button>
            )}
          </>
        )}
        <button
          onClick={() => setCommenting((c) => !c)}
          title="Comment for student"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium underline"
          style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}
        >
          <MessageSquare size={13} /> Comment
        </button>
        <button
          onClick={() => { if (window.confirm(`Delete "${m.name}"? Any uploaded document will also be deleted.`)) run(() => deleteMilestone(studentId, m.name)); }}
          disabled={rowBusy}
          title="Delete requirement"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium underline disabled:opacity-50"
          style={{ color: "var(--dl-coral)", background: "var(--dl-coral-soft)" }}
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>

      {commenting && (
        <div className="mt-2 ml-8">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Write feedback for the student…"
            className="w-full rounded-lg px-2 py-1.5 text-xs"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
          />
          <div className="flex gap-2 mt-2">
            <button onClick={() => run(() => saveMilestoneComment(studentId, m.name, comment))} disabled={rowBusy} className="px-2.5 py-1.5 rounded text-xs font-semibold disabled:opacity-50" style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}>
              {rowBusy ? "Saving…" : "Save comment"}
            </button>
            <button onClick={() => setCommenting(false)} className="text-xs" style={{ color: "var(--dl-slate)" }}>Cancel</button>
          </div>
        </div>
      )}
      {!commenting && m.supervisorComment && (
        <p className="text-xs mt-2 ml-8" style={{ color: "var(--dl-slate)" }}>
          <span className="font-medium">Comment:</span> {m.supervisorComment}
        </p>
      )}

      {m.submitted && (
        <div className="ml-8 mt-1.5 flex flex-col gap-2">
          {m.githubLink && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold" style={{ color: "var(--dl-slate)" }}>GitHub Link:</span>
              <a href={m.githubLink} target="_blank" rel="noreferrer" className="underline font-medium hover:text-[var(--dl-teal)]" style={{ color: "var(--dl-ink)" }}>
                {m.githubLink}
              </a>
            </div>
          )}
          {m.attachments && m.attachments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold" style={{ color: "var(--dl-slate)" }}>Project Attachments:</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {m.attachments.map((att) => {
                  const isImage = att.mimetype && att.mimetype.startsWith("image/");
                  const isVideo = att.mimetype && att.mimetype.startsWith("video/");
                  const url = `/api/students/${studentId}/milestones/${encodeURIComponent(m.name)}/attachments/${att.storedFile}`;

                  return (
                    <div key={att.storedFile} className="rounded-lg border overflow-hidden bg-white p-1.5 flex flex-col gap-1 shadow-sm" style={{ borderColor: "var(--dl-line)" }}>
                      {isImage ? (
                        <a href={url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded bg-gray-50">
                          <img src={url} alt={att.fileName} className="w-full h-full object-cover" />
                        </a>
                      ) : isVideo ? (
                        <video src={url} controls className="w-full aspect-[4/3] rounded bg-black" />
                      ) : (
                        <div className="aspect-[4/3] rounded bg-gray-50 flex items-center justify-center text-xs text-center p-2 font-medium" style={{ color: "var(--dl-slate)" }}>
                          {att.fileName}
                        </div>
                      )}
                      <a href={url} className="text-[10px] truncate hover:underline text-center" style={{ color: "var(--dl-slate)" }} title={att.fileName}>
                        {att.fileName}
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {a && a.supported && (
        <div className="ml-8 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {a.isPlaceholder ? (
              <span className="px-2 py-0.5 rounded-full font-medium" style={{ color: "var(--dl-coral)", background: "var(--dl-coral-soft)" }}>
                Looks incomplete
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full font-medium" style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}>
                {a.completenessScore}% complete
              </span>
            )}
            {a.completenessOverridden && (
              <span style={{ color: "var(--dl-slate)" }}>(AI said {a.aiCompletenessScore}%)</span>
            )}
            <span style={{ color: "var(--dl-slate)" }}>{a.wordCount} words</span>
            {a.missingKeywords.length > 0 && (
              <span style={{ color: "var(--dl-slate)" }}>· missing: {a.missingKeywords.join(", ")}</span>
            )}
            <button onClick={() => setOverriding((o) => !o)} className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--dl-teal)" }}>
              <Pencil size={11} /> {a.completenessOverridden ? "Edit override" : "Override %"}
            </button>
          </div>

          {a.effort && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span style={{ color: "var(--dl-slate)" }}>Effort: </span>
              <span
                className="px-2 py-0.5 rounded-full font-medium"
                style={{
                  color: a.effort.score >= 65 ? "var(--dl-teal)" : a.effort.score >= 35 ? "var(--dl-amber)" : "var(--dl-coral)",
                  background: a.effort.score >= 65 ? "var(--dl-teal-soft)" : a.effort.score >= 35 ? "var(--dl-amber-soft)" : "var(--dl-coral-soft)",
                }}
              >
                {a.effort.score}/100 — {a.effort.label}
              </span>
            </div>
          )}

          {a.originality && a.originality.matches.length > 0 && (
            <div className="flex items-start gap-1.5 text-xs px-2 py-1.5 rounded-lg" style={{ background: "var(--dl-coral-soft)" }}>
              <Copy size={12} style={{ color: "var(--dl-coral)" }} className="shrink-0 mt-0.5" />
              <span style={{ color: "var(--dl-coral)" }}>
                {a.originality.matches[0].similarity}% similar to {a.originality.matches[0].studentName}'s{" "}
                "{a.originality.matches[0].milestoneName}" — checked only against other submissions in
                this system, not the wider internet.
              </span>
            </div>
          )}

          {(a.pledge || a.aiLikelihood) && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              {a.pledge && (
                <span
                  className="px-2 py-0.5 rounded-full font-medium"
                  style={{
                    color: a.pledge.included ? "var(--dl-teal)" : "var(--dl-amber)",
                    background: a.pledge.included ? "var(--dl-teal-soft)" : "var(--dl-amber-soft)",
                  }}
                  title={
                    !a.pledge.sectionFound
                      ? "No declaration/pledge section found in the document."
                      : a.pledge.included
                      ? `Found: ${a.pledge.foundPhrases.join(", ")}${a.pledge.excerpt ? ` — "${a.pledge.excerpt}"` : ""}`
                      : `Declaration section found, but missing: ${a.pledge.missingPhrases.join(", ")}${a.pledge.excerpt ? ` — "${a.pledge.excerpt}"` : ""}`
                  }
                >
                  {!a.pledge.sectionFound ? "No declaration found" : `Pledge: ${a.pledge.matchPercent}% included`}
                </span>
              )}
              {a.aiLikelihood && (
                <span
                  className="px-2 py-0.5 rounded-full font-medium"
                  style={{
                    color: a.aiLikelihood.score >= 65 ? "var(--dl-coral)" : a.aiLikelihood.score >= 35 ? "var(--dl-amber)" : "var(--dl-teal)",
                    background: a.aiLikelihood.score >= 65 ? "var(--dl-coral-soft)" : a.aiLikelihood.score >= 35 ? "var(--dl-amber-soft)" : "var(--dl-teal-soft)",
                  }}
                  title={a.aiLikelihood.label}
                >
                  Est. AI assistance: {a.aiLikelihood.score}%
                </span>
              )}
            </div>
          )}

          {overriding && (
            <div className="rounded-lg p-3 mt-1" style={{ background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}>
              <p className="text-xs mb-2" style={{ color: "var(--dl-slate)" }}>
                Read the document yourself? Set the real completeness percentage.
              </p>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="w-20 rounded-lg px-2 py-1.5 text-sm font-mono-num"
                  style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
                />
                <span className="text-xs" style={{ color: "var(--dl-slate)" }}>%</span>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why? (optional)"
                rows={2}
                className="w-full rounded-lg px-2 py-1.5 text-xs mb-2"
                style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
              />
              {error && <p className="text-xs mb-2" style={{ color: "var(--dl-coral)" }}>{error}</p>}
              <div className="flex items-center gap-2">
                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                  style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setOverriding(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: "var(--dl-slate)" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {a && !a.supported && (
        <p className="ml-8 text-xs" style={{ color: "var(--dl-slate)" }}>{a.summary}</p>
      )}
      {error && <p className="ml-8 text-xs" style={{ color: "var(--dl-coral)" }}>{error}</p>}
    </div>
  );
}
