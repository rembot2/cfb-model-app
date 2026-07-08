export type HistoricalMarginResult = {
  modelHomeMargin: number;
  actualHomeMargin: number;
};

export type CoachDevelopmentInput = {
  developmentRating: string;
  hireYear: number | null;
};

export type WinProbabilityCalibration = {
  spreadProbability: number;
  empiricalProbability: number | null;
  similarGames: number;
  coachAdjustment: number;
  finalProbability: number;
};

const MARGIN_STANDARD_DEVIATION = 14;
const EMPIRICAL_BANDWIDTH = 3.5;
const EMPIRICAL_PRIOR_WEIGHT = 30;
const MAX_EMPIRICAL_WEIGHT = 0.70;
const DEVELOPMENT_ADJUSTMENTS: Record<string, number> = {
  elite: 0.015,
  good: 0.0075,
  average: 0,
  poor: -0.0075,
  terrible: -0.015
};

export function calibrateWinProbability(
  teamMargin: number,
  history: HistoricalMarginResult[],
  teamCoach: CoachDevelopmentInput | null,
  opponentCoach: CoachDevelopmentInput | null,
  season: number
): WinProbabilityCalibration {
  const favoriteMargin = Math.abs(teamMargin);
  const favoriteSpreadProbability = normalCdf(
    favoriteMargin / MARGIN_STANDARD_DEVIATION
  );
  const spreadProbability = teamMargin === 0
    ? 0.5
    : teamMargin > 0
      ? favoriteSpreadProbability
      : 1 - favoriteSpreadProbability;
  const empirical = empiricalFavoriteProbability(favoriteMargin, history);
  const empiricalProbability = empirical.probability === null
    ? null
    : teamMargin >= 0
      ? empirical.probability
      : 1 - empirical.probability;
  const empiricalWeight = empirical.probability === null
    ? 0
    : Math.min(
      MAX_EMPIRICAL_WEIGHT,
      empirical.weight / (empirical.weight + EMPIRICAL_PRIOR_WEIGHT)
    );
  const calibratedProbability = empiricalProbability === null
    ? spreadProbability
    : spreadProbability * (1 - empiricalWeight) + empiricalProbability * empiricalWeight;
  const coachAdjustment = coachDevelopmentAdjustment(
    teamCoach,
    opponentCoach,
    season
  );
  const finalProbability = clamp(
    calibratedProbability + coachAdjustment,
    0.02,
    0.98
  );

  return {
    spreadProbability: round4(spreadProbability),
    empiricalProbability: empiricalProbability === null
      ? null
      : round4(empiricalProbability),
    similarGames: empirical.similarGames,
    coachAdjustment: round4(coachAdjustment),
    finalProbability: round4(finalProbability)
  };
}

function empiricalFavoriteProbability(
  favoriteMargin: number,
  history: HistoricalMarginResult[]
) {
  if (favoriteMargin === 0) {
    return { probability: null, weight: 0, similarGames: 0 };
  }

  let weightedWins = 0;
  let weight = 0;
  let similarGames = 0;

  for (const row of history) {
    if (!Number.isFinite(row.modelHomeMargin) || !Number.isFinite(row.actualHomeMargin)) {
      continue;
    }
    const historicalMargin = Math.abs(row.modelHomeMargin);
    if (historicalMargin === 0) continue;
    const distance = historicalMargin - favoriteMargin;
    if (Math.abs(distance) <= 2.5) similarGames += 1;
    if (Math.abs(distance) > 10) continue;

    const rowWeight = Math.exp(
      -(distance * distance) / (2 * EMPIRICAL_BANDWIDTH * EMPIRICAL_BANDWIDTH)
    );
    const favoriteWon = Math.sign(row.modelHomeMargin) * row.actualHomeMargin > 0
      ? 1
      : 0;
    weightedWins += favoriteWon * rowWeight;
    weight += rowWeight;
  }

  return {
    probability: weight > 0 ? weightedWins / weight : null,
    weight,
    similarGames
  };
}

function coachDevelopmentAdjustment(
  teamCoach: CoachDevelopmentInput | null,
  opponentCoach: CoachDevelopmentInput | null,
  season: number
) {
  return activeCoachAdjustment(teamCoach, season) -
    activeCoachAdjustment(opponentCoach, season);
}

function activeCoachAdjustment(
  coach: CoachDevelopmentInput | null,
  season: number
) {
  if (!coach) return 0;
  if (coach.hireYear && coach.hireYear > season) return 0;
  return DEVELOPMENT_ADJUSTMENTS[String(coach.developmentRating || 'average').toLowerCase()] ?? 0;
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (
    0.254829592 * t -
    0.284496736 * t ** 2 +
    1.421413741 * t ** 3 -
    1.453152027 * t ** 4 +
    1.061405429 * t ** 5
  ) * Math.exp(-(x * x));
  return 0.5 * (1 + sign * erf);
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
