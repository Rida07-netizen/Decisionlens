// Persistent store for DecisionLens.
//
// This replaces the old `db.json` file. On Vercel the filesystem is
// read-only (apart from /tmp, which is wiped between invocations), so
// writing the database to disk meant every signup, student, milestone and
// comment silently disappeared. The whole application state now lives in a
// single JSONB row in Postgres instead.
//
// The document SHAPE is unchanged: loadDb() still returns
// { students, interventions, supervisors, admins, notifications, files }
// exactly as before, so all the existing route logic works untouched. Only
// the read and write are now async.
//
// Concurrency note: this is a read-modify-write of one row, so two writes
// landing in the same instant can overwrite each other (last write wins) —
// the same behaviour the old file store had. For a supervision app with a
// handful of concurrent users that is fine. If it ever needs to scale past
// that, this is the file to split into real tables.

const { neon } = require("@neondatabase/serverless");
const seed = require("./seedData");

const STATE_ID = "main";

let sqlClient = null;
function sql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Add your Neon/Vercel Postgres connection string to the environment."
      );
    }
    sqlClient = neon(url);
  }
  return sqlClient;
}

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await sql()`
    CREATE TABLE IF NOT EXISTS app_state (
      id   TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  tableReady = true;
}

function initialState() {
  return {
    students: seed.students,
    interventions: seed.interventions,
    supervisors: seed.supervisors,
    admins: seed.admins,
    notifications: [],
    // Maps a stored file key -> its Vercel Blob URL. See server/storage.js.
    files: {},
  };
}

async function loadDb() {
  await ensureTable();
  const rows = await sql()`SELECT data FROM app_state WHERE id = ${STATE_ID}`;

  if (rows.length === 0) {
    const initial = initialState();
    await saveDb(initial);
    return initial;
  }

  const db = rows[0].data;
  let migrated = migrate(db);
  if (migrated) await saveDb(db);
  return db;
}

async function saveDb(db) {
  await ensureTable();
  await sql()`
    INSERT INTO app_state (id, data, updated_at)
    VALUES (${STATE_ID}, ${JSON.stringify(db)}::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `;
}

// All the shape migrations that used to live inside loadDb() in index.js.
// Returns true when something changed and the record needs writing back.
function migrate(db) {
  let changed = false;

  if (!db.supervisors) {
    const legacyProfile = db.profile || seed.supervisors[0];
    db.supervisors = [{ id: "sup-001", passwordHash: null, ...legacyProfile }];
    (db.students || []).forEach((s) => {
      if (!s.supervisorId) s.supervisorId = "sup-001";
    });
    delete db.profile;
    changed = true;
  }
  if (!db.admins) { db.admins = seed.admins; changed = true; }
  if (!db.notifications) { db.notifications = []; changed = true; }
  if (!db.students) { db.students = []; changed = true; }
  if (!db.interventions) { db.interventions = []; changed = true; }
  if (!db.files) { db.files = {}; changed = true; }

  db.students.forEach((student) => {
    // Self-registered students (no supervisor pre-added them) request a
    // supervisor from inside their portal; older records predate that flow.
    if (student.requestedSupervisorId === undefined) {
      student.requestedSupervisorId = null;
      changed = true;
    }
    if (student.requestStatus === undefined) {
      student.requestStatus = null;
      changed = true;
    }
    // Roll No. was dropped as a field entirely.
    if ("rollNo" in student) {
      delete student.rollNo;
      changed = true;
    }
    // "active" | "completed" — completed students drop off the main
    // dashboard/roster but stay viewable from the History page.
    if (student.status === undefined) { student.status = "active"; changed = true; }
    if (student.pastDegrees === undefined) { student.pastDegrees = []; changed = true; }
    if (student.statusLog === undefined) { student.statusLog = []; changed = true; }

    (student.milestones || []).forEach((milestone) => {
      if (typeof milestone.published !== "boolean") {
        milestone.published = false;
        changed = true;
      }
      if (!Array.isArray(milestone.versions)) {
        milestone.versions = [];
        changed = true;
      }

      // A submission date by itself is not a submission.
      const hasEvidence = Boolean(
        milestone.storedFile ||
        milestone.githubLink ||
        (Array.isArray(milestone.attachments) && milestone.attachments.length > 0)
      );
      if (milestone.submitted && !hasEvidence) {
        milestone.submitted = null;
        changed = true;
      }

      if (typeof milestone.allowResubmit !== "boolean") {
        milestone.allowResubmit = false;
        changed = true;
      }
    });
  });

  return changed;
}

module.exports = { loadDb, saveDb, initialState };
