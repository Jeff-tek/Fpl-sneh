import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDownRight, ArrowLeftRight, ArrowUpRight, BarChart3, Check, ChevronDown, CircleHelp, Clipboard, Clock3, Download, ExternalLink, Gauge, LoaderCircle, Menu, RotateCcw, Search, Settings2, Shield, Sparkles, Trophy, Users, X } from 'lucide-react'
import { demoSquad, managerNames, transferMarket } from './data/demo'
import { defaultWeights, expectedPoints, formationName, formations, getTransferIdeas, optimizeSquad, type Formation, type Player, type Position, type Weights } from './lib/engine'
import './styles.css'

type Modal = 'settings' | 'editor' | 'player' | 'share' | null
type ElementApi = { id: number; web_name: string; team: number; element_type: number; now_cost: number; form: string; expected_goals: string; expected_assists: string; ict_index: string; total_points: number; selected_by_percent: string; cost_change_event: number }
type TeamApi = { id: number; name: string; short_name: string }
type LiveStat = { points: number; bonus: number; bps: number; minutes: number }
type LiveFixture = { home: string; away: string; homeScore: number; awayScore: number; minute: number }

const positionLabels: Record<Position, string> = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' }
const positionFromElement = (position: number): Position => (['', 'GK', 'DEF', 'MID', 'FWD'][position] || 'MID') as Position
const money = (value: number) => `£${value.toFixed(1)}m`

function fixtureTone(fdr: number) {
  if (fdr <= 2) return 'easy'
  if (fdr === 3) return 'steady'
  return 'hard'
}

function App() {
  const [squad, setSquad] = useState<Player[]>(demoSquad)
  const [bank, setBank] = useState(0.8)
  const [weights, setWeights] = useState<Weights>(defaultWeights)
  const [formation, setFormation] = useState<Formation>()
  const [managerId, setManagerId] = useState('2432')
  const [gameweek, setGameweek] = useState(7)
  const [searchValue, setSearchValue] = useState('2432')
  const [managerName, setManagerName] = useState('Sneh United')
  const [modal, setModal] = useState<Modal>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [liveStatus, setLiveStatus] = useState<'live' | 'paused'>('live')
  const [liveStats, setLiveStats] = useState<Record<number, LiveStat>>({})
  const [liveFixture, setLiveFixture] = useState<LiveFixture | null>(null)
  const [liveFeedLoaded, setLiveFeedLoaded] = useState(false)
  const [activePane, setActivePane] = useState<'squad' | 'moves' | 'fixtures' | 'chips'>('squad')
  const [demoMenu, setDemoMenu] = useState(false)

  const lineup = useMemo(() => optimizeSquad(squad, weights, formation), [squad, weights, formation])
  const paneTitle = { squad: 'Squad overview', moves: 'Transfer room', fixtures: 'Fixture ticker', chips: 'Chip strategy' }[activePane]
  const xPts = lineup.starters.reduce((sum, player) => sum + expectedPoints(player, weights), 0) + (lineup.captain ? expectedPoints(lineup.captain, weights) : 0)
  const ideas = useMemo(() => getTransferIdeas(squad, transferMarket, weights, bank), [squad, weights, bank])
  const activePlayers = squad.filter((player) => liveFeedLoaded ? (liveStats[player.id]?.minutes || 0) > 0 : player.isLive)
  const liveTotal = squad.reduce((total, player) => total + (liveStats[player.id]?.points ?? (!liveFeedLoaded && player.isLive ? player.livePoints || 0 : 0)), 0)

  useEffect(() => {
    const savedId = localStorage.getItem('fpl-sneh-manager-id')
    if (savedId) {
      setManagerId(savedId)
      setSearchValue(savedId)
      if (!managerNames[Number(savedId)]) {
        const savedSquad = localStorage.getItem(`fpl-sneh-squad:${savedId}`)
        if (savedSquad) {
          try { setSquad(JSON.parse(savedSquad) as Player[]) } catch { localStorage.removeItem(`fpl-sneh-squad:${savedId}`) }
        }
      }
    }
  }, [])

  useEffect(() => {
    if (liveStatus !== 'live') return
    let disposed = false
    const refreshLive = async () => {
      try {
        const [liveResponse, fixtureResponse, bootstrapResponse] = await Promise.all([
          fetch(`/api/fpl/event/${gameweek}/live/`), fetch('/api/fpl/fixtures/'), fetch('/api/fpl/bootstrap-static/')
        ])
        if (!liveResponse.ok) throw new Error('Live feed unavailable')
        const live = await liveResponse.json() as { elements?: Array<{ id: number; stats: { total_points: number; bonus: number; bps: number; minutes: number } }> }
        const stats = Object.fromEntries((live.elements || []).map(({ id, stats: playerStats }) => [id, {
          points: playerStats.total_points || 0, bonus: playerStats.bonus || 0, bps: playerStats.bps || 0, minutes: playerStats.minutes || 0,
        }]))
        let currentFixture: LiveFixture | null = null
        if (fixtureResponse.ok && bootstrapResponse.ok) {
          const fixtures = await fixtureResponse.json() as Array<{ event: number; team_h: number; team_a: number; team_h_score: number | null; team_a_score: number | null; started: boolean; finished: boolean; minutes: number }>
          const bootstrap = await bootstrapResponse.json() as { teams?: TeamApi[] }
          const fixture = fixtures.find((item) => item.event === gameweek && item.started && !item.finished)
          if (fixture) {
            const teams = bootstrap.teams || []
            currentFixture = {
              home: teams.find((team) => team.id === fixture.team_h)?.short_name || 'HOM',
              away: teams.find((team) => team.id === fixture.team_a)?.short_name || 'AWY',
              homeScore: fixture.team_h_score || 0, awayScore: fixture.team_a_score || 0, minute: fixture.minutes || 0,
            }
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
  }, [gameweek, liveStatus])

  function flash(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }

  function chooseDemo(id: number) {
    setManagerId(String(id))
    setSearchValue(String(id))
    setManagerName(managerNames[id])
    setSquad(demoSquad)
    setBank(id === 1 ? 1.2 : 0.8)
    setGameweek(7)
    setFormation(undefined)
    localStorage.setItem('fpl-sneh-manager-id', String(id))
    setDemoMenu(false)
    flash(`${managerNames[id]} loaded`)
  }

  async function searchManager(event?: React.FormEvent) {
    event?.preventDefault()
    const id = searchValue.trim()
    if (!/^\d+$/.test(id)) { flash('Enter a numeric FPL team ID'); return }
    if (managerNames[Number(id)]) { chooseDemo(Number(id)); return }
    setBusy(true)
    try {
      const [entryResponse, bootstrapResponse, fixtureResponse] = await Promise.all([
        fetch(`/api/fpl/entry/${id}/`), fetch('/api/fpl/bootstrap-static/'), fetch('/api/fpl/fixtures/')
      ])
      if (!entryResponse.ok || !bootstrapResponse.ok) throw new Error('Could not find that FPL team')
      const entry = await entryResponse.json()
      const bootstrap = await bootstrapResponse.json()
      const fixtures: Array<{ event: number; team_h: number; team_a: number; team_h_difficulty: number; team_a_difficulty: number }> = fixtureResponse.ok ? await fixtureResponse.json() : []
      const teams: TeamApi[] = bootstrap.teams || []
      const elements: ElementApi[] = bootstrap.elements || []
      let picks: { picks?: Array<{ element: number; selling_price?: number }> } | undefined
      for (let gameweek = 6; gameweek >= 1; gameweek -= 1) {
        const picksResponse = await fetch(`/api/fpl/entry/${id}/event/${gameweek}/picks/`)
        if (!picksResponse.ok) continue
        const candidate = await picksResponse.json()
        if (candidate.picks?.length) { picks = candidate; break }
      }
      if (!picks?.picks?.length || !elements.length) throw new Error('No recorded squad found yet. Try again after the deadline, or load a demo team.')
      const loadedSquad = picks.picks.map(({ element, selling_price }) => {
        const apiPlayer = elements.find((item) => item.id === element)
        if (!apiPlayer) return undefined
        const team = teams.find((item) => item.id === apiPlayer.team)
        const upcoming = fixtures.filter((fixture) => fixture.event && fixture.event >= 7 && (fixture.team_h === apiPlayer.team || fixture.team_a === apiPlayer.team)).slice(0, 5)
        const fdr = upcoming.map((fixture) => fixture.team_h === apiPlayer.team ? fixture.team_h_difficulty : fixture.team_a_difficulty)
        const home = upcoming[0]?.team_h === apiPlayer.team
        return {
          id: apiPlayer.id, name: apiPlayer.web_name, club: team?.name || 'Premier League', clubCode: team?.short_name || 'PL', shirt: apiPlayer.web_name.slice(0, 2).toUpperCase(),
          position: positionFromElement(apiPlayer.element_type), price: apiPlayer.now_cost / 10, sellPrice: selling_price === undefined ? apiPlayer.now_cost / 10 : selling_price / 10, form: Number(apiPlayer.form) || 0,
          xG: Number(apiPlayer.expected_goals) || 0, xA: Number(apiPlayer.expected_assists) || 0, ict: Number(apiPlayer.ict_index) || 0,
          points: apiPlayer.total_points, selectedBy: Number(apiPlayer.selected_by_percent) || 0, change: apiPlayer.cost_change_event / 10,
          fdr: fdr.length ? fdr : [3, 3, 3, 3, 3], home,
        } as Player
      }).filter((player): player is Player => Boolean(player))
      if (loadedSquad.length !== 15) throw new Error('FPL returned an incomplete squad for this gameweek.')
      setSquad(loadedSquad)
      setBank((entry.last_deadline_bank || 0) / 10)
      setManagerId(id)
      setGameweek(bootstrap.events?.find((event: { is_current?: boolean }) => event.is_current)?.id || entry.current_event || 7)
      setManagerName(entry.name || `Team ${id}`)
      setFormation(undefined)
      localStorage.setItem('fpl-sneh-manager-id', id)
      localStorage.setItem(`fpl-sneh-squad:${id}`, JSON.stringify(loadedSquad))
      flash(`Latest recorded squad loaded from GW${picks.picks ? '6 → 1' : ''}`)
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Team lookup failed')
    } finally {
      setBusy(false)
    }
  }

  function saveCustomSquad(next: Player[]) {
    setSquad(next)
    if (managerId && !managerNames[Number(managerId)]) localStorage.setItem(`fpl-sneh-squad:${managerId}`, JSON.stringify(next))
  }

  function handleSwap(outgoingId: number, incomingId: number) {
    const outgoing = squad.find((player) => player.id === outgoingId)
    const incoming = [...transferMarket, ...demoSquad].find((player) => player.id === incomingId && !squad.some((owned) => owned.id === player.id))
    if (!outgoing || !incoming || outgoing.position !== incoming.position) { flash('Choose a replacement in the same position'); return }
    const clubCount = squad.filter((player) => player.club === incoming.club && player.id !== outgoing.id).length
    if (clubCount >= 3) { flash('A squad can contain at most three players from one club'); return }
    const cost = incoming.price - (outgoing.sellPrice ?? outgoing.price)
    if (cost > bank) { flash(`This move needs ${money(cost - bank)} more in the bank`); return }
    saveCustomSquad(squad.map((player) => player.id === outgoing.id ? incoming : player))
    setBank((value) => value - cost)
    setFormation(undefined)
    setModal(null)
    flash(`${incoming.name} replaces ${outgoing.name}`)
  }

  async function shareLineup(download: boolean) {
    const summary = `${managerName} · GW7 · ${lineup.formation ? formationName(lineup.formation) : '4-4-2'}\nProjected ${xPts.toFixed(1)} pts incl. captain\nCaptain: ${lineup.captain?.name || '—'} | Vice: ${lineup.viceCaptain?.name || '—'}\n${lineup.starters.map((player) => player.name).join(' · ')}`
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
    context.fillText('FPL SNEH  /  GAMEWEEK 07', 60, 66)
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="FPL sneh home"><span className="brand-mark">s.</span><span>fpl<span className="brand-light">sneh</span></span></a>
        <div className="side-label">WORKSPACE</div>
        <button className={`side-link ${activePane === 'squad' ? 'active' : ''}`} onClick={() => setActivePane('squad')}><BarChart3 size={17} /><span>Squad overview</span>{activePane === 'squad' && <span className="side-dot" />}</button>
        <button className={`side-link ${activePane === 'moves' ? 'active' : ''}`} onClick={() => setActivePane('moves')}><ArrowLeftRight size={17} /><span>Transfer room</span>{activePane === 'moves' && <span className="side-dot" />}</button>
        <button className={`side-link ${activePane === 'fixtures' ? 'active' : ''}`} onClick={() => setActivePane('fixtures')}><Clock3 size={17} /><span>Fixture ticker</span>{activePane === 'fixtures' && <span className="side-dot" />}</button>
        <div className="side-spacer" />
        <div className="side-week"><span className="eyebrow">NEXT DEADLINE</span><strong>Sat, 11:00</strong><span className="side-countdown"><span className="live-pulse" /> 4d 18h 32m</span></div>
        <button className="side-link" onClick={() => setModal('settings')}><Settings2 size={17} /><span>Model settings</span></button>
        <div className="sidebar-foot"><span className="avatar">SP</span><span><b>Sneh Patel</b><small>FPL manager</small></span><button className="icon-button subtle" aria-label="Account options"><Menu size={16} /></button></div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="crumb"><span>Workspace</span><span className="crumb-slash">/</span><b>{paneTitle}</b></div>
          <div className="top-actions"><span className="api-status"><span className="status-led" /> Model ready</span><button className="icon-button settings-shortcut" onClick={() => setModal('settings')} aria-label="Open model settings"><Settings2 size={18} /></button></div>
        </header>

        <div className="page-wrap">
          <section className="page-heading">
            <div><div className="eyebrow heading-kicker"><span className="kicker-bar" /> THE WEEKLY BRIEF <span className="kicker-divider">·</span> PREMIER LEAGUE 2026/27</div><h1>{paneTitle}<span className="heading-period">.</span></h1><p>A sharper read on your next 90 minutes.</p></div>
            <div className="week-control"><span className="week-tag"><span className="week-live" /> GAMEWEEK 07</span><button className="deadline-button"><Clock3 size={15} /> Deadline in <b>4d 18h</b></button></div>
          </section>

          <section className="manager-bar">
            <div className="manager-identity"><span className="manager-icon"><Shield size={19} /></span><span><strong>{managerName}</strong><small>Team ID {managerId} <span className="identity-sep">·</span> <span className="rank-copy">Overall rank <b>68,421</b></span></small></span></div>
            <form className="manager-search" onSubmit={searchManager}><Search size={15} /><input aria-label="FPL team ID" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Enter team ID"/><button type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : 'Load team'}</button></form>
            <div className="demo-pick-wrap"><button className="demo-pick" onClick={() => setDemoMenu(!demoMenu)}>Demo teams <ChevronDown size={14} /></button>{demoMenu && <div className="demo-menu">{Object.entries(managerNames).map(([id, name]) => <button key={id} onClick={() => chooseDemo(Number(id))}><span>{name}</span><small>#{id}</small></button>)}</div>}</div>
          </section>

          <section className="metric-grid">
            <article className="metric-card primary-metric"><div className="metric-top"><span>PROJECTED XI</span><Sparkles size={15} /></div><div className="metric-value">{xPts.toFixed(1)}<small> pts</small></div><div className="metric-foot"><span className="metric-trend"><ArrowUpRight size={13} /> +6.4</span> vs. last gameweek</div><div className="metric-spark"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></article>
            <article className="metric-card"><div className="metric-top"><span>FREE TRANSFERS</span><ArrowLeftRight size={15} /></div><div className="metric-value">1<small> / 5</small></div><div className="metric-foot">Bank available <b>{money(bank)}</b></div><div className="transfer-meter"><span /></div></article>
            <article className="metric-card"><div className="metric-top"><span>EXPECTED GOALS</span><Gauge size={15} /></div><div className="metric-value">8.42<small> xG</small></div><div className="metric-foot">Squad form <b className="green-text">+12.8%</b></div><div className="mini-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></article>
            <article className="metric-card rank-metric"><div className="metric-top"><span>OVERALL RANK</span><Trophy size={15} /></div><div className="metric-value">68,421</div><div className="metric-foot"><span className="metric-trend"><ArrowUpRight size={13} /> 12.4k</span> places this week</div><div className="rank-line"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div></article>
          </section>

          <nav className="workspace-tabs" role="tablist" aria-label="FPL workspace" onKeyDown={(event) => {
            const paneIds = ['squad', 'moves', 'fixtures', 'chips'] as const
            const activeIndex = paneIds.indexOf(activePane)
            const nextIndex = event.key === 'ArrowRight' ? (activeIndex + 1) % paneIds.length
              : event.key === 'ArrowLeft' ? (activeIndex - 1 + paneIds.length) % paneIds.length
                : event.key === 'Home' ? 0 : event.key === 'End' ? paneIds.length - 1 : -1
            if (nextIndex >= 0) {
              event.preventDefault()
              const nextPane = paneIds[nextIndex]
              setActivePane(nextPane)
              document.getElementById(`tab-${nextPane}`)?.focus()
            }
          }}>
            {([
              { id: 'squad', label: 'Squad', icon: BarChart3 },
              { id: 'moves', label: 'Transfers', icon: ArrowLeftRight },
              { id: 'fixtures', label: 'Fixtures', icon: Clock3 },
              { id: 'chips', label: 'Chips', icon: Sparkles },
            ] as const).map(({ id, label, icon: Icon }) => <button key={id} id={`tab-${id}`} className={`workspace-tab ${activePane === id ? 'active' : ''}`} type="button" role="tab" aria-selected={activePane === id} aria-controls="workspace-panel" tabIndex={activePane === id ? 0 : -1} onClick={() => setActivePane(id)}><Icon size={15} />{label}</button>)}
          </nav>

          <section className={`dashboard-grid ${activePane === 'squad' ? '' : 'planning-view'}`} role="tabpanel" id="workspace-panel" aria-labelledby={`tab-${activePane}`}>
            <div className="pitch-column">
              <div className="section-head"><div><div className="section-title-line"><h2>Starting XI</h2><span className="live-label"><span className="live-pulse" /> LIVE</span></div><p>{formationName(lineup.formation)} formation <span>·</span> sorted by expected points</p></div><div className="section-actions"><button className="plain-action" onClick={() => setModal('share')}><ExternalLink size={15} /> Share</button><button className="square-action" aria-label="Edit squad" onClick={() => setModal('editor')}><Users size={16} /></button></div></div>
              <div className="pitch" aria-label={`Starting lineup in ${formationName(lineup.formation)} formation`}>
                <div className="pitch-stripe" /><div className="pitch-half-line" /><div className="pitch-circle" /><div className="pitch-box pitch-box-top" /><div className="pitch-box pitch-box-bottom" />
                <div className="pitch-players">
                  <PlayerRow players={lineup.starters.filter((player) => player.position === 'FWD')} weights={weights} captain={lineup.captain?.id} vice={lineup.viceCaptain?.id} onSelect={(player) => { setSelectedPlayer(player); setModal('player') }} />
                  <PlayerRow players={lineup.starters.filter((player) => player.position === 'MID')} weights={weights} captain={lineup.captain?.id} vice={lineup.viceCaptain?.id} onSelect={(player) => { setSelectedPlayer(player); setModal('player') }} />
                  <PlayerRow players={lineup.starters.filter((player) => player.position === 'DEF')} weights={weights} captain={lineup.captain?.id} vice={lineup.viceCaptain?.id} onSelect={(player) => { setSelectedPlayer(player); setModal('player') }} />
                  <PlayerRow players={lineup.starters.filter((player) => player.position === 'GK')} weights={weights} captain={lineup.captain?.id} vice={lineup.viceCaptain?.id} onSelect={(player) => { setSelectedPlayer(player); setModal('player') }} />
                </div>
                <div className="pitch-caption"><span><span className="pitch-dot" /> HOME ADVANTAGE APPLIED</span><span>MODEL v1.4</span></div>
              </div>
              <div className="formation-strip"><span className="strip-label">SHAPE</span>{formations.map((option) => <button key={formationName(option)} className={formationName(lineup.formation) === formationName(option) ? 'formation-pill selected' : 'formation-pill'} onClick={() => setFormation(option)} title={`Preview ${formationName(option)}`}>{formationName(option)}</button>)}<button className="reset-formation" onClick={() => setFormation(undefined)} title="Return to optimal formation"><RotateCcw size={13} /></button></div>
              <div className="bench-block"><div className="bench-heading"><div><span className="bench-index">01</span><b>Bench order</b><small>Auto-ranked by xPts</small></div><button className="text-button" onClick={() => setModal('editor')}>Edit squad <ArrowLeftRight size={13} /></button></div><div className="bench-list">{lineup.bench.map((player, index) => <button className="bench-player" key={player.id} onClick={() => { setSelectedPlayer(player); setModal('player') }}><span className="bench-number">{index + 1}</span><span className={`mini-jersey club-${player.clubCode.toLowerCase()}`}>{player.shirt.slice(0, 2)}</span><span className="bench-name"><b>{player.name}</b><small>{player.clubCode} · {player.position}</small></span><FixtureBadge difficulty={player.fdr[0] || 3} /><span className="bench-points">{expectedPoints(player, weights).toFixed(1)}<small> xPts</small></span></button>)}</div></div>
            </div>

            <aside className="insight-column">
              <section className="captain-panel"><div className="panel-head"><span>CAPTAINCY CALL</span><button className="help-button" title="The highest projected player receives the armband"><CircleHelp size={15} /></button></div><div className="captain-feature"><span className="captain-avatar">{lineup.captain?.shirt}</span><span className="captain-copy"><b>{lineup.captain?.name}<i>C</i></b><small>{lineup.captain?.club} · {lineup.captain?.position}</small></span><span className="captain-score">{lineup.captain ? expectedPoints(lineup.captain, weights).toFixed(1) : '—'}<small> xPts</small></span></div><div className="captain-reason"><span className="reason-mark"><Sparkles size={13} /></span><span>Top model score <b>{lineup.captain?.form.toFixed(1)} form</b> and a favorable fixture.</span></div><div className="vice-row"><span className="vice-label">VICE-CAPTAIN</span><b>{lineup.viceCaptain?.name}</b><span>{lineup.viceCaptain ? expectedPoints(lineup.viceCaptain, weights).toFixed(1) : '—'} xPts</span></div></section>

              <section className="live-panel"><div className="panel-head"><span><span className="live-pulse" /> LIVE GAMEWEEK</span><button className="live-refresh" onClick={() => setLiveStatus(liveStatus === 'live' ? 'paused' : 'live')} title="Toggle live tracker"><RotateCcw size={13} /></button></div><div className="live-score-line"><span className="live-total">{liveTotal}</span><span className="live-copy">live points<br /><b>{liveFeedLoaded ? 'official feed · bonus included' : 'snapshot feed · BPS shown'}</b></span><span className={`tracker-state ${liveStatus}`}>{liveStatus === 'live' ? 'TRACKING' : 'PAUSED'}</span></div>{liveFixture ? <div className="match-strip"><span className="match-team"><b>{liveFixture.home}</b><em>{liveFixture.homeScore}</em></span><span className="match-time">{liveFixture.minute}′ <i>LIVE</i></span><span className="match-team"><em>{liveFixture.awayScore}</em><b>{liveFixture.away}</b></span></div> : <div className="match-strip"><span className="empty-live">No matches currently in progress</span></div>}{activePlayers.length ? activePlayers.map((player) => { const live = liveStats[player.id]; return <div className="live-player" key={player.id}><span className="live-player-dot" /><b>{player.name}</b><span>{live?.points ?? player.livePoints ?? 0} pts</span><small>{live?.bonus ?? 0} bonus · {live?.bps ?? player.bps ?? 0} BPS</small></div> }) : <div className="empty-live">No owned players currently on the pitch.</div>}</section>

              <section className="planning-panel">
                {activePane === 'moves' && <div className="transfer-content"><div className="transfer-title"><div><span className="eyebrow">MODEL PICK</span><b>Best one-move upgrade</b></div><span className="transfer-count">{ideas.singles.length} ideas</span></div>{ideas.singles.slice(0, 2).map((idea) => <div className="transfer-idea" key={`${idea.outgoing.id}-${idea.incoming.id}`}><span className="transfer-out"><small>SELL</small><b>{idea.outgoing.name}</b><em>{idea.outgoing.clubCode}</em></span><ArrowLeftRight size={14} className="swap-icon"/><span className="transfer-in"><small>BUY</small><b>{idea.incoming.name}</b><em>{idea.incoming.clubCode}</em></span><span className="gain">+{idea.gain.toFixed(1)}<small> xPts</small></span></div>)}<div className="pair-opportunity"><Sparkles size={13} /><span>Best two-move upgrade</span><b>+{ideas.doubles[0]?.gain.toFixed(1) || '0.0'} xPts</b></div>{ideas.doubles[0] && <div className="double-transfer-list">{[ideas.doubles[0].first, ideas.doubles[0].second].map((idea) => <div key={`pair-${idea.outgoing.id}-${idea.incoming.id}`}><span>{idea.outgoing.name}</span><ArrowLeftRight size={11} /><b>{idea.incoming.name}</b></div>)}</div>}<button className="full-action" onClick={() => setModal('editor')}>Open transfer room <ArrowLeftRight size={14} /></button></div>}
                {activePane === 'fixtures' && <div className="ticker-content"><div className="ticker-title"><b>Next five gameweeks</b><span>FDR · 1 easy / 5 hard</span></div>{squad.slice(2, 8).map((player) => <div className="ticker-row" key={player.id}><span className="ticker-club">{player.clubCode}</span><span className="ticker-fixtures">{player.fdr.map((difficulty, index) => <i key={index} className={fixtureTone(difficulty)} title={`GW${index + 7} difficulty ${difficulty}`}>{difficulty}</i>)}</span><small>{player.name}</small></div>)}</div>}
                {activePane === 'chips' && <div className="chip-content"><div className="chip-title"><Sparkles size={15} /><b>Chip timing</b><span>4 available</span></div>{[{ name: 'Wildcard', week: 'GW 9–11', detail: 'Wait for the fixture swing', tone: 'lime' }, { name: 'Free Hit', week: 'Blank GW', detail: 'Hold for a reduced slate', tone: 'coral' }, { name: 'Bench Boost', week: 'Double GW', detail: 'Pair with a wildcard reset', tone: 'blue' }, { name: 'Triple Captain', week: 'Double GW', detail: 'Target a premium with two starts', tone: 'gold' }].map((chip) => <div className="chip-row" key={chip.name}><i className={`chip-swatch ${chip.tone}`} /><span><b>{chip.name}</b><small>{chip.detail}</small></span><em>{chip.week}</em></div>)}</div>}
              </section>
            </aside>
          </section>

          <footer className="dashboard-footer"><span><span className="footer-led" /> EXPLAINABLE MODEL <i>·</i> xPts considers form, xG, xA, ICT, FDR & venue.</span><button onClick={() => setModal('settings')}>Tune your model <Settings2 size={13} /></button></footer>
        </div>
      </main>
      {notice && <div className="toast"><Check size={15} />{notice}</div>}
      {modal === 'settings' && <SettingsModal weights={weights} onChange={setWeights} onClose={() => setModal(null)} />}
      {modal === 'editor' && <EditorModal squad={squad} bank={bank} onSwap={handleSwap} onClose={() => setModal(null)} />}
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

function EditorModal({ squad, bank, onSwap, onClose }: { squad: Player[]; bank: number; onSwap: (outgoing: number, incoming: number) => void; onClose: () => void }) {
  const [outgoingId, setOutgoingId] = useState(squad[0]?.id || 0)
  const outgoing = squad.find((player) => player.id === outgoingId)
  const options = [...demoSquad, ...transferMarket].filter((player) => player.position === outgoing?.position && !squad.some((owned) => owned.id === player.id))
  const [incomingId, setIncomingId] = useState(options[0]?.id || 0)
  useEffect(() => setIncomingId(options[0]?.id || 0), [outgoingId])
  const incoming = options.find((player) => player.id === incomingId)
  const cost = incoming && outgoing ? incoming.price - (outgoing.sellPrice ?? outgoing.price) : 0
  return <ModalShell title="Edit squad" eyebrow="PRE-DEADLINE TRANSFERS" onClose={onClose}><p className="modal-intro">FPL hides pending moves until the deadline. Preview your new squad here; your Best XI updates as soon as you apply the swap.</p><div className="bank-ribbon"><span>AVAILABLE BANK</span><b>{money(bank)}</b><small>One free transfer · hit cost not included</small></div><label className="select-label">Player to sell<select value={outgoingId} onChange={(event) => setOutgoingId(Number(event.target.value))}>{squad.map((player) => <option value={player.id} key={player.id}>{player.name} · {player.clubCode} · sell {money(player.sellPrice ?? player.price)}</option>)}</select></label><div className="editor-swap-mark"><ArrowDownRight size={17} /></div><label className="select-label">Replacement<select value={incomingId} onChange={(event) => setIncomingId(Number(event.target.value))}>{options.map((player) => <option value={player.id} key={player.id}>{player.name} · {player.clubCode} · {money(player.price)}</option>)}</select></label><div className={`cost-summary ${cost > bank ? 'over-budget' : ''}`}><span>Net spend</span><b>{cost > 0 ? '+' : ''}{money(cost)}</b><span>Bank after move</span><b>{money(bank - cost)}</b></div><div className="modal-actions"><button className="secondary-action" onClick={onClose}>Cancel</button><button className="primary-action" disabled={!incoming || cost > bank} onClick={() => onSwap(outgoingId, incomingId)}><Check size={14} /> Apply pending transfer</button></div></ModalShell>
}

function PlayerModal({ player, weights, onClose }: { player: Player; weights: Weights; onClose: () => void }) {
  return <ModalShell title={player.name} eyebrow={`${player.club.toUpperCase()} · ${positionLabels[player.position].toUpperCase()}`} onClose={onClose}><div className="player-detail-head"><span className={`detail-shirt club-${player.clubCode.toLowerCase()}`}>{player.shirt}</span><div><b>{player.club}</b><small>{money(player.price)} <span className={player.change >= 0 ? 'green-text' : 'red-text'}>{player.change >= 0 ? '+' : ''}{player.change.toFixed(1)} this GW</span></small></div><strong>{expectedPoints(player, weights).toFixed(1)}<small> xPts</small></strong></div><div className="stat-grid"><div><span>SEASON POINTS</span><b>{player.points}</b></div><div><span>FORM</span><b>{player.form.toFixed(1)}</b></div><div><span>xG / 90</span><b>{player.xG.toFixed(2)}</b></div><div><span>xA / 90</span><b>{player.xA.toFixed(2)}</b></div><div><span>ICT INDEX</span><b>{player.ict}</b></div><div><span>SELECTED BY</span><b>{player.selectedBy.toFixed(1)}%</b></div></div><div className="detail-section-head"><b>Upcoming fixtures</b><small>Difficulty rating</small></div><div className="detail-fixtures">{player.fdr.map((difficulty, index) => <div className="detail-fixture" key={index}><span>GW{index + 7}</span><b className={fixtureTone(difficulty)}>{difficulty}</b><small>{difficulty < 3 ? 'Favorable' : difficulty === 3 ? 'Balanced' : 'Tough'}</small></div>)}</div><div className="history-block"><div className="detail-section-head"><b>Recent form</b><small>Points trend · last 6</small></div><div className="history-chart">{[0.52, 0.7, 0.46, 0.83, 0.62, Math.min(1, player.form / 10)].map((height, index) => <span key={index} style={{ height: `${height * 100}%` }}><i>GW{index + 1}</i></span>)}</div></div></ModalShell>
}

function ShareModal({ onDownload, onCopy, onClose }: { onDownload: () => void; onCopy: () => void; onClose: () => void }) {
  return <ModalShell title="Share your lineup" eyebrow="A LITTLE TACTICAL EDGE" onClose={onClose}><p className="modal-intro">Take your projected XI with you. Export a clean lineup graphic or copy a text summary.</p><div className="share-preview"><div><span>FPL SNEH · GW07</span><b>Projected XI</b><strong>Captain-led. Model-backed.</strong></div><Activity size={29} /></div><div className="modal-actions"><button className="secondary-action" onClick={onCopy}><Clipboard size={14} /> Copy summary</button><button className="primary-action" onClick={onDownload}><Download size={14} /> Export lineup card</button></div></ModalShell>
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
