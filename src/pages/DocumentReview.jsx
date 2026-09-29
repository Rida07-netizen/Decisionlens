import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, History, MessageSquare, Save } from "lucide-react";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { getMilestoneFileUrl, getMilestoneViewUrl, getStudent, saveMilestoneComment } from "../api/client";

export default function DocumentReview() {
  const { id, milestoneName } = useParams();
  const name = decodeURIComponent(milestoneName);
  const [student, setStudent] = useState(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState("current");

  const load = useCallback(() => {
    getStudent(id)
      .then((data) => {
        const milestone = data.milestones.find((m) => m.name === name);
        if (!milestone?.submitted) throw new Error("No submission is available for this requirement.");
        setStudent(data);
        setComment(milestone.supervisorComment || "");
      })
      .catch((err) => setError(err.response?.data?.error || err.message));
  }, [id, name]);

  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorState message={error} />;
  if (!student) return <LoadingState label="Opening document review…" />;

  const milestone = student.milestones.find((m) => m.name === name);
  const previousVersions = milestone.versions || [];
  const currentVersion = previousVersions.length + 1;
  const viewingCurrent = selectedVersion === "current";
  const submission = viewingCurrent
    ? milestone
    : previousVersions.find((version) => String(version.version) === selectedVersion);
  const handleSave = async () => {
    setSaving(true); setSaved(false); setError(null);
    try {
      await saveMilestoneComment(id, name, comment);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <Link to={`/students/${id}`} className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--dl-slate)" }}><ArrowLeft size={14} /> Back to student</Link>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><p className="text-xs" style={{ color: "var(--dl-slate)" }}>{student.name} · Submitted {submission.submitted}</p><h2 className="font-display text-2xl font-semibold">{milestone.name}</h2></div>
        <div className="flex items-center gap-2">
          {previousVersions.length > 0 && <div className="inline-flex items-center gap-1.5 rounded-lg px-2" style={{ border: "1px solid var(--dl-line)" }}><History size={14} style={{ color: "var(--dl-slate)" }} /><select value={selectedVersion} onChange={(event) => { setSelectedVersion(event.target.value); setSaved(false); }} className="py-2 text-xs bg-transparent outline-none"><option value="current">Version {currentVersion} · Latest</option>{[...previousVersions].reverse().map((version) => <option key={version.version} value={String(version.version)}>Version {version.version} · {version.submitted}</option>)}</select></div>}
          {submission.storedFile && (
            <a href={getMilestoneFileUrl(id, name, viewingCurrent ? undefined : selectedVersion)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ border: "1px solid var(--dl-line)", color: "var(--dl-teal)" }}><Download size={14} /> Download Document</a>
          )}
        </div>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        <div className="flex flex-col gap-4 overflow-y-auto h-[72vh] p-4 rounded-xl" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
          {submission.storedFile && (
            <div className="flex-1 min-h-[50vh] border rounded-lg overflow-hidden mb-4" style={{ borderColor: "var(--dl-line)" }}>
              <iframe title={`${milestone.name} document`} src={getMilestoneViewUrl(id, name, viewingCurrent ? undefined : selectedVersion)} className="w-full h-full" />
            </div>
          )}
          
          {submission.githubLink && (
            <div className="p-4 rounded-lg border mb-4 bg-white flex items-center justify-between shadow-sm" style={{ borderColor: "var(--dl-line)" }}>
              <div>
                <h4 className="text-xs uppercase tracking-wider font-semibold text-gray-500">GitHub Repository</h4>
                <a href={submission.githubLink} target="_blank" rel="noreferrer" className="text-sm font-medium underline text-[var(--dl-teal)] hover:text-teal-700 break-all block mt-1">
                  {submission.githubLink}
                </a>
              </div>
              <a href={submission.githubLink} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition shrink-0">
                Open Repo
              </a>
            </div>
          )}

          {submission.attachments && submission.attachments.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs uppercase tracking-wider font-semibold text-gray-500">Project Media & Attachments</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {submission.attachments.map((att) => {
                  const isImage = att.mimetype && att.mimetype.startsWith("image/");
                  const isVideo = att.mimetype && att.mimetype.startsWith("video/");
                  const url = `/api/students/${id}/milestones/${encodeURIComponent(name)}/attachments/${att.storedFile}${viewingCurrent ? "" : `/${selectedVersion}`}`;

                  return (
                    <div key={att.storedFile} className="rounded-lg border overflow-hidden bg-white p-3 flex flex-col gap-2 shadow-sm" style={{ borderColor: "var(--dl-line)" }}>
                      {isImage ? (
                        <a href={url} target="_blank" rel="noreferrer" className="block w-full aspect-video overflow-hidden rounded bg-gray-50">
                          <img src={url} alt={att.fileName} className="w-full h-full object-cover" />
                        </a>
                      ) : isVideo ? (
                        <video src={url} controls className="w-full aspect-video rounded bg-black" />
                      ) : (
                        <div className="w-full aspect-video rounded bg-gray-50 flex items-center justify-center text-sm font-medium p-4 text-center" style={{ color: "var(--dl-slate)" }}>
                          {att.fileName}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-xs font-medium truncate" style={{ color: "var(--dl-ink)" }} title={att.fileName}>
                          {att.fileName}
                        </span>
                        <a href={url} download={att.fileName} className="text-xs font-semibold shrink-0" style={{ color: "var(--dl-teal)" }}>
                          Download
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {!submission.storedFile && !submission.githubLink && (!submission.attachments || submission.attachments.length === 0) && (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--dl-slate)" }}>
              No preview content available for this submission.
            </div>
          )}
        </div>
        <aside className="rounded-xl p-4" style={{ background: "var(--dl-paper-raised)", border: "1px solid var(--dl-line)" }}>
          <h3 className="font-display font-semibold flex items-center gap-2"><MessageSquare size={16} /> Feedback for student</h3>
          <p className="text-xs mt-1 mb-3" style={{ color: "var(--dl-slate)" }}>{viewingCurrent ? "This comment is immediately visible in the student's portal." : "Feedback below belongs to this earlier submission."}</p>
          <textarea value={viewingCurrent ? comment : (submission.supervisorComment || "")} onChange={(e) => { setComment(e.target.value); setSaved(false); }} disabled={!viewingCurrent} rows={10} placeholder="Write your review comment…" className="w-full rounded-lg px-3 py-2 text-sm disabled:opacity-70" style={{ border: "1px solid var(--dl-line)", background: "var(--dl-paper)" }} />
          {error && <p className="text-xs mt-2" style={{ color: "var(--dl-coral)" }}>{error}</p>}
          {saved && <p className="text-xs mt-2" style={{ color: "var(--dl-teal)" }}>Comment saved and shared with the student.</p>}
          <button onClick={handleSave} disabled={!viewingCurrent || saving || !comment.trim()} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: "var(--dl-ink)", color: "var(--dl-paper)" }}><Save size={14} /> {saving ? "Saving…" : "Save comment"}</button>
        </aside>
      </div>
    </div>
  );
}
