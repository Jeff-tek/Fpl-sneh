import { isAvailable, isFlagged, pointsInWindow, type Player, type Weights } from '../engine'
import { HIT_COST, MAX_FREE_TRANSFERS } from './freeTransfers'

/**
 * A move has to beat simply banking the transfer. Because the horizon shrinks
 * every week, this is the bar that stops the planner burning a free transfer on
 * a marginal upgrade it could make next week for the same price.
 */
const MOVE_THRESHOLD = 2
/** How many of the week's best singles are considered for a two-move week. */
const PAIR_POOL = 14
/** Players ranked for a double only if the pair beats the best single by this. */
const PAIR_MARGIN = 1

export type PlanMove = {
  gw: number
  outgoing: Player
  incoming: Player
  /** Points paid for this move: 0 when a free transfer covers it. */
  hit: number
  spend: number
  /** Projected gain across [gw, toGW], already net of the hit. */
  gain: number
}

export type PlanStep = {
  gw: number
  moves: PlanMove[]
  /** Free transfers banked *after* this week's moves, i.e. going into the next. */
  freeTransfers: number
  bank: number
  /** True when the week is deliberately skipped to bank a transfer. */
  rolled: boolean
}

export type TransferPlan = {
  steps: PlanStep[]
  moves: PlanMove[]
  /** Total projected gain once every hit in the plan is paid. */
  totalGain: number
  totalHits: number
  totalSpend: number
  fromGw: number
  toGw: number
  endBank: number
  endFreeTransfers: number
}

type Candidate = {
  outgoing: Player
  incoming: Player
  hit: number
  spend: number
  gain: number
  /** Gain used for ranking - a flagged player is worth exiting sooner. */
  priority: number
}

const clubCounts = (squad: Player[]) => {
  const counts: Record<string, number> = {}
  for (const player of squad) counts[player.clubCode] = (counts[player.clubCode] || 0) + 1
  return counts
}

const maxClubCount = (squad: Player[]) => Math.max(0, ...Object.values(clubCounts(squad)))

/**
 * Sequences transfers across the next `horizon` gameweeks with real free-transfer
 * accumulation and real hit costs.
 *
 * This is a greedy planner, deliberately: each gameweek it takes the move that
 * projects the biggest gain over everything that is left, requires that gain to
 * clear `MOVE_THRESHOLD`, and otherwise rolls the transfer. Greedy is not
 * optimal - a perfect planner would sometimes decline a good move to fund a
 * better one later - but it is transparent, it never recommends a move it cannot
 * pay for, and it never spends a free transfer it does not have. Treat the output
 * as a route to follow and re-plan each week, not as a fixed script.
 */
export function planTransfers({
  squad, market, weights, bank, freeTransfers, currentGW, horizon, minMinutes = 0,
}: {
  squad: Player[]
  market: Player[]
  weights: Weights
  bank: number
  freeTransfers: number
  currentGW: number
  horizon: number
  minMinutes?: number
}): TransferPlan {
  const fromGw = currentGW
  const toGw = currentGW + horizon - 1
  const weeks = Math.max(1, horizon)

  // Every player's projection for each remaining gameweek, plus a suffix sum so
  // the value of a move at any gameweek is an O(1) lookup instead of a re-sum.
  const schedules = new Map<number, { suffix: number[] }>()
  const scheduleFor = (player: Player) => {
    const cached = schedules.get(player.id)
    if (cached) return cached
    const perGw: number[] = []
    for (let gw = fromGw; gw <= toGw; gw += 1) perGw.push(pointsInWindow(player, weights, gw, gw))
    const suffix = new Array<number>(weeks + 1).fill(0)
    for (let index = weeks - 1; index >= 0; index -= 1) suffix[index] = suffix[index + 1] + perGw[index]
    const built = { suffix }
    schedules.set(player.id, built)
    return built
  }
  const valueFrom = (player: Player, index: number) => scheduleFor(player).suffix[Math.min(index, weeks)]

  let squadNow = squad.map((player) => ({ ...player }))
  let bankNow = bank
  let freeNow = Math.max(0, Math.min(MAX_FREE_TRANSFERS, Math.floor(freeTransfers)))
  const steps: PlanStep[] = []
  const moves: PlanMove[] = []
  let totalGain = 0
  let totalHits = 0
  let totalSpend = 0

  for (let gw = fromGw; gw <= toGw; gw += 1) {
    const index = gw - fromGw
    const owned = new Set(squadNow.map((player) => player.id))
    const counts = clubCounts(squadNow)

    const singles: Candidate[] = []
    for (const outgoing of squadNow) {
      const budget = (outgoing.sellPrice ?? outgoing.price) + bankNow
      const outValue = valueFrom(outgoing, index)
      const urgency = isFlagged(outgoing) ? 2 : 0
      for (const incoming of market) {
        if (incoming.position !== outgoing.position) continue
        if (owned.has(incoming.id)) continue
        if (!isAvailable(incoming)) continue
        if ((incoming.minutes ?? 0) < minMinutes) continue
        if (incoming.price > budget) continue
        const clubs = (counts[incoming.clubCode] || 0) + (incoming.clubCode === outgoing.clubCode ? 0 : 1)
        if (clubs > 3) continue
        const gain = valueFrom(incoming, index) - outValue
        const hit = freeNow >= 1 ? 0 : HIT_COST
        if (gain - hit + urgency < MOVE_THRESHOLD) continue
        singles.push({
          outgoing,
          incoming,
          hit,
          spend: incoming.price - (outgoing.sellPrice ?? outgoing.price),
          gain: gain - hit,
          priority: gain - hit + urgency,
        })
      }
    }
    singles.sort((a, b) => b.priority - a.priority)

    const pool = singles.slice(0, PAIR_POOL)
    // Score a whole week's moves in one currency: total priority, less a penalty
    // for each extra free transfer a pair consumes. Maximising this picks a pair
    // only when it genuinely beats the best single.
    const weekScore = (week: Candidate[]) =>
      week.reduce((sum, move) => sum + move.priority, 0) - (week.length - 1) * PAIR_MARGIN
    let best: Candidate[] | null = pool.length ? [pool[0]] : null
    let bestValue = pool.length ? weekScore([pool[0]]) : 0
    // A second move in the same week is only ever free when a second free
    // transfer is actually banked, so pairs are only considered from 2 FT up.
    if (freeNow >= 2 && pool.length > 1) {
      for (let first = 0; first < pool.length; first += 1) {
        for (let second = first + 1; second < pool.length; second += 1) {
          const a = pool[first]
          const b = pool[second]
          if (a.outgoing.id === b.outgoing.id || a.incoming.id === b.incoming.id) continue
          if (a.incoming.id === b.outgoing.id || b.incoming.id === a.outgoing.id) continue
          if (a.spend + b.spend > bankNow) continue
          // Club limits have to hold for the squad that results from *both* moves.
          const projected = [
            ...squadNow.filter((player) => player.id !== a.outgoing.id && player.id !== b.outgoing.id),
            a.incoming,
            b.incoming,
          ]
          if (maxClubCount(projected) > 3) continue
          const value = weekScore([a, b])
          if (value > bestValue) { best = [a, b]; bestValue = value }
        }
      }
    }

    const weekMoves: PlanMove[] = []
    if (best) {
      // Free transfers cover the moves where they exist; anything beyond the
      // bank costs a hit, which the candidate's gain has already paid for.
      const freeUsed = freeNow >= best.length ? best.length : 0
      for (const move of best) {
        const slot = squadNow.findIndex((player) => player.id === move.outgoing.id)
        squadNow[slot] = {
          ...move.incoming,
          sellPrice: move.incoming.price,
          isStarter: move.outgoing.isStarter,
          isCaptain: move.outgoing.isCaptain,
          isViceCaptain: move.outgoing.isViceCaptain,
          pickPosition: move.outgoing.pickPosition,
        }
        bankNow = Number((bankNow - move.spend).toFixed(1))
        totalGain += move.gain
        totalHits += move.hit
        totalSpend += move.spend
        const recorded: PlanMove = {
          gw,
          outgoing: move.outgoing,
          incoming: move.incoming,
          hit: move.hit,
          spend: Number(move.spend.toFixed(1)),
          gain: Number(move.gain.toFixed(2)),
        }
        weekMoves.push(recorded)
        moves.push(recorded)
      }
      freeNow = Math.min(MAX_FREE_TRANSFERS, freeNow - freeUsed + 1)
    } else {
      freeNow = Math.min(MAX_FREE_TRANSFERS, freeNow + 1)
    }

    steps.push({ gw, moves: weekMoves, freeTransfers: freeNow, bank: bankNow, rolled: weekMoves.length === 0 })
  }

  return {
    steps,
    moves,
    totalGain: Number(totalGain.toFixed(1)),
    totalHits,
    totalSpend: Number(totalSpend.toFixed(1)),
    fromGw,
    toGw,
    endBank: bankNow,
    endFreeTransfers: freeNow,
  }
}
