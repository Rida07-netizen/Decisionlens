# Deploying DecisionLens to Vercel

## What changed and why

The app previously kept all its state in `server/db.json` and all uploaded
documents in `server/uploads/`. Both are writes to the local filesystem.
Vercel runs the backend as a serverless function with a **read-only
filesystem** (apart from `/tmp`, which is wiped between invocations and not
shared between them), so on the old code every signup, student, milestone,
comment and upload would appear to succeed and then vanish.

Three things were replaced:

| Was | Now | File |
|---|---|---|
| `db.json` on disk | One JSONB row in Postgres | `server/db.js` |
| `uploads/` on disk | Vercel Blob | `server/storage.js` |
| LibreOffice / Python `.docx` → PDF | mammoth `.docx` → HTML | `server/index.js` |

Plus: the server exports the Express app instead of calling `app.listen()`
when running on Vercel, and `api/index.js` + `vercel.json` route `/api/*` to
it.

The **data shape is unchanged.** `loadDb()` still returns the same
`{ students, supervisors, admins, interventions, notifications }` object, so
every route's logic is the same code as before — only the read and the write
became `async`.

---

## Setup

### 1. Create the Postgres database

In your Vercel project: **Storage → Create Database → Neon (Postgres)**, then
connect it to the project. Vercel injects `DATABASE_URL` automatically.

You don't need to create any tables. `server/db.js` runs
`CREATE TABLE IF NOT EXISTS app_state (...)` on first use.

### 2. Create the Blob store

**Storage → Create → Blob**, connect it to the project. Vercel injects
`BLOB_READ_WRITE_TOKEN` automatically.

### 3. Deploy

Push to GitHub and import the repo in Vercel, or run `vercel --prod`. The
`vercel.json` in the repo already sets the build command, output directory
and the `/api/*` routing — you shouldn't need to change any build settings in
the dashboard.

### 4. Bring your existing data across (optional)

If you want the students and documents currently in `server/db.json`, run the
migration **once**, from your own machine:

```bash
# pull the two env vars Vercel generated
vercel env pull .env.local

# then, with those loaded:
npm run migrate
```

It uploads every referenced file from `server/uploads/` to Blob, rewrites the
file keys in the records to match, and writes the whole thing to Postgres.

If you'd rather start clean, skip this — the app seeds itself from
`server/seedData.js` on first request.

---

### 5. AI Assistant (optional)

The AI Assistant page works out of the box with a local rule engine, no
setup needed — it only understands a fixed set of question patterns.

To make it answer generic/paraphrased questions too, get a key at
[openrouter.ai/keys](https://openrouter.ai/keys) and add `OPENROUTER_API_KEY`
in Vercel's **Settings → Environment Variables**. Redeploy afterward — like
`DATABASE_URL`, this only takes effect on a new build, not a running one.

Never put a real key in `.env.example`, in a file you commit, or paste it
into a chat/ticket — treat any key that's been exposed that way as
compromised and roll it. Student names are sent to OpenRouter by default,
since the assistant needs to match a real name typed into a question against
the roster — see the comments in `server/aiAssistant.js` if you'd rather
anonymize instead (with the trade-off that name-specific questions stop
working).

If the key is missing, invalid, or OpenRouter is unreachable, the page
silently falls back to the local rule engine rather than showing an error.

---

## Before you push: remove the data files from git

`server/db.json` and `server/uploads/` are currently **tracked in git**, and
`db.json` contains real student records and bcrypt password hashes. The new
`.gitignore` covers them, but git keeps tracking files it already knows about,
so you need to untrack them explicitly:

```bash
git rm -r --cached server/db.json server/uploads dist
git commit -m "Stop tracking local data and build output"
```

The files stay on your disk — this only stops them going to the repository.
If the repo has already been public, treat those passwords as compromised and
use the admin "reset password" actions after deploying.

---

## Things to know about the deployed version

**Upload size is capped at 4 MB.** Vercel limits a serverless function's
request body to 4.5 MB, so the old 15 MB multer limit was unreachable — an
oversized file was rejected by the platform with an opaque error before
Express saw it. The limit is now 4 MB with a clear message. If students need
to submit larger theses, the fix is client-side direct-to-Blob upload
(`@vercel/blob/client`), which bypasses the function entirely; that's a
frontend change to `submitMilestoneDocument` in `src/api/client.js` plus a
token endpoint on the server.

**`.docx` previews are now HTML, not PDF.** LibreOffice isn't available on
Vercel, so the review screen renders a mammoth-converted HTML version. Text,
headings, lists and tables come through; complex page layout, headers/footers
and exact pagination don't. The original file is always still downloadable
from the Download button. Any `.docx` previews that migrated from your old
data are still the LibreOffice PDFs and will keep rendering as PDFs.

**Writes are last-write-wins.** The whole state is one row, read and written
whole, exactly as the JSON file was. Two supervisors saving at the same
instant can overwrite one another. With a handful of users this is very
unlikely to bite; if the app grows, `server/db.js` is the single file to
split into real tables.

**Cold starts.** The first request after a quiet period will be slow (a second
or two) while the function boots and connects. This is normal.

---

## Running locally

Unchanged, except that you now need a database. Put `DATABASE_URL` and
`BLOB_READ_WRITE_TOKEN` in `.env.local` (see `.env.example`), then:

```bash
npm run dev:full
```

You can point `DATABASE_URL` at the same Neon database as production, or
create a second free Neon branch for development so you're not editing live
records.
