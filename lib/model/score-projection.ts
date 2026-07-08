import { normalizeRate, round2 } from './math';
import type { Rating } from './types';

export type TeamSeasonScoring = {
  games: number;
  pointsFor: number | null;
  pointsAllowed: number | null;
  offensivePpd: number | null;
  defensivePpd: number | null;
  playsPerGame: number | null;
  drivesPerGame: number | null;
  passRate: number | null;
};

export type ScoreProjection = {
  teamA: number;
  teamB: number;
  projectedTotal: number;
  paceFactor: number;
  teamAExpected: number;
  teamBExpected: number;
  mode: 'preseason' | 'full-season';
  explanation: string;
};

type ScoreProjectionOptions = {
  season: number;
  teamAMargin: number;
  teamAStats?: TeamSeasonScoring | null;
  teamBStats?: TeamSeasonScoring | null;
  leaguePointsPerTeam?: number | null;
};

const DEFAULT_POINTS_PER_TEAM = 27;
const DEFAULT_DRIVES_PER_GAME = 12;
const COMMON_FOOTBALL_SCORES = [
  0, 2, 3, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17,
  20, 21, 23, 24, 26, 27, 28, 30, 31, 33, 34, 35,
  37, 38, 40, 41, 42, 44, 45, 47, 48, 49, 51, 52,
  54, 55, 56, 58, 59, 61, 62, 63, 65, 66, 68, 69,
  70, 72, 73, 75, 76, 77, 79, 80, 82, 83, 84
];

export function projectMatchupScore(
  teamA: Rating,
  teamB: Rating,
  options: ScoreProjectionOptions
): ScoreProjection {
  const useSeasonStats = options.season < 2026;
  const leaguePoints = clamp(
    useSeasonStats
      ? finiteOr(options.leaguePointsPerTeam, DEFAULT_POINTS_PER_TEAM)
      : DEFAULT_POINTS_PER_TEAM,
    20,
    36
  );
  const teamAExpected = expectedPoints(
    teamA,
    teamB,
    useSeasonStats ? options.teamAStats : null,
    useSeasonStats ? options.teamBStats : null,
    leaguePoints
  );
  const teamBExpected = expectedPoints(
    teamB,
    teamA,
    useSeasonStats ? options.teamBStats : null,
    useSeasonStats ? options.teamAStats : null,
    leaguePoints
  );
  const paceFactor = calculatePaceFactor(
    teamA,
    teamB,
    useSeasonStats ? options.teamAStats : null,
    useSeasonStats ? options.teamBStats : null
  );
  const unpacedTotal = teamAExpected + teamBExpected;
  const pacedTotal = unpacedTotal * (0.72 + paceFactor * 0.28);
  const minimumTotal = Math.abs(options.teamAMargin) + 6;
  const projectedTotal = clamp(pacedTotal, Math.max(20, minimumTotal), 96);
  const targetA = (projectedTotal + options.teamAMargin) / 2;
  const targetB = (projectedTotal - options.teamAMargin) / 2;
  const score = chooseFootballScore(targetA, targetB, options.teamAMargin, projectedTotal);

  return {
    ...score,
    projectedTotal: round2(score.teamA + score.teamB),
    paceFactor: round2(paceFactor),
    teamAExpected: round2(teamAExpected),
    teamBExpected: round2(teamBExpected),
    mode: useSeasonStats ? 'full-season' : 'preseason',
    explanation: useSeasonStats
      ? 'Full-season scoring, efficiency, pace, scheme, and opponent-adjusted ratings'
      : 'Preseason talent, coaching, scheme, and matchup ratings; no season stats'
  };
}

function expectedPoints(
  offense: Rating,
  defense: Rating,
  offenseStats: TeamSeasonScoring | null | undefined,
  defenseStats: TeamSeasonScoring | null | undefined,
  leaguePoints: number
) {
  const passRate = normalizeRate(offenseStats?.passRate ?? offense.passRate);
  const rushRate = 1 - passRate;
  const schemeOffense = offense.passOff * passRate + offense.rushOff * rushRate;
  const schemeDefense = defense.passDef * passRate + defense.rushDef * rushRate;
  const schemeGap = schemeOffense - schemeDefense;
  const overallGap = offense.offRating - defense.defRating;
  const ratingEstimate = leaguePoints + schemeGap * 0.22 + overallGap * 0.10;

  if (!offenseStats?.games || !defenseStats?.games) {
    return clamp(ratingEstimate, 3, 58);
  }

  const offensePoints = regressToMean(
    offenseStats.pointsFor,
    leaguePoints,
    offenseStats.games,
    3
  );
  const defenseAllowance = regressToMean(
    defenseStats.pointsAllowed,
    leaguePoints,
    defenseStats.games,
    3
  );
  const scoringEstimate = offensePoints * 0.56 + defenseAllowance * 0.44;
  const expectedDrives = averageFinite([
    offenseStats.drivesPerGame,
    defenseStats.drivesPerGame
  ]) ?? DEFAULT_DRIVES_PER_GAME;
  const leaguePpd = leaguePoints / DEFAULT_DRIVES_PER_GAME;
  const offensePpd = regressToMean(
    offenseStats.offensivePpd,
    leaguePpd,
    offenseStats.games,
    4
  );
  const defensePpd = regressToMean(
    defenseStats.defensivePpd,
    leaguePpd,
    defenseStats.games,
    4
  );
  const efficiencyEstimate = ((offensePpd + defensePpd) / 2) * expectedDrives;

  return clamp(
    scoringEstimate * 0.50 + efficiencyEstimate * 0.22 + ratingEstimate * 0.28,
    2,
    62
  );
}

function calculatePaceFactor(
  teamA: Rating,
  teamB: Rating,
  teamAStats: TeamSeasonScoring | null | undefined,
  teamBStats: TeamSeasonScoring | null | undefined
) {
  const drives = averageFinite([
    teamAStats?.drivesPerGame,
    teamBStats?.drivesPerGame
  ]);
  const plays = averageFinite([
    teamAStats?.playsPerGame,
    teamBStats?.playsPerGame
  ]);

  if (drives !== null || plays !== null) {
    const drivesFactor = drives === null ? 1 : drives / DEFAULT_DRIVES_PER_GAME;
    const playsFactor = plays === null ? 1 : plays / 70;
    return clamp(drivesFactor * 0.65 + playsFactor * 0.35, 0.86, 1.14);
  }

  const averagePassRate = (
    normalizeRate(teamA.passRate) + normalizeRate(teamB.passRate)
  ) / 2;
  return clamp(1 + (averagePassRate - 0.5) * 0.3, 0.94, 1.06);
}

function chooseFootballScore(
  targetA: number,
  targetB: number,
  targetMargin: number,
  targetTotal: number
) {
  let best = { teamA: 0, teamB: 0, cost: Number.POSITIVE_INFINITY };

  for (const teamA of COMMON_FOOTBALL_SCORES) {
    for (const teamB of COMMON_FOOTBALL_SCORES) {
      const scoreError = square(teamA - targetA) + square(teamB - targetB);
      const marginError = square((teamA - teamB) - targetMargin);
      const totalError = square((teamA + teamB) - targetTotal);
      const cost = scoreError * 0.55 + marginError * 2.4 + totalError * 0.25;
      if (cost < best.cost) best = { teamA, teamB, cost };
    }
  }

  return { teamA: best.teamA, teamB: best.teamB };
}

function regressToMean(
  value: number | null | undefined,
  mean: number,
  sampleSize: number,
  priorGames: number
) {
  const observed = finiteOr(value, mean);
  const weight = clamp(sampleSize / (sampleSize + priorGames), 0, 1);
  return observed * weight + mean * (1 - weight);
}

function averageFinite(values: Array<number | null | undefined>) {
  const numbers = values
    .map(Number)
    .filter(Number.isFinite);
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function finiteOr(value: number | null | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function square(value: number) {
  return value * value;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
