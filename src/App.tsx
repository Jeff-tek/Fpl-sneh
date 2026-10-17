import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Activity, ArrowDownRight, ArrowLeftRight, ArrowUpRight, BarChart3, Check, ChevronDown, CircleHelp, Clipboard, Clock3, Download, ExternalLink, Gauge, LoaderCircle, Menu, RotateCcw, Search, Settings2, Shield, Sparkles, Trophy, Users, X } from 'lucide-react'
import { demoSquad, managerNames } from './data/demo'
import { defaultWeights, expectedPoints, formationName, formations, optimizeSquad, type Formation, type Player, type Weights } from './lib/engine'
import {
  buildMarket, buildSquad, currentGameweek, nextGameweek,
  type BootstrapStatic, type Entry, type EntryHistory, type Fixture, type LiveElement, type Pick,
} from './lib/fpl/data'
import { buildFixtureTicker } from './lib/fpl/ticker'
import { evaluateChips, evaluateSquadHealth } from './lib/fpl/chips'
import { fixtureTone, money, positionLabels } from './lib/ui'
import { ChipsPane, FixturesPane, LivePanel, TransfersPane, type SortKey } from './components/panes'
import './styles.css'

type Modal = 'settings' | 'editor' | 'player' | 'share' | null
type LiveFixture = { home: string; away: string; homeScore: number; awayScore: number; minute: number }

const TRANSFER_HORIZON = 8

function deadlineInfo(iso?: string) {
  if (!iso) return { date: '—', countdown: '—' }
  const date = new Date(iso)
  const dateLabel = date.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  const diff = date.getTime() - Date.now()
  if (diff <= 0) return { date: dateLabel, countdown: 'Locked' }
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  return { date: dateLabel, countdown: `${days}d ${hours}h ${minutes}m` }
}

function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapStatic | null>(null)
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [squad, setSquad] = useState<Player[]>(demoSquad)
  const [picks, setPicks] = useState<Pick[]>([])
  const [entry, setEntry] = useState<Entry | null>(null)
  const [history, setHistory] = useState<EntryHistory | null>(null)
  const [bank, setBank] = useState(0.8)
  const [weights, setWeights] = useState<Weights>(defaultWeights)
  const [formation, setFormation] = useState<Formation>()
  const [managerId, setManagerId] = useState('2432')
  const [gameweek, setGameweek] = useState(1)
  const [searchValue, setSearchValue] = useState('2432')
  const [managerName, setManagerName] = useState('Sneh United')
  const [isDemo, setIsDemo] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [liveStatus, setLiveStatus] = useState<'live' | 'paused'>('live')
  const [liveStats, setLiveStats] = useState<Record<number, LiveElement['stats']>>({})
  const [liveFixture, setLiveFixture] = useState<LiveFixture | null>(null)
  const [liveFeedLoaded, setLiveFeedLoaded] = useState(false)
  const [activePane, setActivePane] = useState<'squad' | 'moves' | 'fixtures' | 'chips'>('squad')
  const [lookahead, setLookahead] = useState(6)
  const [sortBy, setSortBy] = useState<SortKey>('overall')
  const [demoMenu, setDemoMenu] = useState(false)
  const [preferModelXI, setPreferModelXI] = useState(false)
  const bootHandled = useRef(false)

  const lineup = useMemo(() => optimizeSquad(squad, weights, formation), [squad, weights, formation])
  const starterIds = useMemo(() => new Set(lineup.starters.map((player) => player.id)), [lineup])
  const panelSquad = useMemo(() => squad.map((player) => ({ ...player, isStarter: starterIds.has(player.id) })), [squad, starterIds])
  // Your real FPL line-up, straight from the official picks: positions 1-11 are
  // the XI, 12-15 are the bench in substitution order. This is the single source
  // of truth for the pitch, the bench strip AND the live tracker, so a player can
  // never be listed as a starter and a substitute at the same time.
  const officialSquad = useMemo(() => {
    if (!picks.length) return null
    const ordered = squad
      .map((player, index) => ({ player, order: player.pickPosition ?? index + 1 }))
      .sort((a, b) => a.order - b.order)
    const officialStarters = ordered.filter((entry) => entry.player.isStarter).map((entry) => entry.player)
    const officialBench = ordered.filter((entry) => !entry.player.isStarter).map((entry) => entry.player)
    return officialStarters.length === 11 && officialBench.length === 4 ? { starters: officialStarters, bench: officialBench } : null
  }, [squad, picks])
  const activeOfficial = preferModelXI ? null : officialSquad
  const displayStarters = activeOfficial ? activeOfficial.starters : lineup.starters
  const displayBench = activeOfficial ? activeOfficial.bench : lineup.bench
  const displayCaptainId = activeOfficial ? squad.find((player) => player.isCaptain)?.id : lineup.captain?.id
  const displayViceId = activeOfficial ? squad.find((player) => player.isViceCaptain)?.id : lineup.viceCaptain?.id
  const displayCaptain = displayStarters.find((player) => player.id === displayCaptainId)
  const displayVice = displayStarters.find((player) => player.id === displayViceId)
  const displayFormation: Formation = {
    def: displayStarters.filter((player) => player.position === 'DEF').length,
    mid: displayStarters.filter((player) => player.position === 'MID').length,
    fwd: displayStarters.filter((player) => player.position === 'FWD').length,
  }
  const marketGW = bootstrap ? nextGameweek(bootstrap) : gameweek
  const market = useMemo(() => (bootstrap ? buildMarket(bootstrap, fixtures, marketGW) : []), [bootstrap, fixtures, marketGW])
  // Only treat players with meaningful minutes as credible transfer targets;
  // the bar rises as the season progresses.
  const minMinutes = Math.min(450, Math.max(180, (gameweek - 1) * 45))
  const tickerRows = useMemo(() => (bootstrap ? buildFixtureTicker(bootstrap.teams || [], fixtures, gameweek, lookahead) : []), [bootstrap, fixtures, gameweek, lookahead])
  const ownedClubs = useMemo(() => new Set(squad.map((player) => player.clubCode)), [squad])
  const chipAdvices = useMemo(
    () => (bootstrap
      // bootstrap ships each chip once per half-season; keep only the window we're in
      ? evaluateChips(
          (bootstrap.chips || []).filter((chip) => chip.start_event <= gameweek && chip.stop_event >= gameweek),
          history?.chips || [], gameweek, fixtures, panelSquad, bootstrap.events || [],
        )
      : []),
    [bootstrap, history, gameweek, fixtures, panelSquad],
  )
  const health = useMemo(
    () => evaluateSquadHealth(panelSquad, bank, bootstrap?.events || [], gameweek),
    [panelSquad, bank, bootstrap, gameweek],
  )
  const squadValue = squad.reduce((sum, player) => sum + player.price, 0)
  const paneTitle = { squad: 'Squad overview', moves: 'Transfer room', fixtures: 'Fixture ticker', chips: 'Chip strategy' }[activePane]
  const xPts = displayStarters.reduce((sum, player) => sum + expectedPoints(player, weights), 0) + (displayCaptain ? expectedPoints(displayCaptain, weights) : 0)
  // The live total follows the XI we are actually showing, keeping the official
  // multiplier (captain x2) so it matches your real FPL score.
  const liveMultiplier = (id: number) => picks.find((pick) => pick.element === id)?.multiplier ?? (id === displayCaptainId ? 2 : 1)
  const deadline = deadlineInfo((bootstrap?.events?.find((event) => event.is_next) ?? bootstrap?.events?.find((event) => event.is_current))?.deadline_time)
  const rankDisplay = entry?.summary_overall_rank ? entry.summary_overall_rank.toLocaleString('en-GB') : '—'

  function flash(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }

  function persistSquad(next: Player[]) {
    if (managerId && !managerNames[Number(managerId)]) localStorage.setItem(`fpl-sneh-squad:${managerId}`, JSON.stringify(next))
  }

  function chooseDemo(id: number) {
    setManagerId(String(id))
    setSearchValue(String(id))
    setManagerName(managerNames[id])
    setSquad(demoSquad)
    setPicks([])
    setEntry(null)
    setHistory(null)
    setBank(id === 1 ? 1.2 : 0.8)
    setFormation(undefined)
    setIsDemo(true)
    localStorage.setItem('fpl-sneh-manager-id', String(id))
    setDemoMenu(false)
    flash(`${managerNames[id]} loaded`)
  }

  async function loadTeam(id: string, boot: BootstrapStatic | null = bootstrap, fix: Fixture[] = fixtures) {
    if (managerNames[Number(id)]) { chooseDemo(Number(id)); return }
    if (!boot) { flash('Live FPL data is still loading'); return }
    setBusy(true)
    try {
      const entryResponse = await fetch(`/api/fpl/entry/${id}/`)
      if (!entryResponse.ok) throw new Error('Could not find that FPL team')
      const loadedEntry = await entryResponse.json() as Entry
      const gw = currentGameweek(boot)
      let picksResponse: { picks?: Pick[]; entry_history?: { bank?: number } } | null = null
      for (let candidateGW = gw; candidateGW >= Math.max(1, gw - 6); candidateGW -= 1) {
        const response = await fetch(`/api/fpl/entry/${id}/event/${candidateGW}/picks/`)
        if (!response.ok) continue
        const candidate = await response.json() as { picks?: Pick[]; entry_history?: { bank?: number } }
        if (candidate.picks?.length) { picksResponse = candidate; break }
      }
      if (!picksResponse?.picks?.length) throw new Error('No recorded squad found yet. Try again after the deadline, or load a demo team.')
      const builtMarket = buildMarket(boot, fix, nextGameweek(boot))
      const loadedSquad = buildSquad(picksResponse.picks, builtMarket)
      if (loadedSquad.length !== 15) throw new Error('FPL returned an incomplete squad for this gameweek.')
      let loadedHistory: EntryHistory | null = null
      try {
        const historyResponse = await fetch(`/api/fpl/entry/${id}/history/`)
        if (historyResponse.ok) {
          const candidate = await historyResponse.json() as EntryHistory
          if (Array.isArray(candidate?.current)) loadedHistory = candidate
        }
      } catch { /* history is optional */ }
      setSquad(loadedSquad)
      setPicks(picksResponse.picks)
      setBank((picksResponse.entry_history?.bank ?? loadedEntry.last_deadline_bank ?? 0) / 10)
      setEntry(loadedEntry)
      setHistory(loadedHistory)
      setManagerId(id)
      setManagerName(loadedEntry.name || `Team ${id}`)
      setGameweek(gw)
      setFormation(undefined)
      setIsDemo(false)
      localStorage.setItem('fpl-sneh-manager-id', id)
      localStorage.setItem(`fpl-sneh-squad:${id}`, JSON.stringify(loadedSquad))
      flash(`Loaded ${loadedEntry.name || `Team ${id}`} · GW${gw}`)
    } catch (error) {
      const cached = localStorage.getItem(`fpl-sneh-squad:${id}`)
      if (cached) {
        try {
          setSquad(JSON.parse(cached) as Player[])
          setIsDemo(false)
          flash('Loaded your last saved squad (offline)')
          return
        } catch { localStorage.removeItem(`fpl-sneh-squad:${id}`) }
      }
      flash(error instanceof Error ? error.message : 'Team lookup failed')
    } finally {
      setBusy(false)
    }
  }

  function submitSearch(event?: FormEvent) {
    event?.preventDefault()
    const id = searchValue.trim()
    if (!/^\d+$/.test(id)) { flash('Enter a numeric FPL team ID'); return }
    if (managerNames[Number(id)]) { chooseDemo(Number(id)); return }
    void loadTeam(id)
  }

  function applyTransfer(outgoingId: number, incomingId: number) {
    const outgoing = squad.find((player) => player.id === outgoingId)
    const incoming = market.find((player) => player.id === incomingId && !squad.some((owned) => owned.id === player.id))
    if (!outgoing || !incoming) { flash('That move is no longer available'); return }
    if (outgoing.position !== incoming.position) { flash('Choose a replacement in the same position'); return }
    const clubCount = squad.filter((player) => player.clubCode === incoming.clubCode && player.id !== outgoing.id).length
    if (clubCount >= 3) { flash('A squad can contain at most three players from one club'); return }
    const cost = incoming.price - (outgoing.sellPrice ?? outgoing.price)
    if (cost > bank) { flash(`This move needs ${money(cost - bank)} more in the bank`); return }
    const next = squad.map((player) => player.id === outgoing.id
      ? { ...incoming, sellPrice: incoming.price, isStarter: player.isStarter, isCaptain: player.isCaptain, isViceCaptain: player.isViceCaptain, pickPosition: player.pickPosition }
      : player)
    setSquad(next)
    setBank((value) => Number((value - cost).toFixed(1)))
    setFormation(undefined)
    setIsDemo(false)
    persistSquad(next)
    setModal(null)
    flash(`${incoming.name} replaces ${outgoing.name}`)
  }

  async function shareLineup(download: boolean) {
    const summary = `${managerName} · GW${gameweek} · ${lineup.formation ? formationName(lineup.formation) : '4-4-2'}\nProjected ${xPts.toFixed(1)} pts incl. captain\nCaptain: ${lineup.captain?.name || '—'} | Vice: ${lineup.viceCaptain?.name || '—'}\n${lineup.starters.map((player) => player.name).join(' · ')}`
    const canvas = document.createElement('canvas')
    canvas.width = 1000
    canvas.height = 600
    const context = canvas.getContext('2d')
    if (!context) return
    context.fillStyle = '#123c32'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#d7f36a'
    context.fillRect(0, 0, 14, canvas.height)
    context.fillStyle = '#f6f4ec'
    context.font = '700 28px Manrope, sans-serif'
    context.fillText(`FPL SNEH  /  GAMEWEEK ${String(gameweek).padStart(2, '0')}`, 60, 66)
    context.font = '700 48px Manrope, sans-serif'
    context.fillText(managerName, 60, 142)
    context.font = '600 34px Manrope, sans-serif'
    context.fillText(`${xPts.toFixed(1)} projected points`, 60, 205)
    context.font = '500 23px Manrope, sans-serif'
    lineup.starters.forEach((player, index) => {
      const y = 274 + index * 29
      if (y > 560) return
      context.fillStyle = player.id === lineup.captain?.id ? '#d7f36a' : '#f6f4ec'
      context.fillText(`${player.name}${player.id === lineup.captain?.id ? '  (C)' : player.id === lineup.viceCaptain?.id ? '  (VC)' : ''}`, 62, y)
      context.fillStyle = '#aabdb2'
      context.textAlign = 'right'
      context.fillText(`${expectedPoints(player, weights).toFixed(1)} xPts`, 930, y)
      context.textAlign = 'left'
    })
    if (download) {
      const link = document.createElement('a')
      link.download = 'fpl-sneh-lineup.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
      setModal(null)
    } else {
      try {
        await navigator.clipboard.writeText(summary)
        flash('Lineup summary copied')
      } catch { flash('Clipboard access is unavailable in this browser') }
    }
  }

  /* ---- bootstrap + fixtures (public data, always loaded) ---- */
  useEffect(() => {
    let disposed = false
    void (async () => {
      try {
        const [bootstrapResponse, fixturesResponse] = await Promise.all([
          fetch('/api/fpl/bootstrap-static/'), fetch('/api/fpl/fixtures/'),
        ])
        if (!bootstrapResponse.ok) throw new Error('bootstrap unavailable')
        const loadedBootstrap = await bootstrapResponse.json() as BootstrapStatic
        const loadedFixtures = fixturesResponse.ok ? await fixturesResponse.json() as Fixture[] : []
        if (disposed) return
        setBootstrap(loadedBootstrap)
        setFixtures(loadedFixtures)
        setGameweek(currentGameweek(loadedBootstrap))
      } catch {
        if (!disposed) flash('Live FPL data unavailable — showing demo data')
      }
    })()
    return () => { disposed = true }
  }, [])

  /* ---- restore last manager once bootstrap is ready ---- */
  useEffect(() => {
    if (!bootstrap || bootHandled.current) return
    bootHandled.current = true
    const savedId = localStorage.getItem('fpl-sneh-manager-id')
    if (!savedId) return
    setSearchValue(savedId)
    if (managerNames[Number(savedId)]) { chooseDemo(Number(savedId)); return }
    setManagerId(savedId)
    void loadTeam(savedId, bootstrap, fixtures)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap, fixtures])

  /* ---- live gameweek feed ---- */
  useEffect(() => {
    if (liveStatus !== 'live') return
    let disposed = false
    const refreshLive = async () => {
      try {
        const liveResponse = await fetch(`/api/fpl/event/${gameweek}/live/`)
        if (!liveResponse.ok) throw new Error('Live feed unavailable')
        const live = await liveResponse.json() as { elements?: LiveElement[] }
        const stats: Record<number, LiveElement['stats']> = {}
        for (const element of live.elements || []) stats[element.id] = element.stats
        let currentFixture: LiveFixture | null = null
        const active = fixtures.find((fixture) => fixture.event === gameweek && fixture.started && !fixture.finished)
        if (active) {
          const teamMap = new Map((bootstrap?.teams || []).map((team) => [team.id, team]))
          currentFixture = {
            home: teamMap.get(active.team_h)?.short_name || 'HOM',
            away: teamMap.get(active.team_a)?.short_name || 'AWY',
            homeScore: active.team_h_score || 0,
            awayScore: active.team_a_score || 0,
            minute: active.minutes || 0,
          }
        }
        if (!disposed) { setLiveStats(stats); setLiveFixture(currentFixture); setLiveFeedLoaded(true) }
      } catch {
        if (!disposed) setLiveFeedLoaded(false)
      }
    }
    void refreshLive()
    const interval = window.setInterval(refreshLive, 60_000)
    return () => { disposed = true; window.clearInterval(interval) }
  }, [gameweek, liveStatus, fixtures, bootstrap])

  const paneTabs = [
    { id: 'squad', label: 'Squad', icon: BarChart3 },
    { id: 'moves', label: 'Transfers', icon: ArrowLeftRight },
    { id: 'fixtures', label: 'Fixtures', icon: Clock3 },
    { id: 'chips', label: 'Chips', icon: Sparkles },
  ] as const

  function onTabKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    const index = paneTabs.findIndex((tab) => tab.id === activePane)
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % paneTabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + paneTabs.length) % paneTabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? paneTabs.length - 1 : -1
    if (nextIndex < 0) return
    event.preventDefault()
    const nextPane = paneTabs[nextIndex].id
    setActivePane(nextPane)
    document.getElementById(`tab-${nextPane}`)?.focus()
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="FPL sneh home"><span className="brand-mark">s.</span><span>fpl<span className="brand-light">sneh</span></span></a>
        <div className="side-spacer" />
        <div className="side-week"><span className="eyebrow">NEXT DEADLINE</span><strong>{deadline.date}</strong><span className="side-countdown"><span className="live-pulse" /> {deadline.countdown}</span></div>
        <button className="side-link" onClick={() => setModal('settings')}><Settings2 size={17} /><span>Model settings</span></button>
        <div className="sidebar-foot"><span className="avatar">SP</span><span><b>Sneh Patel</b><small>FPL manager</small></span><button className="icon-button subtle" aria-label="Account options"><Menu size={16} /></button></div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="crumb"><span>Workspace</span><span className="crumb-slash">/</span><b>{paneTitle}</b></div>
          <div className="top-actions"><span className="api-status"><span className="status-led" /> {bootstrap ? 'Live data' : 'Loading'} · {market.length} players</span><button className="icon-button settings-shortcut" onClick={() => setModal('settings')} aria-label="Open model settings"><Settings2 size={18} /></button></div>
        </header>

        <div className="page-wrap">
          <nav className="workspace-tabs" role="tablist" aria-label="FPL workspace" onKeyDown={onTabKeyDown}>
            {paneTabs.map(({ id, label, icon: Icon }) => <button key={id} id={`tab-${id}`} className={`workspace-tab ${activePane === id ? 'active' : ''}`} type="button" role="tab" aria-selected={activePane === id} aria-controls="workspace-panel" tabIndex={activePane === id ? 0 : -1} onClick={() => setActivePane(id)}><Icon size={17} />{label}</button>)}
          </nav>

          <section className="page-heading">
            <div><div className="eyebrow heading-kicker"><span className="kicker-bar" /> THE WEEKLY BRIEF <span className="kicker-divider">·</span> PREMIER LEAGUE 2026/27</div><h1>{paneTitle}<span className="heading-period">.</span></h1><p>A sharper read on your next 90 minutes.</p></div>
            <div className="week-control"><span className="week-tag"><span className="week-live" /> GAMEWEEK {String(gameweek).padStart(2, '0')}</span><button className="deadline-button"><Clock3 size={15} /> Deadline in <b>{deadline.countdown}</b></button></div>
          </section>

          <section className="manager-bar">
            <div className="manager-identity"><span className="manager-icon"><Shield size={19} /></span><span><strong>{managerName}</strong><small>Team ID {managerId} <span className="identity-sep">·</span> <span className="rank-copy">Overall rank <b>{rankDisplay}</b></span></small></span></div>
            <form className="manager-search" onSubmit={submitSearch}><Search size={15} /><input aria-label="FPL team ID" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Enter team ID" /><button type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : 'Load team'}</button></form>
            <div className="demo-pick-wrap"><button className="demo-pick" onClick={() => setDemoMenu(!demoMenu)}>Demo teams <ChevronDown size={14} /></button>{demoMenu && <div className="demo-menu">{Object.entries(managerNames).map(([id, name]) => <button key={id} onClick={() => chooseDemo(Number(id))}><span>{name}</span><small>#{id}</small></button>)}</div>}</div>
          </section>

          <section className="metric-grid">
            <article className="metric-card primary-metric"><div className="metric-top"><span>PROJECTED XI</span><Sparkles size={15} /></div><div className="metric-value">{xPts.toFixed(1)}<small> pts</small></div><div className="metric-foot"><span className="metric-trend"><ArrowUpRight size={13} /> {activeOfficial ? 'your XI' : 'model'}</span>{formationName(displayFormation)} formation</div><div className="metric-spark"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></article>
            <article className="metric-card"><div className="metric-top"><span>IN THE BANK</span><ArrowLeftRight size={15} /></div><div className="metric-value" style={{ fontSize: 24 }}>{money(bank)}</div><div className="metric-foot">Free transfers <b>1</b> · hits not applied</div><div className="transfer-meter"><span /></div></article>
            <article className="metric-card"><div className="metric-top"><span>SQUAD VALUE</span><Gauge size={15} /></div><div className="metric-value" style={{ fontSize: 24 }}>{money(squadValue)}</div><div className="metric-foot">Squad health <b className="green-text">{health.grade}</b></div><div className="mini-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></article>
            <article className="metric-card rank-metric"><div className="metric-top"><span>OVERALL RANK</span><Trophy size={15} /></div><div className="metric-value" style={{ fontSize: 24 }}>{rankDisplay}</div><div className="metric-foot"><span className="metric-trend"><ArrowUpRight size={13} /> {isDemo ? 'demo' : 'live'}</span> {entry?.summary_event_points ? `${entry.summary_event_points} pts this GW` : 'season to date'}</div><div className="rank-line"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div></article>
          </section>

          <section className={`dashboard-grid ${activePane === 'squad' ? '' : 'planning-view'}`} role="tabpanel" id="workspace-panel" aria-labelledby={`tab-${activePane}`}>
            <div className="pitch-column">
              <div className="section-head"><div><div className="section-title-line"><h2>{activeOfficial ? 'Your Starting XI' : 'Model Starting XI'}</h2><span className="live-label"><span className="live-pulse" /> LIVE</span></div><p>{formationName(displayFormation)} · {activeOfficial ? 'exactly as submitted on FPL · bench in substitution order' : "the model's highest-scoring XI"}</p></div><div className="section-actions">{officialSquad && <div className="segmented" role="group" aria-label="Lineup source"><button className={!preferModelXI ? 'active' : ''} onClick={() => setPreferModelXI(false)}>Your XI</button><button className={preferModelXI ? 'active' : ''} onClick={() => setPreferModelXI(true)}>Model XI</button></div>}<button className="plain-action" onClick={() => setModal('share')}><ExternalLink size={15} /> Share</button><button className="square-action" aria-label="Edit squad" onClick={() => setModal('editor')}><Users size={16} /></button></div></div>
              <div className="formation-strip"><span className="strip-label">SHAPE</span>{officialSquad && <button className={!preferModelXI ? 'formation-pill selected' : 'formation-pill'} onClick={() => { setPreferModelXI(false); setFormation(undefined) }} title="Show the XI you submitted">Your XI</button>}{formations.map((option) => <button key={formationName(option)} className={preferModelXI && formationName(displayFormation) === formationName(option) ? 'formation-pill selected' : 'formation-pill'} onClick={() => { setFormation(option); setPreferModelXI(true) }} title={`Model XI in ${formationName(option)}`}>{formationName(option)}</button>)}<button className="reset-formation" onClick={() => { setFormation(undefined); setPreferModelXI(false) }} title="Reset to your XI and the optimal shape"><RotateCcw size={13} /></button></div>
              <div className="pitch" aria-label={`${activeOfficial ? 'Your' : 'Model'} starting lineup in ${formationName(displayFormation)} formation`}>
                <div className="pitch-stripe" /><div className="pitch-half-line" /><div className="pitch-circle" /><div className="pitch-box pitch-box-top" /><div className="pitch-box pitch-box-bottom" />
                <div className="pitch-players">
                  <PlayerRow players={displayStarters.filter((player) => player.position === 'FWD')} weights={weights} captain={displayCaptainId} vice={displayViceId} onSelect={(player) => { setSelectedPlayer(player); setModal('player') }} />
                  <PlayerRow players={displayStarters.filter((player) => player.position === 'MID')} weights={weights} captain={displayCaptainId} vice={displayViceId} onSelect={(player) => { setSelectedPlayer(player); setModal('player') }} />
                  <PlayerRow players={displayStarters.filter((player) => player.position === 'DEF')} weights={weights} captain={displayCaptainId} vice={displayViceId} onSelect={(player) => { setSelectedPlayer(player); setModal('player') }} />
                  <PlayerRow players={displayStarters.filter((player) => player.position === 'GK')} weights={weights} captain={displayCaptainId} vice={displayViceId} onSelect={(player) => { setSelectedPlayer(player); setModal('player') }} />
                </div>
                <div className="pitch-caption"><span><span className="pitch-dot" /> HOME ADVANTAGE APPLIED</span><span>{activeOfficial ? 'YOUR FPL XI' : 'MODEL v1.4'}</span></div>
              </div>
              <div className="bench-block"><div className="bench-heading"><div><span className="bench-index">01</span><b>Bench</b><small>{activeOfficial ? 'Your FPL bench, in substitution order' : 'Model bench, ranked by xPts'}</small></div><button className="text-button" onClick={() => setModal('editor')}>Edit squad <ArrowLeftRight size={13} /></button></div><div className="bench-row">{displayBench.map((player, index) => <button className="bench-slot" key={player.id} onClick={() => { setSelectedPlayer(player); setModal('player') }}><span className="bench-order">{index + 1}</span><span className={`bench-shirt club-${player.clubCode.toLowerCase()}`}>{player.shirt.slice(0, 2)}</span><span className="bench-slot-name">{player.name}</span><span className="bench-slot-meta">{player.clubCode} · {player.position}</span><FixtureBadge difficulty={player.fdr[0] || 3} /><span className="bench-slot-pts">{expectedPoints(player, weights).toFixed(1)}<small> xPts</small></span></button>)}</div></div>
            </div>

            <aside className="insight-column">
              <section className="captain-panel"><div className="panel-head"><span>{activeOfficial ? 'YOUR CAPTAIN' : 'CAPTAINCY CALL'}</span><button className="help-button" title="The highest projected player receives the armband"><CircleHelp size={15} /></button></div><div className="captain-feature"><span className="captain-avatar">{displayCaptain?.shirt}</span><span className="captain-copy"><b>{displayCaptain?.name}<i>C</i></b><small>{displayCaptain?.club} · {displayCaptain?.position}</small></span><span className="captain-score">{displayCaptain ? expectedPoints(displayCaptain, weights).toFixed(1) : '—'}<small> xPts</small></span></div>{lineup.captain && displayCaptain && lineup.captain.id !== displayCaptain.id ? <div className="captain-reason"><span className="reason-mark"><Sparkles size={13} /></span><span>Model prefers <b>{lineup.captain.name}</b> (+{(expectedPoints(lineup.captain, weights) - expectedPoints(displayCaptain, weights)).toFixed(1)} xPts over your armband)</span></div> : <div className="captain-reason"><span className="reason-mark"><Sparkles size={13} /></span><span>Top model score <b>{(displayCaptain?.form ?? 0).toFixed(1)} form</b> and a favorable fixture.</span></div>}<div className="vice-row"><span className="vice-label">VICE-CAPTAIN</span><b>{displayVice?.name}</b><span>{displayVice ? expectedPoints(displayVice, weights).toFixed(1) : '—'} xPts</span></div></section>

              <LivePanel starters={displayStarters} bench={displayBench} stats={liveStats} multiplierOf={liveMultiplier} liveFixture={liveFixture} liveFeedLoaded={liveFeedLoaded} liveStatus={liveStatus} gameweek={gameweek} onToggle={() => setLiveStatus(liveStatus === 'live' ? 'paused' : 'live')} />

              <section className="planning-panel">
                {activePane === 'moves' && <TransfersPane squad={squad} market={market} weights={weights} bank={bank} defaultHorizon={TRANSFER_HORIZON} minMinutes={minMinutes} onApply={applyTransfer} />}
                {activePane === 'fixtures' && <FixturesPane rows={tickerRows} ownedClubs={ownedClubs} lookahead={lookahead} onLookahead={setLookahead} sortBy={sortBy} onSort={setSortBy} />}
                {activePane === 'chips' && <ChipsPane advices={chipAdvices} health={health} history={history} currentGW={gameweek} bank={bank} />}
              </section>
            </aside>
          </section>

          <footer className="dashboard-footer"><span><span className="footer-led" /> EXPLAINABLE MODEL <i>·</i> xPts considers form, xG, xA, ICT, FDR & venue · {market.length} players scored.</span><button onClick={() => setModal('settings')}>Tune your model <Settings2 size={13} /></button></footer>
        </div>
      </main>
      {notice && <div className="toast"><Check size={15} />{notice}</div>}
      {modal === 'settings' && <SettingsModal weights={weights} onChange={setWeights} onClose={() => setModal(null)} />}
      {modal === 'editor' && <EditorModal squad={squad} market={market} bank={bank} onSwap={applyTransfer} onClose={() => setModal(null)} />}
      {modal === 'player' && selectedPlayer && <PlayerModal player={selectedPlayer} weights={weights} onClose={() => setModal(null)} />}
      {modal === 'share' && <ShareModal onDownload={() => shareLineup(true)} onCopy={() => shareLineup(false)} onClose={() => setModal(null)} />}
    </div>
  )
}

function PlayerRow({ players, weights, captain, vice, onSelect }: { players: Player[]; weights: Weights; captain?: number; vice?: number; onSelect: (player: Player) => void }) {
  return <div className="pitch-row">{players.map((player) => <button className="pitch-player" key={player.id} onClick={() => onSelect(player)} title={`${player.name}, ${expectedPoints(player, weights).toFixed(1)} expected points`}><span className={`shirt club-${player.clubCode.toLowerCase()}`}><span>{player.shirt}</span>{player.id === captain && <i>C</i>}{player.id === vice && <i className="vice-badge">V</i>}</span><span className="player-name-tag">{player.name}</span><span className="player-points-tag">{expectedPoints(player, weights).toFixed(1)} <small>pts</small></span><span className={`player-fdr ${fixtureTone(player.fdr[0] || 3)}`}>{player.fdr[0] || 3}</span></button>)}</div>
}

function FixtureBadge({ difficulty }: { difficulty: number }) { return <span className={`fixture-badge ${fixtureTone(difficulty)}`}>FDR {difficulty}</span> }

function SettingsModal({ weights, onChange, onClose }: { weights: Weights; onChange: (weights: Weights) => void; onClose: () => void }) {
  const controls: Array<{ key: keyof Weights; name: string; note: string }> = [
    { key: 'form', name: 'Recent form', note: 'Last six gameweeks · points per match' },
    { key: 'xG', name: 'Expected goals', note: 'Underlying goal threat · xG per 90' },
    { key: 'xA', name: 'Expected assists', note: 'Chance creation · xA per 90' },
    { key: 'ict', name: 'ICT index', note: 'Influence, creativity & threat' },
  ]
  return <ModalShell title="Model settings" eyebrow="EXPECTED POINTS MODEL" onClose={onClose}><p className="modal-intro">Adjust what the model values. Weights are normalized automatically, so their relative balance matters more than the total.</p><div className="weight-list">{controls.map(({ key, name, note }) => <label className="weight-control" key={key}><span><b>{name}</b><small>{note}</small></span><input type="range" min="0" max="100" step="1" value={Math.round(weights[key] * 100)} onChange={(event) => onChange({ ...weights, [key]: Number(event.target.value) / 100 })} /><strong>{Math.round(weights[key] * 100)}%</strong></label>)}</div><div className="model-note"><Gauge size={16} /><span><b>Fixture context is always on</b><small>FDR adjusts the projection, with a separate home/away modifier.</small></span></div><div className="modal-actions"><button className="secondary-action" onClick={() => onChange(defaultWeights)}><RotateCcw size={14} /> Reset defaults</button><button className="primary-action" onClick={onClose}>Apply model</button></div></ModalShell>
}

function EditorModal({ squad, market, bank, onSwap, onClose }: { squad: Player[]; market: Player[]; bank: number; onSwap: (outgoing: number, incoming: number) => void; onClose: () => void }) {
  const [outgoingId, setOutgoingId] = useState(squad[0]?.id || 0)
  const outgoing = squad.find((player) => player.id === outgoingId)
  const options = useMemo(() => market
    .filter((player) => player.position === outgoing?.position && !squad.some((owned) => owned.id === player.id))
    .sort((a, b) => b.form + b.xG * 12 + b.xA * 10 - (a.form + a.xG * 12 + a.xA * 10)), [market, squad, outgoing])
  const [incomingId, setIncomingId] = useState(options[0]?.id || 0)
  useEffect(() => setIncomingId(options[0]?.id || 0), [outgoingId, options])
  const incoming = options.find((player) => player.id === incomingId)
  const cost = incoming && outgoing ? incoming.price - (outgoing.sellPrice ?? outgoing.price) : 0
  return <ModalShell title="Edit squad" eyebrow="PRE-DEADLINE TRANSFERS" onClose={onClose}><p className="modal-intro">FPL hides pending moves until the deadline. Preview your new squad here; your Best XI updates as soon as you apply the swap.</p><div className="bank-ribbon"><span>AVAILABLE BANK</span><b>{money(bank)}</b><small>One free transfer · hit cost not included</small></div><label className="select-label">Player to sell<select value={outgoingId} onChange={(event) => setOutgoingId(Number(event.target.value))}>{squad.map((player) => <option value={player.id} key={player.id}>{player.name} · {player.clubCode} · sell {money(player.sellPrice ?? player.price)}</option>)}</select></label><div className="editor-swap-mark"><ArrowDownRight size={17} /></div><label className="select-label">Replacement<select value={incomingId} onChange={(event) => setIncomingId(Number(event.target.value))}>{options.map((player) => <option value={player.id} key={player.id}>{player.name} · {player.clubCode} · {money(player.price)} · {player.points} pts</option>)}</select></label><div className={`cost-summary ${cost > bank ? 'over-budget' : ''}`}><span>Net spend</span><b>{cost > 0 ? '+' : ''}{money(cost)}</b><span>Bank after move</span><b>{money(bank - cost)}</b></div><div className="modal-actions"><button className="secondary-action" onClick={onClose}>Cancel</button><button className="primary-action" disabled={!incoming || cost > bank} onClick={() => onSwap(outgoingId, incomingId)}><Check size={14} /> Apply pending transfer</button></div></ModalShell>
}

function PlayerModal({ player, weights, onClose }: { player: Player; weights: Weights; onClose: () => void }) {
  return <ModalShell title={player.name} eyebrow={`${player.club.toUpperCase()} · ${positionLabels[player.position].toUpperCase()}`} onClose={onClose}><div className="player-detail-head"><span className={`detail-shirt club-${player.clubCode.toLowerCase()}`}>{player.shirt}</span><div><b>{player.club}</b><small>{money(player.price)} <span className={player.change >= 0 ? 'green-text' : 'red-text'}>{player.change >= 0 ? '+' : ''}{player.change.toFixed(1)} this GW</span></small></div><strong>{expectedPoints(player, weights).toFixed(1)}<small> xPts</small></strong></div><div className="stat-grid"><div><span>SEASON POINTS</span><b>{player.points}</b></div><div><span>FORM</span><b>{player.form.toFixed(1)}</b></div><div><span>xG / 90</span><b>{player.xG.toFixed(2)}</b></div><div><span>xA / 90</span><b>{player.xA.toFixed(2)}</b></div><div><span>ICT INDEX</span><b>{player.ict.toFixed(0)}</b></div><div><span>SELECTED BY</span><b>{player.selectedBy.toFixed(1)}%</b></div></div><div className="detail-section-head"><b>Upcoming fixtures</b><small>Difficulty rating</small></div><div className="detail-fixtures">{(player.upcoming && player.upcoming.length ? player.upcoming.slice(0, 5) : player.fdr.slice(0, 5).map((difficulty, index) => ({ gw: index + 1, opponentCode: 'TBC', isHome: player.home, difficulty }))).map((run) => <div className="detail-fixture" key={run.gw}><span>GW{run.gw}</span><b className={fixtureTone(run.difficulty)}>{run.difficulty}</b><small>{run.opponentCode} {run.isHome ? '(H)' : '(A)'}</small></div>)}</div><div className="history-block"><div className="detail-section-head"><b>Recent form</b><small>Points trend · last 6</small></div><div className="history-chart">{[0.52, 0.7, 0.46, 0.83, 0.62, Math.min(1, player.form / 10)].map((height, index) => <span key={index} style={{ height: `${height * 100}%` }}><i>GW{index + 1}</i></span>)}</div></div></ModalShell>
}

function ShareModal({ onDownload, onCopy, onClose }: { onDownload: () => void; onCopy: () => void; onClose: () => void }) {
  return <ModalShell title="Share your lineup" eyebrow="A LITTLE TACTICAL EDGE" onClose={onClose}><p className="modal-intro">Take your projected XI with you. Export a clean lineup graphic or copy a text summary.</p><div className="share-preview"><div><span>FPL SNEH · LIVE</span><b>Projected XI</b><strong>Captain-led. Model-backed.</strong></div><Activity size={29} /></div><div className="modal-actions"><button className="secondary-action" onClick={onCopy}><Clipboard size={14} /> Copy summary</button><button className="primary-action" onClick={onDownload}><Download size={14} /> Export lineup card</button></div></ModalShell>
}

function ModalShell({ title, eyebrow, children, onClose }: { title: string; eyebrow: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{children}</section></div>
}

export default App
