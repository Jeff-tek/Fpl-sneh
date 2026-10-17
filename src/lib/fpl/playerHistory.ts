import { fetchElementSummary, type ElementSummary } from './data'

type History = ElementSummary['history']

/**
 * Per-match history is the only place FPL exposes rolling form, and it costs one
 * request per player. Requests are cached for the session and de-duplicated
 * while in flight, so switching tabs never refetches a squad member and two
 * callers asking for the same player share a single request.
 */
const cache = new Map<number, History>()
const inFlight = new Map<number, Promise<History>>()

export function cachedHistory(id: number): History | undefined {
  return cache.get(id)
}

function start(id: number): Promise<History> {
  const existing = inFlight.get(id)
  if (existing) return existing
  const request = fetchElementSummary(id)
    .then((summary) => summary?.history ?? [])
    .catch<History>(() => [])
    .then((history) => {
      cache.set(id, history)
      inFlight.delete(id)
      return history
    })
  inFlight.set(id, request)
  return request
}

/**
 * Loads histories for `ids` with bounded concurrency, reporting each as it lands
 * so the UI can fill in progressively rather than waiting for the slowest player.
 */
export async function loadHistories(
  ids: number[],
  onEach: (id: number, history: History) => void,
  concurrency = 4,
): Promise<void> {
  const queue = [...new Set(ids)]
  let cursor = 0
  const worker = async () => {
    while (cursor < queue.length) {
      const id = queue[cursor]
      cursor += 1
      onEach(id, await start(id))
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
}
