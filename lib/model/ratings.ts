import type { CoachInfluence, Rating } from './types';

export type RawTeamGameStat = {
  season: number;
  week: number;
  team: string;
  opponent: string;
  ppa_off: number | null;
  ppa_def: number | null;
  success_off: number | null;
  success_def: number | null;
  pts_per_drive_off: number | null;
  pts_per_drive_def: number | null;
  rush_ppa_off: number | null;
  rush_ppa_def: number | null;
  pass_ppa_off: number | null;
  pass_ppa_def: number | null;
  rush_rate_off?: number | null;
  pass_rate_off?: number | null;
};

export type RawRosterPlayer = {
  team: string;
  position: string | null;
  rating: number | string | null;
};

export type RawCoachConfig = {
  team: string;
  coach_name?: string | null;
  hire_year?: number | string | null;
  offense_rating?: number | string | null;
  defense_rating?: number | string | null;
  development_rating?: string | null;
};

type PositionGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';
type PositionRatings = Record<PositionGroup, number>;

const POSITION_GROUPS: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
const POSITION_DEPTH_LIMITS: Record<PositionGroup, number> = {
  QB: 1,
  RB: 3,
  WR: 5,
  TE: 3,
  OL: 7,
  DL: 6,
  LB: 5,
  CB: 4,
  S: 3,
  K: 1,
  P: 1
};

type DevelopmentRating = 'Elite' | 'Good' | 'Average' | 'Poor' | 'Terrible';
type CoachRatingConfig = {
  hireYear: number;
  offenseRating: number;
  defenseRating: number;
  developmentRating: DevelopmentRating;
};

const DEFAULT_COACH_INFLUENCE: CoachInfluence = {
  offenseBoost: 0.6,
  defenseBoost: 0.6,
  developmentBoost: 1.0
};

const DEVELOPMENT_SCORE: Record<DevelopmentRating, number> = {
  Elite: 2,
  Good: 1,
  Average: 0,
  Poor: -1,
  Terrible: -2
};

export type RatingOptions = {
  season: number;
  recencyWeight?: number;
  iterations?: number;
  talentWeight?: number;
  seasons?: number[];
  requireTalent?: boolean;
  rosterPlayers?: RawRosterPlayer[];
  historicalPositionTalentWeight?: number;
  preseasonPositionTalentWeight?: number;
  talentRampWeeks?: number;
  ratingEvaluationWeek?: number;
  performanceTrust?: number;
  coaches?: RawCoachConfig[];
  coachInfluence?: CoachInfluence;
};

type RawRating = {
  ppaOff: number;
  ppaDef: number;
  sucOff: number;
  sucDef: number;
  ppdOff: number;
  ppdDef: number;
  rushOff: number;
  rushDef: number;
  passOff: number;
  passDef: number;
  passRate: number;
  games: number;
};

export function calculateTeamRatings(
  stats: RawTeamGameStat[],
  talentScores: Record<string, number>,
  options: RatingOptions
): Rating[] {
  const season = options.season;
  const seasons = options.seasons?.length
    ? options.seasons.filter((s) => s <= season).sort()
    : [...new Set(stats.map((row) => row.season).filter((s) => s <= season))].sort();

  const seasonSet = new Set(seasons);
  const rows = stats.filter((row) => row.team && seasonSet.has(row.season) && asNumber(row.ppa_off) !== null);
  if (!rows.length) return [];

  const maxSeason = Math.max(...seasons);
  const recency = options.recencyWeight ?? 2.5;
  const iterations = options.iterations ?? 20;
  const coachMap = buildCoachMap(options.coaches || []);
  const coachInfluence = options.coachInfluence || DEFAULT_COACH_INFLUENCE;
  const seasonBaseWeight = new Map<number, number>();
  for (const s of seasons) {
    seasonBaseWeight.set(s, Math.pow(1 / recency, maxSeason - s));
  }

  const rawRatings0 = buildRawOpponentBaseline(rows, seasonBaseWeight);
  const leagueAvgOff = mean(Object.values(rawRatings0).map((row) => row.off));
  const leagueStdOff = stdDev(Object.values(rawRatings0).map((row) => row.off)) || 1;
  const maxWeekBySeason = getMaxWeekBySeason(rows);
  const teamStats = accumulateTeamStats(rows, seasonBaseWeight, rawRatings0, leagueAvgOff, leagueStdOff, maxSeason, maxWeekBySeason);
  const rawRatings = finalizeRawRatings(teamStats);
  const teams = Object.keys(rawRatings).filter(
    (team) => !options.requireTalent || talentScores[team] !== undefined
  );
  if (!teams.length) return [];

  const adjusted = opponentAdjust(rawRatings, rows, seasonBaseWeight, iterations);
  const talentZ = zScoreByTeam(teams, talentScores);

  const zPpaOff = zScore(teams.map((team) => adjusted.off[team]));
  const zPpaDef = zScore(teams.map((team) => adjusted.def[team])).map((z) => -z);
  const zSucOff = zScore(teams.map((team) => rawRatings[team].sucOff));
  const zSucDef = zScore(teams.map((team) => rawRatings[team].sucDef)).map((z) => -z);
  const zPpdOff = zScore(teams.map((team) => rawRatings[team].ppdOff));
  const zPpdDef = zScore(teams.map((team) => rawRatings[team].ppdDef)).map((z) => -z);
  const zRushOff = zScore(teams.map((team) => adjusted.rushOff[team]));
  const zRushDef = zScore(teams.map((team) => adjusted.rushDef[team])).map((z) => -z);
  const zPassOff = zScore(teams.map((team) => adjusted.passOff[team]));
  const zPassDef = zScore(teams.map((team) => adjusted.passDef[team])).map((z) => -z);
  const positionModel = options.rosterPlayers
    ? buildPositionGroupRatings(teams, options.rosterPlayers)
    : null;
  return teams.map((team, index) => {
    const positions = positionModel?.ratings[team];
    const coach = coachMap[team] || defaultCoachConfig();
    const coachYears = coach.hireYear > 0 ? season - coach.hireYear : 99;
    const targetTalentSplit = season >= 2026
      ? clamp(options.historicalPositionTalentWeight ?? 0.30, 0, 1)
      : clamp(options.historicalPositionTalentWeight ?? 0.30, 0, 0.60);
    const earlyTalentSplit = season >= 2026
      ? coachYears <= 0
        ? 0.90
        : coachYears === 1
          ? 0.75
          : clamp(options.preseasonPositionTalentWeight ?? 0.70, 0, 1)
      : clamp(options.preseasonPositionTalentWeight ?? 0.70, 0, 1);
    const ratingWeek = options.ratingEvaluationWeek ?? maxWeekBySeason[season] ?? 0;
    const positionTalentSplit = calculateTalentSplitForWeek(
      ratingWeek,
      earlyTalentSplit,
      targetTalentSplit,
      options.talentRampWeeks ?? 8
    );
    const performanceSplit = 1 - positionTalentSplit;
    const positionRatings = positions ? scalePositionRatings(positions) : null;
    const fallbackTalentRating = zToRating(talentZ[team] || 0);
    const rushOffTalent = positionRatings
      ? positionRatings.RB * 0.45 + positionRatings.OL * 0.55
      : fallbackTalentRating;
    const passOffTalent = positionRatings
      ? positionRatings.QB * 0.40 + positionRatings.WR * 0.25 + positionRatings.TE * 0.10 + positionRatings.OL * 0.25
      : fallbackTalentRating;
    const rushDefTalent = positionRatings
      ? positionRatings.DL * 0.55 + positionRatings.LB * 0.45
      : fallbackTalentRating;
    const passDefTalent = positionRatings
      ? positionRatings.DL * 0.30 + positionRatings.CB * 0.40 + positionRatings.S * 0.30
      : fallbackTalentRating;

    const rushOffBase = blendRatings(rushOffTalent, zToRating(zRushOff[index]), positionTalentSplit, performanceSplit);
    const passOffBase = blendRatings(passOffTalent, zToRating(zPassOff[index]), positionTalentSplit, performanceSplit);
    const rushDefBase = blendRatings(rushDefTalent, zToRating(zRushDef[index]), positionTalentSplit, performanceSplit);
    const passDefBase = blendRatings(passDefTalent, zToRating(zPassDef[index]), positionTalentSplit, performanceSplit);

    const coachActive = isCoachActiveForSeason(coach, season);
    const offenseCoachBoost = coachActive ? coachScaleBoost(coach.offenseRating, coachInfluence.offenseBoost) : 0;
    const defenseCoachBoost = coachActive ? coachScaleBoost(coach.defenseRating, coachInfluence.defenseBoost) : 0;
    const developmentBoost = coachActive ? DEVELOPMENT_SCORE[coach.developmentRating] * coachInfluence.developmentBoost : 0;
    const rushOff = clampRating(rushOffBase + offenseCoachBoost);
    const passOff = clampRating(passOffBase + offenseCoachBoost);
    const rushDef = clampRating(rushDefBase + defenseCoachBoost);
    const passDef = clampRating(passDefBase + defenseCoachBoost);
    const offRating = round2((rushOff + passOff) / 2);
    const defRating = round2((rushDef + passDef) / 2);
    const composite = clampRating(round2((offRating + defRating) / 2 + developmentBoost));

    return {
      team,
      composite,
      offRating,
      defRating,
      rushOff,
      passOff,
      rushDef,
      passDef,
      qbRating: positionRatings?.QB ?? null,
      rbRating: positionRatings?.RB ?? null,
      wrRating: positionRatings?.WR ?? null,
      teRating: positionRatings?.TE ?? null,
      olRating: positionRatings?.OL ?? null,
      dlRating: positionRatings?.DL ?? null,
      lbRating: positionRatings?.LB ?? null,
      cbRating: positionRatings?.CB ?? null,
      sRating: positionRatings?.S ?? null,
      kRating: positionRatings?.K ?? null,
      pRating: positionRatings?.P ?? null,
      passRate: round2(rawRatings[team].passRate),
      games: rawRatings[team].games
    };
  })
    .sort((a, b) => b.composite - a.composite);
}

function buildPositionGroupRatings(teams: string[], players: RawRosterPlayer[]) {
  const grouped: Record<string, Partial<Record<PositionGroup, number[]>>> = {};
  const topQb: Record<string, number> = {};

  for (const player of players) {
    const group = normalizePositionGroup(player.position);
    const rating = asNumber(player.rating);
    if (!player.team || !group || rating === null) continue;

    grouped[player.team] ||= {};
    grouped[player.team][group] ||= [];
    grouped[player.team][group]!.push(rating);
    if (group === 'QB' && (topQb[player.team] === undefined || rating > topQb[player.team])) {
      topQb[player.team] = rating;
    }
  }

  const raw: Record<string, Partial<Record<PositionGroup, number>>> = {};
  for (const team of teams) {
    raw[team] = {};
    for (const group of POSITION_GROUPS) {
      const values = [...(grouped[team]?.[group] || [])]
        .sort((a, b) => b - a)
        .slice(0, POSITION_DEPTH_LIMITS[group]);
      if (!values.length) continue;

      let weightedSum = 0;
      let weightSum = 0;
      for (let index = 0; index < values.length; index++) {
        const weight = Math.exp(-0.35 * index);
        weightedSum += values[index] * weight;
        weightSum += weight;
      }
      raw[team][group] = weightedSum / weightSum;
    }
  }

  const ratings = Object.fromEntries(teams.map((team) => [team, {}])) as Record<string, PositionRatings>;
  for (const group of POSITION_GROUPS) {
    const values = teams.map((team) => raw[team][group]).filter((value): value is number => Number.isFinite(value));
    const groupMean = mean(values);
    const groupStd = stdDev(values) || 1;
    for (const team of teams) {
      const value = raw[team][group];
      ratings[team][group] = value !== undefined
        ? round2(10 + ((value - groupMean) / groupStd) * 3)
        : 10;
    }
  }

  return { ratings, topQb };
}

function calculateTalentSplitForWeek(week: number, earlyTalentSplit: number, targetTalentSplit: number, rampWeeks: number) {
  const safeRampWeeks = Math.max(1, Math.round(rampWeeks || 1));
  const safeWeek = Math.max(0, Number.isFinite(week) ? week : 0);
  if (safeWeek <= 1) return clamp(earlyTalentSplit, 0, 1);
  if (safeWeek >= safeRampWeeks) return clamp(targetTalentSplit, 0, 1);
  const progress = (safeWeek - 1) / (safeRampWeeks - 1);
  return clamp(earlyTalentSplit + (targetTalentSplit - earlyTalentSplit) * progress, 0, 1);
}

function isCoachActiveForSeason(coach: CoachRatingConfig, season: number) {
  return !coach.hireYear || coach.hireYear <= season;
}

function normalizePositionGroup(position: unknown): PositionGroup | null {
  const value = String(position || '').toUpperCase().trim();
  if (value === 'QB') return 'QB';
  if (['RB', 'HB', 'FB'].includes(value)) return 'RB';
  if (value === 'WR') return 'WR';
  if (value === 'TE') return 'TE';
  if (['OL', 'OT', 'IOL', 'OG', 'C'].includes(value)) return 'OL';
  if (['DL', 'EDGE', 'DE', 'DT', 'NT'].includes(value)) return 'DL';
  if (['LB', 'ILB', 'OLB'].includes(value)) return 'LB';
  if (value === 'CB') return 'CB';
  if (['S', 'SAF'].includes(value)) return 'S';
  if (['K', 'PK'].includes(value)) return 'K';
  if (value === 'P') return 'P';
  return null;
}

function buildCoachMap(rows: RawCoachConfig[]) {
  const map: Record<string, CoachRatingConfig> = {};
  for (const row of rows) {
    if (!row.team) continue;
    map[row.team] = {
      hireYear: Math.trunc(asNumber(row.hire_year) || 0),
      offenseRating: clamp(asNumber(row.offense_rating) ?? 5, 1, 10),
      defenseRating: clamp(asNumber(row.defense_rating) ?? 5, 1, 10),
      developmentRating: normalizeDevelopmentRating(row.development_rating)
    };
  }
  return map;
}

function defaultCoachConfig(): CoachRatingConfig {
  return {
    hireYear: 0,
    offenseRating: 5,
    defenseRating: 5,
    developmentRating: 'Average'
  };
}

function normalizeDevelopmentRating(value: unknown): DevelopmentRating {
  const normalized = String(value || 'Average').trim().toLowerCase();
  if (normalized === 'elite') return 'Elite';
  if (normalized === 'good') return 'Good';
  if (normalized === 'poor') return 'Poor';
  if (normalized === 'terrible') return 'Terrible';
  return 'Average';
}

function coachScaleBoost(rating: number, multiplier: number) {
  return (rating - 5.5) * multiplier;
}

function clampRating(value: number) {
  return round2(clamp(value, 0, 100));
}

function buildRawOpponentBaseline(
  rows: RawTeamGameStat[],
  seasonBaseWeight: Map<number, number>
) {
  const rawAvg: Record<string, { off: number; def: number; w: number }> = {};
  for (const row of rows) {
    const ppaOff = asNumber(row.ppa_off);
    const ppaDef = asNumber(row.ppa_def);
    if (ppaOff === null || ppaDef === null) continue;
    const sw = seasonBaseWeight.get(row.season) || 1;
    rawAvg[row.team] ||= { off: 0, def: 0, w: 0 };
    rawAvg[row.team].off += ppaOff * sw;
    rawAvg[row.team].def += ppaDef * sw;
    rawAvg[row.team].w += sw;
  }

  const out: Record<string, { off: number; def: number }> = {};
  for (const [team, row] of Object.entries(rawAvg)) {
    if (row.w > 0) out[team] = { off: row.off / row.w, def: row.def / row.w };
  }
  return out;
}

function accumulateTeamStats(
  rows: RawTeamGameStat[],
  seasonBaseWeight: Map<number, number>,
  rawRatings0: Record<string, { off: number; def: number }>,
  leagueAvgOff: number,
  leagueStdOff: number,
  maxSeason: number,
  maxWeekBySeason: Record<number, number>
) {
  const teamStats: Record<string, any> = {};

  for (const row of rows) {
    const ppaOff = asNumber(row.ppa_off);
    const ppaDef = asNumber(row.ppa_def);
    if (ppaOff === null || ppaDef === null) continue;

    const sw = seasonBaseWeight.get(row.season) || 1;
    const oppRating = rawRatings0[row.opponent];
    const oppQuality = oppRating
      ? Math.max(0.25, Math.min(2.5, Math.pow(2, (oppRating.off - leagueAvgOff) / leagueStdOff)))
      : 1.0;
    const maxWeek = maxWeekBySeason[row.season] || 1;
    const momentumW = row.season === maxSeason && maxWeek > 1 ? 1 + ((row.week - 1) / (maxWeek - 1)) : 1;
    const gameWeight = sw * oppQuality * momentumW;

    teamStats[row.team] ||= {
      sumPpaOff: 0,
      sumPpaDef: 0,
      wPpa: 0,
      sumSucOff: 0,
      sumSucDef: 0,
      wSuc: 0,
      sumPpdOff: 0,
      sumPpdDef: 0,
      wPpd: 0,
      sumRushOff: 0,
      sumRushDef: 0,
      wRush: 0,
      sumPassOff: 0,
      sumPassDef: 0,
      wPass: 0,
      sumPassRate: 0,
      wRate: 0,
      games: 0
    };

    const t = teamStats[row.team];
    t.sumPpaOff += ppaOff * gameWeight;
    t.sumPpaDef += ppaDef * gameWeight;
    t.wPpa += gameWeight;

    addWeighted(t, 'sumSucOff', 'sumSucDef', 'wSuc', row.success_off, row.success_def, gameWeight);
    addWeighted(t, 'sumPpdOff', 'sumPpdDef', 'wPpd', row.pts_per_drive_off, row.pts_per_drive_def, gameWeight);
    addWeighted(t, 'sumRushOff', 'sumRushDef', 'wRush', row.rush_ppa_off, row.rush_ppa_def, gameWeight);
    addWeighted(t, 'sumPassOff', 'sumPassDef', 'wPass', row.pass_ppa_off, row.pass_ppa_def, gameWeight);

    const passRate = normalizeRate(row.pass_rate_off ?? (row.rush_rate_off == null ? null : 1 - row.rush_rate_off));
    t.sumPassRate += passRate * gameWeight;
    t.wRate += gameWeight;
    t.games += 1;
  }

  return teamStats;
}

function finalizeRawRatings(teamStats: Record<string, any>) {
  const out: Record<string, RawRating> = {};
  for (const [team, t] of Object.entries(teamStats)) {
    if (!t.wPpa) continue;
    out[team] = {
      ppaOff: t.sumPpaOff / t.wPpa,
      ppaDef: t.sumPpaDef / t.wPpa,
      sucOff: t.wSuc > 0 ? t.sumSucOff / t.wSuc : 0,
      sucDef: t.wSuc > 0 ? t.sumSucDef / t.wSuc : 0,
      ppdOff: t.wPpd > 0 ? t.sumPpdOff / t.wPpd : 0,
      ppdDef: t.wPpd > 0 ? t.sumPpdDef / t.wPpd : 0,
      rushOff: t.wRush > 0 ? t.sumRushOff / t.wRush : t.sumPpaOff / t.wPpa,
      rushDef: t.wRush > 0 ? t.sumRushDef / t.wRush : t.sumPpaDef / t.wPpa,
      passOff: t.wPass > 0 ? t.sumPassOff / t.wPass : t.sumPpaOff / t.wPpa,
      passDef: t.wPass > 0 ? t.sumPassDef / t.wPass : t.sumPpaDef / t.wPpa,
      passRate: t.wRate > 0 ? t.sumPassRate / t.wRate : 0.5,
      games: t.games
    };
  }
  return out;
}

function opponentAdjust(
  rawRatings: Record<string, RawRating>,
  rows: RawTeamGameStat[],
  seasonBaseWeight: Map<number, number>,
  iterations: number
) {
  const teams = Object.keys(rawRatings);
  const teamOpponents: Record<string, Array<{ opp: string; w: number }>> = {};

  for (const row of rows) {
    if (!rawRatings[row.team] || !rawRatings[row.opponent]) continue;
    teamOpponents[row.team] ||= [];
    teamOpponents[row.team].push({
      opp: row.opponent,
      w: seasonBaseWeight.get(row.season) || 1
    });
  }

  let off = fromTeams(teams, (team) => rawRatings[team].ppaOff);
  let def = fromTeams(teams, (team) => rawRatings[team].ppaDef);
  let rushOff = fromTeams(teams, (team) => rawRatings[team].rushOff);
  let rushDef = fromTeams(teams, (team) => rawRatings[team].rushDef);
  let passOff = fromTeams(teams, (team) => rawRatings[team].passOff);
  let passDef = fromTeams(teams, (team) => rawRatings[team].passDef);

  const avgOff = mean(teams.map((team) => rawRatings[team].ppaOff));
  const avgDef = mean(teams.map((team) => rawRatings[team].ppaDef));
  const avgRushOff = mean(teams.map((team) => rawRatings[team].rushOff));
  const avgRushDef = mean(teams.map((team) => rawRatings[team].rushDef));
  const avgPassOff = mean(teams.map((team) => rawRatings[team].passOff));
  const avgPassDef = mean(teams.map((team) => rawRatings[team].passDef));

  for (let iter = 0; iter < iterations; iter++) {
    const nOff: Record<string, number> = {};
    const nDef: Record<string, number> = {};
    const nRushOff: Record<string, number> = {};
    const nRushDef: Record<string, number> = {};
    const nPassOff: Record<string, number> = {};
    const nPassDef: Record<string, number> = {};

    for (const team of teams) {
      const opps = teamOpponents[team] || [];
      if (!opps.length) {
        nOff[team] = rawRatings[team].ppaOff;
        nDef[team] = rawRatings[team].ppaDef;
        nRushOff[team] = rawRatings[team].rushOff;
        nRushDef[team] = rawRatings[team].rushDef;
        nPassOff[team] = rawRatings[team].passOff;
        nPassDef[team] = rawRatings[team].passDef;
        continue;
      }

      const sums = opps.reduce(
        (acc, { opp, w }) => {
          acc.def += (def[opp] ?? 0) * w;
          acc.off += (off[opp] ?? 0) * w;
          acc.rushDef += (rushDef[opp] ?? 0) * w;
          acc.rushOff += (rushOff[opp] ?? 0) * w;
          acc.passDef += (passDef[opp] ?? 0) * w;
          acc.passOff += (passOff[opp] ?? 0) * w;
          acc.w += w;
          return acc;
        },
        { def: 0, off: 0, rushDef: 0, rushOff: 0, passDef: 0, passOff: 0, w: 0 }
      );
      const w = sums.w || 1;
      nOff[team] = rawRatings[team].ppaOff + (avgDef - sums.def / w) * 0.5;
      nDef[team] = rawRatings[team].ppaDef + (avgOff - sums.off / w) * 0.5;
      nRushOff[team] = rawRatings[team].rushOff + (avgRushDef - sums.rushDef / w) * 0.5;
      nRushDef[team] = rawRatings[team].rushDef + (avgRushOff - sums.rushOff / w) * 0.5;
      nPassOff[team] = rawRatings[team].passOff + (avgPassDef - sums.passDef / w) * 0.5;
      nPassDef[team] = rawRatings[team].passDef + (avgPassOff - sums.passOff / w) * 0.5;
    }

    off = nOff;
    def = nDef;
    rushOff = nRushOff;
    rushDef = nRushDef;
    passOff = nPassOff;
    passDef = nPassDef;
  }

  return { off, def, rushOff, rushDef, passOff, passDef };
}

function addWeighted(target: any, offKey: string, defKey: string, weightKey: string, offValue: unknown, defValue: unknown, weight: number) {
  const off = asNumber(offValue);
  const def = asNumber(defValue);
  if (off === null || def === null) return;
  target[offKey] += off * weight;
  target[defKey] += def * weight;
  target[weightKey] += weight;
}

function getMaxWeekBySeason(rows: RawTeamGameStat[]) {
  const out: Record<number, number> = {};
  for (const row of rows) {
    out[row.season] = Math.max(out[row.season] || 0, row.week || 0);
  }
  return out;
}

function zScoreByTeam(teams: string[], values: Record<string, number>) {
  const vals = teams.map((team) => values[team]).filter((value) => Number.isFinite(value));
  const m = mean(vals);
  const s = stdDev(vals) || 1;
  const out: Record<string, number> = {};
  for (const team of teams) {
    out[team] = Number.isFinite(values[team]) ? (values[team] - m) / s : 0;
  }
  return out;
}

function zScore(values: Array<number | null | undefined>) {
  const m = mean(values);
  const s = stdDev(values) || 1;
  return values.map((value) => ((asNumber(value) ?? m) - m) / s);
}

function mean(values: Array<number | null | undefined>) {
  const finite = values.map(asNumber).filter((value): value is number => value !== null);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function stdDev(values: Array<number | null | undefined>) {
  const finite = values.map(asNumber).filter((value): value is number => value !== null);
  if (finite.length < 2) return 1;
  const m = mean(finite);
  return Math.sqrt(finite.reduce((sum, value) => sum + Math.pow(value - m, 2), 0) / finite.length);
}

function scaleRating(value: number, maxCompositeRaw: number) {
  const slope = maxCompositeRaw !== 10 ? 20 / (maxCompositeRaw - 10) : 2.5;
  return round2(75 + (value - 10) * slope);
}

function scalePositionRatings(positions: PositionRatings): PositionRatings {
  return Object.fromEntries(
    POSITION_GROUPS.map((group) => [group, tenScaleToRating(positions[group])])
  ) as PositionRatings;
}

function tenScaleToRating(value: number) {
  return clampRating(75 + (value - 10) * 5);
}

function zToRating(value: number) {
  return tenScaleToRating(10 + value * 3);
}

function blendRatings(talentRating: number, performanceRating: number, talentSplit: number, performanceSplit: number) {
  return round2(talentRating * talentSplit + performanceRating * performanceSplit);
}

function normalizeRate(value: unknown) {
  let n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n > 1) n /= 100;
  return Math.max(0.2, Math.min(0.8, n));
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function fromTeams(teams: string[], selector: (team: string) => number) {
  return Object.fromEntries(teams.map((team) => [team, selector(team)]));
}
