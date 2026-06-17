const COACH_SHEET_NAME = "Coach Stats";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("CFBD Tools")
    .addItem("Fill stats for all rows", "fillAllStats")
    .addItem("Validate school names", "validateSchools")
    .addToUi();
}

function fillAllStats() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
                              .getSheetByName(COACH_SHEET_NAME);
  if (!sheet) { Logger.log('Sheet not found: ' + COACH_SHEET_NAME); return; }

  const config  = getConfig();
  const API_KEY = config.API_KEY;
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];

  const col = {
    school:         headers.indexOf("school"),
    year:           headers.indexOf("year"),
    role:           headers.indexOf("role"),
    off_ppg:        headers.indexOf("off_ppg"),
    off_ypg:        headers.indexOf("off_ypg"),
    off_rank_pts:   headers.indexOf("off_rank_pts"),
    off_rank_yards: headers.indexOf("off_rank_yards"),
    def_ppg:        headers.indexOf("def_ppg_allowed"),
    def_ypg:        headers.indexOf("def_ypg_allowed"),
    def_rank_pts:   headers.indexOf("def_rank_pts"),
    def_rank_yards: headers.indexOf("def_rank_yards"),
  };

  // Get all unique years in the sheet
  const years = [...new Set(
    data.slice(1).map(r => r[col.year]).filter(y => y)
  )];

  // Fetch bulk data once per year — only 2 API calls per year total
  const yearCache = {};
  for (const year of years) {
    Logger.log('Caching data for ' + year + '...');
    yearCache[year] = fetchYearData(year, API_KEY);
    Utilities.sleep(500);
  }

  let filled = 0, skipped = 0;
  const errors = [];

  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const school = row[col.school];
    const year   = row[col.year];
    const role   = String(row[col.role] || '').toUpperCase();

    if (!school || !year) { skipped++; continue; }

    const needsOff = role.includes("HC") || role.includes("OC");
    const needsDef = role.includes("HC") || role.includes("DC");

    try {
      const cache = yearCache[year];
      if (!cache) { errors.push(`Row ${i+1}: no cache for year ${year}`); continue; }

      const stats = getStatsFromCache(school, year, cache);
      if (!stats) { errors.push(`Row ${i+1}: no data for ${school} ${year}`); continue; }

      const rowNum = i + 1;
      if (needsOff) {
        sheet.getRange(rowNum, col.off_ppg        + 1).setValue(stats.off_ppg);
        sheet.getRange(rowNum, col.off_ypg        + 1).setValue(stats.off_ypg);
        sheet.getRange(rowNum, col.off_rank_pts   + 1).setValue(stats.off_rank_pts);
        sheet.getRange(rowNum, col.off_rank_yards + 1).setValue(stats.off_rank_yards);
      }
      if (needsDef) {
        sheet.getRange(rowNum, col.def_ppg        + 1).setValue(stats.def_ppg);
        sheet.getRange(rowNum, col.def_ypg        + 1).setValue(stats.def_ypg);
        sheet.getRange(rowNum, col.def_rank_pts   + 1).setValue(stats.def_rank_pts);
        sheet.getRange(rowNum, col.def_rank_yards + 1).setValue(stats.def_rank_yards);
      }
      filled++;
    } catch(e) {
      errors.push(`Row ${i+1} (${school} ${year}): ${e.message}`);
    }
  }

  Logger.log(`Done. Filled: ${filled}. Skipped: ${skipped}.`);
  if (errors.length) Logger.log('Errors:\n' + errors.join('\n'));
}

function fetchYearData(year, apiKey) {
  const base    = "https://api.collegefootballdata.com";
  const headers = { "Authorization": `Bearer ${apiKey}`, muteHttpExceptions: true };

  // One call: all team season stats
  const statsRes = JSON.parse(UrlFetchApp.fetch(
    `${base}/stats/season?year=${year}`, { headers }
  ).getContentText());

  // One call: all games that year
  const gamesRes = JSON.parse(UrlFetchApp.fetch(
    `${base}/games?year=${year}&seasonType=regular`, { headers }
  ).getContentText());

  // Build per-team stat maps
  const teamStatMap = {}; // team -> { statName -> value }
  for (const s of statsRes) {
    if (!teamStatMap[s.team]) teamStatMap[s.team] = {};
    teamStatMap[s.team][s.statName] = parseFloat(s.statValue);
  }

  // Build per-team points for/against from games
  const teamPoints = {}; // team -> { for, against, games }
  for (const g of gamesRes) {
    if (g.home_points == null) continue;
    for (const [team, pts, opp] of [
      [g.home_team, g.home_points, g.away_points],
      [g.away_team, g.away_points, g.home_points]
    ]) {
      if (!teamPoints[team]) teamPoints[team] = { for: 0, against: 0, games: 0 };
      teamPoints[team].for     += pts || 0;
      teamPoints[team].against += opp || 0;
      teamPoints[team].games   += 1;
    }
  }

  // Precompute rankings
  // Off yards rank (higher = better)
  const offYdsRanked = Object.entries(teamStatMap)
    .filter(([, s]) => s.totalYards != null)
    .map(([team, s]) => ({ team, val: s.totalYards / (s.games || 12) }))
    .sort((a, b) => b.val - a.val);

  // Def yards rank (lower allowed = better)
  const defYdsRanked = Object.entries(teamStatMap)
    .filter(([, s]) => s.totalYardsOpponent != null)
    .map(([team, s]) => ({ team, val: s.totalYardsOpponent / (s.games || 12) }))
    .sort((a, b) => a.val - b.val);

  // Off points rank
  const offPtsRanked = Object.entries(teamPoints)
    .map(([team, p]) => ({ team, val: p.for / p.games }))
    .sort((a, b) => b.val - a.val);

  // Def points rank
  const defPtsRanked = Object.entries(teamPoints)
    .map(([team, p]) => ({ team, val: p.against / p.games }))
    .sort((a, b) => a.val - b.val);

  return { teamStatMap, teamPoints, offYdsRanked, defYdsRanked, offPtsRanked, defPtsRanked };
}

function getStatsFromCache(school, year, cache) {
  const { teamStatMap, teamPoints, offYdsRanked, defYdsRanked, offPtsRanked, defPtsRanked } = cache;

  // Case-insensitive team match
  const matchKey = (obj, name) =>
    Object.keys(obj).find(k => k.toLowerCase() === name.toLowerCase());

  const statsKey  = matchKey(teamStatMap, school);
  const pointsKey = matchKey(teamPoints,  school);
  if (!statsKey && !pointsKey) return null;

  const stats  = teamStatMap[statsKey]  || {};
  const points = teamPoints[pointsKey]  || { for: 0, against: 0, games: 12 };
  const games  = stats.games || points.games || 12;

  const rankOf = (arr, name) => {
    const idx = arr.findIndex(e => e.team.toLowerCase() === name.toLowerCase());
    return idx === -1 ? null : idx + 1;
  };

  return {
    off_ppg:        points.games > 0 ? round2(points.for     / points.games) : null,
    off_ypg:        stats.totalYards         != null ? round2(stats.totalYards         / games) : null,
    off_rank_pts:   rankOf(offPtsRanked, school),
    off_rank_yards: rankOf(offYdsRanked, school),
    def_ppg:        points.games > 0 ? round2(points.against / points.games) : null,
    def_ypg:        stats.totalYardsOpponent != null ? round2(stats.totalYardsOpponent / games) : null,
    def_rank_pts:   rankOf(defPtsRanked, school),
    def_rank_yards: rankOf(defYdsRanked, school),
  };
}

function fetchCoachTeamStats(school, year, apiKey) {
  const base    = "https://api.collegefootballdata.com";
  const headers = { "Authorization": `Bearer ${apiKey}` };

  // Season stats endpoint
  const statsUrl = `${base}/stats/season?year=${year}&team=${encodeURIComponent(school)}`;
  const statsRes = JSON.parse(UrlFetchApp.fetch(statsUrl, { headers }).getContentText());
  if (!statsRes || statsRes.length === 0) return null;

  // Stats are flat objects with just statName and statValue — no category field
  // Offense stats use plain names, defense uses "Opponent" suffix
  const statMap = {};
  for (const s of statsRes) {
    statMap[s.statName] = parseFloat(s.statValue);
  }

  // Get number of games to convert totals to per-game
  const games = statMap['games'] || 12;

  // Total yards
  const off_ypg = statMap['totalYards']         != null ? statMap['totalYards']         / games : null;
  const def_ypg = statMap['totalYardsOpponent'] != null ? statMap['totalYardsOpponent'] / games : null;

  // Points — use passing + rushing TDs * 6 + approximate extra points as proxy
  // Or use the games endpoint for cleaner scoring data
  const gamesUrl = `${base}/games?year=${year}&team=${encodeURIComponent(school)}&seasonType=regular`;
  const gamesRes = JSON.parse(UrlFetchApp.fetch(gamesUrl, { headers }).getContentText());

  let totalPtsFor = 0, totalPtsAgainst = 0, gameCount = 0;
  for (const g of gamesRes) {
    if (!g.home_points && !g.away_points) continue;
    const isHome = g.home_team.toLowerCase() === school.toLowerCase();
    totalPtsFor     += isHome ? (g.home_points || 0) : (g.away_points || 0);
    totalPtsAgainst += isHome ? (g.away_points || 0) : (g.home_points || 0);
    gameCount++;
  }
  const off_ppg = gameCount > 0 ? totalPtsFor     / gameCount : null;
  const def_ppg = gameCount > 0 ? totalPtsAgainst / gameCount : null;

  // Rankings — fetch all teams and compute rank
  const allUrl  = `${base}/stats/season?year=${year}`;
  const allRes  = JSON.parse(UrlFetchApp.fetch(allUrl, { headers }).getContentText());

  // Build per-team totalYards maps from flat stat list
  const offYdsMap = {}, defYdsMap = {};
  for (const s of allRes) {
    if (s.statName === 'totalYards')         offYdsMap[s.team] = parseFloat(s.statValue) / (statMap['games'] || 12);
    if (s.statName === 'totalYardsOpponent') defYdsMap[s.team] = parseFloat(s.statValue) / (statMap['games'] || 12);
  }

  // Points rankings from games endpoint for all teams is too slow — use yards rank as proxy
  const offYdsSorted = Object.entries(offYdsMap).sort((a, b) => b[1] - a[1]);
  const defYdsSorted = Object.entries(defYdsMap).sort((a, b) => a[1] - b[1]);

  const offRankYards = offYdsSorted.findIndex(([t]) => t.toLowerCase() === school.toLowerCase()) + 1 || null;
  const defRankYards = defYdsSorted.findIndex(([t]) => t.toLowerCase() === school.toLowerCase()) + 1 || null;

  // For points rank, sort teams by off_ppg — we only have our team's ppg here
  // so we'll fetch season team stats for a rough rank
  const spUrl  = `${base}/ratings/sp?year=${year}`;
  const spResp = UrlFetchApp.fetch(spUrl, { headers, muteHttpExceptions: true });
  let off_rank_pts = null, def_rank_pts = null;
  if (spResp.getResponseCode() === 200) {
    const spData = JSON.parse(spResp.getContentText());
    const sorted = spData.sort((a, b) => (b.offense?.rating || 0) - (a.offense?.rating || 0));
    off_rank_pts = sorted.findIndex(t => t.team.toLowerCase() === school.toLowerCase()) + 1 || null;
    const defSorted = spData.sort((a, b) => (b.defense?.rating || 0) - (a.defense?.rating || 0));
    def_rank_pts = defSorted.findIndex(t => t.team.toLowerCase() === school.toLowerCase()) + 1 || null;
  }

  return {
    off_ppg:        off_ppg        != null ? round2(off_ppg)        : null,
    off_ypg:        off_ypg        != null ? round2(off_ypg)        : null,
    off_rank_pts:   off_rank_pts,
    off_rank_yards: offRankYards   || null,
    def_ppg:        def_ppg        != null ? round2(def_ppg)        : null,
    def_ypg:        def_ypg        != null ? round2(def_ypg)        : null,
    def_rank_pts:   def_rank_pts,
    def_rank_yards: defRankYards   || null,
  };
}

function computeCoachRank(allStats, school, statName, category, lowerIsBetter) {
  const teamMap = {};
  for (const s of allStats) {
    if (s.statName !== statName || s.category !== category) continue;
    teamMap[s.team] = parseFloat(s.statValue);
  }
  const sorted = Object.entries(teamMap).sort((a, b) =>
    lowerIsBetter ? a[1] - b[1] : b[1] - a[1]
  );
  const idx = sorted.findIndex(([t]) => t.toLowerCase() === school.toLowerCase());
  return idx === -1 ? null : idx + 1;
}

function validateSchools() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
                              .getSheetByName(COACH_SHEET_NAME);
  const data      = sheet.getDataRange().getValues();
  const headers   = data[0];
  const schoolCol = headers.indexOf("school");

  const schoolsToCheck = [...new Set(
    data.slice(1).filter(r => r[schoolCol]).map(r => r[schoolCol])
  )];

  const config  = getConfig();
  const url     = "https://api.collegefootballdata.com/teams/fbs?year=2024";
  const res     = JSON.parse(UrlFetchApp.fetch(url, {
    headers: { "Authorization": `Bearer ${config.API_KEY}` }
  }).getContentText());
  const validNames = res.map(t => t.school.toLowerCase());

  const invalid = schoolsToCheck.filter(s => !validNames.includes(s.toLowerCase()));
  if (invalid.length === 0) {
    Logger.log("All school names look valid!");
  } else {
    Logger.log("These school names may not match CFBD exactly:\n" + invalid.join("\n"));
  }
}

function diagCoachSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
                              .getSheetByName(COACH_SHEET_NAME);
  if (!sheet) { Logger.log('Sheet not found: ' + COACH_SHEET_NAME); return; }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Logger.log('Sheet name: ' + sheet.getName());
  Logger.log('Columns found (' + headers.length + '):');
  headers.forEach((h, i) => Logger.log(`  [${i}] "${h}"`));

  const expected = [
    'school', 'year', 'role',
    'off_ppg', 'off_ypg', 'off_rank_pts', 'off_rank_yards',
    'def_ppg_allowed', 'def_ypg_allowed', 'def_rank_pts', 'def_rank_yards'
  ];
  Logger.log('\nExpected columns check:');
  for (const e of expected) {
    const idx = headers.indexOf(e);
    Logger.log(`  "${e}" → ${idx === -1 ? 'NOT FOUND' : 'col ' + idx}`);
  }
}