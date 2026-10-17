import type { Position } from './engine'

export const money = (value: number) => `£${value.toFixed(1)}m`

export const fixtureTone = (fdr: number) => {
  if (fdr <= 2) return 'easy'
  if (fdr === 3) return 'steady'
  return 'hard'
}

export const positionLabels: Record<Position, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
}

export const flagTone = (player: { status?: string; chance?: number | null }) => {
  if (player.status === 'i' || player.status === 'u' || player.status === 's') return 'red'
  if (player.status === 'd' || player.status === 'n') return 'amber'
  return null
}

export const flagLabel = (player: { status?: string; chance?: number | null }) => {
  if (player.status === 'i') return 'INJ'
  if (player.status === 'u') return 'OUT'
  if (player.status === 's') return 'SUS'
  if (player.status === 'd') return `${player.chance ?? 25}%`
  if (player.status === 'n') return 'N/A'
  return ''
}
