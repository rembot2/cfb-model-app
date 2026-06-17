export type Rating = {
  team: string;
  composite: number;
  offRating: number;
  defRating: number;
  rushOff: number;
  passOff: number;
  rushDef: number;
  passDef: number;
  passRate?: number | null;
};

export type ModelWeights = {
  pass: number;
  rush: number;
  overall: number;
  composite: number;
};

export type ModelCalibration = {
  pointsPerRating: number;
  homeField: number;
  marginShrink: number;
  maxMargin: number;
};

export type MatchupAdvantages = {
  passAdv: number;
  rushAdv: number;
  overallAdv: number;
  compositeAdv: number;
  homePassRate: number;
  awayPassRate: number;
};

export type GamePrediction = MatchupAdvantages & {
  weightedRatingGap: number;
  modelHomeMargin: number;
  modelSpreadLine: number;
  predictedWinner: string;
  predictedFavorite: string;
  predictedMargin: number;
  modelSpread: string;
};

export type VegasGrade = {
  pick: string;
  result: 'WIN' | 'LOSS' | 'PUSH' | '';
  atsMargin: number | null;
};
