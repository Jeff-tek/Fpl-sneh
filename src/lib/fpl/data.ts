import type { FixtureRun, Player, Position } from '../engine'

/* ------------------------------------------------------------------ *
 * Raw FPL API shapes (only the fields we actually consume)
 * ------------------------------------------------------------------ */

export type BootstrapElement = {
  id: number
  web_name: string
  first_name: string
  second_name: string
  team: number
  element_type: number
  now_cost: number
  form: string
  expected_goals: string
  expected_assists: string
  ict_index: string
  total_points: number
  selected_by_percent: string
  cost_change_event: number
  status: string
  chance_of_playing_next_round: number | null
  news: string
  minutes: number
  starts: number
  bonus: number
  bps: number
  goals_scored: number
  assists: number
  clean_sheets: number
  penalties_order: number | null
}

export type BootstrapTeam = {
  id: number
  name: string
  short_name: string
  strength: number
  strength_attack_home: number
  strength_attack_away: number
  strength_defence_home: number
  strength_defence_away: number
}

export type BootstrapEvent = {
  id: number
  name: string
  is_current: boolean
  is_next: boolean
  finished: boolean
  deadline_time: string
}

export type BootstrapChip = {
  name: string
  label: string
  number: number
  start_event: number
  stop_event: number
  chip_type: string
}

export type BootstrapStatic = {
  elements: BootstrapElement[]
  teams: BootstrapTeam[]
  events: BootstrapEvent[]
  chips?: BootstrapChip[]
}

export type Fixture = {
  id: number
  event: number | null
  team_h: number
  team_a: number
  team_h_difficulty: number
  team_a_difficulty: number
  team_h_score: number | null
  team_a_score: number | null
  started: boolean
  finished: boolean
  minutes: number
  kickoff_time: string | null
}

export type Pick = {
  element: number
  position: number
  multiplier: number
  is_captain: boolean
  is_vice_captain: boolean
  selling_price?: number
}

export type PicksResponse = {
  picks: Pick[]
  entry_history?: { event: number; bank: number; value: number; event_transfers_cost?: number }
}

export type Entry = {
  id: number
  name: string
  player_first_name?: string
  player_last_name?: string
  summary_overall_points?: number
  summary_overall_rank?: number
  summary_event_points?: number
  current_event?: number
  last_deadline_bank?: number
  last_deadline_value?: number
}

export type EntryHistory = {
  current: Array<{
    event: number
    points: number
    total_points: number
    bank: number
    value: number
    event_transfers: number
    event_transfers_cost: number
    points_on_bench: number
    rank?: number
    overall_rank?: number
  }>
  chips: Array<{ name: string; event: number; time: string }>
  past: Array<{ season_name: string; total_points: number; rank: number }>
}

export type LiveElement = {
  id: number
  stats: {
    total_points: number
    bonus: number
    bps: number
    minutes: number
    goals_scored: number
    assists: number
    clean_sheets: number
    yellow_cards: number
    red_cards: number
    saves: number
    own_goals: number
    penalties_saved: number
    penalties_missed: number
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const num = (value: string | number | null | undefined): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const positionFromElement = (position: number): Position =>
  (['', 'GK', 'DEF', 'MID', 'FWD'][position] || 'MID') as Position

export function currentGameweek(bootstrap: BootstrapStatic): number {
  const current = bootstrap.events?.find((event) => event.is_current)
  if (current) return current.id
  const next = bootstrap.events?.find((event) => event.is_next)
  if (next) return next.id
  const finished = (bootstrap.events || []).filter((event) => event.finished)
  if (finished.length) return finished[finished.length - 1].id
  return 1
}

export function nextGameweek(bootstrap: BootstrapStatic): number {
  const next = bootstrap.events?.find((event) => event.is_next)
  if (next) return next.id
  const current = bootstrap.events?.find((event) => event.is_current)
  if (current) return Math.min(38, current.id + 1)
  return currentGameweek(bootstrap)
}

function upcomingRuns(fixtures: Fixture[], teamId: number, targetGW: number, teamMap: Map<number, BootstrapTeam>, count = 12): FixtureRun[] {
  return fixtures
    .filter((fixture) => fixture.event != null && fixture.event >= targetGW && (fixture.team_h === teamId || fixture.team_a === teamId))
    .sort((a, b) => (a.event as number) - (b.event as number) || a.id - b.id)
    .slice(0, count)
    .map((fixture) => {
      const isHome = fixture.team_h === teamId
      const opponent = teamMap.get(isHome ? fixture.team_a : fixture.team_h)
      return {
        gw: fixture.event as number,
        opponent: opponent?.name || 'TBC',
        opponentCode: opponent?.short_name || 'TBC',
        isHome,
        difficulty: isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty,
      }
    })
}

/* ------------------------------------------------------------------ *
 * Market + squad builders
 * ------------------------------------------------------------------ */

export function playerFromElement(
  element: BootstrapElement,
  teamMap: Map<number, BootstrapTeam>,
  fixtures: Fixture[],
  targetGW: number,
): Player {
  const team = teamMap.get(element.team)
  const runs = upcomingRuns(fixtures, element.team, targetGW, teamMap)
  const minutes = element.minutes || 0
  // Season expected stats divided by games played, floored at one game. Raw
  // per-90 values are unusable here: FPL reports absurd rates for cameo
  // players (a 3-minute outing can read as 12+ xG/90), which would corrupt
  // every projection. Clamping keeps the model sane for fringe players.
  const matches = Math.max(1, minutes / 90)
  const perGameGoals = clamp(num(element.expected_goals) / matches, 0, 1)
  const perGameAssists = clamp(num(element.expected_assists) / matches, 0, 0.8)
  return {
    id: element.id,
    name: element.web_name,
    club: team?.name || 'Premier League',
    clubCode: team?.short_name || 'PL',
    teamId: element.team,
    shirt: element.web_name.slice(0, 2).toUpperCase(),
    position: positionFromElement(element.element_type),
    price: element.now_cost / 10,
    form: num(element.form),
    xG: perGameGoals,
    xA: perGameAssists,
    ict: num(element.ict_index),
    points: element.total_points || 0,
    selectedBy: num(element.selected_by_percent),
    change: (element.cost_change_event || 0) / 10,
    fdr: runs.length ? runs.map((run) => run.difficulty) : [3, 3, 3, 3, 3],
    home: runs[0]?.isHome ?? false,
    upcoming: runs,
    status: element.status,
    chance: element.chance_of_playing_next_round,
    news: element.news,
    minutes,
    starts: element.starts || 0,
    bonus: element.bonus || 0,
    bps: element.bps || 0,
  }
}

/** Every player in the game, priced and contextualised against upcoming fixtures. */
export function buildMarket(bootstrap: BootstrapStatic, fixtures: Fixture[], targetGW: number): Player[] {
  const teamMap = new Map((bootstrap.teams || []).map((team) => [team.id, team]))
  return (bootstrap.elements || []).map((element) => playerFromElement(element, teamMap, fixtures, targetGW))
}

/** Maps the manager's picks onto the real market universe. */
export function buildSquad(picks: Pick[], market: Player[]): Player[] {
  const byId = new Map(market.map((player) => [player.id, player]))
  return picks
    .map((pick) => {
      const base = byId.get(pick.element)
      if (!base) return undefined
      return {
        ...base,
        sellPrice: pick.selling_price !== undefined ? pick.selling_price / 10 : base.price,
        isStarter: pick.position <= 11,
        isCaptain: pick.is_captain,
        isViceCaptain: pick.is_vice_captain,
        pickPosition: pick.position,
      } as Player
    })
    .filter((player): player is Player => Boolean(player))
}

export function flagsFrom(element: BootstrapElement): { label: string; tone: string } | null {
  if (element.status === 'i') return { label: 'INJ', tone: 'red' }
  if (element.status === 'u') return { label: 'OUT', tone: 'red' }
  if (element.status === 's') return { label: 'SUS', tone: 'red' }
  if (element.status === 'd') return { label: `${element.chance_of_playing_next_round ?? 25}%`, tone: 'amber' }
  if (element.status === 'n') return { label: 'N/A', tone: 'amber' }
  return null
}
