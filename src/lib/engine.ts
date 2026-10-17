export type Position = 'GK' | 'DEF' | 'MID' | 'FWD'

export type FixtureRun = {
  gw: number
  opponent: string
  opponentCode: string
  isHome: boolean
  difficulty: number
}

export type Player = {
  id: number
  name: string
  club: string
  clubCode: string
  teamId?: number
  shirt: string
  position: Position
  price: number
  sellPrice?: number
  form: number
  xG: number
  xA: number
  ict: number
  points: number
  selectedBy: number
  change: number
  fdr: number[]
  home: boolean
  upcoming?: FixtureRun[]
  // Live FPL availability / usage metadata
  status?: string
  chance?: number | null
  news?: string
  minutes?: number
  starts?: number
  bonus?: number
  bps?: number
  isLive?: boolean
  livePoints?: number
  // Squad membership metadata
  isStarter?: boolean
  isCaptain?: boolean
  isViceCaptain?: boolean
  pickPosition?: number
}

export type Weights = { form: number; xG: number; xA: number; ict: number }
export type Formation = { def: number; mid: number; fwd: number }

export const formations: Formation[] = [
  { def: 3, mid: 5, fwd: 2 }, { def: 3, mid: 4, fwd: 3 },
  { def: 4, mid: 4, fwd: 2 }, { def: 4, mid: 3, fwd: 3 },
  { def: 5, mid: 3, fwd: 2 }, { def: 5, mid: 4, fwd: 1 },
  { def: 4, mid: 5, fwd: 1 }, { def: 5, mid: 2, fwd: 3 },
]

export const defaultWeights: Weights = { form: 0.35, xG: 0.3, xA: 0.2, ict: 0.15 }

/** Fixture-independent per-match performance score from the tunable model. */
export function baseScore(player: Player, weights: Weights): number {
  const total = weights.form + weights.xG + weights.xA + weights.ict || 1
  return (
    player.form * weights.form +
    player.xG * 12 * weights.xG +
    player.xA * 10 * weights.xA +
    (player.ict / 12) * weights.ict
  ) / total
}

function fixtureFactor(difficulty: number, isHome: boolean): number {
  return 1 + (3 - difficulty) * 0.075 + (isHome ? 0.08 : -0.04)
}

export function expectedPoints(player: Player, weights: Weights): number {
  const fixture = player.fdr[0] ?? 3
  return Math.max(0.2, baseScore(player, weights) * fixtureFactor(fixture, player.home))
}

/** Sums projected points across the player's next `horizon` fixtures. */
export function horizonPoints(player: Player, weights: Weights, horizon = 5): number {
  const base = baseScore(player, weights)
  const runs = player.upcoming?.length
    ? player.upcoming.slice(0, horizon)
    : player.fdr.slice(0, horizon).map((difficulty) => ({ difficulty, isHome: player.home }))
  if (!runs.length) return Math.max(0.2, base)
  return runs.reduce((sum, run) => sum + Math.max(0.2, base * fixtureFactor(run.difficulty, run.isHome)), 0)
}

export function formationName(formation: Formation) {
  return `${formation.def}-${formation.mid}-${formation.fwd}`
}

export function optimizeSquad(squad: Player[], weights: Weights, preferred?: Formation) {
  const keepers = squad.filter((player) => player.position === 'GK').sort((a, b) => expectedPoints(b, weights) - expectedPoints(a, weights))
  const defenders = squad.filter((player) => player.position === 'DEF').sort((a, b) => expectedPoints(b, weights) - expectedPoints(a, weights))
  const midfielders = squad.filter((player) => player.position === 'MID').sort((a, b) => expectedPoints(b, weights) - expectedPoints(a, weights))
  const forwards = squad.filter((player) => player.position === 'FWD').sort((a, b) => expectedPoints(b, weights) - expectedPoints(a, weights))
  const candidates = preferred ? [preferred] : formations
  let best = { formation: candidates[0] || formations[0], starters: [] as Player[], score: -1 }
  for (const formation of candidates) {
    if (keepers.length < 1 || defenders.length < formation.def || midfielders.length < formation.mid || forwards.length < formation.fwd) continue
    const starters = [keepers[0], ...defenders.slice(0, formation.def), ...midfielders.slice(0, formation.mid), ...forwards.slice(0, formation.fwd)]
    const score = starters.reduce((sum, player) => sum + expectedPoints(player, weights), 0)
    if (score > best.score) best = { formation, starters, score }
  }
  const ranked = [...best.starters].sort((a, b) => expectedPoints(b, weights) - expectedPoints(a, weights))
  const benchOutfield = squad.filter((player) => !best.starters.some((starter) => starter.id === player.id) && player.position !== 'GK')
    .sort((a, b) => expectedPoints(b, weights) - expectedPoints(a, weights))
  const benchKeeper = keepers.find((player) => !best.starters.some((starter) => starter.id === player.id))
  return {
    ...best,
    captain: ranked[0],
    viceCaptain: ranked[1],
    bench: [...(benchKeeper ? [benchKeeper] : []), ...benchOutfield],
  }
}

export type TransferIdea = {
  outgoing: Player
  incoming: Player
  gain: number
  cost: number
  horizonOut: number
  horizonIn: number
  injuryExit: boolean
  reason: string
}

const isAvailable = (player: Player) =>
  player.status === undefined || player.status === 'a' || (player.chance ?? 0) >= 75

const isFlagged = (player: Player) =>
  player.status === 'i' || player.status === 'u' || (player.chance ?? 100) < 75

/**
 * Real, transfer-market based suggestions. Candidates are drawn from the full
 * bootstrap player universe (`market`) and always exclude players you already
 * own, so a suggestion can never involve someone in your squad.
 */
export function getTransferIdeas(squad: Player[], market: Player[], weights: Weights, bank: number, horizon = 5, minMinutes = 0) {
  const owned = new Set(squad.map((player) => player.id))
  const clubCounts: Record<string, number> = {}
  for (const player of squad) clubCounts[player.clubCode] = (clubCounts[player.clubCode] || 0) + 1

  const singles: TransferIdea[] = []
  for (const outgoing of squad) {
    const budget = (outgoing.sellPrice ?? outgoing.price) + bank
    const horizonOut = horizonPoints(outgoing, weights, horizon)
    const injuryExit = isFlagged(outgoing)
    for (const incoming of market) {
      if (incoming.position !== outgoing.position) continue
      if (owned.has(incoming.id)) continue
      if (!isAvailable(incoming)) continue
      if ((incoming.minutes ?? 0) < minMinutes) continue
      if (incoming.price > budget) continue
      const resultingClub = (clubCounts[incoming.clubCode] || 0) + (incoming.clubCode === outgoing.clubCode ? 0 : 1)
      if (resultingClub > 3) continue
      const horizonIn = horizonPoints(incoming, weights, horizon)
      const gain = horizonIn - horizonOut
      if (gain <= 0.4 && !injuryExit) continue
      singles.push({
        outgoing,
        incoming,
        gain: Number(gain.toFixed(2)),
        cost: Number((incoming.price - (outgoing.sellPrice ?? outgoing.price)).toFixed(2)),
        horizonOut: Number(horizonOut.toFixed(1)),
        horizonIn: Number(horizonIn.toFixed(1)),
        injuryExit,
        reason: injuryExit
          ? `Exit ${outgoing.name}, who is flagged${outgoing.news ? ` (${outgoing.news})` : ''}. ${incoming.name} adds ${gain > 0 ? '+' : ''}${gain.toFixed(1)} xPts over ${horizon} GWs.`
          : `${incoming.name} projects +${gain.toFixed(1)} xPts over the next ${horizon} GWs versus ${outgoing.name}.`,
      })
    }
  }

  const rankedSingles = singles
    .sort((a, b) => b.gain + (b.injuryExit ? 2 : 0) - (a.gain + (a.injuryExit ? 2 : 0)))
    .slice(0, 6)

  const doubles: Array<{ first: TransferIdea; second: TransferIdea; gain: number; cost: number }> = []
  for (let first = 0; first < singles.length; first += 1) {
    for (let second = first + 1; second < singles.length; second += 1) {
      const a = singles[first]
      const b = singles[second]
      if (a.outgoing.id === b.outgoing.id || a.incoming.id === b.incoming.id) continue
      if (a.outgoing.position === b.outgoing.position) continue
      if (a.incoming.id === b.outgoing.id || b.incoming.id === a.outgoing.id) continue
      const combinedCost = a.cost + b.cost
      const combinedGain = a.gain + b.gain
      if (combinedCost <= bank && combinedGain > 1) {
        doubles.push({ first: a, second: b, gain: Number(combinedGain.toFixed(2)), cost: Number(combinedCost.toFixed(2)) })
      }
    }
  }
  doubles.sort((a, b) => b.gain - a.gain)

  return { singles: rankedSingles, doubles: doubles.slice(0, 4) }
}
