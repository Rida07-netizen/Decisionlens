// Seed data — this is written to server/db.json on first run and then
// becomes the live datastore. Risk scores are NOT stored here; they're
// computed fresh on every request in riskEngine.js from milestone data,
// so logging a milestone actually changes what the API returns.

const milestoneTemplate = [
  { name: "Proposal Submission", due: "2026-02-10" },
  { name: "Literature Review", due: "2026-03-15" },
  { name: "Requirement Analysis", due: "2026-04-10" },
  { name: "System Design", due: "2026-05-15" },
  { name: "Implementation Phase 1", due: "2026-07-01" },
  { name: "Implementation Phase 2", due: "2026-08-15" },
  { name: "Testing", due: "2026-09-15" },
  { name: "Draft Thesis Submission", due: "2026-10-15" },
  { name: "Final Defense", due: "2026-11-15" },
];

function withSubmissions(overrides) {
  return milestoneTemplate.map((m) => ({
    ...m,
    published: overrides[m.name] !== undefined,
    // Seed requirements have no uploaded files, links, or attachments. A due
    // date is not proof of a submission, so leave their submission status empty.
    submitted: null,
  }));
}

const students = [
  {
    id: "st-001",
    supervisorId: "sup-001",
    email: "komal.saeed@student.edu.pk",
    passwordHash: null,
    name: "Komal Saeed",
    agNumber: "AG-2022-0022",
    batchYear: "2022",
    thesisTitle: "Mobile App for Mental Health Monitoring using ML",
    program: "BS Computer Science",
    meetingsScheduled: 6,
    meetingsAttended: 4,
    milestones: withSubmissions({
      "Proposal Submission": "2026-02-09",
      "Literature Review": "2026-03-20",
    }),
  },
  {
    id: "st-002",
    supervisorId: "sup-001",
    email: "ayesha.noor@student.edu.pk",
    passwordHash: null,
    name: "Ayesha Noor",
    agNumber: "AG-2021-0007",
    batchYear: "2021",
    thesisTitle: "AI-Based Plagiarism Detection System",
    program: "BS Computer Science",
    meetingsScheduled: 6,
    meetingsAttended: 5,
    milestones: withSubmissions({
      "Proposal Submission": "2026-02-10",
      "Literature Review": "2026-03-14",
      "Requirement Analysis": "2026-04-22",
      "System Design": "2026-06-02",
    }),
  },
  {
    id: "st-003",
    supervisorId: "sup-001",
    email: "mehwish.tariq@student.edu.pk",
    passwordHash: null,
    name: "Mehwish Tariq",
    agNumber: "AG-2021-0031",
    batchYear: "2021",
    thesisTitle: "E-Commerce Recommendation Engine using Collaborative Filtering",
    program: "BS Computer Science",
    meetingsScheduled: 6,
    meetingsAttended: 6,
    milestones: withSubmissions({
      "Proposal Submission": "2026-02-08",
      "Literature Review": "2026-03-24",
      "Requirement Analysis": "2026-04-24",
      "System Design": "2026-05-17",
    }),
  },
  {
    id: "st-004",
    supervisorId: "sup-001",
    email: "hina.yousaf@student.edu.pk",
    passwordHash: null,
    name: "Hina Yousaf",
    agNumber: "AG-2022-0014",
    batchYear: "2022",
    thesisTitle: "IoT-Based Smart Attendance System",
    program: "BS Computer Science",
    meetingsScheduled: 6,
    meetingsAttended: 6,
    milestones: withSubmissions({
      "Proposal Submission": "2026-02-10",
      "Literature Review": "2026-03-13",
      "Requirement Analysis": "2026-04-09",
      "System Design": "2026-05-14",
      "Implementation Phase 1": "2026-07-10",
    }),
  },
  {
    id: "st-005",
    supervisorId: "sup-001",
    email: "zara.ahmed@student.edu.pk",
    passwordHash: null,
    name: "Zara Ahmed",
    agNumber: "AG-2022-0019",
    batchYear: "2022",
    thesisTitle: "Blockchain-Based Academic Certificate Verification",
    program: "BS Computer Science",
    meetingsScheduled: 6,
    meetingsAttended: 6,
    milestones: withSubmissions({
      "Proposal Submission": "2026-02-05",
      "Literature Review": "2026-03-12",
      "Requirement Analysis": "2026-04-08",
      "System Design": "2026-05-15",
      "Implementation Phase 1": "2026-06-28",
    }),
  },
  {
    id: "st-006",
    supervisorId: "sup-001",
    email: "sana.malik@student.edu.pk",
    passwordHash: null,
    name: "Sana Malik",
    agNumber: "AG-2022-0042",
    batchYear: "2022",
    thesisTitle: "Sentiment Analysis of Urdu Tweets using Deep Learning",
    program: "BS Computer Science",
    meetingsScheduled: 6,
    meetingsAttended: 6,
    milestones: withSubmissions({
      "Proposal Submission": "2026-02-06",
      "Literature Review": "2026-03-10",
      "Requirement Analysis": "2026-04-05",
      "System Design": "2026-05-10",
      "Implementation Phase 1": "2026-06-20",
      "Implementation Phase 2": "2026-08-09",
    }),
  },
];

const interventions = [
  { id: "iv-001", studentId: "st-001", date: "2026-08-05", action: "Sent reminder email", outcome: "No response after 3 days" },
  { id: "iv-002", studentId: "st-002", date: "2026-07-28", action: "Scheduled catch-up meeting", outcome: "Rescheduled twice by student" },
  { id: "iv-003", studentId: "st-004", date: "2026-07-15", action: "Approved 1-week deadline extension", outcome: "Milestone submitted within extended window" },
  { id: "iv-004", studentId: "st-003", date: "2026-06-30", action: "Discussed scope change in 1:1", outcome: "Agreed revised timeline, on track since" },
];

const supervisors = [
  {
    id: "sup-001",
    name: "Rida",
    email: "mehmoodrida786@gmail.com",
    passwordHash: null, // self-registers at /signup with this exact email
    institution: "",
    department: "Computer Science",
    emailAlerts: true,
    autoExpandFactors: true,
    createdAt: "2026-01-15",
  },
];

// Exactly one seeded admin slot — signup is gated the same way supervisor
// and student signup are: only this pre-existing email can register.
const admins = [
  {
    id: "admin-001",
    name: "System Admin",
    email: "admin@decisionlens.local",
    passwordHash: null,
    createdAt: "2026-01-01",
  },
];

module.exports = { students, interventions, milestoneTemplate, supervisors, admins };
