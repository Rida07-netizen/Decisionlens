import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, Download, History, Pencil, Send, Trash2, Undo2, X, Check } from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import {
  deleteMilestone, getMilestoneFileUrl, getStudents,
  publishMilestone, unpublishMilestone, updateMilestone,
} from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Requirements() {
  const { user } = useAuth();
  const [students, setStudents] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    getStudents(user.id).then(setStudents).catch((e) => setError(e.response?.data?.error || e.message));
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState message={error} />;
  if (!students) return <LoadingState label="Loading document requirements…" />;

  const rows = students.flatMap((student) => student.milestones.map((milestone) => ({ student, milestone })))
    .sort((a, b) => a.milestone.due.localeCompare(b.milestone.due));

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm" style={{ color: "var(--dl-slate)" }}>
          Prepare requirements privately, then publish them to the relevant student when ready.
        </p>
        <Link to="/add-milestone" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}>
          <CalendarPlus size={14} /> Add requirement
        </Link>
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <table className="w-full min-w-[920px] text-sm">
          <thead style={{ background: "var(--dl-paper)" }}>
            <tr className="text-left text-xs" style={{ color: "var(--dl-slate)" }}>
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Required document</th>
              <th className="px-4 py-3 font-medium">Due date</th>
              <th className="px-4 py-3 font-medium">Visibility</th>
              <th className="px-4 py-3 font-medium">Submission</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--dl-line)" }}>
            {rows.map(({ student, milestone }) => (
              <RequirementRow key={`${student.id}-${milestone.name}`} student={student} milestone={milestone} onChanged={load} />
            ))}
            {!rows.length && (
              <tr><td colSpan="6" className="px-4 py-10 text-center" style={{ color: "var(--dl-slate)" }}>No document requirements yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequirementRow({ student, milestone: m, onChanged }) {
  const versionCount = (m.versions?.length || 0) + (m.submitted ? 1 : 0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.name);
  const [due, setDue] = useState(m.due);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => {
    setName(m.name);
    setDue(m.due);
    setEditing(false);
    setError(null);
  };

  return (
    <tr>
      <td className="px-4 py-3 align-top">
        <Link to={`/students/${student.id}`} className="font-medium hover:underline">{student.name}</Link>
        <p className="text-xs mt-0.5" style={{ color: "var(--dl-slate)" }}>AG No. {student.agNumber} · Batch {student.batchYear}</p>
      </td>
      <td className="px-4 py-3 align-top">
        {editing ? <input value={name} onChange={(e) => setName(e.target.value)} className="w-full min-w-48 rounded px-2 py-1.5 text-sm" style={{ border: "1px solid var(--dl-line)" }} /> : <span className="font-medium">{m.name}</span>}
        {error && <p className="text-xs mt-1" style={{ color: "var(--dl-coral)" }}>{error}</p>}
      </td>
      <td className="px-4 py-3 align-top whitespace-nowrap">
        {editing ? <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded px-2 py-1.5 text-sm" style={{ border: "1px solid var(--dl-line)" }} /> : m.due}
      </td>
      <td className="px-4 py-3 align-top">
        <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ color: m.published ? "var(--dl-teal)" : "var(--dl-slate)", background: m.published ? "var(--dl-teal-soft)" : "var(--dl-paper)" }}>
          {m.published ? "Published" : "Private"}
        </span>
      </td>
      <td className="px-4 py-3 align-top">
        {m.submitted ? (
          <>
            <p className="text-xs">Submitted {m.submitted}</p>
            <p className="text-xs mt-1" style={{ color: "var(--dl-teal)" }}>
              Version {versionCount} · {versionCount > 1 ? `${versionCount - 1} earlier version${versionCount > 2 ? "s" : ""} saved` : "Latest submission"}
            </p>
            {m.fileName && <p className="text-xs truncate max-w-36" style={{ color: "var(--dl-slate)" }}>{m.fileName}</p>}
            {m.githubLink && <p className="text-[10px] truncate max-w-36" style={{ color: "var(--dl-teal)" }}>GitHub link attached</p>}
            {m.attachments && m.attachments.length > 0 && <p className="text-[10px] truncate max-w-36" style={{ color: "var(--dl-teal)" }}>{m.attachments.length} attachment(s)</p>}
          </>
        ) : (
          <span className="text-xs" style={{ color: "var(--dl-slate)" }}>Not submitted</span>
        )}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex justify-end items-center gap-2 flex-wrap">
          {editing ? <>
            <button onClick={() => run(() => updateMilestone(student.id, m.name, { name, due }))} disabled={busy} title="Save changes" className="p-1.5 rounded disabled:opacity-50" style={{ color: "var(--dl-teal)" }}><Check size={15} /></button>
            <button onClick={cancelEdit} disabled={busy} title="Cancel" className="p-1.5 rounded" style={{ color: "var(--dl-slate)" }}><X size={15} /></button>
          </> : <>
            <button onClick={() => setEditing(true)} title="Edit requirement" className="p-1.5 rounded" style={{ color: "var(--dl-teal)" }}><Pencil size={15} /></button>
            <button onClick={() => run(() => m.published ? unpublishMilestone(student.id, m.name) : publishMilestone(student.id, m.name))} disabled={busy} title={m.published ? "Unpublish from student portal" : "Publish to student portal"} className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50" style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}>
              {m.published ? <Undo2 size={13} /> : <Send size={13} />} {m.published ? "Unpublish" : "Publish"}
            </button>
            {m.submitted && <>
              <Link to={`/students/${student.id}/requirements/${encodeURIComponent(m.name)}/review`} title="Open document versions and feedback" className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium" style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}><History size={13} /> Versions ({versionCount})</Link>
              {m.storedFile && <a href={getMilestoneFileUrl(student.id, m.name)} title="Download document" className="p-1.5 rounded" style={{ color: "var(--dl-teal)" }}><Download size={15} /></a>}
            </>}
            <button onClick={() => { if (window.confirm(`Delete “${m.name}” for ${student.name}? Any uploaded document will also be deleted.`)) run(() => deleteMilestone(student.id, m.name)); }} disabled={busy} title="Delete requirement" className="p-1.5 rounded disabled:opacity-50" style={{ color: "var(--dl-coral)" }}><Trash2 size={15} /></button>
          </>}
        </div>
      </td>
    </tr>
  );
}
