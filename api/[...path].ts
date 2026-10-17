import app from '../server'

// Vercel maps `api/[...path].ts` to `/api/*`, so the Express app in server.ts
// (mounted on `/api/fpl`) handles every proxied FPL request in production.
export default app
