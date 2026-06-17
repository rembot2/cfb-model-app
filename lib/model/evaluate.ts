import { mean, median, round2 } from './math';
import {
  DEFAULT_CALIBRATION,
  DEFAULT_WEIGHTS,
  calculateMatchupAdvantages,
  calibrateModelMargin,
  normalizeWeights
} from './predict';
import type { ModelCalibration, ModelWeights, Rating } from './types';

export type RatedGame = {
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  home: Rating;
  away: Rating;
  homePoints: number;
  awayPoints: number;
  vegasHomeSpread: number | null;
};

export type EvaluatedGame = RatedGame & {
  modelHomeMargin: number;
  predictedWinner: string;
  predictedMargin: number;
  actualHomeMargin: number;
  actualWinner: string;
  actualWinMargin: number;
  marginError: number;
  pickCorrect: boolean;
  modelHomeSpread: number;
  modelVegasDiff: number | null;
};

export type EvaluationSummary = {
  games: number;
  pickCorrect: number;
  pickPct: number;
  avgMarginError: number;
  medianMarginError: number;
  rmse: number;
  correlation: number;
  within3: number;
  within3Pct: number;
  within7: number;
  within7Pct: number;
  within10: number;
  within10Pct: number;
  avgPredictedMargin: number;
  avgActualMargin: number;
  vegasGames: number;
  avgVegasDiff: number | null;
  modelScore: number;
};

export function evaluateRatedGames(
  games: RatedGame[],
  weights: ModelWeights = DEFAULT_WEIGHTS,
  calibration: ModelCalibration = DEFAULT_CALIBRATION
) {
  const evaluated = games.map((game) => evaluateRatedGame(game, weights, calibration));
  return {
    games: evaluated,
    summary: summarizeEvaluatedGames(evaluated)
  };
}

export function evaluateRatedGame(
  game: RatedGame,
  weights: ModelWeights = DEFAULT_WEIGHTS,
  calibration: ModelCalibration = DEFAULT_CALIBRATION
): EvaluatedGame {
  const normalizedWeights = normalizeWeights(weights);
  const adv = calculateMatchupAdvantages(game.home, game.away);
  const weightedRatingGap =
    adv.passAdv * normalizedWeights.pass +
    adv.rushAdv * normalizedWeights.rush +
    adv.overallAdv * normalizedWeights.overall +
    adv.compositeAdv * normalizedWeights.composite;
  const rawHomeMargin = weightedRatingGap * calibration.pointsPerRating + calibration.homeField;
  const modelHomeMargin = calibrateModelMargin(rawHomeMargin, adv.compositeAdv, calibration);
  const actualHomeMargin = game.homePoints - game.awayPoints;
  const actualWinner = actualHomeMargin > 0 ? game.homeTeam : actualHomeMargin < 0 ? game.awayTeam : 'TIE';
  const predictedWinner = modelHomeMargin > 0 ? game.homeTeam : modelHomeMargin < 0 ? game.awayTeam : 'TIE';
  const modelHomeSpread = round2(-modelHomeMargin);
  const modelVegasDiff = game.vegasHomeSpread === null ? null : round2(Math.abs(modelHomeSpread - game.vegasHomeSpread));

  return {
    ...game,
    modelHomeMargin,
    predictedWinner,
    predictedMargin: Math.abs(modelHomeMargin),
    actualHomeMargin,
    actualWinner,
    actualWinMargin: Math.abs(actualHomeMargin),
    marginError: round2(Math.abs(modelHomeMargin - actualHomeMargin)),
    pickCorrect: predictedWinner === actualWinner,
    modelHomeSpread,
    modelVegasDiff
  };
}

export function summarizeEvaluatedGames(games: EvaluatedGame[]): EvaluationSummary {
  if (!games.length) {
    return emptySummary();
  }

  const errors = games.map((game) => game.marginError);
  const squaredErrors = games.map((game) => Math.pow(game.modelHomeMargin - game.actualHomeMargin, 2));
  const pickCorrect = games.filter((game) => game.pickCorrect).length;
  const within3 = games.filter((game) => game.marginError <= 3).length;
  const within7 = games.filter((game) => game.marginError <= 7).length;
  const within10 = games.filter((game) => game.marginError <= 10).length;
  const vegasDiffs = games.map((game) => game.modelVegasDiff).filter((value): value is number => value !== null);
  const avgMarginError = round2(mean(errors));
  const rmse = round2(Math.sqrt(mean(squaredErrors)));
  const pickPct = round2((pickCorrect / games.length) * 100);
  const avgVegasDiff = vegasDiffs.length ? round2(mean(vegasDiffs)) : null;

  return {
    games: games.length,
    pickCorrect,
    pickPct,
    avgMarginError,
    medianMarginError: round2(median(errors)),
    rmse,
    correlation: round2(correlation(games.map((game) => game.modelHomeMargin), games.map((game) => game.actualHomeMargin))),
    within3,
    within3Pct: round2((within3 / games.length) * 100),
    within7,
    within7Pct: round2((within7 / games.length) * 100),
    within10,
    within10Pct: round2((within10 / games.length) * 100),
    avgPredictedMargin: round2(mean(games.map((game) => game.predictedMargin))),
    avgActualMargin: round2(mean(games.map((game) => game.actualWinMargin))),
    vegasGames: vegasDiffs.length,
    avgVegasDiff,
    modelScore: round2(avgMarginError + 0.35 * rmse - 0.05 * pickPct + (avgVegasDiff === null ? 0 : 0.1 * avgVegasDiff))
  };
}

export function correlation(xs: number[], ys: number[]) {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] - mx;
    const y = ys[i] - my;
    num += x * y;
    dx += x * x;
    dy += y * y;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : 0;
}

function emptySummary(): EvaluationSummary {
  return {
    games: 0,
    pickCorrect: 0,
    pickPct: 0,
    avgMarginError: 0,
    medianMarginError: 0,
    rmse: 0,
    correlation: 0,
    within3: 0,
    within3Pct: 0,
    within7: 0,
    within7Pct: 0,
    within10: 0,
    within10Pct: 0,
    avgPredictedMargin: 0,
    avgActualMargin: 0,
    vegasGames: 0,
    avgVegasDiff: null,
    modelScore: 0
  };
}

