import type { ModelCalibration, ModelWeights, Rating } from '../model/types';

export function ratingFromRow(row: Record<string, unknown>): Rating {
  return {
    team: String(row.team ?? ''),
    composite: numberValue(row.composite),
    offRating: numberValue(row.off_rating),
    defRating: numberValue(row.def_rating),
    rushOff: numberValue(row.rush_off_rating),
    passOff: numberValue(row.pass_off_rating),
    rushDef: numberValue(row.rush_def_rating),
    passDef: numberValue(row.pass_def_rating),
    qbRating: row.qb_rating == null ? null : numberValue(row.qb_rating),
    rbRating: row.rb_rating == null ? null : numberValue(row.rb_rating),
    wrRating: row.wr_rating == null ? null : numberValue(row.wr_rating),
    teRating: row.te_rating == null ? null : numberValue(row.te_rating),
    olRating: row.ol_rating == null ? null : numberValue(row.ol_rating),
    dlRating: row.dl_rating == null ? null : numberValue(row.dl_rating),
    lbRating: row.lb_rating == null ? null : numberValue(row.lb_rating),
    cbRating: row.cb_rating == null ? null : numberValue(row.cb_rating),
    sRating: row.s_rating == null ? null : numberValue(row.s_rating),
    kRating: row.k_rating == null ? null : numberValue(row.k_rating),
    pRating: row.p_rating == null ? null : numberValue(row.p_rating),
    passRate: row.pass_rate === undefined ? null : numberValue(row.pass_rate)
  };
}

export function weightsFromConfig(row: Record<string, unknown> | null | undefined): ModelWeights {
  return {
    pass: numberValue(row?.pass_weight, 0.3),
    rush: numberValue(row?.rush_weight, 0.2),
    overall: numberValue(row?.overall_weight, 0.25),
    composite: numberValue(row?.composite_weight, 0.25)
  };
}

export function calibrationFromConfig(row: Record<string, unknown> | null | undefined): ModelCalibration {
  return {
    pointsPerRating: numberValue(row?.points_per_rating, 1.4),
    homeField: numberValue(row?.home_field, 2.5),
    marginShrink: numberValue(row?.margin_shrink, 0.75),
    maxMargin: numberValue(row?.max_margin, 24.5)
  };
}

export function numberValue(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
