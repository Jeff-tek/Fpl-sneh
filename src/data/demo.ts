import type { Player } from '../lib/engine'

export const demoSquad: Player[] = [
  { id: 1, name: 'Alisson', club: 'Liverpool', clubCode: 'LIV', shirt: '1', position: 'GK', price: 5.5, form: 5.8, xG: 0.01, xA: 0.02, ict: 23, points: 31, selectedBy: 12.8, change: 0.1, fdr: [3, 2, 4, 2, 3], home: false },
  { id: 2, name: 'Pickford', club: 'Everton', clubCode: 'EVE', shirt: '1', position: 'GK', price: 4.8, form: 4.1, xG: 0, xA: 0.01, ict: 17, points: 27, selectedBy: 15.1, change: 0, fdr: [2, 4, 3, 2, 4], home: true },
  { id: 3, name: 'Saliba', club: 'Arsenal', clubCode: 'ARS', shirt: '2', position: 'DEF', price: 6.1, form: 6.8, xG: 0.11, xA: 0.04, ict: 66, points: 39, selectedBy: 31.4, change: 0.1, fdr: [2, 3, 2, 4, 2], home: true },
  { id: 4, name: 'Gabriel', club: 'Arsenal', clubCode: 'ARS', shirt: '6', position: 'DEF', price: 6.2, form: 7.2, xG: 0.19, xA: 0.03, ict: 75, points: 42, selectedBy: 25.1, change: 0.2, fdr: [2, 3, 2, 4, 2], home: true },
  { id: 5, name: 'Gvardiol', club: 'Man City', clubCode: 'MCI', shirt: '24', position: 'DEF', price: 6.0, form: 5.3, xG: 0.16, xA: 0.12, ict: 64, points: 34, selectedBy: 28.9, change: 0, fdr: [3, 2, 2, 3, 4], home: false },
  { id: 6, name: 'Porro', club: 'Tottenham', clubCode: 'TOT', shirt: '23', position: 'DEF', price: 5.8, form: 6.4, xG: 0.08, xA: 0.29, ict: 79, points: 36, selectedBy: 18.4, change: 0.1, fdr: [3, 2, 3, 4, 2], home: true },
  { id: 7, name: 'Robinson', club: 'Fulham', clubCode: 'FUL', shirt: '33', position: 'DEF', price: 4.8, form: 5.2, xG: 0.03, xA: 0.22, ict: 49, points: 28, selectedBy: 12.3, change: 0.1, fdr: [2, 4, 3, 2, 3], home: false },
  { id: 8, name: 'Salah', club: 'Liverpool', clubCode: 'LIV', shirt: '11', position: 'MID', price: 12.8, form: 9.2, xG: 0.64, xA: 0.38, ict: 142, points: 59, selectedBy: 43.7, change: 0.3, fdr: [3, 2, 4, 2, 3], home: false, isLive: true, livePoints: 8, bps: 27 },
  { id: 9, name: 'Saka', club: 'Arsenal', clubCode: 'ARS', shirt: '7', position: 'MID', price: 10.1, form: 8.1, xG: 0.48, xA: 0.39, ict: 122, points: 52, selectedBy: 38.2, change: 0.2, fdr: [2, 3, 2, 4, 2], home: true },
  { id: 10, name: 'Palmer', club: 'Chelsea', clubCode: 'CHE', shirt: '20', position: 'MID', price: 10.6, form: 8.8, xG: 0.51, xA: 0.36, ict: 119, points: 55, selectedBy: 46.5, change: 0.2, fdr: [4, 2, 3, 2, 3], home: false },
  { id: 11, name: 'Mbeumo', club: 'Brentford', clubCode: 'BRE', shirt: '19', position: 'MID', price: 7.8, form: 7.6, xG: 0.49, xA: 0.24, ict: 103, points: 46, selectedBy: 26.3, change: 0.1, fdr: [2, 3, 2, 3, 4], home: true },
  { id: 12, name: 'Rogers', club: 'Aston Villa', clubCode: 'AVL', shirt: '27', position: 'MID', price: 5.3, form: 5.6, xG: 0.21, xA: 0.18, ict: 57, points: 32, selectedBy: 21.3, change: 0.1, fdr: [4, 2, 3, 2, 4], home: false },
  { id: 13, name: 'Haaland', club: 'Man City', clubCode: 'MCI', shirt: '9', position: 'FWD', price: 15.3, form: 8.9, xG: 0.89, xA: 0.12, ict: 136, points: 57, selectedBy: 54.2, change: 0.3, fdr: [3, 2, 2, 3, 4], home: false },
  { id: 14, name: 'Watkins', club: 'Aston Villa', clubCode: 'AVL', shirt: '11', position: 'FWD', price: 9.1, form: 7.1, xG: 0.54, xA: 0.21, ict: 96, points: 43, selectedBy: 30.8, change: 0.1, fdr: [4, 2, 3, 2, 4], home: false },
  { id: 15, name: 'Isak', club: 'Newcastle', clubCode: 'NEW', shirt: '14', position: 'FWD', price: 8.8, form: 6.6, xG: 0.61, xA: 0.13, ict: 88, points: 37, selectedBy: 18.7, change: 0, fdr: [2, 3, 4, 2, 3], home: true },
]

export const transferMarket: Player[] = [
  { id: 16, name: 'Raya', club: 'Arsenal', clubCode: 'ARS', shirt: '22', position: 'GK', price: 5.6, form: 6.2, xG: 0.02, xA: 0, ict: 22, points: 33, selectedBy: 17.2, change: 0.1, fdr: [2, 3, 2, 4, 2], home: true },
  { id: 17, name: 'Virgil van Dijk', club: 'Liverpool', clubCode: 'LIV', shirt: '4', position: 'DEF', price: 6.3, form: 6.2, xG: 0.1, xA: 0.08, ict: 63, points: 35, selectedBy: 19.2, change: 0.1, fdr: [3, 2, 4, 2, 3], home: false },
  { id: 18, name: 'TAA', club: 'Liverpool', clubCode: 'LIV', shirt: '66', position: 'DEF', price: 7.0, form: 6.8, xG: 0.11, xA: 0.43, ict: 95, points: 41, selectedBy: 22.5, change: 0, fdr: [3, 2, 4, 2, 3], home: false },
  { id: 19, name: 'Foden', club: 'Man City', clubCode: 'MCI', shirt: '47', position: 'MID', price: 9.3, form: 7.9, xG: 0.44, xA: 0.29, ict: 107, points: 47, selectedBy: 14.9, change: 0.1, fdr: [3, 2, 2, 3, 4], home: false },
  { id: 20, name: 'Son', club: 'Tottenham', clubCode: 'TOT', shirt: '7', position: 'MID', price: 9.8, form: 7.3, xG: 0.53, xA: 0.18, ict: 91, points: 44, selectedBy: 15.4, change: 0, fdr: [3, 2, 3, 4, 2], home: true },
  { id: 21, name: 'Jackson', club: 'Chelsea', clubCode: 'CHE', shirt: '15', position: 'FWD', price: 7.8, form: 6.9, xG: 0.61, xA: 0.24, ict: 89, points: 39, selectedBy: 12.1, change: 0.1, fdr: [4, 2, 3, 2, 3], home: false },
  { id: 22, name: 'Solanke', club: 'Bournemouth', clubCode: 'BOU', shirt: '9', position: 'FWD', price: 7.4, form: 7.4, xG: 0.58, xA: 0.16, ict: 84, points: 42, selectedBy: 16.8, change: 0.1, fdr: [2, 3, 2, 3, 4], home: true },
]

export const managerNames: Record<number, string> = { 2432: 'Sneh United', 1: 'The Untouchables' }
