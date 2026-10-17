import type { IncomingMessage, ServerResponse } from 'node:http'

// Vercel's `[...path]` catch-all only matches a single path segment for
// non-Next.js projects, so /api/fpl/entry/1/ would never reach a catch-all
// function. Instead this single function is reached via the explicit
// "/api/(.*)" -> "/api/index" rewrite in vercel.json, and Vercel preserves the
// original req.url, so the Express app mounted on `/api/fpl` still routes it.
//
// The app is imported lazily so any module-load failure is reported as JSON
// instead of an opaque FUNCTION_INVOCATION_FAILED.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const server = await import('../server')
    return server.default(req as never, res as never)
  } catch (error) {
    const err = error as Error
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        proxyInitError: true,
        name: err?.name,
        message: err?.message ?? String(error),
        stack: err?.stack?.split('\n').slice(0, 6),
      })
    )
  }
}
