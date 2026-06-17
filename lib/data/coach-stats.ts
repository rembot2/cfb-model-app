import type { CfbdGame, CfbdTeamSeasonStat } from './cfbd';

export type CoachTeamStats = {
  offPpg: number | null;
  offYpg: number | null;
  offRankPts: number | null;
  offRankYards: number | null;
  defPpgAllowed: number | null;
  defYpgAllowed: number | null;
  defRankPts: number | null;
  defRankYards: number | null;
};

type TeamPoints = {
  for: number;
  against: number;
  games: number;
};

export function buildCoachStatsCache(stats: CfbdTeamSeasonStat[], games: CfbdGame[]) {
  const teamStatMap = new Map<string, Record<string, number>>();
  const teamPoints = new Map<string, TeamPoints>();

  for (const stat of stats) {
    if (!teamStatMap.has(stat.team)) teamStatMap.set(stat.team, {});
    teamStatMap.get(stat.team)![stat.statName] = Number(stat.statValue);
  }

  for (const game of games) {
    if (game.homePoints == null || game.awayPoints == null) continue;
    addPoints(teamPoints, game.homeTeam, game.homePoints, game.awayPoints);
    addPoints(teamPoints, game.awayTeam, game.awayPoints, game.homePoints);
  }

  const offYdsRanked = rankTeams(
    [...teamStatMap.entries()]
      .filter(([, value]) => value.totalYards != null)
      .map(([team, value]) => ({ team, val: value.totalYards / (value.games || 12) })),
    'desc'
  );

  const defYdsRanked = rankTeams(
    [...teamStatMap.entries()]
      .filter(([, value]) => value.totalYardsOpponent != null)
      .map(([team, value]) => ({ team, val: value.totalYardsOpponent / (value.games || 12) })),
    'asc'
  );

  const offPtsRanked = rankTeams(
    [...teamPoints.entries()].map(([team, value]) => ({ team, val: value.for / value.games })),
    'desc'
  );

  const defPtsRanked = rankTeams(
    [...teamPoints.entries()].map(([team, value]) => ({ team, val: value.against / value.games })),
    'asc'
  );

  return {
    teamStatMap,
    teamPoints,
    offYdsRanked,
    defYdsRanked,
    offPtsRanked,
    defPtsRanked
  };
}

export function getCoachStatsForTeam(
  school: string,
  cache: ReturnType<typeof buildCoachStatsCache>
): CoachTeamStats | null {
  const teamKey = matchKey(cache.teamStatMap, school);
  const pointsKey = matchKey(cache.teamPoints, school);
  if (!teamKey && !pointsKey) return null;

  const stats = teamKey ? cache.teamStatMap.get(teamKey) || {} : {};
  const points = pointsKey ? cache.teamPoints.get(pointsKey) || null : null;

  return {
    offPpg: points ? round2(points.for / points.games) : null,
    offYpg: stats.totalYards != null ? round2(stats.totalYards / (stats.games || 12)) : null,
    offRankPts: rankFor(cache.offPtsRanked, school),
    offRankYards: rankFor(cache.offYdsRanked, school),
    defPpgAllowed: points ? round2(points.against / points.games) : null,
    defYpgAllowed: stats.totalYardsOpponent != null ? round2(stats.totalYardsOpponent / (stats.games || 12)) : null,
    defRankPts: rankFor(cache.defPtsRanked, school),
    defRankYards: rankFor(cache.defYdsRanked, school)
  };
}

function addPoints(map: Map<string, TeamPoints>, team: string, pointsFor: number, pointsAgainst: number) {
  const current = map.get(team) || { for: 0, against: 0, games: 0 };
  current.for += pointsFor;
  current.against += pointsAgainst;
  current.games += 1;
  map.set(team, current);
}

function rankTeams(rows: Array<{ team: string; val: number }>, direction: 'asc' | 'desc') {
  return rows.sort((a, b) => (direction === 'asc' ? a.val - b.val : b.val - a.val));
}

function rankFor(rows: Array<{ team: string; val: number }>, school: string) {
  const index = rows.findIndex((row) => row.team.toLowerCase() === school.toLowerCase());
  return index >= 0 ? index + 1 : null;
}

function matchKey<T>(map: Map<string, T>, name: string) {
  return [...map.keys()].find((key) => key.toLowerCase() === name.toLowerCase()) || null;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

