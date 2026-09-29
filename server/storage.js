// File storage for DecisionLens.
//
// This replaces the old `server/uploads/` directory. Multer used to write
// uploaded documents to disk; on Vercel that directory does not survive the
// request, so every download and preview would 404 the moment the student
// left the page. Uploads now go to Vercel Blob.
//
// The store this project is connected to is PRIVATE (Vercel now creates
// Blob stores private by default). A private object's URL is not fetchable
// on its own — every read needs the same read-write token used to write it,
// passed as a Bearer header. That's fine here: the frontend never uses a
// Blob URL directly, it only calls our own /file, /view and /attachments
// routes, and those already proxy the bytes through the server (see
// index.js) rather than redirecting the browser to Blob. So the only place
// that needs to change for a private store is this file.
//
// A "storedFile" is still just an opaque key string, exactly as before, so
// the records in the database keep their existing shape. The key -> private
// URL mapping is kept in db.files, because Vercel Blob adds a random suffix
// to pathnames and the resulting URL cannot be reconstructed from the key.

const crypto = require("crypto");
const { put, del, get } = require("@vercel/blob");

const PREFIX = "decisionlens";

function newKey(originalName = "") {
  const ext = (originalName.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
  return `${crypto.randomBytes(16).toString("hex")}${ext}`;
}

function readToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Create a Blob store in the Vercel dashboard (Storage → Create → Blob) and connect it to this project."
    );
  }
  return token;
}

// Uploads a buffer and records its URL in db.files. Returns the storage key.
async function putFile(db, buffer, originalName, contentType) {
  const key = newKey(originalName);
  const blob = await put(`${PREFIX}/${key}`, buffer, {
    access: "private",
    contentType: contentType || "application/octet-stream",
    addRandomSuffix: true,
    token: readToken(),
  });
  db.files = db.files || {};
  db.files[key] = blob.url;
  return key;
}

function fileUrl(db, key) {
  if (!key) return null;
  return (db.files && db.files[key]) || null;
}

// A private blob's URL only returns data through the SDK's get(), which
// authenticates the request with the read-write token — an unauthenticated
// fetch (or a browser hitting the URL directly) gets a 403.
async function getFileBuffer(db, key) {
  const url = fileUrl(db, key);
  if (!url) return null;
  let result;
  try {
    result = await get(url, { access: "private", token: readToken() });
  } catch {
    return null; // not found, or the blob was deleted out from under us
  }
  if (!result || !result.stream) return null;
  const chunks = [];
  for await (const chunk of result.stream) chunks.push(chunk);
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

async function deleteFile(db, key) {
  const url = fileUrl(db, key);
  if (!url) return;
  try {
    await del(url, { token: readToken() });
  } catch {
    // Already gone, or the store rejected it — not worth failing the
    // surrounding request over a stale file.
  }
  delete db.files[key];
}

module.exports = { putFile, fileUrl, getFileBuffer, deleteFile };
