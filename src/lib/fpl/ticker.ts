import type { BootstrapTeam, Fixture } from './data'

export type TickerFixture = {
  opponent: string
  opponentCode: string
  isHome: boolean
  /** Overall FDR from the FPL API (1 easy → 5 hard). */
  difficulty: number
  /** Difficulty for the attacking side. */
  attack: number
  /** Difficulty for the defensive side. */
  defence: number
}

export type TickerCell = {
  gw: number
  fixtures: TickerFixture[]
  isBlank: boolean
  isDouble: boolean
  average: number
}

export type TickerRow = {
  team: BootstrapTeam
  cells: TickerCell[]
  overall: number
  attack: number
  defence: number
}

const round1 = (value: number) => Math.round(value * 10) / 10
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * A full-league fixture ticker: one row per club, one cell per upcoming
 * gameweek, with Blank and Double gameweeks highlighted.
 *
 * Attacking and defensive difficulty are derived from each opponent's actual
 * record. FPL ships every team strength as 0 these days, so we recompute
 * ratings from completed results (goals scored / conceded per match) and fall
 * back to the published FDR when a club has not played yet.
 */
export function buildFixtureTicker(
  teams: BootstrapTeam[],
  fixtures: Fixture[],
  currentGW: number,
  lookahead = 6,
): TickerRow[] {
  const teamMap = new Map(teams.map((team) => [team.id, team]))
  const gameweeks: number[] = []
  for (let gw = currentGW; gw < currentGW + lookahead && gw <= 38; gw += 1) gameweeks.push(gw)

  // Aggregate completed results into per-match scoring / conceding rates.
  const scored = new Map<number, number>()
  const conceded = new Map<number, number>()
  const played = new Map<number, number>()
  for (const fixture of fixtures) {
    if (fixture.team_h_score === null || fixture.team_a_score === null) continue
    played.set(fixture.team_h, (played.get(fixture.team_h) || 0) + 1)
    played.set(fixture.team_a, (played.get(fixture.team_a) || 0) + 1)
    scored.set(fixture.team_h, (scored.get(fixture.team_h) || 0) + fixture.team_h_score)
    scored.set(fixture.team_a, (scored.get(fixture.team_a) || 0) + fixture.team_a_score)
    conceded.set(fixture.team_h, (conceded.get(fixture.team_h) || 0) + fixture.team_a_score)
    conceded.set(fixture.team_a, (conceded.get(fixture.team_a) || 0) + fixture.team_h_score)
  }
  const totalPlayed = [...played.values()].reduce((sum, value) => sum + value, 0)
  const totalScored = [...scored.values()].reduce((sum, value) => sum + value, 0)
  const leagueRate = totalPlayed ? totalScored / totalPlayed : 1.35

  const perMatch = (map: Map<number, number>, id: number) => {
    const games = played.get(id) || 0
    return games ? (map.get(id) || 0) / games : null
  }

  /** How hard it is to attack this opponent (low = leaky defence). */
  const attackDifficulty = (opponentId: number, isHome: boolean, fdr: number) => {
    const opponent = teamMap.get(opponentId)
    const strength = isHome ? opponent?.strength_defence_away : opponent?.strength_defence_home
    if (strength && strength > 0) return strength
    const against = perMatch(conceded, opponentId)
    if (against === null) return fdr
    return clamp(round1(3 + (1 - against / leagueRate) * 2), 1, 5)
  }

  /** How hard it is to keep a clean sheet against this opponent (high = potent attack). */
  const defenceDifficulty = (opponentId: number, isHome: boolean, fdr: number) => {
    const opponent = teamMap.get(opponentId)
    const strength = isHome ? opponent?.strength_attack_away : opponent?.strength_attack_home
    if (strength && strength > 0) return strength
    const forRate = perMatch(scored, opponentId)
    if (forRate === null) return fdr
    return clamp(round1(3 + (forRate / leagueRate - 1) * 2), 1, 5)
  }

  return teams.map((team) => {
    const cells: TickerCell[] = gameweeks.map((gw) => {
      const clubFixtures = fixtures.filter(
        (fixture) => fixture.event === gw && (fixture.team_h === team.id || fixture.team_a === team.id),
      )
      const mapped: TickerFixture[] = clubFixtures.map((fixture) => {
        const isHome = fixture.team_h === team.id
        const opponentId = isHome ? fixture.team_a : fixture.team_h
        const opponent = teamMap.get(opponentId)
        const fdr = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty
        return {
          opponent: opponent?.short_name || 'TBC',
          opponentCode: opponent?.short_name || 'TBC',
          isHome,
          difficulty: fdr,
          attack: attackDifficulty(opponentId, isHome, fdr),
          defence: defenceDifficulty(opponentId, isHome, fdr),
        }
      })
      const average = mapped.length ? round1(mapped.reduce((sum, fixture) => sum + fixture.difficulty, 0) / mapped.length) : 0
      return { gw, fixtures: mapped, isBlank: mapped.length === 0, isDouble: mapped.length > 1, average }
    })

    const allFixtures = cells.flatMap((cell) => cell.fixtures)
    const mean = (pick: (fixture: TickerFixture) => number, fallback: number) =>
      allFixtures.length ? round1(allFixtures.reduce((sum, fixture) => sum + pick(fixture), 0) / allFixtures.length) : fallback

    return {
      team,
      cells,
      overall: mean((fixture) => fixture.difficulty, 5),
      attack: mean((fixture) => fixture.attack, 5),
      defence: mean((fixture) => fixture.defence, 5),
    }
  })
}
