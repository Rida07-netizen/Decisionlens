// Vercel serverless entry point for the DecisionLens API.
//
// vercel.json rewrites every /api/* request here. The Express app already
// mounts its own routes under /api, so the request is passed through
// unchanged and Express does the routing.
//
// The root package.json sets "type": "module", while server/ is CommonJS
// (server/package.json pins it). Importing across that boundary works:
// the CommonJS module.exports arrives as the default export.
import app from "../server/index.js";

export default app;
