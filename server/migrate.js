// One-off migration: pushes your existing local data into the new stores.
//
//   node server/migrate.js
//
// Reads server/db.json and server/uploads/ and writes them to Postgres and
// Vercel Blob. Requires DATABASE_URL and BLOB_READ_WRITE_TOKEN in the
// environment (see README-DEPLOY.md). Safe to re-run: it rewrites the same
// single state row, though it will re-upload the files each time.

const fs = require("fs");
const path = require("path");
const { saveDb } = require("./db");
const { putFile } = require("./storage");

const DB_PATH = path.join(__dirname, "db.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".html": "text/html; charset=utf-8",
};

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`No db.json found at ${DB_PATH} — nothing to migrate.`);
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  db.files = db.files || {};

  // Every storedFile key referenced anywhere in the data.
  const referenced = new Set();
  const collect = (submission) => {
    if (!submission) return;
    if (submission.storedFile) referenced.add(submission.storedFile);
    if (submission.previewFile) referenced.add(submission.previewFile);
    (submission.attachments || []).forEach((a) => a.storedFile && referenced.add(a.storedFile));
  };
  (db.students || []).forEach((student) => {
    (student.milestones || []).forEach((milestone) => {
      collect(milestone);
      (milestone.versions || []).forEach(collect);
    });
  });

  console.log(`Found ${referenced.size} referenced file(s) in db.json.`);

  // Old keys are re-uploaded under new blob keys, so every reference has to
  // be rewritten to point at the new key.
  const remap = {};
  for (const oldKey of referenced) {
    const filePath = path.join(UPLOADS_DIR, oldKey);
    if (!fs.existsSync(filePath)) {
      console.warn(`  missing on disk, skipping: ${oldKey}`);
      continue;
    }
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(oldKey).toLowerCase();
    const newKey = await putFile(db, buffer, oldKey, MIME_BY_EXT[ext] || "application/octet-stream");
    remap[oldKey] = newKey;
    console.log(`  uploaded ${oldKey} -> ${newKey}`);
  }

  const rewrite = (submission) => {
    if (!submission) return;
    if (submission.storedFile && remap[submission.storedFile]) {
      submission.storedFile = remap[submission.storedFile];
    }
    if (submission.previewFile && remap[submission.previewFile]) {
      submission.previewFile = remap[submission.previewFile];
    }
    (submission.attachments || []).forEach((a) => {
      if (a.storedFile && remap[a.storedFile]) a.storedFile = remap[a.storedFile];
    });
  };
  (db.students || []).forEach((student) => {
    (student.milestones || []).forEach((milestone) => {
      rewrite(milestone);
      (milestone.versions || []).forEach(rewrite);
    });
  });

  // Old .docx previews were PDFs produced by LibreOffice. They have been
  // uploaded as-is and still render; new uploads get HTML previews instead.

  await saveDb(db);
  console.log(`\nMigrated ${(db.students || []).length} student(s), ` +
    `${(db.supervisors || []).length} supervisor(s), ` +
    `${Object.keys(db.files).length} file(s) into Postgres + Blob.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
