import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Download, History, MessageSquare, Pencil, RotateCcw, Send, Trash2, Undo2, X } from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import {
  allowResubmission, deleteMilestone, getMilestoneFileUrl, getStudent,
  publishMilestone, saveMilestoneComment, unpublishMilestone, updateMilestone,
} from "../api/client";

export default function StudentRequirements() {
  const { id } = useParams();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => getStudent(id).then(setStudent).catch((e) => setError(e.response?.data?.error || e.message)), [id]);

  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState message={error} />;
  if (!student) return <LoadingState label="Loading document requirements…" />;

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <Link to={`/students/${student.id}`} className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--dl-slate)" }}><ArrowLeft size={14} /> Back to {student.name}</Link>
      <div>
        <p className="text-xs mb-1" style={{ color: "var(--dl-slate)" }}>AG No. {student.agNumber} · Batch {student.batchYear} · {student.program}</p>
        <h2 className="font-display text-2xl font-semibold">{student.name}'s document requirements</h2>
        <p className="text-sm mt-1" style={{ color: "var(--dl-slate)" }}>Publish or revise requirements, review submitted documents, and send feedback to this student.</p>
      </div>
      <div className="rounded-xl overflow-x-auto" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
        <table className="w-full min-w-[820px] text-sm">
          <thead style={{ background: "var(--dl-paper)" }}><tr className="text-left text-xs" style={{ color: "var(--dl-slate)" }}>
            <th className="px-4 py-3 font-medium">Required document</th><th className="px-4 py-3 font-medium">Due date</th><th className="px-4 py-3 font-medium">Visibility</th><th className="px-4 py-3 font-medium">Submission</th><th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y" style={{ borderColor: "var(--dl-line)" }}>
            {student.milestones.map((m) => <RequirementRow key={m.name} student={student} milestone={m} onChanged={load} />)}
            {!student.milestones.length && <tr><td colSpan="5" className="px-4 py-10 text-center" style={{ color: "var(--dl-slate)" }}>No requirements have been added for this student.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequirementRow({ student, milestone: m, onChanged }) {
  const versionCount = (m.versions?.length || 0) + (m.submitted ? 1 : 0);
  const [editing, setEditing] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [name, setName] = useState(m.name);
  const [due, setDue] = useState(m.due);
  const [comment, setComment] = useState(m.supervisorComment || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (action) => {
    setBusy(true); setError(null);
    try { await action(); setEditing(false); setCommenting(false); onChanged(); }
    catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setBusy(false); }
  };
  const resetEdit = () => { setName(m.name); setDue(m.due); setEditing(false); setError(null); };

  return <tr>
    <td className="px-4 py-3 align-top">
      {editing ? <input value={name} onChange={(e) => setName(e.target.value)} className="w-full min-w-48 rounded px-2 py-1.5" style={{ border: "1px solid var(--dl-line)" }} /> : <><p className="font-medium">{m.name}</p>{error && <p className="text-xs mt-1" style={{ color: "var(--dl-coral)" }}>{error}</p>}</>}
      {commenting && <div className="mt-3"><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Write feedback for the student…" className="w-full min-w-64 rounded px-2 py-1.5 text-xs" style={{ border: "1px solid var(--dl-line)" }} /><div className="flex gap-2 mt-2"><button onClick={() => run(() => saveMilestoneComment(student.id, m.name, comment))} disabled={busy} className="px-2.5 py-1.5 rounded text-xs font-semibold disabled:opacity-50" style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}>{busy ? "Saving…" : "Save comment"}</button><button onClick={() => setCommenting(false)} className="text-xs" style={{ color: "var(--dl-slate)" }}>Cancel</button></div></div>}
      {!commenting && m.supervisorComment && <p className="text-xs mt-2 max-w-80" style={{ color: "var(--dl-slate)" }}><span className="font-medium">Comment:</span> {m.supervisorComment}</p>}
    </td>
    <td className="px-4 py-3 align-top whitespace-nowrap">{editing ? <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded px-2 py-1.5" style={{ border: "1px solid var(--dl-line)" }} /> : m.due}</td>
    <td className="px-4 py-3 align-top"><span className="px-2 py-1 rounded-full text-xs font-medium" style={{ color: m.published ? "var(--dl-teal)" : "var(--dl-slate)", background: m.published ? "var(--dl-teal-soft)" : "var(--dl-paper)" }}>{m.published ? "Published" : "Private"}</span></td>
    <td className="px-4 py-3 align-top">
      {m.submitted ? (
        <>
          <p className="text-xs">Submitted {m.submitted}</p>
          <p className="text-xs mt-1" style={{ color: "var(--dl-teal)" }}>
            Version {versionCount} · {versionCount > 1 ? `${versionCount - 1} earlier version${versionCount > 2 ? "s" : ""} saved` : "Latest submission"}
          </p>
          <p className="text-xs mt-1 font-medium" style={{ color: m.allowResubmit ? "var(--dl-teal)" : "var(--dl-slate)" }}>
            {m.allowResubmit ? "Resubmission open for student" : "Upload form locked for student"}
          </p>
          {m.fileName && <p className="text-xs max-w-36 truncate" style={{ color: "var(--dl-slate)" }}>{m.fileName}</p>}
          {m.githubLink && <p className="text-[10px] max-w-36 truncate" style={{ color: "var(--dl-teal)" }}>GitHub link attached</p>}
          {m.attachments && m.attachments.length > 0 && <p className="text-[10px] max-w-36 truncate" style={{ color: "var(--dl-teal)" }}>{m.attachments.length} attachment(s)</p>}
        </>
      ) : (
        <span className="text-xs" style={{ color: "var(--dl-slate)" }}>Not submitted</span>
      )}
    </td>
    <td className="px-4 py-3 align-top"><div className="flex justify-end gap-2 flex-wrap">
      {editing ? <><button onClick={() => run(() => updateMilestone(student.id, m.name, { name, due }))} disabled={busy} title="Save changes" className="p-1.5" style={{ color: "var(--dl-teal)" }}><Check size={15} /></button><button onClick={resetEdit} title="Cancel" className="p-1.5" style={{ color: "var(--dl-slate)" }}><X size={15} /></button></> : <>
        <button onClick={() => setEditing(true)} title="Edit requirement" className="p-1.5" style={{ color: "var(--dl-teal)" }}><Pencil size={15} /></button>
        <button onClick={() => run(() => m.published ? unpublishMilestone(student.id, m.name) : publishMilestone(student.id, m.name))} disabled={busy} className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50" style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}>{m.published ? <Undo2 size={13} /> : <Send size={13} />}{m.published ? "Unpublish" : "Publish"}</button>
        {m.submitted && <>
          <Link to={`/students/${student.id}/requirements/${encodeURIComponent(m.name)}/review`} title="Open document versions and feedback" className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium" style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}><History size={13} /> Versions ({versionCount})</Link>
          {m.storedFile && <a href={getMilestoneFileUrl(student.id, m.name)} title="Download document" className="p-1.5" style={{ color: "var(--dl-teal)" }}><Download size={15} /></a>}
          <button onClick={() => setCommenting(true)} title="Comment for student" className="p-1.5" style={{ color: "var(--dl-teal)" }}><MessageSquare size={15} /></button>
          {!m.allowResubmit && (
            <button onClick={() => run(() => allowResubmission(student.id, m.name))} disabled={busy} title="Reopen the upload form for this student" className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium disabled:opacity-50" style={{ color: "var(--dl-teal)", background: "var(--dl-teal-soft)" }}>
              <RotateCcw size={13} /> Resubmit
            </button>
          )}
        </>}
        <button onClick={() => { if (window.confirm(`Delete “${m.name}”? Any uploaded document will also be deleted.`)) run(() => deleteMilestone(student.id, m.name)); }} disabled={busy} title="Delete requirement" className="p-1.5 disabled:opacity-50" style={{ color: "var(--dl-coral)" }}><Trash2 size={15} /></button>
      </>}
    </div></td>
  </tr>;
}
