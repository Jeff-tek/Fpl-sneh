import type { EntryHistory } from './data'

export const HIT_COST = 4
export const MAX_FREE_TRANSFERS = 5

export type FreeTransferState = {
  /** Free transfers banked for the next deadline. */
  available: number
  /** False when there is no history to derive it from (pre-season or demo squad). */
  known: boolean
  /** Hits paid in the most recent finished gameweek. */
  lastHit: number
}

/**
 * FPL never publishes your saved free transfers, so they have to be derived.
 * Start on one, gain one per deadline, spend one per free transfer made, bank
 * up to five. Wildcard and Free Hit gameweeks do not consume saved transfers,
 * and free transfers are spent before hits - so paid moves (inferred from
 * `event_transfers_cost`, 4 points each) never eat into the bank.
 */
export function deriveFreeTransfers(history: EntryHistory | null, currentGameweek: number): FreeTransferState {
  const rows = history?.current ?? []
  if (!rows.length) return { available: 1, known: false, lastHit: 0 }

  const chipEvents = new Map<number, string>((history?.chips ?? []).map((chip) => [chip.event, chip.name]))
  const byEvent = new Map(rows.map((row) => [row.event, row]))
  const events = rows.map((row) => row.event)
  const first = Math.min(...events)
  // Never consume a row for a gameweek that is still being played.
  const last = Math.min(currentGameweek - 1, Math.max(...events))

  let free = 1
  let lastHit = 0
  for (let event = first; event <= last; event += 1) {
    const row = byEvent.get(event)
    if (event === last) lastHit = Math.round((row?.event_transfers_cost ?? 0) / HIT_COST)
    const chip = chipEvents.get(event)
    if (chip === 'wildcard' || chip === 'freehit') continue
    const hits = Math.round((row?.event_transfers_cost ?? 0) / HIT_COST)
    const used = Math.max(0, (row?.event_transfers ?? 0) - hits)
    free = Math.min(MAX_FREE_TRANSFERS, Math.max(1, free - used) + 1)
  }
  return { available: free, known: true, lastHit }
}
