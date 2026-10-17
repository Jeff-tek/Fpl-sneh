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
  // Price-change and transfer flow. FPL does not publish the thresholds that
  // trigger a rise or a fall, so these are used to *rank* pressure rather than
  // to promise a change.
  cost_change_start?: number
  cost_change_start_fall?: number
  transfers_in_event?: number
  transfers_out_event?: number
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
  // Defensive-contribution inputs (2026/27 scores 2 pts for 10+ CBIT as a
  // defender, or 12+ including recoveries as a midfielder/forward).
  clearances_blocks_interceptions?: number
  tackles?: number
  recoveries?: number
  saves?: number
  expected_goals_conceded?: string | number
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
  /** Number of managers playing - the denominator for ownership pressure. */
  total_players?: number
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

function upcomingRuns(fixtures: Fixture[], teamId: number, targetGW: number, teamMap: Map<number, BootstrapTeam>, count = 20): FixtureRun[] {
  // Twenty fixtures, not twelve: the planner works in gameweeks, and a run of
  // double gameweeks would exhaust a fixture-counted list before the gameweek
  // window is covered, silently projecting zero for the weeks it ran out on.
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

/** Poisson tail P(X >= k) for a per-match action rate. */
function poissonAtLeast(lambda: number, k: number): number {
  if (!(lambda > 0)) return 0
  let cdf = 0
  let term = Math.exp(-lambda)
  for (let i = 0; i < k; i += 1) {
    cdf += term
    term *= lambda / (i + 1)
  }
  return clamp(1 - cdf, 0, 1)
}

export type DefensiveExpectation = {
  defconPoints: number
  cleanSheetPoints: number
  concededPoints: number
  savePoints: number
  bonusPoints: number
}

/**
 * Per-match expected value of the point sources an attacking model can't see:
 * defensive contributions, clean sheets, goals-conceded deductions, saves and
 * bonus. Everything is divided by *club matches played* rather than by the
 * player's own minutes, so rotation risk and cameo appearances are priced in
 * automatically (a 20-minute-a-week bench player cannot look like a nailed 90).
 */
export function defensiveExpectation(element: BootstrapElement, games: number, position: Position): DefensiveExpectation {
  const played = Math.max(1, games)
  const minutes = num(element.minutes)
  // Share of available minutes actually played - the gate for clean-sheet
  // points, which must not accrue to someone who never gets on the pitch.
  const playFactor = clamp(minutes / (played * 90), 0, 1)
  const concededPerGame = num(element.expected_goals_conceded) / played
  const keeper = position === 'GK'
  const defender = position === 'DEF'

  const defconThreshold = defender ? 10 : 12
  const defconActions = defender
    ? num(element.clearances_blocks_interceptions) + num(element.tackles)
    : num(element.clearances_blocks_interceptions) + num(element.tackles) + num(element.recoveries)
  // Defensive-contribution and bonus rates are the noisiest inputs we have, so
  // shrink them towards zero until the sample is large enough to trust.
  const reliability = played / (played + 3)
  const defconPoints = keeper ? 0 : 2 * poissonAtLeast(defconActions / played, defconThreshold) * reliability

  const cleanSheetValue = keeper || defender ? 4 : position === 'MID' ? 1 : 0
  const cleanSheetPoints = cleanSheetValue * Math.exp(-concededPerGame) * playFactor
  const concededPoints = keeper || defender ? -concededPerGame / 2 : 0
  const savePoints = keeper ? num(element.saves) / played / 3 : 0
  // Bonus is lumpy in small samples, so damp it: one 3-bonus haul should not
  // dominate a projection the way an underlying rate would.
  const bonusPoints = 0.75 * Math.min(1.2, num(element.bonus) / played) * reliability

  return { defconPoints, cleanSheetPoints, concededPoints, savePoints, bonusPoints }
}

export function playerFromElement(
  element: BootstrapElement,
  teamMap: Map<number, BootstrapTeam>,
  fixtures: Fixture[],
  targetGW: number,
  teamGames?: Map<number, number>,
  totalPlayers = 0,
): Player {
  const team = teamMap.get(element.team)
  const runs = upcomingRuns(fixtures, element.team, targetGW, teamMap)
  const minutes = element.minutes || 0
  const position = positionFromElement(element.element_type)
  const teamGameCount = teamGames?.get(element.team)
    ?? fixtures.filter((fixture) => fixture.finished && (fixture.team_h === element.team || fixture.team_a === element.team)).length
  // One denominator for the whole model: matches the club has actually played.
  // Dividing each rate by the player's *own* minutes instead made cameo
  // appearances look elite - a 72-minute sample reads as 14.9 ICT and 0.79 xG
  // per 90, neither of which means anything. Per club match, a fringe player is
  // priced for the game time he actually gets. Falls back to the player's own
  // 90s when the fixture list is unavailable, so a missing schedule can never
  // collapse the denominator to one and inflate a whole season.
  const games = teamGameCount > 0 ? teamGameCount : Math.max(1, minutes / 90)
  const per90s = Math.max(1, minutes / 90)
  const defensive = defensiveExpectation(element, games, position)
  // FPL's form is points per appearance, so it is scaled by the share of a match
  // the player is actually on the pitch for. Otherwise a substitute with one
  // big cameo is projected as if he plays ninety minutes every week. This is
  // deliberately approximate - a 45-minute player does not score exactly half
  // of a 90-minute player's points - but it stops part-time players being
  // ranked as if they were nailed starters.
  const appearanceShare = teamGameCount > 0 ? clamp(minutes / (teamGameCount * 60), 0, 1) : 1
  const transfersIn = num(element.transfers_in_event)
  const transfersOut = num(element.transfers_out_event)
  const netTransfers = transfersIn - transfersOut
  const owners = totalPlayers > 0 ? (num(element.selected_by_percent) / 100) * totalPlayers : 0
  return {
    id: element.id,
    name: element.web_name,
    club: team?.name || 'Premier League',
    clubCode: team?.short_name || 'PL',
    teamId: element.team,
    shirt: element.web_name.slice(0, 2).toUpperCase(),
    position,
    price: element.now_cost / 10,
    form: num(element.form),
    formPerMatch: num(element.form) * appearanceShare,
    appearanceShare,
    xG: clamp(num(element.expected_goals) / games, 0, 1),
    xA: clamp(num(element.expected_assists) / games, 0, 0.8),
    xG90: clamp(num(element.expected_goals) / per90s, 0, 1.5),
    xA90: clamp(num(element.expected_assists) / per90s, 0, 1.2),
    ict: num(element.ict_index) / games,
    ictSeason: num(element.ict_index),
    points: element.total_points || 0,
    selectedBy: num(element.selected_by_percent),
    change: (element.cost_change_event || 0) / 10,
    priceChangeStart: num(element.cost_change_start) / 10,
    transfersIn,
    transfersOut,
    netTransfers,
    ownershipPressure: owners > 0 ? (netTransfers / owners) * 100 : 0,
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
    teamGames: teamGameCount,
    ...defensive,
  }
}

/** Every player in the game, priced and contextualised against upcoming fixtures. */
export function buildMarket(bootstrap: BootstrapStatic, fixtures: Fixture[], targetGW: number): Player[] {
  const teamMap = new Map((bootstrap.teams || []).map((team) => [team.id, team]))
  // Games each club has completed - the denominator for every per-match rate.
  const teamGames = new Map<number, number>()
  for (const team of bootstrap.teams || []) teamGames.set(team.id, 0)
  for (const fixture of fixtures) {
    if (!fixture.finished) continue
    teamGames.set(fixture.team_h, (teamGames.get(fixture.team_h) || 0) + 1)
    teamGames.set(fixture.team_a, (teamGames.get(fixture.team_a) || 0) + 1)
  }
  return (bootstrap.elements || []).map((element) => playerFromElement(element, teamMap, fixtures, targetGW, teamGames, bootstrap.total_players || 0))
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

export type ElementSummary = {
  history: Array<{
    round: number
    total_points: number
    minutes: number
    was_home: boolean
    opponent_team?: number
    goals_scored?: number
    assists?: number
    clean_sheets?: number
    goals_conceded?: number
    bonus?: number
    bps?: number
    starts?: number
    expected_goals?: string | number
    expected_assists?: string | number
    expected_goal_involvements?: string | number
    /** Price at that gameweek, in tenths of a million. */
    value?: number
    /**
     * Raw CBIT count (clearances + blocks + interceptions + tackles, plus
     * recoveries for midfielders and forwards) - NOT the awarded points. The
     * two bonus points land when a defender reaches 10 or a midfielder or
     * forward reaches 12, so the threshold is applied on read.
     */
    defensive_contribution?: number
  }>
}

/**
 * Real per-match points for a single player. FPL's "form" is a smoothed 30-day
 * average, so the only way to show an honest trend is the element summary
 * endpoint - one request, fired when the player card is opened.
 */
export async function fetchElementSummary(id: number): Promise<ElementSummary | null> {
  try {
    const response = await fetch(`/api/fpl/element-summary/${id}/`)
    if (!response.ok) return null
    const payload = (await response.json()) as Partial<ElementSummary>
    if (!Array.isArray(payload.history)) return null
    return { history: payload.history }
  } catch {
    return null
  }
}
