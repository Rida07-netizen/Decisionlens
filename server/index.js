const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { computeStudent } = require("./riskEngine");
const { analyzeDocument, checkOriginality } = require("./documentAnalysis");
const seed = require("./seedData");
const { loadDb, saveDb, initialState } = require("./db");
const { putFile, fileUrl, getFileBuffer, deleteFile } = require("./storage");
const { answerWithAI } = require("./aiAssistant");

// Uploads are held in memory just long enough to analyze them and push them
// to blob storage. There is no writable uploads directory in a serverless
// deployment, so multer must never touch the disk.
// Vercel caps the request body of a serverless function at 4.5MB, so the old
// 15MB limit could never actually be reached in production — an oversized
// upload was rejected by the platform before Express ever saw it, with an
// opaque 413. The limit is set below that cap so the user gets a clear,
// actionable message from the app instead.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

// Adds a notification to the in-memory db. Doesn't save on its own — call
// sites push this right before their own saveDb(db) so it's written in the
// same write as the action that triggered it.
function notify(db, { recipientType, recipientId, message, link }) {
  db.notifications.push({
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recipientType, // "supervisor" | "student"
    recipientId,
    message,
    link: link || null,
    createdAt: new Date().toISOString(),
    read: false,
  });
}

// Appends to a student's own audit trail (statusLog) — every completed/
// reactivated/new-degree/profile-edit action lands here with a timestamp,
// so a status a supervisor didn't expect is always traceable afterwards
// instead of a silent surprise.
function logStatus(student, action, note) {
  student.statusLog = student.statusLog || [];
  student.statusLog.push({ action, at: new Date().toISOString(), note: note || null });
}

function filesForSubmission(submission) {
  return [
    submission?.storedFile,
    submission?.previewFile,
    ...(submission?.attachments || []).map((attachment) => attachment.storedFile),
  ].filter(Boolean);
}

async function deleteSubmissionFiles(db, submission) {
  for (const storedFile of [...new Set(filesForSubmission(submission))]) {
    await deleteFile(db, storedFile);
  }
}

function submissionForVersion(milestone, versionNumber) {
  if (!versionNumber) return milestone;
  return (milestone.versions || []).find((version) => String(version.version) === String(versionNumber));
}

// Browsers can't render a .docx inline, so the review screen used to rely on
// a LibreOffice (or Python) conversion running on the server. Neither binary
// exists on a serverless host, so the preview is now produced with mammoth,
// which is pure JavaScript: the .docx is converted to styled HTML once, at
// upload time, and that HTML is stored alongside the original. The uploaded
// original is always still available from the /file download endpoint.
async function createHtmlPreview(db, buffer, originalName) {
  const extension = path.extname(originalName || "").toLowerCase();
  if (extension !== ".docx") return null;
  try {
    const mammoth = require("mammoth");
    const { value } = await mammoth.convertToHtml({ buffer });
    const html = `<!doctype html><meta charset="utf-8">
<title>${escapeHtml(originalName || "Document")}</title>
<style>
  body { max-width: 820px; margin: 2.5rem auto; padding: 0 1.5rem;
         font: 16px/1.7 Georgia, "Times New Roman", serif; color: #1a1a1a; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #ccc; padding: .4rem .6rem; }
  h1, h2, h3 { font-family: system-ui, sans-serif; line-height: 1.3; }
</style>
${value}`;
    return await putFile(db, Buffer.from(html, "utf-8"), `${path.parse(originalName).name}.html`, "text/html; charset=utf-8");
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeSupervisor(s) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...safe } = s;
  return safe;
}

const app = express();
app.use(cors());
app.use(express.json());

// POST /api/students — create a new student under the requesting supervisor
app.post("/api/students", async (req, res) => {
  const { name, agNumber, batchYear, thesisTitle, program, meetingsScheduled, email, supervisorId } = req.body;
  if (!name || !agNumber || !batchYear || !thesisTitle || !email || !supervisorId) {
    return res.status(400).json({ error: "name, agNumber, batchYear, thesisTitle, email, and supervisorId are required" });
  }
  const db = await loadDb();

  if (!db.supervisors.some((s) => s.id === supervisorId)) {
    return res.status(404).json({ error: "Supervisor not found" });
  }
  if (db.students.some((s) => s.agNumber === agNumber)) {
    return res.status(409).json({ error: `AG number ${agNumber} already exists` });
  }
  if (db.students.some((s) => s.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: `A student with email ${email} already exists` });
  }

  // No auto-generated dates: milestones start empty. The supervisor adds
  // each milestone with its real due date via POST /api/students/:id/milestones,
  // and later attaches a document via the /submit endpoint when it's in.
  const newStudent = {
    id: `st-${Date.now()}`,
    supervisorId,
    name,
    agNumber,
    batchYear,
    thesisTitle,
    program: program || "BS Computer Science",
    meetingsScheduled: Number(meetingsScheduled) || 0,
    meetingsAttended: 0,
    createdAt: new Date().toISOString().slice(0, 10),
    email: email.toLowerCase(),
    passwordHash: null, // set once the student self-registers via /api/student-auth/signup
    status: "active", // "active" | "completed" — see /mark-completed and /reactivate below
    pastDegrees: [],
    statusLog: [],
    requestedSupervisorId: null,
    requestStatus: null,
    milestones: [],
  };

  db.students.push(newStudent);
  await saveDb(db);
  res.status(201).json(computeStudent(newStudent));
});

// PUT /api/students/:id — a supervisor correcting a student's basic
// profile: something the student got wrong self-registering, or a typo
// the supervisor made adding them. Deliberately narrow — doesn't touch
// supervisorId, status, milestones, or login credentials, each of which
// has its own dedicated route. Every change is recorded in statusLog.
app.put("/api/students/:id", async (req, res) => {
  const { name, email, agNumber, batchYear, thesisTitle, program } = req.body;
  if (!name || !email || !agNumber || !batchYear || !thesisTitle || !program) {
    return res.status(400).json({ error: "name, email, agNumber, batchYear, thesisTitle, and program are required" });
  }

  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const normalizedEmail = email.toLowerCase();
  if (db.students.some((s) => s.id !== student.id && s.email.toLowerCase() === normalizedEmail)) {
    return res.status(409).json({ error: `Another student already uses email ${email}` });
  }
  if (db.students.some((s) => s.id !== student.id && s.agNumber === agNumber)) {
    return res.status(409).json({ error: `AG number ${agNumber} already exists` });
  }

  const changes = [];
  if (student.name !== name) changes.push(`name "${student.name}" → "${name}"`);
  if (student.email !== normalizedEmail) changes.push(`email "${student.email}" → "${normalizedEmail}"`);
  if (student.agNumber !== agNumber) changes.push(`AG No. "${student.agNumber}" → "${agNumber}"`);
  if (student.batchYear !== batchYear) changes.push(`batch "${student.batchYear}" → "${batchYear}"`);
  if (student.program !== program) changes.push(`program "${student.program}" → "${program}"`);
  if (student.thesisTitle !== thesisTitle) changes.push(`thesis title "${student.thesisTitle}" → "${thesisTitle}"`);

  student.name = name;
  student.email = normalizedEmail;
  student.agNumber = agNumber;
  student.batchYear = batchYear;
  student.thesisTitle = thesisTitle;
  student.program = program;
  if (changes.length > 0) logStatus(student, "profile_edited", changes.join("; "));

  await saveDb(db);
  res.json(computeStudent(student));
});

// POST /api/student-auth/signup — a student self-registers, but ONLY for
// an email the supervisor already added via POST /api/students. This is
// what "only students the teacher added can get in" actually enforces.
app.post("/api/student-auth/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const db = await loadDb();
  const student = db.students.find((s) => s.email && s.email.toLowerCase() === email.toLowerCase());
  if (!student) {
    return res.status(404).json({ error: "No student account found for that email. Ask your supervisor to add you first." });
  }
  if (student.passwordHash) {
    return res.status(409).json({ error: "This account is already registered — try signing in instead." });
  }

  student.passwordHash = await bcrypt.hash(password, 10);
  await saveDb(db);
  res.status(201).json({ id: student.id, name: student.name, email: student.email });
});

// POST /api/student-auth/login
app.post("/api/student-auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const db = await loadDb();
  const student = db.students.find((s) => s.email && s.email.toLowerCase() === email.toLowerCase());
  if (!student || !student.passwordHash) {
    return res.status(401).json({ error: "No registered account for that email. Sign up first (your supervisor must have added you)." });
  }

  const ok = await bcrypt.compare(password, student.passwordHash);
  if (!ok) return res.status(401).json({ error: "Incorrect password" });

  res.json({ id: student.id, name: student.name, email: student.email });
});

// POST /api/student-auth/register — a student creates their own account
// from scratch, with no supervisor having added them first. They pick a
// supervisor to request afterwards via POST /api/students/:id/request-supervisor.
app.post("/api/student-auth/register", async (req, res) => {
  const { name, agNumber, batchYear, thesisTitle, program, email, password } = req.body;
  if (!name || !agNumber || !batchYear || !thesisTitle || !email || !password) {
    return res.status(400).json({ error: "name, agNumber, batchYear, thesisTitle, email, and password are required" });
  }
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const db = await loadDb();
  if (db.students.some((s) => s.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: `An account with email ${email} already exists` });
  }
  if (db.students.some((s) => s.agNumber === agNumber)) {
    return res.status(409).json({ error: `AG number ${agNumber} already exists` });
  }

  const newStudent = {
    id: `st-${Date.now()}`,
    supervisorId: null, // set once a supervisor accepts their request
    name,
    agNumber,
    batchYear,
    thesisTitle,
    program: program || "BS Computer Science",
    meetingsScheduled: 0,
    meetingsAttended: 0,
    createdAt: new Date().toISOString().slice(0, 10),
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
    status: "active",
    pastDegrees: [],
    statusLog: [],
    requestedSupervisorId: null,
    requestStatus: null,
    milestones: [],
  };
  db.students.push(newStudent);
  await saveDb(db);
  res.status(201).json({ id: newStudent.id, name: newStudent.name, email: newStudent.email });
});

// GET /api/supervisors/public — a lightweight, non-sensitive supervisor
// directory for the student-side "pick a supervisor" screen.
app.get("/api/supervisors/public", async (req, res) => {
  const db = await loadDb();
  res.json(db.supervisors.map((s) => ({
    id: s.id,
    name: s.name,
    department: s.department || "",
    institution: s.institution || "",
  })));
});

// POST /api/students/:id/request-supervisor — a self-registered (or
// currently unassigned) student asks a supervisor to take them on.
app.post("/api/students/:id/request-supervisor", async (req, res) => {
  const { supervisorId } = req.body;
  if (!supervisorId) return res.status(400).json({ error: "supervisorId is required" });

  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (student.supervisorId) return res.status(409).json({ error: "You already have a supervisor" });

  const supervisor = db.supervisors.find((s) => s.id === supervisorId);
  if (!supervisor) return res.status(404).json({ error: "Supervisor not found" });

  student.requestedSupervisorId = supervisorId;
  student.requestStatus = "pending";
  notify(db, {
    recipientType: "supervisor",
    recipientId: supervisorId,
    message: `${student.name} requested you as their supervisor`,
    link: null,
  });
  await saveDb(db);
  res.json(computeStudent(student));
});

// GET /api/supervisors/:id/requests — pending student requests for a supervisor
app.get("/api/supervisors/:id/requests", async (req, res) => {
  const db = await loadDb();
  const pending = db.students
    .filter((s) => s.requestedSupervisorId === req.params.id && s.requestStatus === "pending")
    .map((s) => ({
      id: s.id, name: s.name, email: s.email, agNumber: s.agNumber,
      batchYear: s.batchYear, program: s.program, thesisTitle: s.thesisTitle,
    }));
  res.json(pending);
});

// POST /api/students/:id/accept-request — supervisor accepts a pending request
app.post("/api/students/:id/accept-request", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (student.requestStatus !== "pending" || !student.requestedSupervisorId) {
    return res.status(400).json({ error: "This student has no pending request" });
  }

  student.supervisorId = student.requestedSupervisorId;
  student.requestedSupervisorId = null;
  student.requestStatus = null;
  notify(db, {
    recipientType: "student",
    recipientId: student.id,
    message: `Your supervisor accepted your request. Welcome aboard!`,
    link: null,
  });
  await saveDb(db);
  res.json(computeStudent(student));
});

// POST /api/students/:id/reject-request — supervisor declines a pending
// request; the student is left unassigned so they can request someone else.
app.post("/api/students/:id/reject-request", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (student.requestStatus !== "pending" || !student.requestedSupervisorId) {
    return res.status(400).json({ error: "This student has no pending request" });
  }

  student.requestedSupervisorId = null;
  student.requestStatus = "rejected";
  notify(db, {
    recipientType: "student",
    recipientId: student.id,
    message: `Your supervisor request wasn't accepted. You can request another supervisor.`,
    link: null,
  });
  await saveDb(db);
  res.json(computeStudent(student));
});


// GET /api/students?supervisorId=sup-001 — that supervisor's roster with
// live-computed risk. Excludes completed (graduated) students by default;
// pass status=completed for the History page, or status=all for both.
app.get("/api/students", async (req, res) => {
  const db = await loadDb();
  const { supervisorId, status } = req.query;
  let pool = supervisorId ? db.students.filter((s) => s.supervisorId === supervisorId) : db.students;
  if (status === "completed") pool = pool.filter((s) => s.status === "completed");
  else if (status !== "all") pool = pool.filter((s) => s.status !== "completed");
  const computed = pool.map((s) => computeStudent(s)).sort((a, b) => b.riskScore - a.riskScore);
  res.json(computed);
});

// Hides which specific peer a document was flagged as similar to when the
// viewer is the student themselves — supervisors/admins see the real name,
// students just see that a match exists.
function redactOriginalityForStudent(computedStudent) {
  computedStudent.milestones = computedStudent.milestones.map((m) => {
    if (!m.analysis || !m.analysis.originality) return m;
    const redactedMatches = m.analysis.originality.matches.map((match) => ({
      ...match,
      studentName: "another submission in the system",
    }));
    return { ...m, analysis: { ...m.analysis, originality: { ...m.analysis.originality, matches: redactedMatches } } };
  });
  return computedStudent;
}

// GET /api/students/:id?viewerRole=student — pass viewerRole=student from
// the student portal so peer names get redacted from originality matches.
app.get("/api/students/:id", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (req.query.viewerRole === "student") {
    // A student must only see requirements explicitly released by their
    // supervisor; private requirements do not affect their portal metrics
    // either, because they have not been asked to act on them yet.
    // Calculate the risk score from the same complete record the supervisor
    // uses, then hide only the unreleased requirement rows from the portal.
    // This keeps the risk score identical on both sides.
    const computed = computeStudent(student);
    computed.milestones = computed.milestones.filter((m) => m.published);
    return res.json(redactOriginalityForStudent(computed));
  }
  res.json(computeStudent(student));
});

// POST /api/students/:id/mark-completed — the student has finished their
// degree. They drop off the active dashboard/roster but stay fully
// viewable (and re-activatable) from the supervisor's History page.
app.post("/api/students/:id/mark-completed", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  student.status = "completed";
  student.completedAt = new Date().toISOString().slice(0, 10);
  logStatus(student, "completed", `Marked completed for "${student.thesisTitle}"`);
  await saveDb(db);
  res.json(computeStudent(student));
});

// POST /api/students/:id/reactivate — undo mark-completed, e.g. if it
// was marked by mistake or the student re-enrolls.
app.post("/api/students/:id/reactivate", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  student.status = "active";
  student.completedAt = null;
  logStatus(student, "reactivated", null);
  await saveDb(db);
  res.json(computeStudent(student));
});

// POST /api/students/:id/start-new-degree — a student who finished (status
// "completed") is going again for a further degree at the same institution.
// Their finished project is archived into pastDegrees (still visible on
// their own portal and to their supervisor) and their live record resets
// to a fresh, empty project under the same login and the same supervisor.
app.post("/api/students/:id/start-new-degree", async (req, res) => {
  const { agNumber, batchYear, program, thesisTitle } = req.body;
  if (!agNumber || !batchYear || !program || !thesisTitle) {
    return res.status(400).json({ error: "agNumber, batchYear, program, and thesisTitle are required" });
  }

  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (student.status !== "completed") {
    return res.status(400).json({ error: "Finish (mark completed) your current degree before starting another" });
  }
  if (db.students.some((s) => s.id !== student.id && s.agNumber === agNumber)) {
    return res.status(409).json({ error: `AG number ${agNumber} already exists` });
  }

  const previousProgram = student.program;
  const previousThesis = student.thesisTitle;

  student.pastDegrees.push({
    program: student.program,
    thesisTitle: student.thesisTitle,
    agNumber: student.agNumber,
    batchYear: student.batchYear,
    completedAt: student.completedAt,
    supervisorId: student.supervisorId,
    milestones: student.milestones,
  });

  student.program = program;
  student.thesisTitle = thesisTitle;
  student.agNumber = agNumber;
  student.batchYear = batchYear;
  student.milestones = [];
  student.meetingsScheduled = 0;
  student.meetingsAttended = 0;
  student.status = "active";
  student.completedAt = null;
  if (student.riskOverride) delete student.riskOverride;
  logStatus(student, "new_degree_started", `Archived "${previousProgram} — ${previousThesis}"; started "${program} — ${thesisTitle}"`);

  if (student.supervisorId) {
    notify(db, {
      recipientType: "supervisor",
      recipientId: student.supervisorId,
      message: `${student.name} started a new degree with you: ${program} — "${thesisTitle}"`,
      link: null,
    });
  }
  await saveDb(db);
  res.json(computeStudent(student));
});

// DELETE /api/students/:id — a supervisor permanently removing a student
// they added (as opposed to /api/admin/students/:id, which lets an admin
// remove any student regardless of who supervises them). Cleans up every
// uploaded document/version so nothing orphaned is left on disk.
app.delete("/api/students/:id", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  for (const milestone of student.milestones) {
    await deleteSubmissionFiles(db, milestone);
    for (const version of milestone.versions || []) await deleteSubmissionFiles(db, version);
  }
  db.students = db.students.filter((s) => s.id !== req.params.id);
  db.interventions = db.interventions.filter((iv) => iv.studentId !== req.params.id);
  await saveDb(db);
  res.json({ ok: true });
});

// GET /api/dashboard?supervisorId=sup-001 — summary stats for that supervisor's cohort
app.get("/api/dashboard", async (req, res) => {
  const db = await loadDb();
  const { supervisorId } = req.query;
  const pool = (supervisorId ? db.students.filter((s) => s.supervisorId === supervisorId) : db.students)
    .filter((s) => s.status !== "completed");
  const computed = pool.map((s) => computeStudent(s));
  res.json({
    totalStudents: computed.length,
    highRisk: computed.filter((s) => s.riskLevel === "High").length,
    avgProgress: computed.length ? Math.round(computed.reduce((sum, s) => sum + s.progressPct, 0) / computed.length) : 0,
    needsAttention: [...computed].sort((a, b) => b.riskScore - a.riskScore).slice(0, 4),
  });
});

// GET /api/milestone-templates — suggested milestone names, for the "Add milestone" form's datalist
app.get("/api/milestone-templates", async (req, res) => {
  res.json(seed.milestoneTemplate.map((m) => m.name));
});

// POST /api/students/:id/milestones — supervisor manually adds a milestone
// with a real due date they choose. No dates are ever auto-generated.
app.post("/api/students/:id/milestones", async (req, res) => {
  const { name, due } = req.body;
  if (!name || !due) return res.status(400).json({ error: "name and due date are required" });

  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  if (student.milestones.some((m) => m.name === name)) {
    return res.status(409).json({ error: `${student.name} already has a "${name}" milestone` });
  }

  student.milestones.push({
    name, due, published: false, submitted: null, analysis: null, fileName: null, allowResubmit: false,
  });
  await saveDb(db);
  res.status(201).json(computeStudent(student));
});

// POST /api/students/:id/milestones/:milestoneName/publish — make a prepared
// requirement, including its due date, visible in that student's portal.
app.post("/api/students/:id/milestones/:milestoneName/publish", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const milestone = student.milestones.find((m) => m.name === milestoneName);
  if (!milestone) return res.status(404).json({ error: "Milestone not found for this student" });

  milestone.published = true;
  notify(db, {
    recipientType: "student",
    recipientId: student.id,
    message: `A new requirement was published: "${milestoneName}" (due ${milestone.due})`,
    link: null,
  });
  await saveDb(db);
  res.json(computeStudent(student));
});

// POST /api/students/:id/milestones/:milestoneName/unpublish — hide a
// previously released requirement from the student's portal.
app.post("/api/students/:id/milestones/:milestoneName/unpublish", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const milestone = student.milestones.find((m) => m.name === milestoneName);
  if (!milestone) return res.status(404).json({ error: "Milestone not found for this student" });

  milestone.published = false;
  await saveDb(db);
  res.json(computeStudent(student));
});

// POST /api/students/:id/milestones/:milestoneName/allow-resubmit — reopens
// the upload form on the student's portal for one more submission. The
// student's client hides the form again automatically once they use it.
app.post("/api/students/:id/milestones/:milestoneName/allow-resubmit", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const milestone = student.milestones.find((m) => m.name === milestoneName);
  if (!milestone) return res.status(404).json({ error: "Milestone not found for this student" });
  if (!milestone.submitted) return res.status(400).json({ error: "This requirement hasn't been submitted yet" });

  milestone.allowResubmit = true;
  notify(db, {
    recipientType: "student",
    recipientId: student.id,
    message: `Your supervisor allowed you to resubmit "${milestoneName}"`,
    link: null,
  });
  await saveDb(db);
  res.json(computeStudent(student));
});

// PUT /api/students/:id/milestones/:milestoneName — edit the requirement
// name and/or due date before or after it has been published.
app.put("/api/students/:id/milestones/:milestoneName", async (req, res) => {
  const { name, due } = req.body;
  if (!name || !due) return res.status(400).json({ error: "name and due date are required" });

  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const milestone = student.milestones.find((m) => m.name === milestoneName);
  if (!milestone) return res.status(404).json({ error: "Milestone not found for this student" });
  if (name !== milestoneName && student.milestones.some((m) => m.name === name)) {
    return res.status(409).json({ error: `${student.name} already has a "${name}" milestone` });
  }

  milestone.name = name;
  milestone.due = due;
  await saveDb(db);
  res.json(computeStudent(student));
});

// DELETE /api/students/:id/milestones/:milestoneName — remove a requirement
// and its uploaded file, if one exists.
app.delete("/api/students/:id/milestones/:milestoneName", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const index = student.milestones.findIndex((m) => m.name === milestoneName);
  if (index === -1) return res.status(404).json({ error: "Milestone not found for this student" });

  const [milestone] = student.milestones.splice(index, 1);
  await deleteSubmissionFiles(db, milestone);
  for (const version of milestone.versions || []) await deleteSubmissionFiles(db, version);
  await saveDb(db);
  res.json(computeStudent(student));
});

// POST /api/students/:id/milestones/:milestoneName/comment — a supervisor's
// review comment is stored with the document and shown to that student.
app.post("/api/students/:id/milestones/:milestoneName/comment", async (req, res) => {
  const { comment } = req.body;
  if (!comment || !comment.trim()) return res.status(400).json({ error: "A comment is required" });

  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const milestone = student.milestones.find((m) => m.name === milestoneName);
  if (!milestone) return res.status(404).json({ error: "Milestone not found for this student" });
  if (!milestone.submitted) return res.status(400).json({ error: "A milestone must be submitted before you can comment on it" });

  milestone.supervisorComment = comment.trim();
  milestone.supervisorCommentedAt = new Date().toISOString().slice(0, 10);
  notify(db, {
    recipientType: "student",
    recipientId: student.id,
    message: `Your supervisor commented on "${milestoneName}"`,
    link: null,
  });
  await saveDb(db);
  res.json(computeStudent(student));
});

// POST /api/students/:id/milestones/:milestoneName/submit — attach a document,
// github link, and/or media attachments to an existing milestone.
app.post("/api/students/:id/milestones/:milestoneName/submit", upload.fields([
  { name: "document", maxCount: 1 },
  { name: "attachments", maxCount: 10 }
]), async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  
  const docFile = req.files && req.files.document && req.files.document[0];
  const attachmentFiles = req.files && req.files.attachments ? req.files.attachments : [];
  const githubLink = req.body?.githubLink || "";

  // Uploads live in memory now, so there is nothing to unlink on a rejected
  // request — the buffers are simply dropped when the handler returns.
  const cleanupRequestFiles = () => {};

  if (!student) {
    cleanupRequestFiles();
    return res.status(404).json({ error: "Student not found" });
  }

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const milestone = student.milestones.find((m) => m.name === milestoneName);
  if (!milestone) {
    cleanupRequestFiles();
    return res.status(404).json({ error: "Milestone not found for this student" });
  }

  // The due date is inclusive. From the following calendar day onward, only
  // the supervisor can reopen this milestone by extending its due date.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(`${milestone.due}T00:00:00`);
  if (dueDate < today) {
    cleanupRequestFiles();
    return res.status(403).json({
      error: `The submission deadline (${milestone.due}) has passed. Your supervisor must extend the due date before you can upload.`,
    });
  }

  // Once a document is submitted, the student can't upload again until the
  // supervisor explicitly reopens this requirement for resubmission.
  if (milestone.submitted && !milestone.allowResubmit) {
    cleanupRequestFiles();
    return res.status(403).json({
      error: "You've already submitted this requirement. Ask your supervisor to allow a resubmission before uploading again.",
    });
  }

  if (!docFile && !githubLink && attachmentFiles.length === 0) {
    cleanupRequestFiles();
    return res.status(400).json({ error: "At least one submission element (document, GitHub link, or media attachments) is required" });
  }

  let analysis = null;
  if (docFile) {
    try {
      analysis = await analyzeDocument(docFile.buffer, docFile.mimetype, docFile.originalname, milestoneName);
    } catch (err) {
      // Logged (not swallowed) so a real failure shows up in Vercel's
      // function logs instead of masquerading as a bad file forever.
      console.error(`Document analysis failed for ${docFile.originalname}:`, err);
      cleanupRequestFiles();
      return res.status(400).json({ error: "Couldn't read that file — try a .txt, .docx, or .pdf" });
    }

    if (analysis.supported && analysis.rawText) {
      const others = [];
      for (const s of db.students) {
        for (const m of s.milestones) {
          if (s.id === student.id && m.name === milestoneName) continue;
          if (m.analysis && m.analysis.supported && m.analysis.rawText) {
            others.push({ studentName: s.name, milestoneName: m.name, text: m.analysis.rawText });
          }
        }
      }
      analysis.originality = checkOriginality(analysis.rawText, others);
    } else {
      analysis.originality = null;
    }
  }

  // Preserve the previous submission, including its review feedback, before
  // making this upload the current version. Files are deliberately retained.
  if (milestone.submitted) {
    const { versions, ...currentSubmission } = milestone;
    const nextVersion = Math.max(0, ...(versions || []).map((version) => Number(version.version) || 0)) + 1;
    milestone.versions = [...(versions || []), {
      ...currentSubmission,
      version: nextVersion,
      submittedAt: currentSubmission.submittedAt || currentSubmission.submitted,
    }];
  }

  const submittedDate = req.body.submittedDate || new Date().toISOString().slice(0, 10);
  milestone.submitted = submittedDate;
  milestone.submittedAt = new Date().toISOString();
  milestone.githubLink = githubLink || null;
  // Consume the one-time permission — the student needs it granted again
  // before their next resubmission.
  milestone.allowResubmit = false;
  // Feedback belongs to the version it was written on. The new version starts
  // fresh so a resolved issue is not shown as feedback on the improvement.
  milestone.supervisorComment = null;
  milestone.supervisorCommentedAt = null;

  if (docFile) {
    const storedKey = await putFile(db, docFile.buffer, docFile.originalname, docFile.mimetype);
    milestone.fileName = docFile.originalname;
    milestone.storedFile = storedKey;
    milestone.analysis = analysis;
    // PDFs are already browser-readable; .docx gets a mammoth-rendered HTML
    // preview. Anything else falls back to the raw-text view below.
    milestone.previewFile = path.extname(docFile.originalname).toLowerCase() === ".pdf"
      ? storedKey
      : await createHtmlPreview(db, docFile.buffer, docFile.originalname);
  } else {
    milestone.fileName = null;
    milestone.storedFile = null;
    milestone.analysis = null;
    milestone.previewFile = null;
  }

  if (attachmentFiles.length > 0) {
    milestone.attachments = [];
    for (const file of attachmentFiles) {
      milestone.attachments.push({
        fileName: file.originalname,
        storedFile: await putFile(db, file.buffer, file.originalname, file.mimetype),
        mimetype: file.mimetype,
      });
    }
  } else {
    milestone.attachments = [];
  }

  notify(db, {
    recipientType: "supervisor",
    recipientId: student.supervisorId,
    message: `${student.name} submitted "${milestoneName}"`,
    link: `/students/${student.id}`,
  });
  await saveDb(db);

  const responseAnalysis = analysis ? { ...analysis } : null;
  if (responseAnalysis && responseAnalysis.rawText !== undefined) {
    delete responseAnalysis.rawText;
  }
  res.status(201).json({ student: computeStudent(student), analysis: responseAnalysis });
});

// GET /api/students/:id/milestones/:milestoneName/attachments/:filename — serve or download an attachment
app.get("/api/students/:id/milestones/:milestoneName/attachments/:filename{/:version}", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const milestone = student.milestones.find((m) => m.name === milestoneName);
  const submission = submissionForVersion(milestone, req.params.version);
  if (!submission || !submission.attachments) {
    return res.status(404).json({ error: "No attachments found for this milestone" });
  }

  const att = submission.attachments.find((a) => a.storedFile === req.params.filename);
  if (!att) return res.status(404).json({ error: "Attachment not found" });

  const buffer = await getFileBuffer(db, att.storedFile);
  if (!buffer) return res.status(404).json({ error: "File is missing on the server" });

  const isImage = att.mimetype && att.mimetype.startsWith("image/");
  const isVideo = att.mimetype && att.mimetype.startsWith("video/");
  if (isImage || isVideo) {
    res.type(att.mimetype);
    res.setHeader("Content-Disposition", "inline");
    return res.send(buffer);
  }

  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(att.fileName)}"`);
  res.type(att.mimetype || "application/octet-stream");
  res.send(buffer);
});

// GET /api/students/:id/milestones/:milestoneName/file — download the actual
// uploaded document (for supervisor/admin review of a student's submission)
app.get("/api/students/:id/milestones/:milestoneName/file{/:version}", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const milestone = student.milestones.find((m) => m.name === milestoneName);
  const submission = submissionForVersion(milestone, req.params.version);
  if (!submission || !submission.storedFile) {
    return res.status(404).json({ error: "No document on file for this milestone" });
  }

  const buffer = await getFileBuffer(db, submission.storedFile);
  if (!buffer) return res.status(404).json({ error: "File is missing on the server" });

  const downloadName = submission.fileName || submission.storedFile;
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadName)}"`);
  res.type(path.extname(downloadName) || "application/octet-stream");
  res.send(buffer);
});

// GET /api/students/:id/milestones/:milestoneName/view — render a safe,
// browser-readable preview. Browsers cannot embed .docx files natively and
// otherwise download them as soon as the review screen opens; the original
// file remains available only from the explicit /file download endpoint.
app.get("/api/students/:id/milestones/:milestoneName/view{/:version}", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const milestone = student.milestones.find((m) => m.name === milestoneName);
  const submission = submissionForVersion(milestone, req.params.version);
  if (!submission || !submission.storedFile) return res.status(404).json({ error: "No document on file for this milestone" });

  const isPdf = path.extname(submission.fileName || "").toLowerCase() === ".pdf";

  // Older uploads (and anything stored before the preview existed) get their
  // preview built on first review instead of at upload time.
  if (!submission.previewFile) {
    if (isPdf) {
      submission.previewFile = submission.storedFile;
    } else {
      const original = await getFileBuffer(db, submission.storedFile);
      if (original) {
        submission.previewFile = await createHtmlPreview(db, original, submission.fileName);
      }
    }
    if (submission.previewFile) await saveDb(db);
  }

  if (submission.previewFile) {
    const previewBuffer = await getFileBuffer(db, submission.previewFile);
    if (previewBuffer) {
      res.type(submission.previewFile === submission.storedFile && isPdf ? "pdf" : "html");
      res.setHeader("Content-Disposition", "inline");
      return res.send(previewBuffer);
    }
  }

  const fileName = submission.fileName || submission.storedFile;
  const text = submission.analysis?.rawText;
  const content = text
    ? escapeHtml(text)
    : "This file cannot be previewed in the browser. Use the Download button to open the original document.";

  res.type("html");
  res.setHeader("Content-Disposition", "inline");
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(fileName)}</title><style>body{margin:0;padding:32px;font-family:Arial,sans-serif;color:#17233d;background:#fff;line-height:1.65}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.65 Arial,sans-serif}</style></head><body><pre>${content}</pre></body></html>`);
});

// POST /api/students/:id/milestones/:milestoneName/override-completeness
// A supervisor who's actually read the document can correct the AI's
// completeness score. The AI's original score stays on record
// (aiCompletenessScore) so the correction is visible, not silent — and
// because this feeds the risk formula's inputs, correcting it here
// naturally updates the student's overall risk score too.
app.post("/api/students/:id/milestones/:milestoneName/override-completeness", async (req, res) => {
  const { score, note } = req.body;
  if (score === undefined || score === null || Number(score) < 0 || Number(score) > 100) {
    return res.status(400).json({ error: "score must be a number between 0 and 100" });
  }

  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const milestoneName = decodeURIComponent(req.params.milestoneName);
  const milestone = student.milestones.find((m) => m.name === milestoneName);
  if (!milestone || !milestone.analysis) {
    return res.status(404).json({ error: "No analyzed submission found for this milestone" });
  }

  milestone.analysis.completenessScore = Number(score);
  milestone.analysis.completenessOverridden = true;
  milestone.analysis.completenessOverrideNote = note || null;

  await saveDb(db);
  res.json(computeStudent(student));
});

// POST /api/students/:id/override-risk — supervisor sets the final risk
// score/level by hand after reviewing everything. The AI's own number
// keeps being computed and returned (aiRiskScore/aiRiskLevel) so this
// always reads as a correction on top of the AI, not a replacement of it.
app.post("/api/students/:id/override-risk", async (req, res) => {
  const { score, note } = req.body;
  if (score === undefined || score === null || Number(score) < 0 || Number(score) > 100) {
    return res.status(400).json({ error: "score must be a number between 0 and 100" });
  }

  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const numericScore = Number(score);
  const level = numericScore >= 70 ? "High" : numericScore >= 40 ? "Moderate" : "Low";
  student.riskOverride = { score: numericScore, level, note: note || null, setAt: new Date().toISOString().slice(0, 10) };

  await saveDb(db);
  res.json(computeStudent(student));
});

// DELETE /api/students/:id/override-risk — revert to the AI-computed score
app.delete("/api/students/:id/override-risk", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  delete student.riskOverride;
  await saveDb(db);
  res.json(computeStudent(student));
});

// GET /api/interventions?studentId=st-001
app.get("/api/interventions", async (req, res) => {
  const db = await loadDb();
  const { studentId } = req.query;
  const list = studentId ? db.interventions.filter((iv) => iv.studentId === studentId) : db.interventions;
  res.json([...list].sort((a, b) => new Date(b.date) - new Date(a.date)));
});

// POST /api/interventions — log a new intervention
app.post("/api/interventions", async (req, res) => {
  const { studentId, action, outcome } = req.body;
  if (!studentId || !action) return res.status(400).json({ error: "studentId and action are required" });

  const db = await loadDb();
  const student = db.students.find((s) => s.id === studentId);
  if (!student) return res.status(404).json({ error: "Student not found" });

  const entry = {
    id: `iv-${Date.now()}`,
    studentId,
    date: new Date().toISOString().slice(0, 10),
    action,
    outcome: outcome || "Pending follow-up",
  };
  db.interventions.unshift(entry);
  await saveDb(db);
  res.status(201).json(entry);
});

// GET /api/notifications — for a supervisor pass ?supervisorId=..., for a
// student pass ?studentId=.... Returns newest-first with an unread count.
app.get("/api/notifications", async (req, res) => {
  const { supervisorId, studentId } = req.query;
  if (!supervisorId && !studentId) {
    return res.status(400).json({ error: "supervisorId or studentId is required" });
  }
  const db = await loadDb();
  const recipientType = supervisorId ? "supervisor" : "student";
  const recipientId = supervisorId || studentId;
  const list = db.notifications
    .filter((n) => n.recipientType === recipientType && n.recipientId === recipientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ notifications: list, unreadCount: list.filter((n) => !n.read).length });
});

// POST /api/notifications/:id/read — mark a single notification as read.
app.post("/api/notifications/:id/read", async (req, res) => {
  const db = await loadDb();
  const n = db.notifications.find((n) => n.id === req.params.id);
  if (!n) return res.status(404).json({ error: "Notification not found" });
  n.read = true;
  await saveDb(db);
  res.json(n);
});

// POST /api/notifications/read-all — mark every notification for a
// recipient as read (e.g. when they open the notification panel).
app.post("/api/notifications/read-all", async (req, res) => {
  const { supervisorId, studentId } = req.body || {};
  if (!supervisorId && !studentId) {
    return res.status(400).json({ error: "supervisorId or studentId is required" });
  }
  const db = await loadDb();
  const recipientType = supervisorId ? "supervisor" : "student";
  const recipientId = supervisorId || studentId;
  db.notifications.forEach((n) => {
    if (n.recipientType === recipientType && n.recipientId === recipientId) n.read = true;
  });
  await saveDb(db);
  res.json({ ok: true });
});

// POST /api/assistant — answers questions about the supervisor's students.
// Tries a real language model first (via OpenRouter, see aiAssistant.js) so
// it can handle paraphrased/generic questions, not just an exact keyword
// match. If no OPENROUTER_API_KEY is set, or the call fails or times out,
// it falls back to answerFromData() below — a deterministic rule engine
// over the same live data — so the assistant never goes fully silent.
app.post("/api/assistant", async (req, res) => {
  const { supervisorId, message } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const db = await loadDb();
  const pool = supervisorId ? db.students.filter((s) => s.supervisorId === supervisorId) : db.students;
  const students = pool.map((s) => computeStudent(s));
  const studentIds = new Set(students.map((s) => s.id));
  const interventions = db.interventions
    .filter((iv) => studentIds.has(iv.studentId))
    .map((iv) => ({ ...iv, studentName: students.find((s) => s.id === iv.studentId)?.name || iv.studentId }))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const reply = await answerWithAI(message, students, interventions, answerFromData);
  res.json({ reply });
});


// ---- Local rule/data-driven assistant engine (free, no external API) ----

function answerFromData(rawMessage, students, interventions) {
  const q = rawMessage.trim();
  const lower = q.toLowerCase();

  if (!students.length) {
    return "You don't have any students on your roster yet, so I don't have anything to analyze.";
  }

  const fmt = (n) => Math.round(n * 10) / 10;
  const listNames = (arr) => arr.map((s) => s.name).join(", ");
  // Whole-word match, so short keywords like "late" don't fire on
  // substrings inside other words (e.g. "calcuLATEd").
  const hasWord = (text, word) => new RegExp(`\\b${word}\\b`).test(text);

  // Try to find student(s) mentioned by name (first name, last name, or full name).
  const mentioned = students.filter((s) => {
    const tokens = s.name.toLowerCase().split(/\s+/);
    return lower.includes(s.name.toLowerCase()) || tokens.some((t) => t.length > 2 && lower.includes(t));
  });

  // How many top results the user asked for, e.g. "top 5" / "top three".
  const numberWords = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const numMatch = lower.match(/\btop\s+(\d+)\b/) || lower.match(/\btop\s+(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  const topN = numMatch ? (Number(numMatch[1]) || numberWords[numMatch[1]] || 3) : 3;

  // --- Greeting / help ---
  if (/^(hi|hello|hey)\b/.test(lower) || lower.includes("what can you") || lower.includes("help")) {
    return `I can answer questions about your ${students.length} student${students.length === 1 ? "" : "s"} — risk levels, milestones, progress, meetings, and intervention history. Try things like "who's highest risk", "which students are low risk", "why is ${students[0].name.split(" ")[0]} flagged", "who has overdue milestones", "what's the average risk score", or "compare ${students[0]?.name?.split(" ")[0]} and ${students[1]?.name?.split(" ")[0] || "another student"}".`;
  }

  // --- Explaining a specific student (risk / status / why flagged) ---
  if (mentioned.length === 1 && (lower.includes("why") || lower.includes("risk") || lower.includes("status") || lower.includes("doing") || lower.includes("how is"))) {
    const s = mentioned[0];
    const topFactors = [...s.factors].sort((a, b) => b.weight - a.weight).slice(0, 2);
    const overdue = s.milestones.filter((m) => m.status === "Overdue" || m.status === "Late");
    let out = `${s.name} is ${s.riskLevel} risk (score ${s.riskScore}${s.isRiskOverridden ? ", manually overridden" : ""}). ${s.explanation || ""}`.trim();
    if (topFactors.length) out += ` Main drivers: ${topFactors.map((f) => `${f.name}${f.note ? ` (${f.note})` : ""}`).join("; ")}.`;
    out += ` Progress: ${fmt(s.progressPct)}%, last activity ${s.lastActivity}, meetings ${s.meetingsAttended}/${s.meetingsScheduled}.`;
    if (overdue.length) out += ` Overdue/late milestones: ${overdue.map((m) => m.name).join(", ")}.`;
    const ivs = interventions.filter((iv) => iv.studentId === s.id);
    if (ivs.length) out += ` ${ivs.length} intervention${ivs.length > 1 ? "s" : ""} logged, most recent: "${ivs[0].action}" (${ivs[0].outcome}).`;
    return out;
  }

  // --- Milestones for a specific student ---
  if (mentioned.length === 1 && lower.includes("milestone")) {
    const s = mentioned[0];
    if (!s.milestones.length) return `${s.name} has no milestones set up yet.`;
    return `${s.name}'s milestones: ${s.milestones.map((m) => `${m.name} — ${m.status}${m.due ? ` (due ${m.due})` : ""}`).join("; ")}.`;
  }

  // --- Compare two named students ---
  if (mentioned.length >= 2 && (lower.includes("compare") || lower.includes(" vs ") || lower.includes(" versus "))) {
    const [a, b] = mentioned;
    return `${a.name}: ${a.riskLevel} risk (${a.riskScore}), ${fmt(a.progressPct)}% progress, last active ${a.lastActivity}. ${b.name}: ${b.riskLevel} risk (${b.riskScore}), ${fmt(b.progressPct)}% progress, last active ${b.lastActivity}.`;
  }

  // --- Simple lookup for a single named student not covered above ---
  if (mentioned.length === 1) {
    const s = mentioned[0];
    return `${s.name}: ${s.riskLevel} risk (score ${s.riskScore}), ${fmt(s.progressPct)}% progress, last activity ${s.lastActivity}, meetings ${s.meetingsAttended}/${s.meetingsScheduled}.`;
  }

  // --- Overdue / late milestones across the cohort ---
  if (lower.includes("overdue") || hasWord(lower, "late") || hasWord(lower, "behind")) {
    const flagged = students.filter((s) => s.milestones.some((m) => m.status === "Overdue" || m.status === "Late"));
    if (!flagged.length) return "Nobody currently has an overdue or late milestone.";
    return `${flagged.length} student${flagged.length > 1 ? "s have" : " has"} overdue/late milestones: ${flagged
      .map((s) => `${s.name} (${s.milestones.filter((m) => m.status === "Overdue" || m.status === "Late").map((m) => m.name).join(", ")})`)
      .join("; ")}.`;
  }

  // --- Highest risk ---
  if (lower.includes("highest risk") || lower.includes("most at risk") || lower.includes("who needs attention") || (lower.includes("risk") && (lower.includes("top") || lower.includes("worst")))) {
    const ranked = [...students].sort((a, b) => b.riskScore - a.riskScore).slice(0, topN);
    return `Highest risk: ${ranked.map((s) => `${s.name} (${s.riskScore}, ${s.riskLevel})`).join(", ")}.`;
  }

  // --- Lowest / low risk ---
  if (lower.includes("low risk") || lower.includes("lowest risk") || lower.includes("least risk") || lower.includes("doing well") || lower.includes("on track")) {
    const ranked = [...students].sort((a, b) => a.riskScore - b.riskScore).slice(0, topN);
    return `Lowest risk: ${ranked.map((s) => `${s.name} (${s.riskScore}, ${s.riskLevel})`).join(", ")}.`;
  }

  // --- Moderate risk ---
  if (lower.includes("moderate risk") || lower.includes("medium risk")) {
    const moderate = students.filter((s) => s.riskLevel && s.riskLevel.toLowerCase().includes("mod"));
    if (!moderate.length) return "No students are currently at moderate risk.";
    return `Moderate risk: ${listNames(moderate)}.`;
  }

  // --- Counts by risk level / general breakdown ---
  if (lower.includes("how many") || lower.includes("breakdown") || lower.includes("overview") || lower.includes("summary")) {
    const high = students.filter((s) => s.riskLevel?.toLowerCase().includes("high")).length;
    const mod = students.filter((s) => s.riskLevel?.toLowerCase().includes("mod")).length;
    const low = students.filter((s) => s.riskLevel?.toLowerCase().includes("low")).length;
    const avg = fmt(students.reduce((sum, s) => sum + s.riskScore, 0) / students.length);
    return `${students.length} students total — ${high} high risk, ${mod} moderate risk, ${low} low risk. Average risk score: ${avg}.`;
  }

  // --- Average / mean risk or progress ---
  if (lower.includes("average") || lower.includes("mean ")) {
    if (lower.includes("progress")) {
      const avg = fmt(students.reduce((sum, s) => sum + s.progressPct, 0) / students.length);
      return `Average progress across ${students.length} students: ${avg}%.`;
    }
    const avg = fmt(students.reduce((sum, s) => sum + s.riskScore, 0) / students.length);
    return `Average risk score across ${students.length} students: ${avg}.`;
  }

  // --- Inactive / haven't heard from ---
  if (lower.includes("inactive") || lower.includes("haven't heard") || lower.includes("no activity") || lower.includes("quiet")) {
    const ranked = [...students].sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity)).slice(0, topN);
    return `Least recently active: ${ranked.map((s) => `${s.name} (last seen ${s.lastActivity})`).join(", ")}.`;
  }

  // --- Meeting attendance ---
  if (lower.includes("meeting") || lower.includes("attendance")) {
    const missed = students.filter((s) => s.meetingsScheduled > 0 && s.meetingsAttended < s.meetingsScheduled);
    if (!missed.length) return "Everyone is up to date on scheduled meetings.";
    return `Students with missed meetings: ${missed.map((s) => `${s.name} (${s.meetingsAttended}/${s.meetingsScheduled})`).join(", ")}.`;
  }

  // --- Interventions log ---
  if (lower.includes("intervention") || lower.includes("what should i do") || lower.includes("what has been tried")) {
    if (!interventions.length) return "No interventions have been logged yet for your students.";
    const recent = interventions.slice(0, 5);
    return `Recent interventions: ${recent.map((iv) => `${iv.studentName} — ${iv.action} (${iv.outcome})`).join("; ")}.`;
  }

  // --- How risk score is calculated (about the app itself) ---
  if (lower.includes("risk score") || lower.includes("how is risk") || lower.includes("how does risk") || lower.includes("calculated")) {
    return "Risk score is computed live from each student's milestone delays, days since last activity, overdue milestones, and meeting attendance. Roughly: 70+ is high risk, 40-69 is moderate, below 40 is low. A supervisor can also manually override a score with a note.";
  }

  // --- Fallback: list everyone with a one-line status so it's still useful ---
  const ranked = [...students].sort((a, b) => b.riskScore - a.riskScore);
  return `I didn't catch a specific question there. Here's your full roster: ${ranked
    .map((s) => `${s.name} (${s.riskLevel}, ${s.riskScore})`)
    .join(", ")}. Ask about a specific student by name, or things like "highest risk", "overdue milestones", "average progress", or "interventions".`;
}

// GET /api/profile?supervisorId=sup-001
app.get("/api/profile", async (req, res) => {
  const db = await loadDb();
  const supervisor = db.supervisors.find((s) => s.id === req.query.supervisorId);
  if (!supervisor) return res.status(404).json({ error: "Supervisor not found" });
  res.json(safeSupervisor(supervisor));
});

// PUT /api/profile — body must include supervisorId
app.put("/api/profile", async (req, res) => {
  const db = await loadDb();
  const { supervisorId, ...updates } = req.body;
  const supervisor = db.supervisors.find((s) => s.id === supervisorId);
  if (!supervisor) return res.status(404).json({ error: "Supervisor not found" });

  delete updates.passwordHash; // never settable directly through this route
  Object.assign(supervisor, updates);
  await saveDb(db);
  res.json(safeSupervisor(supervisor));
});

// POST /api/supervisor-auth/signup — gated the same way students are:
// only an email an admin already added as a supervisor can register.
app.post("/api/supervisor-auth/signup", async (req, res) => {
  const { name, email, password, institution } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const db = await loadDb();
  const supervisor = db.supervisors.find((s) => s.email.toLowerCase() === email.toLowerCase());
  if (!supervisor) {
    return res.status(404).json({ error: "No supervisor account found for that email. Ask an admin to add you first." });
  }
  if (supervisor.passwordHash) {
    return res.status(409).json({ error: "This account is already registered — try signing in instead." });
  }

  supervisor.passwordHash = await bcrypt.hash(password, 10);
  if (name) supervisor.name = name;
  if (institution) supervisor.institution = institution;
  await saveDb(db);
  res.status(201).json(safeSupervisor(supervisor));
});

// POST /api/supervisor-auth/login
app.post("/api/supervisor-auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const db = await loadDb();
  const supervisor = db.supervisors.find((s) => s.email.toLowerCase() === email.toLowerCase());
  if (!supervisor || !supervisor.passwordHash) {
    return res.status(401).json({ error: "No registered account for that email. Sign up first (an admin must have added you)." });
  }

  const ok = await bcrypt.compare(password, supervisor.passwordHash);
  if (!ok) return res.status(401).json({ error: "Incorrect password" });

  res.json(safeSupervisor(supervisor));
});

// ── Admin ────────────────────────────────────────────────────────────────
// Same gated self-registration pattern as students/supervisors, but there's
// exactly one seeded admin slot (see server/seedData.js) — nobody can create
// additional admin accounts through the API.

app.post("/api/admin-auth/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const db = await loadDb();
  const admin = db.admins.find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (!admin) return res.status(404).json({ error: "No admin account found for that email." });
  if (admin.passwordHash) return res.status(409).json({ error: "Already registered — try signing in instead." });

  admin.passwordHash = await bcrypt.hash(password, 10);
  await saveDb(db);
  res.status(201).json({ id: admin.id, name: admin.name, email: admin.email });
});

app.post("/api/admin-auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const db = await loadDb();
  const admin = db.admins.find((a) => a.email.toLowerCase() === email.toLowerCase());
  if (!admin || !admin.passwordHash) return res.status(401).json({ error: "No registered admin account for that email." });

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: "Incorrect password" });

  res.json({ id: admin.id, name: admin.name, email: admin.email });
});

// GET /api/admin/overview — system-wide stats
app.get("/api/admin/overview", async (req, res) => {
  const db = await loadDb();
  const computed = db.students.map((s) => computeStudent(s));
  res.json({
    totalSupervisors: db.supervisors.length,
    registeredSupervisors: db.supervisors.filter((s) => s.passwordHash).length,
    totalStudents: computed.length,
    registeredStudents: db.students.filter((s) => s.passwordHash).length,
    highRisk: computed.filter((s) => s.riskLevel === "High").length,
  });
});

// GET /api/admin/supervisors — every supervisor with their student count
app.get("/api/admin/supervisors", async (req, res) => {
  const db = await loadDb();
  const list = db.supervisors.map((s) => ({
    ...safeSupervisor(s),
    registered: !!s.passwordHash,
    studentCount: db.students.filter((st) => st.supervisorId === s.id).length,
  }));
  res.json(list);
});

// POST /api/admin/supervisors — admin adds a supervisor's email, gating their self-signup
app.post("/api/admin/supervisors", async (req, res) => {
  const { name, email, institution, department } = req.body;
  if (!name || !email) return res.status(400).json({ error: "name and email are required" });

  const db = await loadDb();
  if (db.supervisors.some((s) => s.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: `A supervisor with email ${email} already exists` });
  }

  const newSupervisor = {
    id: `sup-${Date.now()}`,
    name,
    email: email.toLowerCase(),
    passwordHash: null,
    institution: institution || "",
    department: department || "Computer Science",
    emailAlerts: true,
    autoExpandFactors: true,
    createdAt: new Date().toISOString().slice(0, 10),
  };
  db.supervisors.push(newSupervisor);
  await saveDb(db);
  res.status(201).json({ ...safeSupervisor(newSupervisor), registered: false, studentCount: 0 });
});

// DELETE /api/admin/supervisors/:id — blocked if they still have students,
// to avoid silently orphaning a whole roster.
app.delete("/api/admin/supervisors/:id", async (req, res) => {
  const db = await loadDb();
  const supervisor = db.supervisors.find((s) => s.id === req.params.id);
  if (!supervisor) return res.status(404).json({ error: "Supervisor not found" });

  const studentCount = db.students.filter((s) => s.supervisorId === supervisor.id).length;
  if (studentCount > 0) {
    return res.status(409).json({ error: `Reassign this supervisor's ${studentCount} student(s) to someone else first.` });
  }

  db.supervisors = db.supervisors.filter((s) => s.id !== req.params.id);
  await saveDb(db);
  res.json({ ok: true });
});

// POST /api/admin/supervisors/:id/reset-password — revokes access; they must
// self-register again via /supervisor/signup with the same email.
app.post("/api/admin/supervisors/:id/reset-password", async (req, res) => {
  const db = await loadDb();
  const supervisor = db.supervisors.find((s) => s.id === req.params.id);
  if (!supervisor) return res.status(404).json({ error: "Supervisor not found" });

  supervisor.passwordHash = null;
  await saveDb(db);
  res.json({ ok: true });
});

// GET /api/admin/students — every student, system-wide, with their supervisor's name
app.get("/api/admin/students", async (req, res) => {
  const db = await loadDb();
  const list = db.students
    .map((s) => computeStudent(s))
    .map((s) => {
      const supervisor = db.supervisors.find((sup) => sup.id === s.supervisorId);
      return { ...s, supervisorName: supervisor ? supervisor.name : "Unassigned", registered: !!s.passwordHash };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
  res.json(list);
});

// POST /api/admin/students/:id/reassign — move a student to a different supervisor
app.post("/api/admin/students/:id/reassign", async (req, res) => {
  const { supervisorId } = req.body;
  if (!supervisorId) return res.status(400).json({ error: "supervisorId is required" });

  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (!db.supervisors.some((s) => s.id === supervisorId)) {
    return res.status(404).json({ error: "Target supervisor not found" });
  }

  student.supervisorId = supervisorId;
  await saveDb(db);
  res.json(computeStudent(student));
});

// POST /api/admin/students/:id/reset-password
app.post("/api/admin/students/:id/reset-password", async (req, res) => {
  const db = await loadDb();
  const student = db.students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: "Student not found" });

  student.passwordHash = null;
  await saveDb(db);
  res.json({ ok: true });
});

// DELETE /api/admin/students/:id
app.delete("/api/admin/students/:id", async (req, res) => {
  const db = await loadDb();
  const exists = db.students.some((s) => s.id === req.params.id);
  if (!exists) return res.status(404).json({ error: "Student not found" });

  db.students = db.students.filter((s) => s.id !== req.params.id);
  db.interventions = db.interventions.filter((iv) => iv.studentId !== req.params.id);
  await saveDb(db);
  res.json({ ok: true });
});

// Reset endpoint — restores seed data, handy for demos
app.post("/api/reset", async (req, res) => {
  // Clear any uploaded documents from the previous session before the
  // records that point at them are thrown away.
  const current = await loadDb();
  for (const key of Object.keys(current.files || {})) {
    await deleteFile(current, key);
  }
  await saveDb(initialState());
  res.json({ ok: true });
});

// Turns multer's upload failures into readable JSON instead of a raw stack
// trace or an opaque platform 413. Must be registered after all routes.
app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: `That file is too large. The maximum upload size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB — try compressing the document or splitting the attachments.`,
    });
  }
  if (err && err.code && String(err.code).startsWith("LIMIT_")) {
    return res.status(400).json({ error: `Upload rejected: ${err.message}` });
  }
  if (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({ error: "Something went wrong on the server." });
  }
  next();
});

// Vercel imports this module and drives it as a serverless function, so the
// server must not open a port there. Locally (`npm run server`) this file is
// the entry point and still listens as before.
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`DecisionLens API running at http://localhost:${PORT}`);
  });
}

module.exports = app;
