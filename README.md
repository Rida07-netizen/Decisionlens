# DecisionLens — Hybrid Front-End + API (Week 4/5)

AI-powered **research/thesis progress tracker with risk prediction**,
now supporting three roles — **Admin, Supervisor, and Student** — each
with their own login, gated by the role above it. A real hybrid app:
a React front-end calls a small Express API backed by a JSON-file
datastore, so adding a milestone or uploading a document **actually
recalculates** that student's risk score, and everything persists
across refreshes.

## Stack
- **Frontend:** React 19 + Vite, Tailwind CSS v4 + Bootstrap 5, React Router v6, Chart.js, lucide-react, Axios
- **Backend:** Express, `bcryptjs`, `multer`, `mammoth`, `pdf-parse`; a JSON file as the datastore (`server/db.json`, auto-created from seed data on first run)

## Getting started

You need **two things running**: the API server and the Vite dev server.

**Easiest — one command runs both:**
```bash
npm install
npm run dev:full
```
This starts the API on `http://localhost:4000` and the app on `http://localhost:5173`
(Vite proxies `/api` requests to the backend automatically — see `vite.config.js`).

**Or run them separately** (useful for watching server logs on their own):
```bash
# terminal 1
npm run server

# terminal 2
npm run dev
```

Then open **http://localhost:5173**.

## Setting up all three roles from a fresh install
The hierarchy is Admin → Supervisor → Student, each gating the next. There's
one seeded admin account and one seeded supervisor account (already
carrying a real 6-student demo cohort so the app isn't empty on first
run) — everyone else you add yourself. On a brand-new `db.json`
(auto-created from seed data on first run), here's the full path from
nothing to a working system:

1. **Admin** — go to `/admin/signup`, register with the seeded email
   (`admin@decisionlens.local`) and any password. You're now on `/admin/dashboard`.
2. **Supervisor registers** — the seed supervisor account is already
   there with 6 students attached and just needs a password. Go to
   `/signup`, use `mehmoodrida786@gmail.com` (or whatever email you've
   set in `server/seedData.js`), and set a password. You're now on your
   dashboard with your full roster. To add *another* supervisor instead,
   use the Admin dashboard's Supervisors tab.
3. **Add a student** — from the supervisor's dashboard, **Add Student**
   requires an email. They start with zero milestones and a risk score of 0.
4. **Add a milestone** — you type the name (a datalist suggests the
   standard 9-milestone names so content analysis knows what sections to
   check for, but you can type anything) and pick the real due date yourself.
5. **Student registers** — go to `/student/signup`, use that exact email,
   set a password. They land in `/student/portal`.
6. **Student uploads a document** for the milestone (.txt, .docx, or
   .pdf) right from their portal — the server extracts the text and runs
   the content check below, and their risk score updates immediately.

Roll numbers and emails must be unique system-wide — the API returns a 409 if you reuse one.

Note on the 6 seed students: they have emails (e.g.
`komal.saeed@student.edu.pk` — see `server/seedData.js` for the full list)
but no password yet, since seeding can't know what password they'd pick.
To test the student portal against seed data, sign up at `/student/signup`
with one of those emails first.

## Document content analysis
When you submit a document, `server/documentAnalysis.js`:
- Extracts raw text (`.txt` directly, `.docx` via `mammoth`, `.pdf` via `pdf-parse`)
- Counts words and flags likely placeholder/empty content (very short, or
  contains markers like "TBD", "lorem ipsum", "to be added")
- For the 9 standard milestone names, checks whether expected
  keywords/sections show up (e.g. "Literature Review" expects to see
  "related work", "research gap", "reference", etc. — see
  `SECTION_EXPECTATIONS` in that file to edit the list)
- Produces a 0–100 completeness score
- Scores **effort** (0–100) from vocabulary richness, sentence-length
  variety, and length — a rough proxy for "does this read like genuine
  writing" rather than thin or repetitive filler
- Checks **originality** against every other document already uploaded
  to this system (any student, any milestone) using word-shingle
  similarity. **This is not a plagiarism check against the internet or
  any outside source** — only against submissions on file here. A match
  ≥30% similar gets flagged with which student/milestone it matches.

None of this is a writing-quality or plagiarism judgment in the formal
sense — it's a fast, transparent, explainable signal. It's meant to catch
"submitted a nearly empty file to beat the deadline" or "copied a
classmate's file," not to grade the thesis.

The completeness score feeds into risk as a factor, **Submission content
quality**, alongside milestone delays, overdue count, days-since-activity,
and meeting attendance — so a student who submits on time but with
placeholder content still gets flagged. Effort and originality are shown
as extra context but don't currently feed the risk formula directly.

## Supervisor overrides — correcting the AI
A supervisor can read an uploaded document themselves and override two
different numbers, from the **Student Detail** page:

1. **Per-milestone completeness %** — "Override %" next to any analyzed
   submission. This actually changes an input to the risk formula, so the
   student's overall risk score recalculates using your corrected number
   instead of the AI's. The AI's original score stays visible
   (`aiCompletenessScore`) so the correction is a visible fix, not a silent one.
2. **Overall risk score** — "Override this score" near the risk meter.
   This is a final, top-level verdict that sits *on top of* the AI's
   number rather than changing its inputs — the AI keeps computing in the
   background (`aiRiskScore`/`aiRiskLevel`) for comparison, and "Revert to
   AI score" clears the override at any time.

Both are visible history, not silent edits — `isRiskOverridden` and
`completenessOverridden` flags (plus the optional note you type) make it
clear on the student's page that a human corrected the AI, and what the
AI originally said.

Supervisors can also **download the actual uploaded file** for any
submitted milestone directly from Student Detail — the content-analysis
summary was never a substitute for reading the real document, just a
first pass.

**Privacy note on originality matches:** a student's own portal shows
*that* a similarity was flagged and the percentage, but never *which*
other student it matched — that identifying detail is only shown to
supervisors and comes from a `viewerRole=student` flag the student
portal passes when fetching its own data. Like the rest of this app's
auth, that's a client-declared flag, not cryptographically enforced —
consistent with the "Honest limitation" note under Authentication below.

## Authentication
There are now **three separate logins**, each gating the next — this is
the actual hierarchy the app enforces, not just a UI convention:

```
Admin (one seeded slot)
  └── adds Supervisors (email only)
        └── Supervisor self-registers, then adds Students (email only)
              └── Student self-registers
```

**Admin** (`/admin/login`, `/admin/signup`) — there is exactly **one**
admin account, seeded in `server/seedData.js` (default email
`admin@decisionlens.local`). Signup is gated the same way as everyone
else below it: only that exact seeded email can register, so you can't
create a second admin account through the API. From `/admin/dashboard`,
the admin can:
- **Add / remove supervisors** — adding just reserves an email; the
  supervisor still has to self-register with it
- **Reassign any student** to a different supervisor
- **Reset a password** (supervisor or student) — this sets their
  `passwordHash` back to `null`, forcing them to sign up again with the
  same email. There's no email-sending in this app, so this is the
  "reset" mechanism.
- **Delete** supervisors (blocked with a 409 if they still have students
  — reassign first) or students (cascades their milestones/interventions)
- See system-wide stats: total supervisors/students, how many are
  actually registered vs. just added, high-risk count

**Supervisor** (`/login`, `/signup`) — now properly **multi-tenant**.
Each supervisor only ever sees their own students — every list/dashboard
endpoint filters by `supervisorId`. Signup is gated exactly like students:
an admin has to add your email first via the Admin dashboard, then you
register with that same email at `/signup`.

**Student** (`/student/login`, `/student/signup`) — unchanged from
before: gated by the supervisor adding the email first (see below).

**Student portal** (`/student/portal`, behind `StudentProtectedRoute`) —
a student's own view of exactly what their supervisor sees for them: risk
score, milestone timeline, the Explanation/Risk Factors breakdown, and any
logged interventions. Each milestone has an inline upload control right
there. Uploading hits the *same* `/api/students/:id/milestones/:name/submit`
endpoint, so a student's upload is analyzed and reflected in their risk
score immediately, and shows up on the supervisor's side the next time
they load that student.

All three logins link to each other from their sign-in pages.

**API responses never include `passwordHash`** — `computeStudent()` and
the `safeSupervisor()` helper both strip it before returning anything,
and every signup/login route only ever returns `{id, name, email, ...}`.

**Honest limitation, worth saying out loud if asked:** there are no
session tokens sent with API requests — a logged-in supervisor's `id` is
just passed as a query param/body field on each call, and nothing on the
server actually verifies "this request really came from that supervisor."
Fine for a local/internship-scale demo where you trust who's using it;
not something to expose on the open internet as-is. The natural next
step is real session tokens (JWT) checked by middleware on every route —
worth mentioning as "future work" if your supervisor asks about it.

## How the "hybrid" part works
- `server/seedData.js` — the milestone-name template, one seed
  supervisor account (with a real 6-student demo cohort), and the single
  seed admin account (no risk scores stored — those are always computed)
- `server/documentAnalysis.js` — extracts text from uploaded files and runs the content check
- `server/riskEngine.js` — computes risk score, level, and factor breakdown
  **live**, every time, from milestone delays, days since last activity,
  overdue milestones, meeting attendance, and document content quality
- `server/index.js` — Express routes; `db.json` is created automatically
  on first run; uploaded files land in `server/uploads/`. `loadDb()` also
  auto-migrates an older single-supervisor `db.json` (with a `profile`
  field) into the new `supervisors`/`admins` shape the first time it's read.
- `src/api/client.js` — Axios client the frontend uses instead of static imports

Try it: as a student (or supervisor), upload a short/empty `.txt` file for
any milestone, then check that student's page — the risk score, level, and
factor breakdown will reflect the weak submission even if the date was on time.

To wipe your changes and restore the original seed data (1 supervisor
with 6 students, 1 admin slot):
```bash
curl -X POST http://localhost:4000/api/reset
```
or delete `server/db.json` and everything in `server/uploads/`, then restart the server.

## Screens (16)
| Screen | Route | Notes |
|---|---|---|
| Login | /login | Supervisor sign-in — links to both Student and Admin sign-in |
| Sign Up | /signup | Only works for an email an admin already added as a supervisor |
| Dashboard | / | This supervisor's cohort stats + "Needs Attention" list |
| My Students | /students | This supervisor's roster only, filterable by risk level |
| Student Detail | /students/:id | Milestone timeline, live risk breakdown, chart, past interventions |
| Add Milestone | /add-milestone | You set the name + real due date, nothing auto-generated |
| Compare Students | /compare | Side-by-side risk comparison, within this supervisor's roster |
| Interventions | /interventions | Real log — persists to db.json |
| AI Assistant | /assistant | Answers questions using this supervisor's own students only |
| Settings | /settings | Supervisor profile + preferences |
| Student Sign Up | /student/signup | Only works for a supervisor-added email |
| Student Sign In | /student/login | |
| Student Portal | /student/portal | Own risk score, milestones, and document upload |
| Admin Sign Up | /admin/signup | Only the one seeded admin email can register |
| Admin Sign In | /admin/login | |
| Admin Dashboard | /admin/dashboard | Overview stats + full supervisor/student management |

## API reference
| Method | Route | Purpose |
|---|---|---|
| POST | /api/students | `{name, rollNo, thesisTitle, email, program, meetingsScheduled, supervisorId}` — adds a student |
| GET | /api/students?supervisorId= | That supervisor's roster, risk-sorted |
| GET | /api/students/:id | Single student with computed risk |
| GET | /api/dashboard?supervisorId= | That supervisor's cohort stats |
| GET | /api/milestone-templates | Suggested milestone names, for the Add Milestone datalist |
| POST | /api/students/:id/milestones | `{name, due}` — adds a milestone with a real due date |
| POST | /api/students/:id/milestones/:name/submit | multipart `document` file (+ optional `submittedDate`) — analyzes content, marks submitted. Used by both the supervisor and the student portal. |
| GET | /api/students/:id/milestones/:name/file | Downloads the actual uploaded document |
| POST | /api/students/:id/milestones/:name/override-completeness | `{score, note}` — supervisor corrects the AI's completeness %; feeds back into the risk formula |
| POST | /api/students/:id/override-risk | `{score, note}` — supervisor sets the final risk score by hand; AI keeps computing its own for comparison |
| DELETE | /api/students/:id/override-risk | Clears the override, reverting to the AI-computed score |
| GET / PUT | /api/profile | `?supervisorId=` — a supervisor's own profile/preferences |
| POST | /api/supervisor-auth/signup | `{name, email, password, institution}` — only succeeds for an email an admin already added |
| POST | /api/supervisor-auth/login | `{email, password}` |
| POST | /api/student-auth/signup | `{email, password}` — only succeeds for an email a supervisor already added |
| POST | /api/student-auth/login | `{email, password}` |
| POST | /api/admin-auth/signup | `{email, password}` — only the one seeded admin email |
| POST | /api/admin-auth/login | `{email, password}` |
| GET | /api/admin/overview | System-wide stats |
| GET | /api/admin/supervisors | Every supervisor, with registration status + student count |
| POST | /api/admin/supervisors | `{name, email, institution, department}` — adds a supervisor (gates their signup) |
| DELETE | /api/admin/supervisors/:id | Blocked (409) if they still have students — reassign first |
| POST | /api/admin/supervisors/:id/reset-password | Revokes access; they must sign up again |
| GET | /api/admin/students | Every student system-wide, with their supervisor's name attached |
| POST | /api/admin/students/:id/reassign | `{supervisorId}` — moves a student to a different supervisor |
| POST | /api/admin/students/:id/reset-password | Revokes access; they must sign up again |
| DELETE | /api/admin/students/:id | Deletes the student and their interventions |
| GET | /api/interventions | Optional `?studentId=` filter |
| POST | /api/interventions | `{studentId, action, outcome}` |
| POST | /api/reset | Restores seed data (1 supervisor with 6 students, 1 admin slot) |

## Next (production)
- Swap `server/db.json` for a real database (MySQL/MongoDB) when you're
  ready to deploy — the route logic doesn't need to change, only `loadDb`/`saveDb`
  in `server/index.js`.
- Add real session tokens (JWT) so the server actually verifies who's
  making each request, instead of trusting a `supervisorId`/`studentId`
  passed in the request. See the note in "Authentication" above.
