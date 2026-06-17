import { normalizeRate, round2, roundToHalf } from './math';
import type { GamePrediction, MatchupAdvantages, ModelCalibration, ModelWeights, Rating, VegasGrade } from './types';

export const DEFAULT_WEIGHTS: ModelWeights = {
  pass: 0.3,
  rush: 0.2,
  overall: 0.25,
  composite: 0.25
};

export const DEFAULT_CALIBRATION: ModelCalibration = {
  pointsPerRating: 1.4,
  homeField: 2.5,
  marginShrink: 0.75,
  maxMargin: 24.5
};

const SIMILAR_TEAM_COMPOSITE_THRESHOLD = 3.0;
const SIMILAR_TEAM_DAMPENER = 0.85;

export function normalizeWeights(weights: ModelWeights): ModelWeights {
  const total = weights.pass + weights.rush + weights.overall + weights.composite;
  if (!total) return DEFAULT_WEIGHTS;
  return {
    pass: weights.pass / total,
    rush: weights.rush / total,
    overall: weights.overall / total,
    composite: weights.composite / total
  };
}

export function calculateMatchupAdvantages(home: Rating, away: Rating): MatchupAdvantages {
  const homePassRate = normalizeRate(home.passRate);
  const awayPassRate = normalizeRate(away.passRate);
  const homeRushRate = 1 - homePassRate;
  const awayRushRate = 1 - awayPassRate;

  const homePassEdge = home.passOff - away.passDef;
  const awayPassEdge = away.passOff - home.passDef;
  const homeRushEdge = home.rushOff - away.rushDef;
  const awayRushEdge = away.rushOff - home.rushDef;
  const homeOverallEdge = home.offRating - away.defRating;
  const awayOverallEdge = away.offRating - home.defRating;

  return {
    passAdv: (homePassEdge * homePassRate) - (awayPassEdge * awayPassRate),
    rushAdv: (homeRushEdge * homeRushRate) - (awayRushEdge * awayRushRate),
    overallAdv: (homeOverallEdge - awayOverallEdge) / 2,
    compositeAdv: home.composite - away.composite,
    homePassRate,
    awayPassRate
  };
}

export function calibrateModelMargin(
  rawHomeMargin: number,
  compositeAdv: number,
  calibration: ModelCalibration
): number {
  let margin = rawHomeMargin;
  if (Math.abs(compositeAdv || 0) < SIMILAR_TEAM_COMPOSITE_THRESHOLD) {
    margin *= SIMILAR_TEAM_DAMPENER;
  }
  margin *= calibration.marginShrink;
  margin = Math.max(-calibration.maxMargin, Math.min(calibration.maxMargin, margin));
  return roundToHalf(margin);
}

export function predictGame(
  home: Rating,
  away: Rating,
  weights: ModelWeights = DEFAULT_WEIGHTS,
  calibration: ModelCalibration = DEFAULT_CALIBRATION
): GamePrediction {
  const normalizedWeights = normalizeWeights(weights);
  const adv = calculateMatchupAdvantages(home, away);
  const weightedRatingGap =
    adv.passAdv * normalizedWeights.pass +
    adv.rushAdv * normalizedWeights.rush +
    adv.overallAdv * normalizedWeights.overall +
    adv.compositeAdv * normalizedWeights.composite;

  const rawModelHomeMargin = weightedRatingGap * calibration.pointsPerRating + calibration.homeField;
  const modelHomeMargin = calibrateModelMargin(rawModelHomeMargin, adv.compositeAdv, calibration);
  const predictedWinner = modelHomeMargin > 0 ? home.team : away.team;
  const predictedMargin = Math.abs(modelHomeMargin);

  return {
    ...adv,
    weightedRatingGap,
    modelHomeMargin,
    modelSpreadLine: round2(-modelHomeMargin),
    predictedWinner,
    predictedFavorite: predictedWinner,
    predictedMargin,
    modelSpread: formatModelSpread(predictedWinner, predictedMargin)
  };
}

export function formatModelSpread(team: string, margin: number): string {
  const m = Math.abs(roundToHalf(margin));
  if (m === 0) return "Pick'em";
  return `${team} -${m.toFixed(1)}`;
}

export function formatSignedSpread(spread: number): string {
  const n = roundToHalf(spread);
  if (n > 0) return `+${n.toFixed(1)}`;
  if (n < 0) return n.toFixed(1);
  return 'PK';
}

export function gradeModelVsVegas(
  homeTeam: string,
  awayTeam: string,
  vegasHomeSpread: number,
  modelHomeSpread: number,
  actualHomeMargin: number
): VegasGrade {
  if (![vegasHomeSpread, modelHomeSpread, actualHomeMargin].every(Number.isFinite)) {
    return { pick: '', result: '', atsMargin: null };
  }

  const edge = round2(Math.abs(modelHomeSpread - vegasHomeSpread));
  if (edge === 0) return { pick: 'No Edge', result: '', atsMargin: null };

  const pickHome = modelHomeSpread < vegasHomeSpread;
  const pick = pickHome
    ? `${homeTeam} ${formatSignedSpread(vegasHomeSpread)}`
    : `${awayTeam} ${formatSignedSpread(-vegasHomeSpread)}`;
  const homeAtsMargin = actualHomeMargin + vegasHomeSpread;
  const atsMargin = round2(pickHome ? homeAtsMargin : -homeAtsMargin);
  const result = atsMargin > 0 ? 'WIN' : atsMargin < 0 ? 'LOSS' : 'PUSH';

  return { pick, result, atsMargin };
}
