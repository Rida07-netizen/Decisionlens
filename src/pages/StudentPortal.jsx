import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";
import {
  AlertTriangle, GraduationCap, LogOut, CheckCircle2, Clock, XCircle,
  Download, History, UploadCloud, Bell, PlusCircle,
} from "lucide-react";
import RiskMeter, { bandFor } from "../components/RiskMeter";
import { LoadingState, ErrorState } from "../components/LoadingState";
import StudentSupervisorRequest from "./StudentSupervisorRequest";
import {
  getMilestoneFileUrl, getStudent, submitMilestoneDocument,
  getNotifications, markAllNotificationsRead, startNewDegree,
} from "../api/client";
import { useStudentAuth } from "../context/StudentAuthContext";
import { DEGREE_LEVELS, DEPARTMENT_GROUPS } from "../data/academicPrograms";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const TABS = ["Explanation", "Risk Factors"];

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const statusIcon = {
  "On time": { Icon: CheckCircle2, color: "var(--dl-teal)" },
  "Early": { Icon: CheckCircle2, color: "var(--dl-teal)" },
  "Late": { Icon: Clock, color: "var(--dl-amber)" },
  "Overdue": { Icon: XCircle, color: "var(--dl-coral)" },
  "Upcoming": { Icon: Clock, color: "var(--dl-slate)" },
};

export default function StudentPortal() {
  const { student: session, logout } = useStudentAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState(TABS[0]);
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showNewDegreeForm, setShowNewDegreeForm] = useState(false);
  const notifRef = useRef(null);

  const load = useCallback(() => {
    getStudent(session.id, "student")
      .then((s) => {
        setStudent(s);
      })
      .catch((e) => setError(e.response?.data?.error || e.message));
  }, [session.id]);

  useEffect(() => {
    load();
    // Poll while unassigned so the portal unlocks automatically once a
    // supervisor accepts, without the student needing to refresh.
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const loadNotifications = useCallback(() => {
    getNotifications({ studentId: session.id })
      .then(({ notifications, unreadCount }) => {
        setNotifications(notifications);
        setUnreadCount(unreadCount);
      })
      .catch(() => {});
  }, [session.id]);

  // Poll every 20s so a new comment or published requirement shows up
  // without the student needing to refresh the page.
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 20000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    function onClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const toggleNotif = () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening && unreadCount > 0) {
      markAllNotificationsRead({ studentId: session.id })
        .then(() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))))
        .then(() => setUnreadCount(0))
        .catch(() => {});
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/student/login");
  };

  if (error) return <ErrorState message={error} />;
  if (!student) return <LoadingState label="Loading your dashboard…" />;
  if (!student.supervisorId) return <StudentSupervisorRequest student={student} onRequested={load} />;

  const band = bandFor(student.riskScore);

  const chartData = {
    labels: student.factors.map((f) => f.name.split(" ").slice(0, 2).join(" ")),
    datasets: [{
      data: student.factors.map((f) => f.weight),
      backgroundColor: "var(--dl-ink)",
      borderRadius: 6,
      maxBarThickness: 56,
    }],
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
    <div className="min-h-screen" style={{ background: "var(--dl-paper)" }}>
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "var(--dl-ink)" }}>
            <GraduationCap size={15} color="var(--dl-paper)" />
          </div>
          <span className="font-display text-base font-semibold">DecisionLens · Student</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative" ref={notifRef}>
            <button
              onClick={toggleNotif}
              className="w-9 h-9 rounded-full flex items-center justify-center relative"
              style={{ background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span
                  className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                  style={{ background: "var(--dl-coral)" }}
                />
              )}
            </button>
            {notifOpen && (
              <div
                className="absolute right-0 mt-2 w-80 rounded-lg overflow-hidden shadow-lg z-20 max-h-96 overflow-y-auto"
                style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}
              >
                <div className="px-4 py-3 border-b" style={{ borderColor: "var(--dl-line)" }}>
                  <p className="text-sm font-medium">Notifications</p>
                </div>
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div key={n.id} className="px-4 py-2.5 text-sm border-b last:border-b-0" style={{ borderColor: "var(--dl-line)" }}>
                      <p>{n.message}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--dl-slate)" }}>{timeAgo(n.createdAt)}</p>
                    </div>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm" style={{ color: "var(--dl-slate)" }}>
                    No new notifications
                  </p>
                )}
              </div>
            )}
          </div>
          <button onClick={handleLogout} className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--dl-slate)" }}>
            <LogOut size={14} /> Log out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="rounded-xl p-6" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
          <p className="text-xs mb-1.5" style={{ color: "var(--dl-slate)" }}>
            AG No. {student.agNumber} · Batch {student.batchYear} · {student.program}
          </p>
          <h1 className="font-display text-2xl font-semibold mb-1">{student.name}</h1>
          <p className="text-sm mb-4" style={{ color: "var(--dl-ink-soft)" }}>{student.thesisTitle}</p>

          {student.status === "completed" && (
            <div className="rounded-lg p-4 mb-5 flex items-start gap-3" style={{ background: "var(--dl-teal-soft)" }}>
              <GraduationCap size={20} color="var(--dl-teal)" className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs uppercase tracking-wide font-semibold mb-0.5" style={{ color: "var(--dl-teal)" }}>
                  Completed{student.completedAt ? ` · ${student.completedAt}` : ""}
                </p>
                <p className="text-sm mb-3" style={{ color: "var(--dl-ink-soft)" }}>
                  You've finished this thesis. Everything below is your history — your submitted
                  milestones and documents stay here for you to look back on.
                </p>
                {!showNewDegreeForm && (
                  <button
                    onClick={() => setShowNewDegreeForm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
                  >
                    <PlusCircle size={13} /> Start a new degree here
                  </button>
                )}
                {showNewDegreeForm && (
                  <NewDegreeForm
                    studentId={student.id}
                    onCancel={() => setShowNewDegreeForm(false)}
                    onStarted={() => { setShowNewDegreeForm(false); load(); }}
                  />
                )}
              </div>
            </div>
          )}

          {student.pastDegrees?.length > 0 && (
            <div className="rounded-lg p-4 mb-5" style={{ background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}>
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

          {student.riskLevel === "High" && (
            <div className="rounded-lg p-4 mb-5 flex items-start gap-3" style={{ background: band.soft }}>
              <AlertTriangle size={20} color={band.color} className="shrink-0 mt-0.5" />
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold mb-0.5" style={{ color: band.color }}>
                  You're currently flagged high-risk
                </p>
                <p className="text-sm" style={{ color: "var(--dl-ink-soft)" }}>
                  Last active {student.lastActivity} · {student.progressPct}% of milestones submitted.
                  Consider reaching out to your supervisor.
                </p>
              </div>
            </div>
          )}

          <RiskMeter value={student.riskScore} />
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
          <h3 className="font-display text-base font-semibold mb-1">
            {student.status === "completed" ? "Your Milestone History" : "Your Milestones"}
          </h3>
          <p className="text-sm mb-4" style={{ color: "var(--dl-slate)" }}>
            {student.status === "completed"
              ? "A read-only record of everything you submitted for this thesis."
              : "Your supervisor sets these with real due dates. Upload the matching document (.txt, .docx, or .pdf) when it's ready — it's read automatically and factored into your risk score right away."}
          </p>
          {student.milestones.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--dl-slate)" }}>
              Your supervisor hasn't published any document requirements yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {student.milestones.map((m) => (
                <MilestoneRow key={m.name} milestone={m} studentId={session.id} onSubmitted={load} readOnly={student.status === "completed"} />
              ))}
            </div>
          )}
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
                {tab === t && <span className="absolute left-0 right-0 -bottom-px h-0.5" style={{ background: "var(--dl-teal)" }} />}
              </button>
            ))}
          </div>
          <div className="p-5">
            {tab === "Explanation" && (
              <p className="text-sm leading-relaxed" style={{ color: "var(--dl-ink-soft)" }}>{student.explanation}</p>
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


        <p className="text-center text-xs" style={{ color: "var(--dl-slate)" }}>
          Not you? <Link to="/login" className="underline">Supervisor sign in</Link>
        </p>
      </div>
    </div>
  );
}

function NewDegreeForm({ studentId, onCancel, onStarted }) {
  const [form, setForm] = useState({ agNumber: "", batchYear: "", degree: "", department: "", thesisTitle: "" });
  const [customDepartment, setCustomDepartment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const department = form.department === "Other" ? customDepartment.trim() : form.department;
    if (!form.degree || !department) {
      setError("Select your degree and department");
      return;
    }
    setSubmitting(true);
    try {
      await startNewDegree(studentId, {
        agNumber: form.agNumber,
        batchYear: form.batchYear,
        thesisTitle: form.thesisTitle,
        program: `${form.degree} ${department}`,
      });
      onStarted();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't start a new degree — is the API running?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-1 p-3 rounded-lg" style={{ background: "var(--dl-paper)", border: "1px solid var(--dl-line)" }}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">AG Number</label>
          <input
            required
            value={form.agNumber}
            onChange={(e) => set({ agNumber: e.target.value })}
            placeholder="e.g. AG-2026-0031"
            className="w-full rounded-lg px-2.5 py-2 text-xs"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Batch Year</label>
          <input
            required
            value={form.batchYear}
            onChange={(e) => set({ batchYear: e.target.value })}
            placeholder="e.g. 2026"
            className="w-full rounded-lg px-2.5 py-2 text-xs"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Degree Program</label>
          <select
            required
            value={form.degree}
            onChange={(e) => set({ degree: e.target.value })}
            className="w-full rounded-lg px-2.5 py-2 text-xs"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
          >
            <option value="" disabled>Select…</option>
            {DEGREE_LEVELS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Department</label>
          <select
            required
            disabled={!form.degree}
            value={form.department}
            onChange={(e) => set({ department: e.target.value })}
            className="w-full rounded-lg px-2.5 py-2 text-xs disabled:opacity-50"
            style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
          >
            <option value="" disabled>{form.degree ? "Select…" : "Pick a degree first"}</option>
            {DEPARTMENT_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </optgroup>
            ))}
            <option value="Other">Other…</option>
          </select>
        </div>
      </div>
      {form.department === "Other" && (
        <input
          required
          value={customDepartment}
          onChange={(e) => setCustomDepartment(e.target.value)}
          placeholder="Enter your department"
          className="w-full rounded-lg px-2.5 py-2 text-xs"
          style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
        />
      )}
      <div>
        <label className="block text-xs font-medium mb-1">Thesis / Project Title</label>
        <input
          required
          value={form.thesisTitle}
          onChange={(e) => set({ thesisTitle: e.target.value })}
          placeholder="e.g. Federated Learning for Edge Devices"
          className="w-full rounded-lg px-2.5 py-2 text-xs"
          style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper-raised)" }}
        />
      </div>
      {error && <p className="text-xs" style={{ color: "var(--dl-coral)" }}>{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
        >
          {submitting ? "Starting…" : "Start this degree"}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-2 text-xs font-medium" style={{ color: "var(--dl-slate)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function MilestoneRow({ milestone: m, studentId, onSubmitted, readOnly }) {
  const { Icon, color } = statusIcon[m.status] || statusIcon["Upcoming"];
  const a = m.analysis;
  const previousVersions = m.versions || [];
  const versionCount = previousVersions.length + (m.submitted ? 1 : 0);
  const submissionVersions = [
    ...previousVersions,
    ...(m.submitted ? [{ ...m, version: versionCount, isLatest: true }] : []),
  ];
  const deadlinePassed = new Date(`${m.due}T23:59:59.999`) < new Date();
  // Once submitted, the upload form stays hidden until the supervisor
  // explicitly reopens this requirement for a resubmission. A completed
  // student's portal is read-only history regardless of that flag.
  const locked = readOnly || (Boolean(m.submitted) && !m.allowResubmit);
  const [file, setFile] = useState(null);
  const [githubLink, setGithubLink] = useState(m.githubLink || "");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const attachmentsInputRef = useRef(null);

  useEffect(() => {
    setGithubLink(m.githubLink || "");
  }, [m.githubLink]);

  const handleUpload = async () => {
    if (deadlinePassed) {
      setError(`The deadline was ${m.due}. Your supervisor must extend it before you can submit.`);
      return;
    }
    if (locked) {
      setError("Your supervisor must allow a resubmission before you can upload again.");
      return;
    }
    if (!file && !githubLink && attachments.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      await submitMilestoneDocument(studentId, m.name, {
        file,
        githubLink,
        attachments
      });
      setFile(null);
      setAttachments([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (attachmentsInputRef.current) attachmentsInputRef.current.value = "";
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg p-3" style={{ border: "1px solid var(--dl-line)" }}>
      <div className="flex items-center gap-3">
        <Icon size={17} color={color} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{m.name}</p>
          <p className="text-xs" style={{ color: "var(--dl-slate)" }}>
            Due {m.due}{m.submitted ? ` · Submitted ${m.submitted}${m.fileName ? ` · ${m.fileName}` : ""}` : ""}
          </p>
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded-full shrink-0" style={{ color, background: `${color}1a` }}>
          {m.status}
        </span>
      </div>

      {m.submitted && (
        <div className="mt-3 ml-8 flex flex-col gap-2">
          <div className="rounded-lg px-3 py-2" style={{ background: "var(--dl-teal-soft)" }}>
            <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--dl-teal)" }}><History size={13} /> Submission versions ({versionCount})</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {[...submissionVersions].reverse().map((version) => (
                <div key={version.version} className="flex items-center justify-between gap-3 text-xs">
                  <span style={{ color: "var(--dl-ink-soft)" }}>
                    Version {version.version}{version.isLatest ? " · Latest" : ""} · {version.submitted}
                    {version.fileName ? ` · ${version.fileName}` : ""}
                  </span>
                  {version.storedFile && <a href={getMilestoneFileUrl(studentId, m.name, version.isLatest ? undefined : version.version)} className="inline-flex shrink-0 items-center gap-1 font-semibold" style={{ color: "var(--dl-teal)" }}><Download size={12} /> Download</a>}
                </div>
              ))}
            </div>
          </div>
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
        <div className="mt-2 ml-8 flex flex-col gap-1.5">
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
              <span style={{ color: "var(--dl-slate)" }}>(your supervisor reviewed this)</span>
            )}
            <span style={{ color: "var(--dl-slate)" }}>{a.wordCount} words</span>
            {a.missingKeywords.length > 0 && (
              <span style={{ color: "var(--dl-slate)" }}>· missing: {a.missingKeywords.join(", ")}</span>
            )}
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
            <p className="text-xs px-2 py-1.5 rounded-lg" style={{ background: "var(--dl-coral-soft)", color: "var(--dl-coral)" }}>
              This looks {a.originality.matches[0].similarity}% similar to {a.originality.matches[0].studentName} —
              flagged for your supervisor's review.
            </p>
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
                      ? "No declaration/pledge section found in your document."
                      : a.pledge.included
                      ? "Found in your document"
                      : `Missing: ${a.pledge.missingPhrases.join(", ")}`
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
        </div>
      )}
      {a && !a.supported && (
        <p className="mt-1 ml-8 text-xs" style={{ color: "var(--dl-slate)" }}>{a.summary}</p>
      )}
      {m.supervisorComment && (
        <div className="mt-3 ml-8 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--dl-teal-soft)", color: "var(--dl-ink-soft)" }}>
          <span className="font-semibold" style={{ color: "var(--dl-teal)" }}>Supervisor comment</span>
          {m.supervisorCommentedAt ? ` · ${m.supervisorCommentedAt}` : ""}
          <p className="mt-1">{m.supervisorComment}</p>
        </div>
      )}

      {locked && (m.submitted || !readOnly) && (
        <div className="mt-3 ml-8 p-3 rounded-lg border flex items-start gap-2" style={{ borderColor: "var(--dl-line)", background: "var(--dl-paper-raised)" }}>
          <CheckCircle2 size={15} color="var(--dl-teal)" className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: "var(--dl-ink-soft)" }}>
            {readOnly
              ? "This project is marked completed, so the upload form is closed — this is now part of your history."
              : "Submitted and awaiting your supervisor's review. They'll need to allow a resubmission before this upload form reopens."}
          </p>
        </div>
      )}
      {!locked && (
        <div className="mt-3 ml-8 p-3 rounded-lg border flex flex-col gap-3 bg-[var(--dl-paper-raised)]" style={{ borderColor: deadlinePassed ? "var(--dl-coral)" : "var(--dl-line)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--dl-ink-soft)" }}>
            {deadlinePassed ? "Submission closed" : m.submitted ? "Update your submission" : "Submit Milestone"}
          </p>
          {deadlinePassed && (
            <p className="text-xs" style={{ color: "var(--dl-coral)" }}>
              The deadline was {m.due}. Ask your supervisor to extend this requirement before uploading.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--dl-slate)" }}>Document File (.txt, .docx, .pdf)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.docx,.pdf"
                disabled={deadlinePassed}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-xs rounded border p-1"
                style={{ borderColor: "var(--dl-line)", background: "var(--dl-paper)" }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--dl-slate)" }}>GitHub Repository Link</label>
              <input
                type="url"
                placeholder="https://github.com/username/project"
                value={githubLink}
                disabled={deadlinePassed}
                onChange={(e) => setGithubLink(e.target.value)}
                className="text-xs rounded border px-2 py-1.5"
                style={{ borderColor: "var(--dl-line)", background: "var(--dl-paper)" }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--dl-slate)" }}>Project Photos / Videos (For hardware/demos, multiple allowed)</label>
            <input
              ref={attachmentsInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              disabled={deadlinePassed}
              onChange={(e) => setAttachments(Array.from(e.target.files || []))}
              className="text-xs rounded border p-1"
              style={{ borderColor: "var(--dl-line)", background: "var(--dl-paper)" }}
            />
          </div>

          <div className="flex items-center justify-between gap-3 mt-1">
            {error && <p className="text-xs" style={{ color: "var(--dl-coral)" }}>{error}</p>}
            {!error && <div />}
            <button
              onClick={handleUpload}
              disabled={deadlinePassed || (!file && !githubLink && attachments.length === 0) || uploading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 shrink-0"
              style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}
            >
              <UploadCloud size={13} />
              {uploading ? "Uploading…" : m.submitted ? "Re-submit" : "Submit"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1.5 ml-8 text-xs" style={{ color: "var(--dl-coral)" }}>{error}</p>}
    </div>
  );
}
