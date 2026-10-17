import type { Position } from '../engine'
import type { ElementSummary } from './data'

export type FormVerdict = 'under' | 'over' | 'level'

export type FormRead = {
  /** Appearances in the window (rows with minutes on the pitch). */
  games: number
  minutes: number
  points: number
  pointsPerGame: number
  /** Expected goal involvements: xG + xA across the window. */
  xgi: number
  /** Actual goal involvements: goals + assists. */
  returns: number
  /**
   * Returns minus expected returns. Positive means he is living off
   * over-performance (a sell-high candidate); negative means he is generating
   * chances and not converting them (a hold, or a buy-low).
   */
  overperformance: number
  /** Matches where he cleared the defensive-contribution threshold. */
  defconHits: number
  verdict: FormVerdict
  note: string
}

/** The CBIT count that scores two points, by position. Keepers never score it. */
export const defconThreshold = (position: Position) => (position === 'DEF' ? 10 : position === 'GK' ? 0 : 12)

const num = (value: string | number | null | undefined): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * A rolling read on how a player is actually going over his last few matches,
 * and whether his returns are backed by his underlying numbers.
 *
 * FPL's published `form` is a smoothed 30-day points average - it says how many
 * points arrived, never whether they were earned. Over a handful of matches the
 * difference is the whole game: a defender who returned 30 points from three
 * freak clean sheets is a sell, and a midfielder with 2.4 xGI and one assist is
 * a hold. This is the check that separates the two.
 *
 * Needs at least three appearances before it will call anything, because below
 * that every verdict would be noise.
 */
export function readForm(
  history: ElementSummary['history'],
  position: Position,
  window = 6,
): FormRead | null {
  const recent = (history ?? []).slice(-window)
  if (!recent.length) return null
  const played = recent.filter((row) => num(row.minutes) > 0)
  if (played.length < 3) return null

  const points = recent.reduce((sum, row) => sum + num(row.total_points), 0)
  const minutes = recent.reduce((sum, row) => sum + num(row.minutes), 0)
  const xgi = played.reduce((sum, row) => sum + num(row.expected_goals) + num(row.expected_assists), 0)
  const returns = played.reduce((sum, row) => sum + num(row.goals_scored) + num(row.assists), 0)
  const threshold = defconThreshold(position)
  const defconHits = threshold > 0
    ? played.filter((row) => num(row.defensive_contribution) >= threshold).length
    : 0
  const overperformance = Number((returns - xgi).toFixed(2))
  const pointsPerGame = Number((points / played.length).toFixed(1))

  let verdict: FormVerdict = 'level'
  let note = `${returns} goal involvements from ${xgi.toFixed(1)} expected over ${played.length} matches.`
  if (overperformance >= 1 && xgi >= 0.8) {
    verdict = 'over'
    note = `${returns} returns from only ${xgi.toFixed(1)} expected — riding his luck, so the points may not last.`
  } else if (overperformance <= -1 && xgi >= 1) {
    verdict = 'under'
    note = `${xgi.toFixed(1)} expected goal involvements but only ${returns} returned — the underlying numbers say the points are coming.`
  } else if (overperformance >= 0.75 && xgi < 0.8) {
    verdict = 'over'
    note = `Barely creating (${xgi.toFixed(1)} xGI) despite ${returns} returns — hard to sustain.`
  } else if (overperformance <= -0.75 && xgi >= 0.8) {
    verdict = 'under'
    note = `Generating ${xgi.toFixed(1)} xGI for ${returns} returns — due a correction in his favour.`
  }

  return {
    games: played.length,
    minutes,
    points,
    pointsPerGame,
    xgi: Number(xgi.toFixed(2)),
    returns,
    overperformance,
    defconHits,
    verdict,
    note,
  }
}
