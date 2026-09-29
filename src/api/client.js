import axios from "axios";

// In dev, Vite proxies /api -> http://localhost:4000 (see vite.config.js),
// so this works without CORS headaches. In production you'd point
// baseURL at your deployed API instead.
const api = axios.create({ baseURL: "/api" });

// ── Supervisor-scoped student data ─────────────────────────────────────
export const getStudents = (supervisorId, status) =>
  api.get("/students", { params: { supervisorId, status } }).then((r) => r.data);
export const getStudent = (id, viewerRole) =>
  api.get(`/students/${id}`, { params: viewerRole ? { viewerRole } : {} }).then((r) => r.data);
export const addStudent = (payload) => api.post("/students", payload).then((r) => r.data);
export const getDashboard = (supervisorId) =>
  api.get("/dashboard", { params: { supervisorId } }).then((r) => r.data);
export const getMilestoneTemplates = () => api.get("/milestone-templates").then((r) => r.data);

// Supervisor removing a student they added, or marking them graduated/done
// (which just hides them from the active roster — see getStudents status param).
export const removeStudent = (id) => api.delete(`/students/${id}`).then((r) => r.data);
export const markStudentCompleted = (id) => api.post(`/students/${id}/mark-completed`).then((r) => r.data);
export const reactivateStudent = (id) => api.post(`/students/${id}/reactivate`).then((r) => r.data);
export const startNewDegree = (id, payload) => api.post(`/students/${id}/start-new-degree`, payload).then((r) => r.data);
export const updateStudentProfile = (id, payload) => api.put(`/students/${id}`, payload).then((r) => r.data);

// Supervisor manually adds a milestone with a due date they choose — nothing is auto-generated.
export const addMilestone = (studentId, payload) =>
  api.post(`/students/${studentId}/milestones`, payload).then((r) => r.data);
export const publishMilestone = (studentId, milestoneName) =>
  api.post(`/students/${studentId}/milestones/${encodeURIComponent(milestoneName)}/publish`).then((r) => r.data);
export const unpublishMilestone = (studentId, milestoneName) =>
  api.post(`/students/${studentId}/milestones/${encodeURIComponent(milestoneName)}/unpublish`).then((r) => r.data);
export const allowResubmission = (studentId, milestoneName) =>
  api.post(`/students/${studentId}/milestones/${encodeURIComponent(milestoneName)}/allow-resubmit`).then((r) => r.data);
export const updateMilestone = (studentId, milestoneName, payload) =>
  api.put(`/students/${studentId}/milestones/${encodeURIComponent(milestoneName)}`, payload).then((r) => r.data);
export const deleteMilestone = (studentId, milestoneName) =>
  api.delete(`/students/${studentId}/milestones/${encodeURIComponent(milestoneName)}`).then((r) => r.data);
export const saveMilestoneComment = (studentId, milestoneName, comment) =>
  api.post(`/students/${studentId}/milestones/${encodeURIComponent(milestoneName)}/comment`, { comment }).then((r) => r.data);

// Attaches a document to an existing milestone; the server extracts text and
// analyzes it (word count, placeholder detection, expected sections).
export const submitMilestoneDocument = (studentId, milestoneName, { file, githubLink, attachments, submittedDate } = {}) => {
  const form = new FormData();
  if (file) form.append("document", file);
  if (githubLink) form.append("githubLink", githubLink);
  if (attachments && attachments.length > 0) {
    attachments.forEach((att) => form.append("attachments", att));
  }
  if (submittedDate) form.append("submittedDate", submittedDate);
  // Don't set a Content-Type header here: the browser needs to generate its
  // own multipart boundary from the FormData. If we set
  // "Content-Type: multipart/form-data" ourselves (without a boundary), the
  // browser won't add one, and the server can't parse the request at all —
  // this was why every submit/re-submit was silently failing.
  return api
    .post(`/students/${studentId}/milestones/${encodeURIComponent(milestoneName)}/submit`, form)
    .then((r) => r.data);
};

export const getInterventions = (studentId) =>
  api.get("/interventions", { params: studentId ? { studentId } : {} }).then((r) => r.data);
export const logIntervention = (payload) => api.post("/interventions", payload).then((r) => r.data);

// Download link for the actual uploaded file (opens/downloads in browser) —
// consumed directly as an href, not through axios.
export const getMilestoneFileUrl = (studentId, milestoneName, version) =>
  `/api/students/${studentId}/milestones/${encodeURIComponent(milestoneName)}/file${version ? `/${version}` : ""}`;
export const getMilestoneViewUrl = (studentId, milestoneName, version) =>
  `/api/students/${studentId}/milestones/${encodeURIComponent(milestoneName)}/view${version ? `/${version}` : ""}`;

// Supervisor overrides — a human correction on top of the AI's numbers.
// The AI's own score is always still returned alongside these for comparison.
export const overrideMilestoneCompleteness = (studentId, milestoneName, score, note) =>
  api
    .post(`/students/${studentId}/milestones/${encodeURIComponent(milestoneName)}/override-completeness`, { score, note })
    .then((r) => r.data);
export const overrideRiskScore = (studentId, score, note) =>
  api.post(`/students/${studentId}/override-risk`, { score, note }).then((r) => r.data);
export const clearRiskOverride = (studentId) =>
  api.delete(`/students/${studentId}/override-risk`).then((r) => r.data);

export const getProfile = (supervisorId) =>
  api.get("/profile", { params: { supervisorId } }).then((r) => r.data);
export const updateProfile = (payload) => api.put("/profile", payload).then((r) => r.data);

export const resetData = () => api.post("/reset").then((r) => r.data);

// Notifications — supervisor gets one when a student uploads a document;
// student gets one when a requirement is published or commented on.
// Pass exactly one of supervisorId/studentId depending on who's asking.
export const getNotifications = ({ supervisorId, studentId } = {}) =>
  api.get("/notifications", { params: { supervisorId, studentId } }).then((r) => r.data);
export const markNotificationRead = (id) =>
  api.post(`/notifications/${id}/read`).then((r) => r.data);
export const markAllNotificationsRead = ({ supervisorId, studentId } = {}) =>
  api.post("/notifications/read-all", { supervisorId, studentId }).then((r) => r.data);

// Assistant — answers questions about the supervisor's students by reasoning
// over live data server-side (see server/index.js POST /assistant). Free:
// no external AI API involved, just the app's own risk/milestone data.
export const askAssistant = (supervisorId, message) =>
  api.post("/assistant", { supervisorId, message }).then((r) => r.data);

// ── Supervisor auth — gated: only an email an admin already added can register ──
export const supervisorSignup = (payload) => api.post("/supervisor-auth/signup", payload).then((r) => r.data);
export const supervisorLogin = (payload) => api.post("/supervisor-auth/login", payload).then((r) => r.data);

// ── Student portal auth — gated: only an email a supervisor already added can register ──
export const studentSignup = (payload) => api.post("/student-auth/signup", payload).then((r) => r.data);
export const studentLogin = (payload) => api.post("/student-auth/login", payload).then((r) => r.data);

// ── Student self-registration — no supervisor needed up front; the student
// picks one afterwards and waits for that supervisor to accept them ──
export const studentRegister = (payload) => api.post("/student-auth/register", payload).then((r) => r.data);
export const getPublicSupervisors = () => api.get("/supervisors/public").then((r) => r.data);
export const requestSupervisor = (studentId, supervisorId) =>
  api.post(`/students/${studentId}/request-supervisor`, { supervisorId }).then((r) => r.data);
export const getSupervisorRequests = (supervisorId) =>
  api.get(`/supervisors/${supervisorId}/requests`).then((r) => r.data);
export const acceptStudentRequest = (studentId) =>
  api.post(`/students/${studentId}/accept-request`).then((r) => r.data);
export const rejectStudentRequest = (studentId) =>
  api.post(`/students/${studentId}/reject-request`).then((r) => r.data);

// ── Admin auth — exactly one seeded admin account, same gated pattern ──
export const adminSignup = (payload) => api.post("/admin-auth/signup", payload).then((r) => r.data);
export const adminLogin = (payload) => api.post("/admin-auth/login", payload).then((r) => r.data);

// ── Admin management — full control over supervisors and students ──
export const getAdminOverview = () => api.get("/admin/overview").then((r) => r.data);

export const getAdminSupervisors = () => api.get("/admin/supervisors").then((r) => r.data);
export const addSupervisor = (payload) => api.post("/admin/supervisors", payload).then((r) => r.data);
export const deleteSupervisor = (id) => api.delete(`/admin/supervisors/${id}`).then((r) => r.data);
export const resetSupervisorPassword = (id) =>
  api.post(`/admin/supervisors/${id}/reset-password`).then((r) => r.data);

export const getAdminStudents = () => api.get("/admin/students").then((r) => r.data);
export const reassignStudent = (id, supervisorId) =>
  api.post(`/admin/students/${id}/reassign`, { supervisorId }).then((r) => r.data);
export const resetStudentPassword = (id) =>
  api.post(`/admin/students/${id}/reset-password`).then((r) => r.data);
export const deleteStudent = (id) => api.delete(`/admin/students/${id}`).then((r) => r.data);

export default api;
