import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeftRight, ArrowRight, Check, Clock3, Info, RotateCcw, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react'
import { getTransferIdeas, horizonPoints, type Player, type Weights } from '../lib/engine'
import type { ChipAdvice, SquadHealth } from '../lib/fpl/chips'
import type { TickerRow } from '../lib/fpl/ticker'
import type { EntryHistory, LiveElement, Pick } from '../lib/fpl/data'
import { fixtureTone, flagLabel, flagTone, money } from '../lib/ui'

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

export function FixturePips({ player, horizon = 5 }: { player: Player; horizon?: number }) {
  const runs = (player.upcoming ?? []).slice(0, horizon)
  if (!runs.length) return <span className="pip-wrap"><em className="pip none">—</em></span>
  return (
    <span className="pip-wrap">
      {runs.map((run) => (
        <i key={run.gw} className={`pip ${fixtureTone(run.difficulty)}`} title={`GW${run.gw} ${run.isHome ? 'vs' : '@'} ${run.opponent}`}>
          <b>{run.opponentCode}</b>
          <em>{run.isHome ? 'H' : 'A'}</em>
        </i>
      ))}
    </span>
  )
}

function FlagChip({ player }: { player: Player }) {
  const tone = flagTone(player)
  if (!tone) return null
  return <span className={`flag-chip ${tone}`} title={player.news || 'Availability flag'}>{flagLabel(player)}</span>
}

/* ------------------------------------------------------------------ */
/* Transfers                                                           */
/* ------------------------------------------------------------------ */

type TransfersPaneProps = {
  squad: Player[]
  market: Player[]
  weights: Weights
  bank: number
  defaultHorizon: number
  minMinutes: number
  onApply: (outgoingId: number, incomingId: number) => void
}

export function TransfersPane({ squad, market, weights, bank, defaultHorizon, minMinutes, onApply }: TransfersPaneProps) {
  const [sandbox, setSandbox] = useState(false)
  // Transfers are a long-term decision, so the default look-ahead is deliberately
  // wide and the manager can stretch it further.
  const [horizon, setHorizon] = useState(defaultHorizon)
  const ideas = useMemo(() => getTransferIdeas(squad, market, weights, bank, horizon, minMinutes), [squad, market, weights, bank, horizon, minMinutes])
  const [sellId, setSellId] = useState<number>(squad[0]?.id ?? 0)
  const sell = squad.find((player) => player.id === sellId) ?? squad[0]
  const owned = useMemo(() => new Set(squad.map((player) => player.id)), [squad])
  const clubCounts = useMemo(() => squad.reduce<Record<string, number>>((acc, player) => ({ ...acc, [player.clubCode]: (acc[player.clubCode] || 0) + 1 }), {}), [squad])
  const options = useMemo(() => {
    if (!sell) return []
    const budget = (sell.sellPrice ?? sell.price) + bank
    return market
      .filter((player) => player.position === sell.position && !owned.has(player.id) && player.price <= budget && (player.status === undefined || player.status === 'a' || (player.chance ?? 0) >= 75) && (player.minutes ?? 0) >= minMinutes)
      .sort((a, b) => horizonPoints(b, weights, horizon) - horizonPoints(a, weights, horizon))
  }, [market, sell, owned, bank, weights, horizon, minMinutes])
  const [buyId, setBuyId] = useState<number>(0)
  const buy = options.find((player) => player.id === buyId) ?? options[0]

  if (!market.length) {
    return <div className="pane-empty"><Info size={16} /><span>Live player market unavailable. Reload when FPL data is reachable.</span></div>
  }

  return (
    <div className="transfers-pane">
      <div className="pane-head">
        <div><span className="eyebrow">TRANSFER MARKET</span><h3>Long-term transfer ideas</h3><p>Ranked by projected points across the next {horizon} gameweeks — not just this week · players you already own are never suggested</p></div>
        <div className="pane-controls">
          <div className="segmented" role="group" aria-label="Projection horizon">
            {([5, 8, 10, 12] as const).map((value) => <button key={value} className={horizon === value ? 'active' : ''} onClick={() => setHorizon(value)}>{value} GW</button>)}
          </div>
          <button className={`pane-toggle ${sandbox ? 'active' : ''}`} onClick={() => setSandbox((value) => !value)}><ArrowLeftRight size={14} /> {sandbox ? 'Hide sandbox' : 'Open sandbox'}</button>
        </div>
      </div>

      {ideas.singles.length === 0 && <div className="pane-empty"><Check size={16} /><span>No upgrade clears the threshold this week. Your squad is well set — save the transfer.</span></div>}

      <div className="tr-list">
        {ideas.singles.map((idea) => (
          <div className="tr-card" key={`${idea.outgoing.id}-${idea.incoming.id}`}>
            <div className={`tr-side out ${idea.injuryExit ? 'flagged' : ''}`}>
              <small>SELL {idea.injuryExit && <FlagChip player={idea.outgoing} />}</small>
              <b>{idea.outgoing.name}</b>
              <span>{idea.outgoing.clubCode} · {idea.outgoing.position} · {money(idea.outgoing.sellPrice ?? idea.outgoing.price)}</span>
              <FixturePips player={idea.outgoing} />
            </div>
            <ArrowRight size={16} className="tr-arrow" />
            <div className="tr-side in">
              <small>BUY</small>
              <b>{idea.incoming.name}</b>
              <span>{idea.incoming.clubCode} · {idea.incoming.position} · {money(idea.incoming.price)}</span>
              <FixturePips player={idea.incoming} />
            </div>
            <div className="tr-meta">
              <span className={`tr-gain ${idea.gain >= 0 ? 'positive' : 'negative'}`}>{idea.gain >= 0 ? '+' : ''}{idea.gain.toFixed(1)}<small> xPts</small></span>
              <span className="tr-cost">{idea.cost === 0 ? 'Free' : `${idea.cost > 0 ? '-' : '+'}${money(Math.abs(idea.cost))}`}</span>
              <button className="tr-apply" onClick={() => onApply(idea.outgoing.id, idea.incoming.id)}>Apply</button>
            </div>
            <p className="tr-reason">{idea.reason}</p>
          </div>
        ))}
      </div>

      {ideas.doubles.length > 0 && (
        <div className="tr-doubles">
          <div className="tr-doubles-head"><Sparkles size={14} /><b>Best two-move plans</b><span>{horizon}-GW horizon</span></div>
          {ideas.doubles.map((plan) => (
            <div className="tr-double" key={`${plan.first.incoming.id}-${plan.second.incoming.id}`}>
              <div className="tr-double-moves">
                <span>{plan.first.outgoing.name} <ArrowLeftRight size={11} /> <b>{plan.first.incoming.name}</b></span>
                <span>{plan.second.outgoing.name} <ArrowLeftRight size={11} /> <b>{plan.second.incoming.name}</b></span>
              </div>
              <div className="tr-meta"><span className="tr-gain positive">+{plan.gain.toFixed(1)}<small> xPts</small></span><span className="tr-cost">{money(plan.cost)} spend</span></div>
            </div>
          ))}
        </div>
      )}

      {sandbox && (
        <div className="sandbox">
          <div className="sandbox-head"><span className="eyebrow">WHAT-IF SANDBOX</span><small>Bank {money(bank)} · club limit 3</small></div>
          <div className="sandbox-grid">
            <label className="select-label">Player out
              <select value={sell?.id ?? 0} onChange={(event) => setSellId(Number(event.target.value))}>
                {squad.map((player) => <option key={player.id} value={player.id}>{player.name} · {player.clubCode} · {player.position}</option>)}
              </select>
            </label>
            <label className="select-label">Player in
              <select value={buy?.id ?? 0} onChange={(event) => setBuyId(Number(event.target.value))}>
                {options.slice(0, 80).map((player) => <option key={player.id} value={player.id}>{player.name} · {player.clubCode} · {money(player.price)}</option>)}
              </select>
            </label>
          </div>
          {sell && buy && (() => {
            const cost = buy.price - (sell.sellPrice ?? sell.price)
            const clubOk = (clubCounts[buy.clubCode] || 0) + (buy.clubCode === sell.clubCode ? 0 : 1) <= 3
            const gain = horizonPoints(buy, weights, horizon) - horizonPoints(sell, weights, horizon)
            return (
              <div className={`sandbox-summary ${cost > bank || !clubOk ? 'invalid' : ''}`}>
                <span>Net spend <b>{cost > 0 ? '+' : ''}{money(cost)}</b></span>
                <span>Bank after <b>{money(bank - cost)}</b></span>
                <span>Projected <b className={gain >= 0 ? 'green-text' : 'red-text'}>{gain >= 0 ? '+' : ''}{gain.toFixed(1)} xPts</b></span>
                {!clubOk && <span className="sandbox-warn"><ShieldAlert size={12} /> Three-player club limit</span>}
                <button className="tr-apply" disabled={cost > bank || !clubOk} onClick={() => onApply(sell.id, buy.id)}>Apply move</button>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

export type SortKey = 'overall' | 'attack' | 'defence' | 'name'

export function FixturesPane({
  rows, ownedClubs, lookahead, onLookahead, sortBy, onSort,
}: {
  rows: TickerRow[]
  ownedClubs: Set<string>
  lookahead: number
  onLookahead: (value: number) => void
  sortBy: SortKey
  onSort: (value: SortKey) => void
}) {
  const [query, setQuery] = useState('')
  const sorted = useMemo(() => {
    const value = (row: TickerRow) => sortBy === 'attack' ? row.attack : sortBy === 'defence' ? row.defence : sortBy === 'name' ? 0 : row.overall
    const list = [...rows]
    if (sortBy === 'name') list.sort((a, b) => a.team.name.localeCompare(b.team.name))
    else list.sort((a, b) => value(a) - value(b))
    return query ? list.filter((row) => row.team.name.toLowerCase().includes(query.toLowerCase()) || row.team.short_name.toLowerCase().includes(query.toLowerCase())) : list
  }, [rows, sortBy, query])

  if (!rows.length) return <div className="pane-empty"><Info size={16} /><span>Fixture data is unavailable right now.</span></div>

  const gwCount = rows[0]?.cells.length ?? lookahead
  const gridStyle = { '--gw-count': gwCount } as CSSProperties

  return (
    <div className="fixtures-pane">
      <div className="pane-head">
        <div><span className="eyebrow">FIXTURE TICKER</span><h3>Fixture difficulty · next {gwCount} GWs</h3><p>Attacking and defensive runs for every club · 1 easy → 5 hard</p></div>
        <div className="pane-controls">
          <input className="pane-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter club" aria-label="Filter club" />
          <div className="segmented">{([4, 6, 8] as const).map((value) => <button key={value} className={lookahead === value ? 'active' : ''} onClick={() => onLookahead(value)}>{value} GW</button>)}</div>
          <select className="pane-select" value={sortBy} onChange={(event) => onSort(event.target.value as SortKey)} aria-label="Sort by">
            <option value="overall">Sort: overall FDR</option>
            <option value="attack">Sort: attack run</option>
            <option value="defence">Sort: defence run</option>
            <option value="name">Sort: club</option>
          </select>
        </div>
      </div>
      <div className="fx-head">
        <span className="fx-club-head">CLUB</span>
        <div className="fx-cells" style={gridStyle}>{sorted[0]?.cells.map((cell) => <span key={cell.gw} className="fx-gw">GW{cell.gw}</span>)}</div>
        <span className="fx-avg-head">AVG</span>
      </div>
      <div className="fx-body">
        {sorted.map((row) => (
          <div className={`fx-row ${ownedClubs.has(row.team.short_name) ? 'owned' : ''}`} key={row.team.id}>
            <span className="fx-club"><b className={`club-dot club-${row.team.short_name.toLowerCase()}`} />{row.team.short_name}</span>
            <div className="fx-cells" style={gridStyle}>
              {row.cells.map((cell) => (
                <div key={cell.gw} className={`fx-cell ${cell.isBlank ? 'blank' : cell.isDouble ? 'double' : fixtureTone(cell.average)}`}>
                  {cell.isBlank && <em>BLK</em>}
                  {cell.fixtures.map((fixture, index) => (
                    <span key={index} className="fx-opp"><b>{fixture.opponent}</b><small>{fixture.isHome ? 'H' : 'A'}</small></span>
                  ))}
                  {cell.isDouble && <small className="fx-double-tag">DGW</small>}
                </div>
              ))}
            </div>
            <span className={`fx-avg ${fixtureTone(row.overall)}`}>{row.overall.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

const REC_LABEL: Record<ChipAdvice['recommendation'], string> = {
  USE_THIS_GW: 'Use this GW',
  CONSIDER_NOW: 'Consider now',
  SAVE_FOR_LATER: 'Save',
  ALREADY_PLAYED: 'Used',
}

export function ChipsPane({
  advices, health, history, currentGW, bank,
}: {
  advices: ChipAdvice[]
  health: SquadHealth
  history: EntryHistory | null
  currentGW: number
  bank: number
}) {
  const recent = (history?.current ?? []).slice(-6).reverse()
  return (
    <div className="chips-pane">
      <div className="pane-head">
        <div><span className="eyebrow">CHIP STRATEGY</span><h3>Chip timing & squad health</h3><p>Recommendations adapt to Double/Blank gameweeks and your squad condition</p></div>
        <span className="chip-gw-badge">GW{currentGW}</span>
      </div>

      <div className="chip-grid">
        {advices.map((advice) => (
          <article className={`chip-card tone-${advice.tone} rec-${advice.recommendation.toLowerCase()}`} key={advice.name}>
            <i className="chip-swatch" />
            <div className="chip-copy">
              <div className="chip-name">{advice.label}<span className={`chip-rec ${advice.recommendation.toLowerCase()}`}>{REC_LABEL[advice.recommendation]}</span></div>
              <p>{advice.reasoning}</p>
            </div>
            <span className="chip-status">{advice.statusText}</span>
          </article>
        ))}
      </div>

      <div className="health-panel">
        <div className="health-head">
          <div><span className="eyebrow">SQUAD HEALTH</span><div className="health-score"><b>{health.grade}</b><span>{health.score}/100</span></div></div>
          <div className="health-metrics">
            <span><ShieldAlert size={13} /> {health.injured} injured</span>
            <span><TrendingUp size={13} /> {health.benchXPts.toFixed(1)} bench xPts</span>
            <span><Clock3 size={13} /> GW{currentGW}</span>
          </div>
        </div>
        <div className="health-bar"><span style={{ width: `${health.score}%` }} /></div>
        <ul className="health-notes">{health.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        <div className="club-concentration">
          {health.clubConcentration.slice(0, 4).map((entry) => (
            <span key={entry.club} className="club-pill"><b className={`club-dot club-${entry.club.toLowerCase()}`} />{entry.club} <em>{entry.count}</em></span>
          ))}
          <span className="club-pill bank-pill">Bank <em>{money(bank)}</em></span>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="history-panel">
          <div className="history-head"><b>Recent gameweeks</b><small>Points · transfers · bench</small></div>
          <div className="history-rows">
            {recent.map((row) => (
              <div className="history-row" key={row.event}>
                <span className="history-gw">GW{row.event}</span>
                <span className="history-points">{row.points} pts</span>
                <span className="history-meta">{row.event_transfers} transfer{row.event_transfers === 1 ? '' : 's'}{row.event_transfers_cost ? ` · -${row.event_transfers_cost}` : ''}</span>
                <span className="history-bench">{row.points_on_bench} benched</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Live tracker                                                        */
/* ------------------------------------------------------------------ */

export function LivePanel({
  squad, picks, captainId, liveStats, liveFixture, liveFeedLoaded, liveStatus, gameweek, onToggle,
}: {
  squad: Player[]
  picks: Pick[]
  captainId?: number
  liveStats: Record<number, LiveElement['stats']>
  liveFixture: { home: string; away: string; homeScore: number; awayScore: number; minute: number } | null
  liveFeedLoaded: boolean
  liveStatus: 'live' | 'paused'
  gameweek: number
  onToggle: () => void
}) {
  const multiplier = (id: number) => picks.length ? (picks.find((pick) => pick.element === id)?.multiplier ?? 1) : (id === captainId ? 2 : 1)
  const starterIds = picks.length
    ? new Set(picks.filter((pick) => pick.position <= 11).map((pick) => pick.element))
    : new Set(squad.filter((player) => player.isStarter).map((player) => player.id))
  const pointsOf = (player: Player) => liveStats[player.id]?.total_points ?? player.livePoints ?? 0
  const total = squad.reduce((sum, player) => sum + (starterIds.has(player.id) ? pointsOf(player) * multiplier(player.id) : 0), 0)
  const ranked = [...squad].sort((a, b) => pointsOf(b) - pointsOf(a))

  return (
    <section className="live-panel">
      <div className="panel-head">
        <span><span className="live-pulse" /> LIVE GAMEWEEK {gameweek}</span>
        <button className="live-refresh" onClick={onToggle} title="Toggle live tracker"><RotateCcw size={13} /></button>
      </div>
      <div className="live-score-line">
        <span className="live-total">{total}</span>
        <span className="live-copy">live points<br /><b>{liveFeedLoaded ? 'official feed · bonus included' : 'snapshot · awaiting kickoff'}</b></span>
        <span className={`tracker-state ${liveStatus}`}>{liveStatus === 'live' ? 'TRACKING' : 'PAUSED'}</span>
      </div>
      {liveFixture ? (
        <div className="match-strip">
          <span className="match-team"><b>{liveFixture.home}</b><em>{liveFixture.homeScore}</em></span>
          <span className="match-time">{liveFixture.minute}′ <i>LIVE</i></span>
          <span className="match-team"><em>{liveFixture.awayScore}</em><b>{liveFixture.away}</b></span>
        </div>
      ) : <div className="match-strip"><span className="empty-live">No matches currently in progress</span></div>}
      <div className="live-table">
        {ranked.map((player) => {
          const live = liveStats[player.id]
          const isStarter = starterIds.has(player.id)
          const mult = multiplier(player.id)
          return (
            <div className={`live-row ${isStarter ? '' : 'benched'}`} key={player.id}>
              <span className={`live-mult ${mult > 1 ? 'armband' : ''}`}>{mult > 1 ? `×${mult}` : ''}</span>
              <span className="live-name"><b>{player.name}</b><small>{player.clubCode} · {player.position}</small></span>
              <span className="live-stat">{live?.minutes ?? 0}′</span>
              <span className="live-stat">{(live?.goals_scored ?? 0)}G {(live?.assists ?? 0)}A</span>
              <span className="live-stat">{live?.bonus ?? 0}<small> bns</small></span>
              <span className="live-pts">{pointsOf(player) * mult}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
