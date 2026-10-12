export type Position = 'GK' | 'DEF' | 'MID' | 'FWD'

export type Player = {
  id: number
  name: string
  club: string
  clubCode: string
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
  isLive?: boolean
  livePoints?: number
  bps?: number
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

export function expectedPoints(player: Player, weights: Weights): number {
  const total = weights.form + weights.xG + weights.xA + weights.ict || 1
  const performance = (
    player.form * weights.form +
    player.xG * 12 * weights.xG +
    player.xA * 10 * weights.xA +
    player.ict / 12 * weights.ict
  ) / total
  const fixture = player.fdr[0] ?? 3
  const fixtureFactor = 1 + (3 - fixture) * 0.075 + (player.home ? 0.08 : -0.04)
  return Math.max(0.2, performance * fixtureFactor)
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

export function getTransferIdeas(squad: Player[], market: Player[], weights: Weights, bank: number) {
  const ownedIds = new Set(squad.map((player) => player.id))
  const ideas = squad.flatMap((outgoing) => market
    .filter((incoming) => incoming.position === outgoing.position && !ownedIds.has(incoming.id) && incoming.price <= (outgoing.sellPrice ?? outgoing.price) + bank)
    .map((incoming) => ({ outgoing, incoming, gain: expectedPoints(incoming, weights) - expectedPoints(outgoing, weights), cost: incoming.price - (outgoing.sellPrice ?? outgoing.price) })))
    .filter((idea) => idea.gain > 0.05)
    .sort((a, b) => b.gain - a.gain)
  const pairs: Array<{ first: typeof ideas[number]; second: typeof ideas[number]; gain: number; cost: number }> = []
  for (let first = 0; first < ideas.length; first += 1) {
    for (let second = first + 1; second < ideas.length; second += 1) {
      const a = ideas[first]
      const b = ideas[second]
      if (a.outgoing.id === b.outgoing.id || a.incoming.id === b.incoming.id || a.outgoing.position === b.outgoing.position) continue
      if (a.cost + b.cost <= bank && a.gain + b.gain > 0) pairs.push({ first: a, second: b, gain: a.gain + b.gain, cost: a.cost + b.cost })
    }
  }
  pairs.sort((a, b) => b.gain - a.gain)
  return { singles: ideas.slice(0, 4), doubles: pairs.slice(0, 4) }
}
