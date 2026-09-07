// Data transcribed from "Monte Carlo 2025 Season Predictions - Phillips-David Model"
// 10,000 simulated seasons, preseason 2025 run.

export type ConferenceName = 'ACC' | 'Big 12' | 'Big Ten' | 'FBS Independents' | 'SEC';

export type TeamSim = {
  rank: number;
  team: string;
  conference: ConferenceName;
  avgW: number;
  med: number;
  floor: number;
  ceiling: number;
  stdDev: number;
  range80: string;
};

export const SIMULATIONS = 10000;

const CONFERENCE_MAP: Record<string, ConferenceName> = {
  Miami: 'ACC', Louisville: 'ACC', SMU: 'ACC', California: 'ACC', Clemson: 'ACC', Duke: 'ACC',
  'Virginia Tech': 'ACC', Virginia: 'ACC', Pittsburgh: 'ACC', Syracuse: 'ACC', 'NC State': 'ACC',
  'Georgia Tech': 'ACC', 'Wake Forest': 'ACC', 'Florida State': 'ACC', Stanford: 'ACC',
  'North Carolina': 'ACC', 'Boston College': 'ACC',

  'Texas Tech': 'Big 12', BYU: 'Big 12', 'Kansas State': 'Big 12', Houston: 'Big 12', Utah: 'Big 12',
  TCU: 'Big 12', 'Oklahoma State': 'Big 12', UCF: 'Big 12', Colorado: 'Big 12', Cincinnati: 'Big 12',
  Arizona: 'Big 12', 'West Virginia': 'Big 12', 'Arizona State': 'Big 12', Baylor: 'Big 12',
  'Iowa State': 'Big 12', Kansas: 'Big 12',

  Oregon: 'Big Ten', 'Ohio State': 'Big Ten', Indiana: 'Big Ten', USC: 'Big Ten', 'Penn State': 'Big Ten',
  Michigan: 'Big Ten', Washington: 'Big Ten', Iowa: 'Big Ten', Maryland: 'Big Ten', UCLA: 'Big Ten',
  Nebraska: 'Big Ten', Rutgers: 'Big Ten', Minnesota: 'Big Ten', Wisconsin: 'Big Ten', Illinois: 'Big Ten',
  Northwestern: 'Big Ten', 'Michigan State': 'Big Ten', Purdue: 'Big Ten',

  'Notre Dame': 'FBS Independents',

  Georgia: 'SEC', Texas: 'SEC', LSU: 'SEC', 'Texas A&M': 'SEC', Alabama: 'SEC', Oklahoma: 'SEC',
  Tennessee: 'SEC', Florida: 'SEC', 'Ole Miss': 'SEC', Missouri: 'SEC', Vanderbilt: 'SEC', Auburn: 'SEC',
  'South Carolina': 'SEC', Kentucky: 'SEC', 'Mississippi State': 'SEC', Arkansas: 'SEC'
};

type RawRow = [number, string, number, number, number, number, number, string];

const RAW_ROWS: RawRow[] = [
  [1, 'Miami', 10.5, 11.0, 6, 12, 1.00, '9–12 wins'],
  [2, 'Texas Tech', 10.3, 10.0, 6, 12, 1.07, '9–12 wins'],
  [3, 'Oregon', 10.2, 10.0, 5, 12, 1.11, '9–12 wins'],
  [4, 'Notre Dame', 10.2, 10.0, 5, 12, 1.17, '9–12 wins'],
  [5, 'Georgia', 9.8, 10.0, 4, 12, 1.26, '8–11 wins'],
  [6, 'BYU', 9.7, 10.0, 5, 12, 1.24, '8–11 wins'],
  [7, 'Ohio State', 9.5, 10.0, 5, 12, 1.21, '8–11 wins'],
  [8, 'Texas', 9.4, 10.0, 4, 12, 1.30, '8–11 wins'],
  [9, 'Indiana', 9.4, 10.0, 4, 12, 1.26, '8–11 wins'],
  [10, 'LSU', 9.0, 9.0, 4, 12, 1.36, '7–11 wins'],
  [11, 'Texas A&M', 9.0, 9.0, 3, 12, 1.31, '7–11 wins'],
  [12, 'Alabama', 9.0, 9.0, 3, 12, 1.31, '7–11 wins'],
  [13, 'Kansas State', 8.9, 9.0, 3, 12, 1.38, '7–11 wins'],
  [14, 'Louisville', 8.8, 9.0, 4, 12, 1.36, '7–11 wins'],
  [15, 'SMU', 8.7, 9.0, 4, 12, 1.28, '7–10 wins'],
  [16, 'USC', 8.7, 9.0, 3, 12, 1.35, '7–10 wins'],
  [17, 'Houston', 8.6, 9.0, 4, 12, 1.31, '7–10 wins'],
  [18, 'Penn State', 8.4, 8.0, 4, 12, 1.24, '7–10 wins'],
  [19, 'California', 8.3, 8.0, 3, 12, 1.45, '6–10 wins'],
  [20, 'Michigan', 8.2, 8.0, 3, 12, 1.27, '7–10 wins'],
  [21, 'Washington', 8.0, 8.0, 3, 12, 1.27, '6–10 wins'],
  [22, 'Utah', 7.9, 8.0, 2, 12, 1.47, '6–10 wins'],
  [23, 'Clemson', 7.7, 8.0, 3, 12, 1.36, '6–9 wins'],
  [24, 'Duke', 7.6, 8.0, 2, 12, 1.36, '6–9 wins'],
  [25, 'Oklahoma', 7.6, 8.0, 2, 12, 1.39, '6–9 wins'],
  [26, 'Iowa', 7.5, 8.0, 3, 12, 1.33, '6–9 wins'],
  [27, 'Maryland', 7.5, 7.0, 3, 12, 1.38, '6–9 wins'],
  [28, 'TCU', 7.4, 7.0, 3, 12, 1.35, '6–9 wins'],
  [29, 'UCLA', 7.2, 7.0, 3, 12, 1.27, '6–9 wins'],
  [30, 'Virginia Tech', 7.2, 7.0, 2, 12, 1.36, '5–9 wins'],
  [31, 'Tennessee', 7.1, 7.0, 2, 11, 1.38, '5–9 wins'],
  [32, 'Oklahoma State', 7.0, 7.0, 2, 12, 1.42, '5–9 wins'],
  [33, 'Virginia', 6.9, 7.0, 2, 12, 1.55, '5–9 wins'],
  [34, 'UCF', 6.9, 7.0, 2, 12, 1.41, '5–9 wins'],
  [35, 'Nebraska', 6.9, 7.0, 3, 12, 1.30, '5–9 wins'],
  [36, 'Florida', 6.9, 7.0, 2, 12, 1.41, '5–9 wins'],
  [37, 'Pittsburgh', 6.8, 7.0, 3, 12, 1.31, '5–8 wins'],
  [38, 'Ole Miss', 6.6, 7.0, 2, 12, 1.44, '5–8 wins'],
  [39, 'Colorado', 6.6, 7.0, 1, 12, 1.56, '5–9 wins'],
  [40, 'Missouri', 6.6, 7.0, 2, 12, 1.49, '5–8 wins'],
  [41, 'Vanderbilt', 6.5, 6.0, 2, 11, 1.27, '5–8 wins'],
  [42, 'Auburn', 6.4, 6.0, 2, 11, 1.29, '5–8 wins'],
  [43, 'Syracuse', 6.4, 6.0, 2, 12, 1.49, '4–8 wins'],
  [44, 'NC State', 6.1, 6.0, 2, 11, 1.47, '4–8 wins'],
  [45, 'Cincinnati', 6.0, 6.0, 2, 11, 1.36, '4–8 wins'],
  [46, 'Arizona', 5.9, 6.0, 3, 11, 1.30, '4–8 wins'],
  [47, 'West Virginia', 5.9, 6.0, 1, 11, 1.52, '4–8 wins'],
  [48, 'South Carolina', 5.9, 6.0, 2, 11, 1.42, '4–8 wins'],
  [49, 'Rutgers', 5.8, 6.0, 2, 11, 1.43, '4–8 wins'],
  [50, 'Georgia Tech', 5.8, 6.0, 1, 11, 1.46, '4–8 wins'],
  [51, 'Wake Forest', 5.7, 6.0, 2, 10, 1.34, '4–7 wins'],
  [52, 'Arizona State', 5.6, 6.0, 1, 10, 1.43, '4–7 wins'],
  [53, 'Florida State', 5.4, 5.0, 2, 11, 1.32, '4–7 wins'],
  [54, 'Minnesota', 5.2, 5.0, 2, 10, 1.44, '3–7 wins'],
  [55, 'Kentucky', 5.2, 5.0, 2, 11, 1.41, '3–7 wins'],
  [56, 'Wisconsin', 5.2, 5.0, 1, 11, 1.38, '4–7 wins'],
  [57, 'Illinois', 5.2, 5.0, 1, 10, 1.44, '3–7 wins'],
  [58, 'Mississippi State', 5.2, 5.0, 2, 11, 1.37, '4–7 wins'],
  [59, 'Baylor', 5.2, 5.0, 2, 11, 1.38, '3–7 wins'],
  [60, 'Iowa State', 5.0, 5.0, 2, 10, 1.40, '3–7 wins'],
  [61, 'Northwestern', 4.4, 4.0, 1, 10, 1.44, '3–6 wins'],
  [62, 'Michigan State', 4.4, 4.0, 2, 11, 1.22, '3–6 wins'],
  [63, 'Arkansas', 4.3, 4.0, 2, 9, 1.30, '3–6 wins'],
  [64, 'Stanford', 4.1, 4.0, 2, 9, 1.23, '3–6 wins'],
  [65, 'Kansas', 4.1, 4.0, 1, 10, 1.46, '2–6 wins'],
  [66, 'North Carolina', 4.0, 4.0, 2, 9, 1.20, '2–6 wins'],
  [67, 'Purdue', 3.6, 4.0, 1, 9, 1.31, '2–5 wins'],
  [68, 'Boston College', 3.2, 3.0, 1, 9, 1.24, '2–5 wins']
];

export const TEAM_SIMS: TeamSim[] = RAW_ROWS.map(
  ([rank, team, avgW, med, floor, ceiling, stdDev, range80]) => ({
    rank,
    team,
    conference: CONFERENCE_MAP[team],
    avgW,
    med,
    floor,
    ceiling,
    stdDev,
    range80
  })
);

export const CONFERENCE_ORDER: ConferenceName[] = ['SEC', 'Big Ten', 'Big 12', 'ACC', 'FBS Independents'];

export type WinDistribution = {
  team: string;
  avgW: number;
  dist: { wins: number; pct: number }[];
};

export const WIN_DISTRIBUTIONS: WinDistribution[] = [
  { team: 'Miami', avgW: 10.5, dist: [{ wins: 8, pct: 3 }, { wins: 9, pct: 12 }, { wins: 10, pct: 32 }, { wins: 11, pct: 39 }, { wins: 12, pct: 14 }] },
  { team: 'Texas Tech', avgW: 10.3, dist: [{ wins: 8, pct: 5 }, { wins: 9, pct: 17 }, { wins: 10, pct: 33 }, { wins: 11, pct: 33 }, { wins: 12, pct: 12 }] },
  { team: 'Oregon', avgW: 10.2, dist: [{ wins: 7, pct: 1 }, { wins: 8, pct: 5 }, { wins: 9, pct: 18 }, { wins: 10, pct: 32 }, { wins: 11, pct: 32 }, { wins: 12, pct: 12 }] },
  { team: 'Notre Dame', avgW: 10.2, dist: [{ wins: 7, pct: 1 }, { wins: 8, pct: 6 }, { wins: 9, pct: 17 }, { wins: 10, pct: 31 }, { wins: 11, pct: 32 }, { wins: 12, pct: 13 }] },
  { team: 'Georgia', avgW: 9.8, dist: [{ wins: 7, pct: 4 }, { wins: 8, pct: 11 }, { wins: 9, pct: 24 }, { wins: 10, pct: 31 }, { wins: 11, pct: 23 }, { wins: 12, pct: 7 }] },
  { team: 'BYU', avgW: 9.7, dist: [{ wins: 7, pct: 4 }, { wins: 8, pct: 12 }, { wins: 9, pct: 25 }, { wins: 10, pct: 32 }, { wins: 11, pct: 21 }, { wins: 12, pct: 5 }] },
  { team: 'Ohio State', avgW: 9.5, dist: [{ wins: 7, pct: 4 }, { wins: 8, pct: 15 }, { wins: 9, pct: 29 }, { wins: 10, pct: 30 }, { wins: 11, pct: 17 }, { wins: 12, pct: 4 }] },
  { team: 'Texas', avgW: 9.4, dist: [{ wins: 6, pct: 1 }, { wins: 7, pct: 6 }, { wins: 8, pct: 16 }, { wins: 9, pct: 26 }, { wins: 10, pct: 29 }, { wins: 11, pct: 17 }, { wins: 12, pct: 4 }] },
  { team: 'Indiana', avgW: 9.4, dist: [{ wins: 6, pct: 1 }, { wins: 7, pct: 5 }, { wins: 8, pct: 15 }, { wins: 9, pct: 28 }, { wins: 10, pct: 30 }, { wins: 11, pct: 17 }, { wins: 12, pct: 3 }] },
  { team: 'LSU', avgW: 9.0, dist: [{ wins: 6, pct: 3 }, { wins: 7, pct: 9 }, { wins: 8, pct: 21 }, { wins: 9, pct: 29 }, { wins: 10, pct: 24 }, { wins: 11, pct: 12 }, { wins: 12, pct: 2 }] },
  { team: 'Texas A&M', avgW: 9.0, dist: [{ wins: 6, pct: 2 }, { wins: 7, pct: 10 }, { wins: 8, pct: 21 }, { wins: 9, pct: 30 }, { wins: 10, pct: 24 }, { wins: 11, pct: 10 }, { wins: 12, pct: 2 }] },
  { team: 'Alabama', avgW: 9.0, dist: [{ wins: 6, pct: 3 }, { wins: 7, pct: 9 }, { wins: 8, pct: 23 }, { wins: 9, pct: 30 }, { wins: 10, pct: 24 }, { wins: 11, pct: 10 }, { wins: 12, pct: 2 }] },
  { team: 'Kansas State', avgW: 8.9, dist: [{ wins: 6, pct: 3 }, { wins: 7, pct: 11 }, { wins: 8, pct: 21 }, { wins: 9, pct: 29 }, { wins: 10, pct: 22 }, { wins: 11, pct: 10 }, { wins: 12, pct: 2 }] },
  { team: 'Louisville', avgW: 8.8, dist: [{ wins: 6, pct: 4 }, { wins: 7, pct: 12 }, { wins: 8, pct: 23 }, { wins: 9, pct: 29 }, { wins: 10, pct: 22 }, { wins: 11, pct: 9 }, { wins: 12, pct: 2 }] },
  { team: 'SMU', avgW: 8.7, dist: [{ wins: 6, pct: 4 }, { wins: 7, pct: 13 }, { wins: 8, pct: 25 }, { wins: 9, pct: 31 }, { wins: 10, pct: 20 }, { wins: 11, pct: 6 }] },
  { team: 'USC', avgW: 8.7, dist: [{ wins: 6, pct: 4 }, { wins: 7, pct: 14 }, { wins: 8, pct: 25 }, { wins: 9, pct: 28 }, { wins: 10, pct: 20 }, { wins: 11, pct: 7 }, { wins: 12, pct: 1 }] },
  { team: 'Houston', avgW: 8.6, dist: [{ wins: 6, pct: 4 }, { wins: 7, pct: 13 }, { wins: 8, pct: 26 }, { wins: 9, pct: 29 }, { wins: 10, pct: 19 }, { wins: 11, pct: 6 }] },
  { team: 'Penn State', avgW: 8.4, dist: [{ wins: 6, pct: 5 }, { wins: 7, pct: 16 }, { wins: 8, pct: 30 }, { wins: 9, pct: 29 }, { wins: 10, pct: 15 }, { wins: 11, pct: 4 }] },
  { team: 'California', avgW: 8.3, dist: [{ wins: 5, pct: 2 }, { wins: 6, pct: 8 }, { wins: 7, pct: 16 }, { wins: 8, pct: 26 }, { wins: 9, pct: 26 }, { wins: 10, pct: 15 }, { wins: 11, pct: 5 }] },
  { team: 'Michigan', avgW: 8.2, dist: [{ wins: 5, pct: 2 }, { wins: 6, pct: 7 }, { wins: 7, pct: 19 }, { wins: 8, pct: 30 }, { wins: 9, pct: 28 }, { wins: 10, pct: 12 }, { wins: 11, pct: 2 }] }
];

export type PlayoffRow = {
  team: string;
  tenPlus: number;
  ninePlus: number;
  eightPlus: number;
  avgW: number;
};

export const PLAYOFF_PICTURE: PlayoffRow[] = [
  { team: 'Miami', tenPlus: 84.4, ninePlus: 96.7, eightPlus: 99.6, avgW: 10.5 },
  { team: 'Texas Tech', tenPlus: 78.0, ninePlus: 94.5, eightPlus: 99.3, avgW: 10.3 },
  { team: 'Oregon', tenPlus: 76.0, ninePlus: 93.7, eightPlus: 98.8, avgW: 10.2 },
  { team: 'Notre Dame', tenPlus: 75.3, ninePlus: 92.1, eightPlus: 98.4, avgW: 10.2 },
  { team: 'Georgia', tenPlus: 60.5, ninePlus: 84.6, eightPlus: 95.4, avgW: 9.8 },
  { team: 'BYU', tenPlus: 58.4, ninePlus: 83.4, eightPlus: 95.4, avgW: 9.7 },
  { team: 'Ohio State', tenPlus: 51.1, ninePlus: 80.2, eightPlus: 94.8, avgW: 9.5 },
  { team: 'Texas', tenPlus: 50.8, ninePlus: 77.1, eightPlus: 92.8, avgW: 9.4 },
  { team: 'Indiana', tenPlus: 50.0, ninePlus: 78.2, eightPlus: 93.2, avgW: 9.4 },
  { team: 'LSU', tenPlus: 37.9, ninePlus: 67.0, eightPlus: 87.5, avgW: 9.0 },
  { team: 'Texas A&M', tenPlus: 36.2, ninePlus: 66.4, eightPlus: 87.4, avgW: 9.0 },
  { team: 'Alabama', tenPlus: 35.3, ninePlus: 65.0, eightPlus: 87.5, avgW: 9.0 },
  { team: 'Kansas State', tenPlus: 34.9, ninePlus: 63.6, eightPlus: 84.8, avgW: 8.9 },
  { team: 'Louisville', tenPlus: 32.0, ninePlus: 61.1, eightPlus: 83.8, avgW: 8.8 },
  { team: 'SMU', tenPlus: 26.8, ninePlus: 57.9, eightPlus: 82.6, avgW: 8.7 },
  { team: 'USC', tenPlus: 27.8, ninePlus: 56.0, eightPlus: 80.8, avgW: 8.7 },
  { team: 'Houston', tenPlus: 25.9, ninePlus: 55.4, eightPlus: 81.3, avgW: 8.6 },
  { team: 'Penn State', tenPlus: 18.5, ninePlus: 47.4, eightPlus: 77.3, avgW: 8.4 },
  { team: 'California', tenPlus: 21.4, ninePlus: 47.0, eightPlus: 73.2, avgW: 8.3 },
  { team: 'Michigan', tenPlus: 14.2, ninePlus: 41.7, eightPlus: 71.7, avgW: 8.2 },
  { team: 'Washington', tenPlus: 11.3, ninePlus: 35.6, eightPlus: 65.9, avgW: 8.0 },
  { team: 'Utah', tenPlus: 13.8, ninePlus: 35.6, eightPlus: 62.6, avgW: 7.9 },
  { team: 'Clemson', tenPlus: 9.0, ninePlus: 28.6, eightPlus: 57.6, avgW: 7.7 },
  { team: 'Duke', tenPlus: 7.0, ninePlus: 25.5, eightPlus: 53.5, avgW: 7.6 },
  { team: 'Oklahoma', tenPlus: 7.5, ninePlus: 24.9, eightPlus: 52.3, avgW: 7.6 }
];
