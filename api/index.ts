import app from '../server'

// Vercel's `[...path]` catch-all only matches a single path segment for
// non-Next.js projects, so /api/fpl/entry/1/ would never reach a catch-all
// function. Instead this single function is reached via the explicit
// "/api/(.*)" -> "/api/index" rewrite in vercel.json, and Vercel preserves the
// original req.url, so the Express app mounted on `/api/fpl` still routes it.
export default app
