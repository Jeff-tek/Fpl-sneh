import { defaultWeights, expectedPoints, type Player, type Weights } from '../engine'
import type { BootstrapChip, BootstrapEvent, EntryHistory, Fixture } from './data'

export type ChipRecommendation = 'USE_THIS_GW' | 'CONSIDER_NOW' | 'SAVE_FOR_LATER' | 'ALREADY_PLAYED'

export type ChipAdvice = {
  name: string
  label: string
  tone: string
  recommendation: ChipRecommendation
  statusText: string
  bestGW?: number
  reasoning: string
}

export type SquadHealth = {
  score: number
  grade: 'A+' | 'A' | 'B' | 'C' | 'D'
  injured: number
  doubtful: number
  benchXPts: number
  clubConcentration: Array<{ club: string; count: number }>
  notes: string[]
}

const TONES: Record<string, string> = {
  wildcard: 'lime',
  freehit: 'coral',
  'free hit': 'coral',
  bboost: 'blue',
  'bench boost': 'blue',
  '3xc': 'gold',
  'triple captain': 'gold',
}

const LABELS: Record<string, string> = {
  wildcard: 'Wildcard',
  freehit: 'Free Hit',
  'free hit': 'Free Hit',
  bboost: 'Bench Boost',
  'bench boost': 'Bench Boost',
  '3xc': 'Triple Captain',
  'triple captain': 'Triple Captain',
}

const cleanChipName = (name: string) => name.replace(/_/g, ' ').toLowerCase()

function scanGameweeks(fixtures: Fixture[], currentGW: number, span = 8) {
  const doubles: number[] = []
  const blanks: number[] = []
  for (let gw = currentGW; gw <= Math.min(38, currentGW + span); gw += 1) {
    const count = fixtures.filter((fixture) => fixture.event === gw).length
    if (count > 10) doubles.push(gw)
    if (count > 0 && count < 10) blanks.push(gw)
  }
  return { doubles, blanks }
}

const isFlagged = (player: Player) => player.status === 'i' || player.status === 'u' || (player.chance ?? 100) < 75

export function evaluateChips(
  chipRules: BootstrapChip[],
  usedChips: EntryHistory['chips'],
  currentGW: number,
  fixtures: Fixture[],
  squad: Player[],
  _events: BootstrapEvent[],
  weights: Weights = defaultWeights,
): ChipAdvice[] {
  const used = new Set(usedChips.map((chip) => cleanChipName(chip.name)))
  const { doubles, blanks } = scanGameweeks(fixtures, currentGW)
  const nextDouble = doubles[0]
  const nextBlank = blanks[0]

  const flagged = squad.filter(isFlagged).length
  const bench = squad.filter((player) => player.isStarter === false)
  const benchXPts = bench.reduce((sum, player) => sum + expectedPoints(player, weights), 0)
  const premiumCaptain = squad
    .filter((player) => player.price >= 8.5)
    .sort((a, b) => b.form - a.form)[0]

  const rules = chipRules.length
    ? chipRules
    : [
        { name: 'wildcard', label: 'Wildcard', number: 1, start_event: 1, stop_event: 19, chip_type: 'team' },
        { name: 'freehit', label: 'Free Hit', number: 1, start_event: 1, stop_event: 19, chip_type: 'team' },
        { name: 'bboost', label: 'Bench Boost', number: 1, start_event: 1, stop_event: 19, chip_type: 'team' },
        { name: '3xc', label: 'Triple Captain', number: 1, start_event: 1, stop_event: 19, chip_type: 'team' },
      ]

  return rules.map((rule) => {
    const key = cleanChipName(rule.name)
    const label = LABELS[key] || rule.label || rule.name
    const tone = TONES[key] || 'lime'
    const available = !used.has(key) && rule.stop_event >= currentGW

    if (used.has(key)) {
      const playedAt = usedChips.find((chip) => cleanChipName(chip.name) === key)
      return {
        name: key,
        label,
        tone,
        recommendation: 'ALREADY_PLAYED' as const,
        statusText: playedAt ? `Played GW${playedAt.event}` : 'Played',
        reasoning: 'Already used this half of the season. It returns after the next chip reset.',
      }
    }

    if (!available) {
      return {
        name: key,
        label,
        tone,
        recommendation: 'ALREADY_PLAYED' as const,
        statusText: 'Expired',
        reasoning: `The window for this chip closed after GW${rule.stop_event}.`,
      }
    }

    if (key === 'wildcard') {
      if (flagged >= 3) {
        return {
          name: key, label, tone, recommendation: 'CONSIDER_NOW', statusText: 'Consider now',
          reasoning: `${flagged} players are flagged. A wildcard lets you rebuild without points hits.`,
        }
      }
      return {
        name: key, label, tone, recommendation: 'SAVE_FOR_LATER',
        bestGW: nextDouble ?? undefined, statusText: nextDouble ? `Target GW${nextDouble}` : 'Save',
        reasoning: nextDouble
          ? `Hold for the Double in GW${nextDouble} to reshape around the extra fixtures.`
          : 'Your squad is healthy — save the wildcard for a fixture swing or injury crisis.',
      }
    }

    if (key === 'free hit') {
      return {
        name: key, label, tone,
        recommendation: nextBlank === currentGW ? 'USE_THIS_GW' : 'SAVE_FOR_LATER',
        bestGW: nextBlank ?? undefined,
        statusText: nextBlank ? `Blank GW${nextBlank}` : 'Save',
        reasoning: nextBlank
          ? `A reduced slate lands in GW${nextBlank}. A Free Hit covers blanks without disrupting your squad.`
          : 'No blanks in range yet. Hold it for a reduced gameweek.',
      }
    }

    if (key === 'bench boost') {
      if (benchXPts >= 16) {
        return {
          name: key, label, tone, recommendation: 'CONSIDER_NOW', statusText: 'Bench is strong',
          reasoning: `Your bench projects ≈${benchXPts.toFixed(1)} xPts — strong enough to boost now.`,
        }
      }
      return {
        name: key, label, tone, recommendation: 'SAVE_FOR_LATER',
        bestGW: nextDouble ?? undefined, statusText: nextDouble ? `Target GW${nextDouble}` : 'Save',
        reasoning: nextDouble
          ? `Save for the GW${nextDouble} Double so all 15 players have fixtures.`
          : 'Your bench is light. Build depth before using Bench Boost.',
      }
    }

    // Triple captain
    return {
      name: key, label, tone,
      recommendation: nextDouble && premiumCaptain ? 'SAVE_FOR_LATER' : 'CONSIDER_NOW',
      bestGW: nextDouble ?? undefined,
      statusText: nextDouble ? `Target GW${nextDouble}` : 'Available',
      reasoning: premiumCaptain
        ? `Triple Captain works best on a premium double. Your leading premium is ${premiumCaptain.name}${nextDouble ? ` — target GW${nextDouble}.` : '.'}`
        : 'No premium in your squad yet; save Triple Captain for a double gameweek.',
    }
  })
}

export function evaluateSquadHealth(squad: Player[], bank: number, events: BootstrapEvent[], currentGW: number, weights: Weights = defaultWeights): SquadHealth {
  const injured = squad.filter((player) => player.status === 'i' || player.status === 'u').length
  const doubtful = squad.filter((player) => player.status === 'd' || (player.chance ?? 100) < 75).length
  const bench = squad.filter((player) => player.isStarter === false)
  const benchXPts = Number(bench.reduce((sum, player) => sum + expectedPoints(player, weights), 0).toFixed(1))

  const clubCounts: Record<string, number> = {}
  for (const player of squad) clubCounts[player.clubCode] = (clubCounts[player.clubCode] || 0) + 1
  const clubConcentration = Object.entries(clubCounts)
    .map(([club, count]) => ({ club, count }))
    .sort((a, b) => b.count - a.count)

  let score = 100
  score -= injured * 12
  score -= doubtful * 5
  score -= Math.max(0, 10 - benchXPts) * 2
  score -= Math.max(0, (clubConcentration[0]?.count || 0) - 3) * 6
  score = Math.max(10, Math.min(100, Math.round(score)))

  const grade: SquadHealth['grade'] = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 68 ? 'B' : score >= 55 ? 'C' : 'D'

  const notes: string[] = []
  if (injured) notes.push(`${injured} injured player${injured > 1 ? 's' : ''} need attention`)
  if (doubtful) notes.push(`${doubtful} flagged doubt${doubtful > 1 ? 's' : ''} this week`)
  if (clubConcentration[0]?.count >= 3) notes.push(`Heavy ${clubConcentration[0].club} exposure (${clubConcentration[0].count})`)
  if (benchXPts < 8) notes.push('Bench offers little cover')
  if (bank > 2) notes.push(`£${bank.toFixed(1)}m sat in the bank`)
  if (!notes.length) notes.push('Squad is in excellent shape for the run ahead')

  const remaining = events.filter((event) => !event.finished && event.id >= currentGW).length
  if (remaining && remaining <= 3) notes.push('Season run-in — manage minutes risk')

  return { score, grade, injured, doubtful, benchXPts, clubConcentration, notes }
}
