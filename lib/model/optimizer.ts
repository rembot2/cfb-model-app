import { DEFAULT_CALIBRATION, DEFAULT_WEIGHTS } from './predict';
import { evaluateRatedGames, type RatedGame } from './evaluate';
import type { ModelCalibration, ModelWeights } from './types';

const WEIGHT_STEP = 0.1;
const MIN_PASS_WEIGHT = 0.2;
const MIN_RUSH_WEIGHT = 0.2;
const MIN_OVERALL_WEIGHT = 0.1;
const MIN_MATCHUP_WEIGHT = 0.45;
const MAX_OVERALL_WEIGHT = 0.4;
const MAX_COMPOSITE_WEIGHT = 0.4;
const TARGET_MATCHUP_WEIGHT = 0.55;
const FOOTBALL_PRIOR_PENALTY = 1.25;
const TRAIN_SCORE_WEIGHT = 0.3;
const HOLDOUT_SCORE_WEIGHT = 0.5;
const ALL_SCORE_WEIGHT = 0.2;
const STABILITY_PENALTY_WEIGHT = 0.5;

const POINTS_PER_RATING_OPTIONS = [1.1, 1.3, 1.5];
const HFA_OPTIONS = [2.0, 2.5, 3.0];
const MARGIN_SHRINK_OPTIONS = [0.65, 0.75, 0.85, 0.95];
const MAX_MARGIN_OPTIONS = [21.5, 24.5, 28.5];

export type OptimizerResult = {
  rank: number;
  useThis: string;
  weights: ModelWeights;
  calibration: ModelCalibration;
  trainGames: number;
  trainPickPct: number;
  trainAvgError: number;
  trainRmse: number;
  trainCorr: number;
  trainScore: number;
  holdoutGames: number;
  holdoutPickPct: number;
  holdoutAvgError: number;
  holdoutRmse: number;
  holdoutCorr: number;
  holdoutScore: number;
  allGames: number;
  allPickPct: number;
  allAvgError: number;
  allRmse: number;
  allCorr: number;
  allScore: number;
  stabilityPenalty: number;
  finalScore: number;
};

export function optimizeWeights(games: RatedGame[]): OptimizerResult[] {
  if (!games.length) return [];
  const holdoutSeason = Math.max(...games.map((game) => game.season));
  const trainGames = games.filter((game) => game.season < holdoutSeason);
  const holdoutGames = games.filter((game) => game.season === holdoutSeason);
  if (!trainGames.length || !holdoutGames.length) return [];

  const rows: OptimizerResult[] = [];
  const units = Math.round(1 / WEIGHT_STEP);

  for (let p = 0; p <= units; p++) {
    for (let r = 0; r <= units - p; r++) {
      for (let o = 0; o <= units - p - r; o++) {
        const c = units - p - r - o;
        const weights = {
          pass: p * WEIGHT_STEP,
          rush: r * WEIGHT_STEP,
          overall: o * WEIGHT_STEP,
          composite: c * WEIGHT_STEP
        };
        if (!isAllowedWeightSet(weights)) continue;

        for (const pointsPerRating of POINTS_PER_RATING_OPTIONS) {
          for (const homeField of HFA_OPTIONS) {
            for (const marginShrink of MARGIN_SHRINK_OPTIONS) {
              for (const maxMargin of MAX_MARGIN_OPTIONS) {
                const calibration = { pointsPerRating, homeField, marginShrink, maxMargin };
                const train = evaluateRatedGames(trainGames, weights, calibration).summary;
                const holdout = evaluateRatedGames(holdoutGames, weights, calibration).summary;
                const all = evaluateRatedGames(games, weights, calibration).summary;
                const trainScore = addFootballPriorPenalty(train.modelScore, weights);
                const holdoutScore = addFootballPriorPenalty(holdout.modelScore, weights);
                const allScore = addFootballPriorPenalty(all.modelScore, weights);
                const stabilityPenalty = Math.abs(trainScore - holdoutScore) * STABILITY_PENALTY_WEIGHT;
                const finalScore =
                  trainScore * TRAIN_SCORE_WEIGHT +
                  holdoutScore * HOLDOUT_SCORE_WEIGHT +
                  allScore * ALL_SCORE_WEIGHT +
                  stabilityPenalty;

                rows.push({
                  rank: 0,
                  useThis: '',
                  weights,
                  calibration,
                  trainGames: train.games,
                  trainPickPct: train.pickPct,
                  trainAvgError: train.avgMarginError,
                  trainRmse: train.rmse,
                  trainCorr: train.correlation,
                  trainScore,
                  holdoutGames: holdout.games,
                  holdoutPickPct: holdout.pickPct,
                  holdoutAvgError: holdout.avgMarginError,
                  holdoutRmse: holdout.rmse,
                  holdoutCorr: holdout.correlation,
                  holdoutScore,
                  allGames: all.games,
                  allPickPct: all.pickPct,
                  allAvgError: all.avgMarginError,
                  allRmse: all.rmse,
                  allCorr: all.correlation,
                  allScore,
                  stabilityPenalty,
                  finalScore
                });
              }
            }
          }
        }
      }
    }
  }

  rows.sort((a, b) =>
    a.finalScore - b.finalScore ||
    a.holdoutScore - b.holdoutScore ||
    a.allScore - b.allScore ||
    a.stabilityPenalty - b.stabilityPenalty ||
    a.holdoutAvgError - b.holdoutAvgError ||
    a.holdoutRmse - b.holdoutRmse ||
    b.holdoutPickPct - a.holdoutPickPct ||
    b.holdoutCorr - a.holdoutCorr
  );

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    useThis: index === 0 ? 'BEST' : ''
  }));
}

export function getDefaultOptimizerInputs() {
  return {
    weights: DEFAULT_WEIGHTS,
    calibration: DEFAULT_CALIBRATION
  };
}

function isAllowedWeightSet(weights: ModelWeights) {
  return (
    weights.pass >= MIN_PASS_WEIGHT &&
    weights.rush >= MIN_RUSH_WEIGHT &&
    weights.pass + weights.rush >= MIN_MATCHUP_WEIGHT &&
    weights.overall >= MIN_OVERALL_WEIGHT &&
    weights.overall <= MAX_OVERALL_WEIGHT &&
    weights.composite <= MAX_COMPOSITE_WEIGHT
  );
}

function addFootballPriorPenalty(score: number, weights: ModelWeights) {
  const matchupWeight = weights.pass + weights.rush;
  const shortfall = Math.max(0, TARGET_MATCHUP_WEIGHT - matchupWeight);
  return score + shortfall * FOOTBALL_PRIOR_PENALTY;
}

