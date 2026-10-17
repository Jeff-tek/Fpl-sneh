import type { Player } from '../engine'
import type { EntryHistory } from './data'

export type PriceRadar = {
  /** Strongest upward transfer pressure this gameweek. */
  rising: Player[]
  /** Strongest downward pressure - value at risk. */
  falling: Player[]
  /** Squad members under the heaviest downward pressure. */
  atRisk: Player[]
}

/**
 * Who the market is buying and selling right now, and what that means for your
 * squad.
 *
 * FPL does not publish the algorithm or the thresholds behind a price change, so
 * this deliberately stops short of predicting one. It reports the observable
 * input instead: net transfers this gameweek. Ranking is by absolute volume,
 * because that is what actually moves a price - a 0.1%-owned player can gain
 * every one of his owners and still not shift, which a pure ownership-relative
 * ratio would hide. `ownershipPressure` is carried alongside as context, since
 * the number of transfers needed does scale with how widely a player is held.
 */
export function buildPriceRadar(market: Player[], squadIds: Set<number>, limit = 4, floor = 1000): PriceRadar {
  const byNet = (a: Player, b: Player) => (b.netTransfers ?? 0) - (a.netTransfers ?? 0)
  const moving = market.filter((player) => Math.abs(player.netTransfers ?? 0) >= floor)
  const mine = market
    .filter((player) => squadIds.has(player.id) && (player.netTransfers ?? 0) < 0)
    .sort(byNet)
    .reverse()
  return {
    rising: moving.filter((player) => (player.netTransfers ?? 0) > 0).sort(byNet).slice(0, limit),
    falling: moving.filter((player) => (player.netTransfers ?? 0) < 0).sort(byNet).slice(-limit).reverse(),
    atRisk: mine.slice(0, limit),
  }
}

export type TeamValue = {
  /** Reported squad value plus bank, in millions. */
  total: number
  /** Change since the first recorded gameweek, in millions. */
  gained: number
  /** False when there is no usable history and `total` is a local estimate. */
  known: boolean
}

/**
 * FPL's own team value for the most recently *completed* gameweek: reported squad
 * value plus bank, both straight from the entry history.
 *
 * Recomputing it from today's prices instead would quietly restate history every
 * time the market moved, and would also count a player you are about to sell at a
 * price you will never receive. Only completed gameweeks are used, because the
 * in-progress row is written before its price changes finish landing.
 */
export function teamValueFrom(history: EntryHistory | null, gameweek: number, fallback: number): TeamValue {
  const rows = (history?.current ?? []).filter((row) => row.event < gameweek && row.value)
  const latest = rows[rows.length - 1]
  if (!latest) return { total: fallback, gained: 0, known: false }
  const total = (latest.value + latest.bank) / 10
  const start = rows[0] ? (rows[0].value + rows[0].bank) / 10 : total
  return { total, gained: Number((total - start).toFixed(1)), known: true }
}
