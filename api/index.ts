import dns from 'node:dns'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

// Keep this file self-contained. Vercel transpiles api/*.ts to ESM without
// bundling imports that live outside api/, so importing `../server` at runtime
// fails with ERR_MODULE_NOT_FOUND. server.ts re-exports this app for local dev.

dns.setDefaultResultOrder('ipv4first')

const app = express()
const root = path.dirname(fileURLToPath(import.meta.url))
// On Vercel this function is emitted to /var/task/api while the snapshots from
// `includeFiles` land at /var/task/snapshots, so probe a few likely locations.
const snapshotDir =
  [
    path.join(root, 'snapshots'),
    path.resolve(root, '..', 'snapshots'),
    path.resolve(process.cwd(), 'snapshots'),
  ].find((candidate) => fs.existsSync(candidate)) || path.join(root, 'snapshots')
const fplApiBaseUrl = (process.env.FPL_API_BASE_URL || 'https://fantasy.premierleague.com/api').replace(/\/$/, '')
const cache = new Map<string, { expiresAt: number; body: string; contentType: string }>()
const cacheTtlMs = 7 * 60 * 1000

function readSnapshot(file: string) {
  try {
    return fs.readFileSync(path.join(snapshotDir, file), 'utf8')
  } catch {
    return undefined
  }
}

function fallbackFor(resource: string) {
  const normalized = resource.replace(/^\/+|\/+$/g, '')
  if (normalized === 'bootstrap-static') {
    const bootstrap = JSON.parse(readSnapshot('bootstrap-static.json') || '{}')
    if (!bootstrap.elements?.length) bootstrap.elements = JSON.parse(readSnapshot('demo-elements.json') || '[]')
    return JSON.stringify(bootstrap)
  }
  if (normalized === 'fixtures') return readSnapshot('fixtures.json')

  const entryMatch = normalized.match(/^entry\/(2432|1)(?:\/(history|event\/\d+\/picks))?$/)
  if (!entryMatch) return undefined

  const demo = JSON.parse(readSnapshot(`demo-${entryMatch[1]}.json`) || '{}')
  if (!entryMatch[2]) return JSON.stringify(demo.entry)
  if (entryMatch[2] === 'history') return JSON.stringify(demo.history)
  if (!demo.picks?.picks?.length) {
    const gameweek = Number(entryMatch[2].match(/event\/(\d+)/)?.[1] || 1)
    demo.picks = {
      active_chip: null,
      automatic_subs: [],
      entry_history: { event: gameweek, points: 68, total_points: 412, rank: 68421, bank: 8, value: 1004, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 4 },
      picks: Array.from({ length: 15 }, (_, index) => ({ element: index + 1, position: index + 1, multiplier: index === 7 ? 2 : 1, is_captain: index === 7, is_vice_captain: index === 8 })),
    }
  }
  return JSON.stringify(demo.picks)
}

app.use('/api/fpl/purge-cache', (_req, res) => {
  const entries = cache.size
  cache.clear()
  res.json({ purged: entries, ok: true })
})

app.use('/api/fpl', async (req, res) => {
  const resource = req.path.replace(/^\/+/, '')
  const upstreamUrl = `${fplApiBaseUrl}/${resource}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`
  const key = `${req.method}:${upstreamUrl}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    res.set('Content-Type', cached.contentType).send(cached.body)
    return
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'FPL-sneh/1.0' },
      signal: AbortSignal.timeout(9000),
    })
    if (!upstream.ok) throw new Error(`FPL upstream returned ${upstream.status}`)

    const body = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8'
    const ttl = /^event\/\d+\/live\/?$/.test(resource) ? 15_000 : resource === 'fixtures' ? 60_000 : cacheTtlMs
    cache.set(key, { body, contentType, expiresAt: Date.now() + ttl })
    res.set('Content-Type', contentType).send(body)
  } catch (error) {
    const snapshot = fallbackFor(resource)
    if (snapshot !== undefined) {
      res.set('X-FPL-Source', 'snapshot').type('json').send(snapshot)
      return
    }
    res.status(503).json({
      error: 'The official FPL API is temporarily unavailable.',
      detail: error instanceof Error ? error.message : 'Upstream request failed',
    })
  }
})

// Standalone production server only; Vercel serves the static build itself.
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const distDir = path.resolve(root, '..', 'dist')
  app.use(express.static(distDir, { index: false, fallthrough: true }))
  app.get('*', (req, res) => {
    if (path.extname(req.path)) {
      res.status(404).json({ error: 'Asset not found' })
      return
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
} else if (!process.env.VERCEL) {
  app.get('/', (_req, res) => res.status(200).send('FPL sneh API server is ready. Run the Vite client on port 5173.'))
}

export default app
