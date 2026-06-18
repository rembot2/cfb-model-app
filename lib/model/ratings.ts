import type { Rating } from './types';

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

export type RatingOptions = {
  season: number;
  recencyWeight?: number;
  iterations?: number;
  talentWeight?: number;
  seasons?: number[];
  requireTalent?: boolean;
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
  const talentWeight = options.talentWeight ?? 0.4;
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

  const rawRows = teams.map((team, index) => {
    const rawOffZ = (zPpaOff[index] + zSucOff[index] + zPpdOff[index]) / 3;
    const rawDefZ = (zPpaDef[index] + zSucDef[index] + zPpdDef[index]) / 3;
    const talent = talentZ[team] || 0;
    const perfScore = ((rawOffZ + rawDefZ) / 2) * 15;
    const compositeRaw = perfScore * (1 - talentWeight) + talent * 10 * talentWeight;

    const rushOffRaw = zRushOff[index] * 15 * (1 - talentWeight) + talent * 10 * talentWeight;
    const passOffRaw = zPassOff[index] * 15 * (1 - talentWeight) + talent * 10 * talentWeight;
    const rushDefRaw = zRushDef[index] * 15 * (1 - talentWeight) + talent * 10 * talentWeight;
    const passDefRaw = zPassDef[index] * 15 * (1 - talentWeight) + talent * 10 * talentWeight;

    return {
      team,
      games: rawRatings[team].games,
      passRate: rawRatings[team].passRate,
      offRaw: (rushOffRaw + passOffRaw) / 2,
      defRaw: (rushDefRaw + passDefRaw) / 2,
      compositeRaw,
      rushOffRaw,
      passOffRaw,
      rushDefRaw,
      passDefRaw
    };
  });

  const displayRows = rawRows.map((row) => {
    const rushOffDisplay = 10 + row.rushOffRaw / 3;
    const passOffDisplay = 10 + row.passOffRaw / 3;
    const rushDefDisplay = 10 + row.rushDefRaw / 3;
    const passDefDisplay = 10 + row.passDefRaw / 3;
    const offDisplay = (rushOffDisplay + passOffDisplay) / 2;
    const defDisplay = (rushDefDisplay + passDefDisplay) / 2;

    return {
      ...row,
      rushOffDisplay,
      passOffDisplay,
      rushDefDisplay,
      passDefDisplay,
      compositeDisplay: (offDisplay + defDisplay) / 2
    };
  });

  const maxCompositeRaw = Math.max(...displayRows.map((row) => row.compositeDisplay), 10.1);

  return displayRows
    .map((row) => {
      const rushOff = scaleRating(row.rushOffDisplay, maxCompositeRaw);
      const passOff = scaleRating(row.passOffDisplay, maxCompositeRaw);
      const rushDef = scaleRating(row.rushDefDisplay, maxCompositeRaw);
      const passDef = scaleRating(row.passDefDisplay, maxCompositeRaw);
      const offRating = round2((rushOff + passOff) / 2);
      const defRating = round2((rushDef + passDef) / 2);

      return {
        team: row.team,
        composite: round2((offRating + defRating) / 2),
        offRating,
        defRating,
        rushOff,
        passOff,
        rushDef,
        passDef,
        passRate: round2(row.passRate),
        games: row.games
      };
    })
    .sort((a, b) => b.composite - a.composite);
}

function buildRawOpponentBaseline(rows: RawTeamGameStat[], seasonBaseWeight: Map<number, number>) {
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
    teamOpponents[row.team].push({ opp: row.opponent, w: seasonBaseWeight.get(row.season) || 1 });
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

function normalizeRate(value: unknown) {
  let n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n > 1) n /= 100;
  return Math.max(0.2, Math.min(0.8, n));
}

function asNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function fromTeams(teams: string[], selector: (team: string) => number) {
  return Object.fromEntries(teams.map((team) => [team, selector(team)]));
}
