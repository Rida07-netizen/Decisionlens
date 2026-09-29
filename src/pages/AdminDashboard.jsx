import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, LogOut, Users, GraduationCap, AlertTriangle,
  Trash2, KeyRound, ArrowRightLeft, Plus, X, FileText, ChevronDown, ChevronUp,
  Download, History, Copy, CheckCircle2, Clock, XCircle,
} from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import {
  getAdminOverview, getAdminSupervisors, addSupervisor, deleteSupervisor, resetSupervisorPassword,
  getAdminStudents, reassignStudent, resetStudentPassword, deleteStudent, getMilestoneFileUrl,
} from "../api/client";
import { useAdminAuth } from "../context/AdminAuthContext";

const TABS = ["Overview", "Supervisors", "Students"];

export default function AdminDashboard() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Overview");

  const [overview, setOverview] = useState(null);
  const [supervisors, setSupervisors] = useState(null);
  const [students, setStudents] = useState(null);
  const [error, setError] = useState(null);

  const loadAll = useCallback(() => {
    Promise.all([getAdminOverview(), getAdminSupervisors(), getAdminStudents()])
      .then(([o, sup, st]) => {
        setOverview(o);
        setSupervisors(sup);
        setStudents(st);
      })
      .catch((e) => setError(e.response?.data?.error || e.message));
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
  };

  if (error) return <ErrorState message={error} />;
  if (!overview || !supervisors || !students) return <LoadingState label="Loading admin dashboard…" />;

  return (
    <div className="min-h-screen" style={{ background: "var(--dl-paper)" }}>
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "var(--dl-ink)" }}>
            <ShieldCheck size={15} color="var(--dl-paper)" />
          </div>
          <span className="font-display text-base font-semibold">DecisionLens · Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: "var(--dl-slate)" }}>{admin.name}</span>
          <button onClick={handleLogout} className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--dl-slate)" }}>
            <LogOut size={14} /> Log out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex border-b" style={{ borderColor: "var(--dl-line)" }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-5 py-3 text-sm font-medium relative"
              style={{ color: tab === t ? "var(--dl-ink)" : "var(--dl-slate)" }}
            >
              {t}
              {tab === t && <span className="absolute left-0 right-0 -bottom-px h-0.5" style={{ background: "var(--dl-teal)" }} />}
            </button>
          ))}
        </div>

        {tab === "Overview" && <OverviewTab overview={overview} />}
        {tab === "Supervisors" && <SupervisorsTab supervisors={supervisors} onChange={loadAll} />}
        {tab === "Students" && <StudentsTab students={students} supervisors={supervisors} onChange={loadAll} />}
      </div>
    </div>
  );
}

function OverviewTab({ overview }) {
  const cards = [
    { icon: Users, label: "Supervisors", value: overview.totalSupervisors, sub: `${overview.registeredSupervisors} registered` },
    { icon: GraduationCap, label: "Students", value: overview.totalStudents, sub: `${overview.registeredStudents} registered` },
    { icon: AlertTriangle, label: "High risk", value: overview.highRisk, sub: "across all supervisors" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl p-5" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
          <c.icon size={18} style={{ color: "var(--dl-slate)" }} />
          <p className="font-mono-num text-3xl font-semibold mt-3">{c.value}</p>
          <p className="text-sm mt-1" style={{ color: "var(--dl-ink-soft)" }}>{c.label}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--dl-slate)" }}>{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

function SupervisorsTab({ supervisors, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", institution: "" });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await addSupervisor(form);
      setForm({ name: "", email: "", institution: "" });
      setShowForm(false);
      onChange();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (id) => {
    setBusyId(id);
    try {
      await resetSupervisorPassword(id);
      onChange();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    setBusyId(id);
    setError(null);
    try {
      await deleteSupervisor(id);
      onChange();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--dl-slate)" }}>
          Add a supervisor's email here to let them self-register at <code>/login</code> → Create an account.
        </p>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold shrink-0"
          style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "Add Supervisor"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
          <div className="grid sm:grid-cols-2 gap-3">
            <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }} />
            <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }} />
          </div>
          <input placeholder="Institution (optional)" value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })}
            className="rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }} />
          {error && <p className="text-sm" style={{ color: "var(--dl-coral)" }}>{error}</p>}
          <button type="submit" disabled={submitting} className="self-start px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
            style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}>
            {submitting ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {!showForm && error && <p className="text-sm" style={{ color: "var(--dl-coral)" }}>{error}</p>}

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        {supervisors.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--dl-line)" }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-xs" style={{ color: "var(--dl-slate)" }}>{s.email} · {s.institution || "—"}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full font-medium shrink-0"
              style={{ color: s.registered ? "var(--dl-teal)" : "var(--dl-slate)", background: s.registered ? "var(--dl-teal-soft)" : "var(--dl-line)" }}>
              {s.registered ? "Registered" : "Not registered"}
            </span>
            <span className="text-xs font-mono-num shrink-0" style={{ color: "var(--dl-slate)" }}>{s.studentCount} students</span>
            <button onClick={() => handleReset(s.id)} disabled={busyId === s.id}
              title="Revoke access — they must sign up again" className="p-2 rounded-lg shrink-0" style={{ color: "var(--dl-slate)" }}>
              <KeyRound size={15} />
            </button>
            <button onClick={() => handleDelete(s.id)} disabled={busyId === s.id}
              title="Delete supervisor" className="p-2 rounded-lg shrink-0" style={{ color: "var(--dl-coral)" }}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StudentsTab({ students, supervisors, onChange }) {
  const [busyId, setBusyId] = useState(null);
  const [reassigningId, setReassigningId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState(null);

  const handleReassign = async (studentId, supervisorId) => {
    setBusyId(studentId);
    setError(null);
    try {
      await reassignStudent(studentId, supervisorId);
      setReassigningId(null);
      onChange();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReset = async (id) => {
    setBusyId(id);
    try {
      await resetStudentPassword(id);
      onChange();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this student and all their milestones/interventions? This can't be undone.")) return;
    setBusyId(id);
    try {
      await deleteStudent(id);
      onChange();
    } finally {
      setBusyId(null);
    }
  };

  const riskColor = (level) => level === "High" ? "var(--dl-coral)" : level === "Moderate" ? "var(--dl-amber)" : "var(--dl-teal)";

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm" style={{ color: "var(--dl-coral)" }}>{error}</p>}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        {students.map((s) => (
          <div key={s.id} style={{ borderBottom: "1px solid var(--dl-line)" }}>
            <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs" style={{ color: "var(--dl-slate)" }}>{s.email} · AG No. {s.agNumber} · Batch {s.batchYear}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full font-medium shrink-0" style={{ color: riskColor(s.riskLevel), background: `${riskColor(s.riskLevel)}1a` }}>
                {s.riskScore} {s.riskLevel}
              </span>

              {reassigningId === s.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    defaultValue={s.supervisorId}
                    onChange={(e) => handleReassign(s.id, e.target.value)}
                    disabled={busyId === s.id}
                    className="text-xs rounded-lg px-2 py-1.5"
                    style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }}
                  >
                    {supervisors.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                  </select>
                  <button onClick={() => setReassigningId(null)} className="p-1.5" style={{ color: "var(--dl-slate)" }}><X size={14} /></button>
                </div>
              ) : (
                <button onClick={() => setReassigningId(s.id)} className="text-xs shrink-0" style={{ color: "var(--dl-ink-soft)" }} title={s.supervisorName}>
                  {s.supervisorName}
                </button>
              )}

              <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)} title="View milestones & documents"
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium shrink-0" style={{ color: "var(--dl-teal)" }}>
                <FileText size={14} /> Documents
                {expandedId === s.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button onClick={() => setReassigningId(s.id)} disabled={busyId === s.id}
                title="Reassign to a different supervisor" className="p-2 rounded-lg shrink-0" style={{ color: "var(--dl-slate)" }}>
                <ArrowRightLeft size={15} />
              </button>
              <button onClick={() => handleReset(s.id)} disabled={busyId === s.id}
                title="Revoke access — they must sign up again" className="p-2 rounded-lg shrink-0" style={{ color: "var(--dl-slate)" }}>
                <KeyRound size={15} />
              </button>
              <button onClick={() => handleDelete(s.id)} disabled={busyId === s.id}
                title="Delete student" className="p-2 rounded-lg shrink-0" style={{ color: "var(--dl-coral)" }}>
                <Trash2 size={15} />
              </button>
            </div>

            {expandedId === s.id && (
              <div className="px-4 pb-4">
                <AdminMilestoneList student={s} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const statusIcon = {
  "On time": { Icon: CheckCircle2, color: "var(--dl-teal)" },
  "Early": { Icon: CheckCircle2, color: "var(--dl-teal)" },
  "Late": { Icon: Clock, color: "var(--dl-amber)" },
  "Overdue": { Icon: XCircle, color: "var(--dl-coral)" },
  "Upcoming": { Icon: Clock, color: "var(--dl-slate)" },
};

// Read-only for admin — reviewing documents and their AI analysis, same
// data the supervisor sees, but without the override controls (those stay
// a supervisor-only action since they're the one who knows the student).
function AdminMilestoneList({ student }) {
  if (!student.milestones || student.milestones.length === 0) {
    return <p className="text-xs" style={{ color: "var(--dl-slate)" }}>No milestones yet for this student.</p>;
  }

  return (
    <div className="rounded-lg p-3 flex flex-col gap-3" style={{ background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}>
      {student.milestones.map((m) => {
        const { Icon, color } = statusIcon[m.status] || statusIcon["Upcoming"];
        const a = m.analysis;
        const previousVersions = m.versions || [];
        const versionCount = previousVersions.length + (m.submitted ? 1 : 0);
        const submissionVersions = [
          ...previousVersions,
          ...(m.submitted ? [{ ...m, version: versionCount, isLatest: true }] : []),
        ];
        return (
          <div key={m.name} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Icon size={15} color={color} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs" style={{ color: "var(--dl-slate)" }}>
                  Due {m.due}{m.submitted ? ` · Submitted ${m.submitted}${m.fileName ? ` · ${m.fileName}` : ""}` : ""}
                </p>
              </div>
              {m.submitted && m.fileName && (
                <a href={getMilestoneFileUrl(student.id, m.name)} className="inline-flex items-center gap-1 text-xs font-medium shrink-0" style={{ color: "var(--dl-teal)" }}>
                  <Download size={12} /> Download
                </a>
              )}
              <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0" style={{ color, background: `${color}1a` }}>{m.status}</span>
            </div>

            {m.submitted && (
              <div className="ml-6 rounded-md px-2.5 py-2" style={{ background: "var(--dl-teal-soft)" }}>
                <p className="text-xs font-semibold flex items-center gap-1" style={{ color: "var(--dl-teal)" }}><History size={12} /> Submission versions ({versionCount})</p>
                <div className="mt-1.5 flex flex-col gap-1">
                  {[...submissionVersions].reverse().map((version) => (
                    <div key={version.version} className="flex items-center justify-between gap-2 text-xs">
                      <span style={{ color: "var(--dl-ink-soft)" }}>
                        Version {version.version}{version.isLatest ? " · Latest" : ""} · {version.submitted}{version.fileName ? ` · ${version.fileName}` : ""}
                      </span>
                      {version.storedFile && <a href={getMilestoneFileUrl(student.id, m.name, version.isLatest ? undefined : version.version)} className="inline-flex items-center gap-1 shrink-0 font-medium" style={{ color: "var(--dl-teal)" }}><Download size={11} /> Download</a>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {a && a.supported && (
              <div className="ml-6 flex items-center gap-2 text-xs flex-wrap">
                <span className="px-2 py-0.5 rounded-full font-medium"
                  style={{ color: a.isPlaceholder ? "var(--dl-coral)" : "var(--dl-teal)", background: a.isPlaceholder ? "var(--dl-coral-soft)" : "var(--dl-teal-soft)" }}>
                  {a.isPlaceholder ? "Looks incomplete" : `${a.completenessScore}% complete`}
                </span>
                {a.completenessOverridden && <span style={{ color: "var(--dl-slate)" }}>(AI said {a.aiCompletenessScore}%)</span>}
                {a.effort && <span style={{ color: "var(--dl-slate)" }}>· effort {a.effort.score}/100</span>}
                {a.originality && a.originality.matches.length > 0 && (
                  <span className="inline-flex items-center gap-1" style={{ color: "var(--dl-coral)" }}>
                    <Copy size={11} /> {a.originality.matches[0].similarity}% similar to {a.originality.matches[0].studentName}
                  </span>
                )}
              </div>
            )}
            {a && !a.supported && <p className="ml-6 text-xs" style={{ color: "var(--dl-slate)" }}>{a.summary}</p>}
          </div>
        );
      })}
    </div>
  );
}
