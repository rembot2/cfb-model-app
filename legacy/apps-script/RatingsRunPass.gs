// ============================================================
// CFB RATINGS MODEL - COMPLETE FILE WITH RUN/PASS SPLITS
// ============================================================
// INSTRUCTIONS:
//   1. Open Extensions > Apps Script in your spreadsheet
//   2. Click your main script file (the one with calculateRatings etc)
//   3. Select ALL the text and DELETE it
//   4. Paste THIS ENTIRE FILE in its place
//   5. Save with Ctrl+S
//   6. IMPORTANT: Run "setupSheets()" once from the Apps Script
//      editor to add the new columns to your RawStats and Ratings
//      sheets. It will NOT delete your existing data.
//   7. Then re-run your fetch functions and calculateRatings()
//
// WHAT CHANGED:
//   - RawStats sheet gains 4 new columns (cols 12-15):
//       rush_ppa_off, rush_ppa_def, pass_ppa_off, pass_ppa_def
//   - Ratings sheet gains 4 new columns (cols 6-9):
//       rush_off, pass_off, rush_def, pass_def
//   - All existing columns stay exactly where they are
//   - fetchSeasonByYear() and fetchSeason2025() now pull rush/pass splits
//   - calculateRatings() now computes all 4 split ratings
// ============================================================


// ── STEP 1: SET UP YOUR SHEETS ──────────────────────────────
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetNames = ss.getSheets().map(s => s.getName());

  // ── Config sheet ──────────────────────────────────────────
  if (!sheetNames.includes('Config')) {
    const cfg = ss.insertSheet('Config');
    cfg.getRange('A1:B1').setValues([['Setting', 'Value']]);
    cfg.getRange('A1:B1').setFontWeight('bold');
    cfg.getRange('A2:B8').setValues([
      ['API_KEY',             'PASTE_YOUR_KEY_HERE'],
      ['SEASONS',             '2022,2023,2024,2025'],
      ['RECENCY_WEIGHT',      1.5],
      ['HFA_POINTS',          2.5],
      ['ITERATIONS',          20],
      ['EXCLUDE_FCS',         true],
      ['GARBAGE_TIME_CUTOFF', 5],
    ]);
    cfg.setColumnWidth(1, 200);
    cfg.setColumnWidth(2, 220);
  }

  // ── RawStats sheet ────────────────────────────────────────
  // 17 columns total: original 11 + 4 run/pass split columns + 2 rate columns
  if (!sheetNames.includes('RawStats')) {
    const raw = ss.insertSheet('RawStats');
    const headers = [
      'season','week','team','opponent','isHome',
      'ppa_off','ppa_def',
      'success_off','success_def',
      'pts_per_drive_off','pts_per_drive_def',
      // NEW — run/pass PPA splits
      'rush_ppa_off','rush_ppa_def',
      'pass_ppa_off','pass_ppa_def',
      'rush_rate_off','pass_rate_off'
    ];
    raw.getRange(1, 1, 1, headers.length).setValues([headers]);
    raw.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    raw.setFrozenRows(1);
  } else {
    // Sheet already exists — just make sure the new headers are there
    const raw = ss.getSheetByName('RawStats');
    const existingHeaders = raw.getRange(1, 1, 1, raw.getLastColumn()).getValues()[0];
    const needed = ['rush_ppa_off','rush_ppa_def','pass_ppa_off','pass_ppa_def','rush_rate_off','pass_rate_off'];
    for (const h of needed) {
      if (!existingHeaders.includes(h)) {
        const nextCol = raw.getLastColumn() + 1;
        raw.getRange(1, nextCol).setValue(h).setFontWeight('bold');
      }
    }
  }

  // ── Ratings sheet ─────────────────────────────────────────
  // 9 columns: original 5 + 4 new split ratings
  if (!sheetNames.includes('Ratings')) {
    const rat = ss.insertSheet('Ratings');
    const headers = [
      'team',
      'off_rating','def_rating','composite','games',
      // NEW — run/pass split ratings
      'rush_off_rating','pass_off_rating',
      'rush_def_rating','pass_def_rating'
    ];
    rat.getRange(1, 1, 1, headers.length).setValues([headers]);
    rat.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    rat.setFrozenRows(1);
  } else {
    // Sheet already exists — add new header columns if missing
    const rat = ss.getSheetByName('Ratings');
    const existingHeaders = rat.getRange(1, 1, 1, rat.getLastColumn()).getValues()[0];
    const needed = ['rush_off_rating','pass_off_rating','rush_def_rating','pass_def_rating'];
    for (const h of needed) {
      if (!existingHeaders.includes(h)) {
        const nextCol = rat.getLastColumn() + 1;
        rat.getRange(1, nextCol).setValue(h).setFontWeight('bold');
      }
    }
  }

  SpreadsheetApp.getUi().alert(
    'Sheets ready!\n\n' +
    'RawStats now has 17 columns (added rush/pass PPA and rush/pass rate columns).\n' +
    'Ratings now has 9 columns (added rush_off_rating, pass_off_rating, rush_def_rating, pass_def_rating).\n\n' +
    'Re-run your fetch functions to fill in the new columns, then run calculateRatings().'
  );
}


// ── STEP 2: FETCH BY YEAR (2022, 2023, 2024) ────────────────
// This replaces fetchSeasonByYear() — now captures rush/pass PPA splits
function fetchSeason2022() { fetchSeasonByYear('2022'); }
function fetchSeason2023() { fetchSeasonByYear('2023'); }
function fetchSeason2024() { fetchSeasonByYear('2024'); }

function getRunPassRates(rushObj, passObj) {
  function directRate(obj) {
    if (!obj) return null;
    const keys = ['rate','usage','playRate','play_rate','percent','percentage'];
    for (const k of keys) {
      const v = parseFloat(obj[k]);
      if (!isNaN(v)) return v > 1 ? v / 100 : v;
    }
    return null;
  }

  function playCount(obj) {
    if (!obj) return null;
    const keys = ['plays','playCount','count','total','attempts','attemptCount','numPlays'];
    for (const k of keys) {
      const v = parseFloat(obj[k]);
      if (!isNaN(v) && v >= 0) return v;
    }
    return null;
  }

  const rushRate = directRate(rushObj);
  const passRate = directRate(passObj);

  if (rushRate !== null && passRate !== null && rushRate + passRate > 0) {
    const total = rushRate + passRate;
    return { rush: rushRate / total, pass: passRate / total };
  }

  const rushPlays = playCount(rushObj);
  const passPlays = playCount(passObj);
  if (rushPlays !== null && passPlays !== null && rushPlays + passPlays > 0) {
    const total = rushPlays + passPlays;
    return { rush: rushPlays / total, pass: passPlays / total };
  }

  return { rush: null, pass: null };
}

function fetchRunPassRateMap(season, apiKey) {
  const out = {};

  for (const seasonType of ['regular', 'postseason']) {
    const url = `https://api.collegefootballdata.com/games/teams?year=${season}&seasonType=${seasonType}`;
    const resp = fetchWithAuth(url, apiKey);
    if (!resp) continue;

    let rows;
    try {
      rows = JSON.parse(resp);
    } catch (e) {
      Logger.log('Run/pass team stats parse error: ' + e.message);
      continue;
    }

    for (const row of rows) {
      const teamRows = Array.isArray(row.teams) ? row.teams : [row];

      for (const teamRow of teamRows) {
        const gameId = teamRow.gameId || teamRow.id || row.gameId || row.id;
        const team = teamRow.school || teamRow.team || teamRow.name;
        if (!gameId || !team) continue;

        const stats = teamRow.stats || {};
        const rushAttempts = extractTeamStat(stats, [
          'rushingAttempts',
          'rushAttempts',
          'rushingAtt',
          'rushAtt',
          'rushingPlays',
          'rushPlays'
        ]);
        const passAttempts = extractTeamStat(stats, [
          'passingAttempts',
          'passAttempts',
          'passesAttempted',
          'completionAttempts',
          'completionsAttempts'
        ]);

        if (rushAttempts === null || passAttempts === null) continue;
        if (rushAttempts + passAttempts <= 0) continue;

        out[`${gameId}_${team}`] = {
          rush: rushAttempts / (rushAttempts + passAttempts),
          pass: passAttempts / (rushAttempts + passAttempts)
        };
      }
    }
  }

  if (Object.keys(out).length > 0) {
    Logger.log('Game-level run/pass rate rows loaded for ' + season + ': ' + Object.keys(out).length);
    return out;
  }

  Logger.log('No game-level run/pass rates for ' + season + '. Falling back to season team stats.');
  return fetchSeasonRunPassRateMap(season, apiKey);
}

function fetchSeasonRunPassRateMap(season, apiKey) {
  const attemptsByTeam = {};

  for (const seasonType of ['regular', 'postseason']) {
    const url = `https://api.collegefootballdata.com/stats/season?year=${season}&seasonType=${seasonType}`;
    const resp = fetchWithAuth(url, apiKey);
    if (!resp) continue;

    let rows;
    try {
      rows = JSON.parse(resp);
    } catch (e) {
      Logger.log('Season stats parse error: ' + e.message);
      continue;
    }

    for (const row of rows) {
      const team = row.team || row.school;
      const statName = String(row.statName || row.category || row.stat || '').toLowerCase();
      const value = parseTeamStatNumber(row.statValue !== undefined ? row.statValue : row.value, statName);
      if (!team || value === null) continue;

      if (!attemptsByTeam[team]) attemptsByTeam[team] = { rush: null, pass: null };

      if ([
        'rushingattempts',
        'rushattempts',
        'rushingatt',
        'rushatt',
        'rushingplays',
        'rushplays'
      ].indexOf(statName) >= 0) {
        attemptsByTeam[team].rush = value;
      }

      if ([
        'passingattempts',
        'passattempts',
        'passesattempted',
        'completionattempts',
        'completionsattempts'
      ].indexOf(statName) >= 0) {
        attemptsByTeam[team].pass = value;
      }
    }
  }

  const out = {};
  for (const team in attemptsByTeam) {
    if (!Object.prototype.hasOwnProperty.call(attemptsByTeam, team)) continue;
    const v = attemptsByTeam[team];
    if (v.rush === null || v.pass === null || v.rush + v.pass <= 0) continue;
    out[team] = {
      rush: v.rush / (v.rush + v.pass),
      pass: v.pass / (v.rush + v.pass)
    };
  }

  Logger.log('Season-level run/pass rate teams loaded for ' + season + ': ' + Object.keys(out).length);
  return out;
}

function extractTeamStat(stats, names) {
  if (!stats) return null;
  const wanted = names.map(function(n) { return String(n).toLowerCase(); });

  if (Array.isArray(stats)) {
    for (var i = 0; i < stats.length; i++) {
      var item = stats[i];
      var category = String(item.category || item.name || item.statName || '').toLowerCase();
      if (wanted.indexOf(category) < 0) continue;
      return parseTeamStatNumber(item.stat !== undefined ? item.stat : item.value, category);
    }
    return null;
  }

  for (var k in stats) {
    if (!Object.prototype.hasOwnProperty.call(stats, k)) continue;
    if (wanted.indexOf(String(k).toLowerCase()) < 0) continue;
    return parseTeamStatNumber(stats[k], String(k).toLowerCase());
  }

  return null;
}

function parseTeamStatNumber(value, category) {
  if (value === null || value === undefined || value === '') return null;
  var text = String(value);

  // CFBD box stats often store pass completions/attempts as "18-31".
  if (category && category.indexOf('completion') >= 0 && text.indexOf('-') >= 0) {
    var parts = text.split('-');
    var attempts = parseFloat(parts[parts.length - 1]);
    return isNaN(attempts) ? null : attempts;
  }

  var n = parseFloat(text.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function fetchSeasonByYear(season) {
  const config = getConfig();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = ss.getSheetByName('RawStats');
  const allRows = [];

  Logger.log('Fetching ' + season + '...');

  // Regular season advanced stats
  const statsUrl = `https://api.collegefootballdata.com/stats/game/advanced?year=${season}&seasonType=regular`;
  const statsResp = fetchWithAuth(statsUrl, config.API_KEY);
  if (!statsResp) { Logger.log('No stats response'); return; }
  const regularStats = JSON.parse(statsResp);

  // Postseason advanced stats
  const postStatsUrl = `https://api.collegefootballdata.com/stats/game/advanced?year=${season}&seasonType=postseason`;
  const postStatsResp = fetchWithAuth(postStatsUrl, config.API_KEY);
  const postStats = postStatsResp ? JSON.parse(postStatsResp) : [];

  // Regular season games (for scores and home/away)
  const gamesUrl = `https://api.collegefootballdata.com/games?year=${season}&seasonType=regular`;
  const gamesResp = fetchWithAuth(gamesUrl, config.API_KEY);
  const regularGames = gamesResp ? JSON.parse(gamesResp) : [];

  // CFP postseason games only
  const postUrl = `https://api.collegefootballdata.com/games?year=${season}&seasonType=postseason`;
  const postResp = fetchWithAuth(postUrl, config.API_KEY);
  const postGames = postResp ? JSON.parse(postResp) : [];
  const cfpGames = postGames.filter(g =>
    g.notes && g.notes.toLowerCase().includes('playoff')
  );

  // Merge: only keep postseason stats for CFP game IDs
  const cfpGameIds = new Set(cfpGames.map(g => g.id));
  const filteredPostStats = postStats.filter(g => cfpGameIds.has(g.gameId));
  const stats    = [...regularStats, ...filteredPostStats];
  const allGames = [...regularGames, ...cfpGames];
  const runPassRateMap = fetchRunPassRateMap(season, config.API_KEY);
  Logger.log('Stats rows: ' + stats.length);

  // Game map: id → home/away teams and scores
  const gameMap = {};
  for (const g of allGames) {
    gameMap[g.id] = {
      homeTeam: g.home_team,
      awayTeam: g.away_team,
      homePts:  g.home_points || 0,
      awayPts:  g.away_points || 0,
    };
  }

  // FBS teams
  const teamsUrl = `https://api.collegefootballdata.com/teams/fbs?year=${season}`;
  const teamsResp = fetchWithAuth(teamsUrl, config.API_KEY);
  const fbsTeams = teamsResp ? new Set(JSON.parse(teamsResp).map(t => t.school)) : new Set();

  // Stat lookup: gameId_team → full stat row
  const statMap = {};
  for (const row of stats) {
    statMap[`${row.gameId}_${row.team}`] = row;
  }

  const processed = new Set();
  for (const row of stats) {
    const gameId   = row.gameId;
    const team     = row.team;
    const opponent = row.opponent;
    const pairKey  = `${gameId}_${team}`;

    if (processed.has(pairKey)) continue;
    processed.add(pairKey);
    if (!team || !opponent) continue;
    if (config.EXCLUDE_FCS && !fbsTeams.has(opponent)) continue;

    const info   = gameMap[gameId] || {};
    const isHome = info.homeTeam === team;

    // This team's offense stats
    const offRow = statMap[`${gameId}_${team}`]     || {};
    // Opponent's offense stats (= what our defense faced)
    const defRow = statMap[`${gameId}_${opponent}`] || {};

    const off = offRow.offense || {};
    const def = defRow.offense || {};

    // ── Rush and pass sub-objects ──────────────────────────
    // CFBD returns rushingPlays and passingPlays inside offense/defense
    // Each has: ppa, successRate, explosiveness, etc.
    const offRush = off.rushingPlays || {};
    const offPass = off.passingPlays || {};
    const defRush = def.rushingPlays || {}; // opponent's rush offense = our rush defense faced
    const defPass = def.passingPlays || {}; // opponent's pass offense = our pass defense faced
    const runPassRates = runPassRateMap[`${gameId}_${team}`] || runPassRateMap[team] || getRunPassRates(offRush, offPass);

    const teamPts = isHome ? info.homePts : info.awayPts;
    const oppPts  = isHome ? info.awayPts : info.homePts;
    const teamDrv = off.drives || 10;
    const oppDrv  = def.drives || 10;

    allRows.push([
      // Original 11 columns
      parseInt(season), row.week, team, opponent, isHome,
      off.ppa         ?? null,
      def.ppa         ?? null,
      off.successRate ?? null,
      def.successRate ?? null,
      teamPts / teamDrv,
      oppPts  / oppDrv,
      // NEW: 4 run/pass split columns (cols 12-15)
      offRush.ppa ?? null,  // rush_ppa_off
      defRush.ppa ?? null,  // rush_ppa_def  (opponent's rush ppa = what our D faced)
      offPass.ppa ?? null,  // pass_ppa_off
      defPass.ppa ?? null,  // pass_ppa_def  (opponent's pass ppa = what our D faced)
      runPassRates.rush,
      runPassRates.pass,
    ]);
  }

  Logger.log('Rows to write: ' + allRows.length);

  if (allRows.length > 0) {
    const lastRow  = rawSheet.getLastRow();
    const chunkSize = 200;
    for (let i = 0; i < allRows.length; i += chunkSize) {
      const chunk = allRows.slice(i, i + chunkSize);
      rawSheet.getRange(lastRow + 1 + i, 1, chunk.length, 17).setValues(chunk);
    }
    SpreadsheetApp.getUi().alert(`Done! Added ${allRows.length} rows for ${season}.`);
  } else {
    SpreadsheetApp.getUi().alert(`0 rows for ${season} — check Executions log.`);
  }
}


// ── FETCH 2025 SEASON ────────────────────────────────────────
function fetchSeason2025() {
  const config = getConfig();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet = ss.getSheetByName('RawStats');
  const season = '2025';
  const allRows = [];

  Logger.log('Fetching 2025...');

  const statsUrl = `https://api.collegefootballdata.com/stats/game/advanced?year=${season}`;
  const statsResp = fetchWithAuth(statsUrl, config.API_KEY);
  if (!statsResp) { Logger.log('No stats response'); return; }
  const stats = JSON.parse(statsResp);
  const runPassRateMap = fetchRunPassRateMap(season, config.API_KEY);
  Logger.log('Stats rows: ' + stats.length);

  const gamesUrl = `https://api.collegefootballdata.com/games?year=${season}&seasonType=regular`;
  const gamesResp = fetchWithAuth(gamesUrl, config.API_KEY);
  const gameResults = gamesResp ? JSON.parse(gamesResp) : [];

  const gameMap = {};
  for (const g of gameResults) {
    gameMap[g.id] = {
      homeTeam: g.home_team,
      awayTeam: g.away_team,
      homePts:  g.home_points || 0,
      awayPts:  g.away_points || 0,
    };
  }

  const teamsUrl = `https://api.collegefootballdata.com/teams/fbs?year=${season}`;
  const teamsResp = fetchWithAuth(teamsUrl, config.API_KEY);
  const fbsTeams = teamsResp ? new Set(JSON.parse(teamsResp).map(t => t.school)) : new Set();

  if (stats.length > 0) Logger.log('Sample stat row: ' + JSON.stringify(stats[0]));

  const statMap = {};
  for (const row of stats) {
    statMap[`${row.gameId}_${row.team}`] = row;
  }

  const processed = new Set();
  for (const row of stats) {
    const gameId   = row.gameId;
    const team     = row.team;
    const opponent = row.opponent;
    const pairKey  = `${gameId}_${team}`;

    if (processed.has(pairKey)) continue;
    processed.add(pairKey);
    if (!team || !opponent) continue;
    if (config.EXCLUDE_FCS && !fbsTeams.has(opponent)) continue;
    if (config.EXCLUDE_FCS && !fbsTeams.has(team)) continue;

    const info   = gameMap[gameId] || {};
    const isHome = info.homeTeam === team;

    const offRow = statMap[`${gameId}_${team}`]     || {};
    const defRow = statMap[`${gameId}_${opponent}`] || {};

    const off = offRow.offense || {};
    const def = defRow.offense || {};

    const offRush = off.rushingPlays || {};
    const offPass = off.passingPlays || {};
    const defRush = def.rushingPlays || {};
    const defPass = def.passingPlays || {};
    const runPassRates = runPassRateMap[`${gameId}_${team}`] || runPassRateMap[team] || getRunPassRates(offRush, offPass);

    const teamPts = isHome ? info.homePts : info.awayPts;
    const oppPts  = isHome ? info.awayPts : info.homePts;
    const teamDrv = off.drives || 10;
    const oppDrv  = def.drives || 10;

    allRows.push([
      2025, row.week, team, opponent, isHome,
      off.ppa         ?? null,
      def.ppa         ?? null,
      off.successRate ?? null,
      def.successRate ?? null,
      teamPts / teamDrv,
      oppPts  / oppDrv,
      offRush.ppa ?? null,
      defRush.ppa ?? null,
      offPass.ppa ?? null,
      defPass.ppa ?? null,
      runPassRates.rush,
      runPassRates.pass,
    ]);
  }

  Logger.log('Rows to write: ' + allRows.length);

  if (allRows.length > 0) {
    const lastRow = rawSheet.getLastRow();
    rawSheet.getRange(lastRow + 1, 1, allRows.length, 17).setValues(allRows);
    SpreadsheetApp.getUi().alert(`Done! Added ${allRows.length} rows for 2025.`);
  } else {
    SpreadsheetApp.getUi().alert('Still 0 rows — check Executions log for the sample stat row output.');
  }
}


// ── STEP 3: CALCULATE RATINGS ────────────────────────────────
// Now produces 9 output columns:
//   team, off_rating, def_rating, composite, games,
//   rush_off_rating, pass_off_rating, rush_def_rating, pass_def_rating
const POSITION_GROUPS_2026 = ['QB','RB','WR','TE','OL','DL','LB','CB','S','K','P'];

function normalizePositionGroup2026(pos) {
  pos = String(pos || '').toUpperCase().trim();

  if (pos === 'QB') return 'QB';
  if (['RB','HB','FB'].includes(pos)) return 'RB';
  if (pos === 'WR') return 'WR';
  if (pos === 'TE') return 'TE';
  if (['OL','OT','IOL','OG','C'].includes(pos)) return 'OL';
  if (['DL','EDGE','DE','DT','NT'].includes(pos)) return 'DL';
  if (['LB','ILB','OLB'].includes(pos)) return 'LB';
  if (pos === 'CB') return 'CB';
  if (['S','SAF'].includes(pos)) return 'S';
  if (['K','PK'].includes(pos)) return 'K';
  if (pos === 'P') return 'P';

  return '';
}

function positionDepthLimit2026(group) {
  const limits = {
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

  return limits[group] || 4;
}

function getOn3StagingSheetName(year) {
  year = parseInt(year, 10) || 2026;
  return year === 2026 ? 'On3RosterStaging' : 'On3RosterStaging' + year;
}

function getTalentOverrideSheetNameForYear(year) {
  year = parseInt(year, 10) || 2026;
  return year === 2026 ? 'TalentOverride' : 'TalentOverride' + year;
}

function computePositionGroupRatings2026(teams, ratingYear) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = getOn3StagingSheetName(ratingYear);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(sheetName + ' sheet not found.');
  }

  const data = sheet.getDataRange().getValues();
  const grouped = {};

  for (let i = 1; i < data.length; i++) {
    const team = data[i][0];
    const pos = normalizePositionGroup2026(data[i][2]);
    const rating = parseFloat(data[i][3]);

    if (!team || !pos || isNaN(rating)) continue;

    if (!grouped[team]) grouped[team] = {};
    if (!grouped[team][pos]) grouped[team][pos] = [];

    grouped[team][pos].push(rating);
  }

  const raw = {};

  for (const team of teams) {
    raw[team] = {};

    for (const group of POSITION_GROUPS_2026) {
      const ratings = ((grouped[team] && grouped[team][group]) || [])
        .sort((a, b) => b - a)
        .slice(0, positionDepthLimit2026(group));

      if (ratings.length === 0) {
        raw[team][group] = null;
        continue;
      }

      let weightedSum = 0;
      let weightSum = 0;

      for (let i = 0; i < ratings.length; i++) {
        const weight = Math.exp(-0.35 * i);
        weightedSum += ratings[i] * weight;
        weightSum += weight;
      }

      raw[team][group] = weightedSum / weightSum;
    }
  }

  const output = {};

  for (const team of teams) {
    output[team] = {};
  }

  for (const group of POSITION_GROUPS_2026) {
    const vals = teams
      .map(team => raw[team][group])
      .filter(v => v !== null && !isNaN(v));

    const m = mean(vals);
    const s = stdDev(vals) || 1;

    for (const team of teams) {
      const v = raw[team][group];

      output[team][group] =
  v !== null && !isNaN(v)
    ? round2(10 + (((v - m) / s) * 3))
    : 10;
    }
  }

  return output;
}
function calculateRatings2022() {
  calculateRatingsCore('Ratings2022', 'TalentOverride', 2022);
}

function calculateRatings2023() {
  calculateRatingsCore('Ratings2023', 'TalentOverride', 2023);
}

function calculateRatings2024() {
  calculateRatingsCore('Ratings2024', 'TalentOverride', 2024);
}

function calculateRatings2025() {
  calculateRatingsCore('Ratings2025', 'TalentOverride', 2025);
}

function calculateRatings2026() {
  calculateRatingsCore('Ratings2026', 'TalentOverride', 2026);
}
function calculateRatingsCore(outputSheetName, talentSourceMode, ratingYear) {
  ratingYear = parseInt(ratingYear, 10) || 2026;
  const config     = getConfig();
  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const rawSheet   = ss.getSheetByName('RawStats');
  let ratSheet = ss.getSheetByName(outputSheetName);
if (!ratSheet) {
  ratSheet = ss.insertSheet(outputSheetName);

  if (talentSourceMode === 'TalentOverride') {
    ratSheet.getRange(1, 1, 1, 20).setValues([[
      'team','off_rating','def_rating','composite','games',
      'rush_off_rating','pass_off_rating','rush_def_rating','pass_def_rating',
      'qb_rating','rb_rating','wr_rating','te_rating','ol_rating',
      'dl_rating','lb_rating','cb_rating','s_rating','k_rating','p_rating'
    ]]).setFontWeight('bold');
  } else {
    ratSheet.getRange(1, 1, 1, 9).setValues([[
      'team','off_rating','def_rating','composite','games',
      'rush_off_rating','pass_off_rating','rush_def_rating','pass_def_rating'
    ]]).setFontWeight('bold');
  }

  ratSheet.setFrozenRows(1);
}
if (talentSourceMode === 'TalentOverride') {
  ratSheet.getRange(1, 1, 1, 20).setValues([[
    'team','off_rating','def_rating','composite','games',
    'rush_off_rating','pass_off_rating','rush_def_rating','pass_def_rating',
    'qb_rating','rb_rating','wr_rating','te_rating','ol_rating',
    'dl_rating','lb_rating','cb_rating','s_rating','k_rating','p_rating'
  ]]).setFontWeight('bold');
} else {
  ratSheet.getRange(1, 1, 1, 9).setValues([[
    'team','off_rating','def_rating','composite','games',
    'rush_off_rating','pass_off_rating','rush_def_rating','pass_def_rating'
  ]]).setFontWeight('bold');
}
ratSheet.setFrozenRows(1);
  const coachSheet = ss.getSheetByName('Coaches');

  const data    = rawSheet.getDataRange().getValues();
  const headers = data[0];
  const col     = name => headers.indexOf(name);
  let rows      = data.slice(1).filter(r => {
    const team = r[col('team')];
    const season = parseInt(r[col('season')], 10);
    return team && !isNaN(season) && season <= ratingYear;
  });

  // ── Tier config ───────────────────────────────────────────
  const baseTW = parseFloat(config.TALENT_WEIGHT) || 0.40;
  const TIER_CONFIG = {
    'Elite':      { talentWeight: baseTW * 0.50, trajectoryMult: 2.0, meanPull: 0.00 },
    'Good':       { talentWeight: baseTW * 0.80, trajectoryMult: 1.5, meanPull: 0.00 },
    'Average':    { talentWeight: baseTW,         trajectoryMult: 1.0, meanPull: 0.00 },
    'Concerning': { talentWeight: baseTW * 1.25,  trajectoryMult: 0.0, meanPull: 0.15 },
    'Unknown':    { talentWeight: baseTW * 1.375, trajectoryMult: 0.5, meanPull: 0.25 },
  };

  function tendencyToTrust(val) {
    const t = parseInt(val) || 3;
    return [0, 0.55, 0.70, 0.82, 0.92, 1.0][Math.min(Math.max(t, 1), 5)];
  }

  // ── Load coach data ───────────────────────────────────────
  const coachMap = {};
  if (coachSheet) {
    const coachData = coachSheet.getDataRange().getValues().slice(1);
    for (const [team, , tier, hireYear, offT, defT, preseasonOverride] of coachData) {
      if (!team) continue;
      const tierKey = tier || 'Average';
      coachMap[team] = {
        tier:             tierKey,
        tierCfg:          TIER_CONFIG[tierKey] || TIER_CONFIG['Average'],
        hireYear:         parseInt(hireYear) || 0,
        offTrust:         tendencyToTrust(offT),
        defTrust:         tendencyToTrust(defT),
        preseasonOverride: parseFloat(preseasonOverride) || 0,
      };
    }
  }

  // ── Season weights ────────────────────────────────────────
  let seasons   = String(config.SEASONS)
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(s => !isNaN(s) && s <= ratingYear)
    .sort();

  if (seasons.length === 0) {
    seasons = [...new Set(rows.map(r => parseInt(r[col('season')], 10)).filter(s => !isNaN(s)))]
      .sort();
  }

  const seasonSet = new Set(seasons);
  rows = rows.filter(r => seasonSet.has(parseInt(r[col('season')], 10)));

  const maxSeason = seasons.length ? Math.max(...seasons) : ratingYear;
  const RECENCY   = parseFloat(config.RECENCY_WEIGHT) || 2.5;
  const seasonBaseWeight = {};
  for (const s of seasons) {
    seasonBaseWeight[s] = Math.pow(1 / RECENCY, maxSeason - s);
  }

  function preHireDiscount(team, season) {
    const coach = coachMap[team];
    if (!coach || !coach.hireYear || season >= coach.hireYear) return 1.0;
    const yearsBack = coach.hireYear - season;
    return yearsBack === 1 ? 0.10 : 0.05;
  }

  // ── Pass 1: Raw ratings for opponent quality ──────────────
  const rawAvg = {};
  for (const row of rows) {
    const team    = row[col('team')];
    const season  = row[col('season')];
    const ppa_off = row[col('ppa_off')];
    const ppa_def = row[col('ppa_def')];
    if (ppa_off === '' || ppa_off === null || isNaN(ppa_off)) continue;
    const sw = seasonBaseWeight[season] * preHireDiscount(team, season);
    if (!rawAvg[team]) rawAvg[team] = { off: 0, def: 0, w: 0 };
    rawAvg[team].off += ppa_off * sw;
    rawAvg[team].def += ppa_def * sw;
    rawAvg[team].w   += sw;
  }
  const rawRatings0 = {};
  for (const [team, t] of Object.entries(rawAvg)) {
    if (t.w > 0) rawRatings0[team] = { off: t.off / t.w, def: t.def / t.w };
  }

  const allOffVals   = Object.values(rawRatings0).map(r => r.off);
  const leagueAvgOff = mean(allOffVals);
  const leagueStdOff = stdDev(allOffVals) || 1;

  // Max week per season for momentum
  const maxWeekBySeason = {};
  for (const row of rows) {
    const s = row[col('season')], w = row[col('week')];
    if (!maxWeekBySeason[s] || w > maxWeekBySeason[s]) maxWeekBySeason[s] = w;
  }

  // ── Trajectory (season-over-season improvement) ───────────
  const seasonAvg = {};
  for (const row of rows) {
    const team    = row[col('team')];
    const season  = row[col('season')];
    const ppa_off = row[col('ppa_off')];
    const ppa_def = row[col('ppa_def')];
    if (ppa_off === '' || ppa_off === null || isNaN(ppa_off)) continue;
    if (!seasonAvg[team]) seasonAvg[team] = {};
    if (!seasonAvg[team][season]) seasonAvg[team][season] = { offSum:0, defSum:0, n:0 };
    seasonAvg[team][season].offSum += ppa_off;
    seasonAvg[team][season].defSum += ppa_def;
    seasonAvg[team][season].n++;
  }

  const trajectoryBonus = {};
  for (const [team, seasons_] of Object.entries(seasonAvg)) {
    const coach    = coachMap[team];
    const tierCfg  = coach ? coach.tierCfg : TIER_CONFIG['Average'];
    const hireYear = coach ? coach.hireYear : 0;

    const validSeasons = Object.keys(seasons_)
      .map(Number)
      .filter(s => s >= (hireYear || 0))
      .sort();

    if (validSeasons.length < 2) { trajectoryBonus[team] = { off:0, def:0 }; continue; }

    const prev     = validSeasons[validSeasons.length - 2];
    const curr     = validSeasons[validSeasons.length - 1];
    const prevData = seasons_[prev], currData = seasons_[curr];

    trajectoryBonus[team] = {
      off: ((currData.offSum/currData.n) - (prevData.offSum/prevData.n)) * tierCfg.trajectoryMult,
      def: ((currData.defSum/currData.n) - (prevData.defSum/prevData.n)) * tierCfg.trajectoryMult,
    };
  }

  // ── Pass 2: Accumulate weighted stats (overall + run/pass) ─
  const teamStats = {};

  for (const row of rows) {
    const team    = row[col('team')];
    const opp     = row[col('opponent')];
    const season  = row[col('season')];
    const week    = row[col('week')];
    const ppa_off = row[col('ppa_off')];
    const ppa_def = row[col('ppa_def')];
    const suc_off = row[col('success_off')];
    const suc_def = row[col('success_def')];
    const ppd_off = row[col('pts_per_drive_off')];
    const ppd_def = row[col('pts_per_drive_def')];

    // ── New run/pass columns ───────────────────────────────
    // col() looks them up by header name so this works even if
    // they land on different column numbers
    const rushPpaOff = row[col('rush_ppa_off')];
    const rushPpaDef = row[col('rush_ppa_def')];
    const passPpaOff = row[col('pass_ppa_off')];
    const passPpaDef = row[col('pass_ppa_def')];

    if (ppa_off === '' || ppa_off === null || isNaN(ppa_off)) continue;

    const sw = seasonBaseWeight[season] * preHireDiscount(team, season);

    // Opponent quality multiplier (same as before)
    const oppRating = rawRatings0[opp];
    let oppQuality  = 1.0;
    if (oppRating) {
      const oppZ = (oppRating.off - leagueAvgOff) / leagueStdOff;
      oppQuality = Math.max(0.25, Math.min(2.5, Math.pow(2, oppZ)));
    }

    // Momentum (current season only)
    let momentumW = 1.0;
    if (season === maxSeason && maxWeekBySeason[season] > 1) {
      momentumW = 1 + ((week - 1) / (maxWeekBySeason[season] - 1));
    }

    const gameWeight = sw * oppQuality * momentumW;

    if (!teamStats[team]) {
      teamStats[team] = {
        // Overall metrics (same as before)
        sum_ppa_off:0, sum_ppa_def:0, w_ppa:0,
        sum_suc_off:0, sum_suc_def:0, w_suc:0,
        sum_ppd_off:0, sum_ppd_def:0, w_ppd:0,
        // Run/pass split metrics (new)
        sum_rush_ppa_off:0, sum_rush_ppa_def:0, w_rush:0,
        sum_pass_ppa_off:0, sum_pass_ppa_def:0, w_pass:0,
        games:0
      };
    }

    const t = teamStats[team];

    // Overall PPA
    t.sum_ppa_off += ppa_off * gameWeight;
    t.sum_ppa_def += ppa_def * gameWeight;
    t.w_ppa       += gameWeight;

    // Success rate
    if (suc_off !== '' && suc_off !== null && !isNaN(suc_off)) {
      t.sum_suc_off += suc_off * gameWeight;
      t.sum_suc_def += (suc_def || 0) * gameWeight;
      t.w_suc       += gameWeight;
    }

    // Points per drive
    if (ppd_off !== '' && ppd_off !== null && !isNaN(ppd_off)) {
      t.sum_ppd_off += ppd_off * gameWeight;
      t.sum_ppd_def += (ppd_def || 0) * gameWeight;
      t.w_ppd       += gameWeight;
    }

    // Rush PPA split
    // Only accumulate when both sides have data for this game
    // (some games may have null if no rushes occurred — very rare)
    if (rushPpaOff !== '' && rushPpaOff !== null && !isNaN(rushPpaOff) &&
        rushPpaDef !== '' && rushPpaDef !== null && !isNaN(rushPpaDef)) {
      t.sum_rush_ppa_off += rushPpaOff * gameWeight;
      t.sum_rush_ppa_def += rushPpaDef * gameWeight;
      t.w_rush            += gameWeight;
    }

    // Pass PPA split
    if (passPpaOff !== '' && passPpaOff !== null && !isNaN(passPpaOff) &&
        passPpaDef !== '' && passPpaDef !== null && !isNaN(passPpaDef)) {
      t.sum_pass_ppa_off += passPpaOff * gameWeight;
      t.sum_pass_ppa_def += passPpaDef * gameWeight;
      t.w_pass            += gameWeight;
    }

    t.games++;
  }

  // Compute per-team averages
  const rawRatings = {};
  for (const [team, t] of Object.entries(teamStats)) {
    if (!t.w_ppa) continue;
    rawRatings[team] = {
      ppa_off:      t.sum_ppa_off / t.w_ppa,
      ppa_def:      t.sum_ppa_def / t.w_ppa,
      suc_off:      t.w_suc  > 0 ? t.sum_suc_off / t.w_suc  : 0,
      suc_def:      t.w_suc  > 0 ? t.sum_suc_def / t.w_suc  : 0,
      ppd_off:      t.w_ppd  > 0 ? t.sum_ppd_off / t.w_ppd  : 0,
      ppd_def:      t.w_ppd  > 0 ? t.sum_ppd_def / t.w_ppd  : 0,
      // Run/pass splits — fall back to overall PPA if no split data
      rush_ppa_off: t.w_rush > 0 ? t.sum_rush_ppa_off / t.w_rush : t.sum_ppa_off / t.w_ppa,
      rush_ppa_def: t.w_rush > 0 ? t.sum_rush_ppa_def / t.w_rush : t.sum_ppa_def / t.w_ppa,
      pass_ppa_off: t.w_pass > 0 ? t.sum_pass_ppa_off / t.w_pass : t.sum_ppa_off / t.w_ppa,
      pass_ppa_def: t.w_pass > 0 ? t.sum_pass_ppa_def / t.w_pass : t.sum_ppa_def / t.w_ppa,
      games:        t.games,
    };
  }

  // ── Iterative opponent adjustment (overall only) ──────────
  // We apply the same opponent adjustment to run/pass splits
  // after the main loop using the same opponent schedule weights
  const teamOpponents = {};
  for (const row of rows) {
    const team   = row[col('team')];
    const opp    = row[col('opponent')];
    const season = row[col('season')];
    const w      = seasonBaseWeight[season] * preHireDiscount(team, season);
    if (!rawRatings[team] || !rawRatings[opp]) continue;
    if (!teamOpponents[team]) teamOpponents[team] = [];
    teamOpponents[team].push({ opp, w });
  }

  // Initialize adjustment objects for all 6 metrics
  let adjOff  = {}, adjDef  = {};
  let adjRushOff = {}, adjRushDef = {};
  let adjPassOff = {}, adjPassDef = {};

  for (const [team, r] of Object.entries(rawRatings)) {
    adjOff[team]     = r.ppa_off;
    adjDef[team]     = r.ppa_def;
    adjRushOff[team] = r.rush_ppa_off;
    adjRushDef[team] = r.rush_ppa_def;
    adjPassOff[team] = r.pass_ppa_off;
    adjPassDef[team] = r.pass_ppa_def;
  }

  const avgOff     = mean(Object.values(rawRatings).map(r => r.ppa_off));
  const avgDef     = mean(Object.values(rawRatings).map(r => r.ppa_def));
  const avgRushOff = mean(Object.values(rawRatings).map(r => r.rush_ppa_off));
  const avgRushDef = mean(Object.values(rawRatings).map(r => r.rush_ppa_def));
  const avgPassOff = mean(Object.values(rawRatings).map(r => r.pass_ppa_off));
  const avgPassDef = mean(Object.values(rawRatings).map(r => r.pass_ppa_def));

  const ITERS = config.ITERATIONS || 20;
  for (let iter = 0; iter < ITERS; iter++) {
    const nOff  = {}, nDef  = {};
    const nRushOff = {}, nRushDef = {};
    const nPassOff = {}, nPassDef = {};

    for (const [team, r] of Object.entries(rawRatings)) {
      const opps = teamOpponents[team] || [];
      if (!opps.length) {
        nOff[team]     = r.ppa_off;      nDef[team]     = r.ppa_def;
        nRushOff[team] = r.rush_ppa_off; nRushDef[team] = r.rush_ppa_def;
        nPassOff[team] = r.pass_ppa_off; nPassDef[team] = r.pass_ppa_def;
        continue;
      }

      let oppDefSum=0, oppOffSum=0;
      let oppRushDefSum=0, oppRushOffSum=0;
      let oppPassDefSum=0, oppPassOffSum=0;
      let wSum=0;

      for (const { opp, w } of opps) {
        if (adjDef[opp]     !== undefined) { oppDefSum     += adjDef[opp]     * w; wSum += w; }
        if (adjOff[opp]     !== undefined)   oppOffSum     += adjOff[opp]     * w;
        if (adjRushDef[opp] !== undefined)   oppRushDefSum += adjRushDef[opp] * w;
        if (adjRushOff[opp] !== undefined)   oppRushOffSum += adjRushOff[opp] * w;
        if (adjPassDef[opp] !== undefined)   oppPassDefSum += adjPassDef[opp] * w;
        if (adjPassOff[opp] !== undefined)   oppPassOffSum += adjPassOff[opp] * w;
      }

      const wS = wSum || 1;
      nOff[team]     = r.ppa_off      + (avgDef     - oppDefSum     / wS) * 0.5;
      nDef[team]     = r.ppa_def      + (avgOff     - oppOffSum     / wS) * 0.5;
      nRushOff[team] = r.rush_ppa_off + (avgRushDef - oppRushDefSum / wS) * 0.5;
      nRushDef[team] = r.rush_ppa_def + (avgRushOff - oppRushOffSum / wS) * 0.5;
      nPassOff[team] = r.pass_ppa_off + (avgPassDef - oppPassDefSum / wS) * 0.5;
      nPassDef[team] = r.pass_ppa_def + (avgPassOff - oppPassOffSum / wS) * 0.5;
    }

    adjOff  = nOff;  adjDef  = nDef;
    adjRushOff = nRushOff; adjRushDef = nRushDef;
    adjPassOff = nPassOff; adjPassDef = nPassDef;
  }

// ── Build composite ratings ───────────────────────────────
let teams = Object.keys(rawRatings);

const talentOverrideSheetName = getTalentOverrideSheetNameForYear(ratingYear);

// For On3-driven ratings, only include teams that exist in the year-specific TalentOverride sheet
if (talentSourceMode === 'TalentOverride') {
  const talentSheet = ss.getSheetByName(talentOverrideSheetName);

  if (!talentSheet) {
    throw new Error(talentOverrideSheetName + ' sheet not found.');
  }

  const talentData = talentSheet.getDataRange().getValues();

  const validTeams = new Set();

  for (let i = 4; i < talentData.length; i++) {
    const team = talentData[i][0];

    if (team) {
      validTeams.add(String(team).trim());
    }
  }

  teams = teams.filter(team => validTeams.has(team));
}

// ── Talent source ─────────────────────────────────────────
// TalentOverride mode = year-specific On3 full roster talent sheet
let talentRaw = {};

if (talentSourceMode === 'TalentOverride') {
  const talentSheet = ss.getSheetByName(talentOverrideSheetName);
  if (!talentSheet) throw new Error(talentOverrideSheetName + ' sheet not found.');

  const talentData = talentSheet.getDataRange().getValues();

for (let i = 4; i < talentData.length; i++) {
  const team = talentData[i][0];              // Column A: team
  const score = parseFloat(talentData[i][1]); // Column B: talent_score

  if (team && !isNaN(score) && score > 0) {
    talentRaw[team] = score;
  }
}

  Logger.log('Talent source: ' + talentOverrideSheetName);
} else {
  const talentMap = {};

  try {
    for (const s of [maxSeason, maxSeason - 1]) {
      const tResp = fetchWithAuth(
        `https://api.collegefootballdata.com/recruiting/teams?year=${s}`,
        config.API_KEY
      );
      if (!tResp) continue;

      for (const entry of JSON.parse(tResp)) {
        if (!talentMap[entry.team]) talentMap[entry.team] = [];
        talentMap[entry.team].push(entry.points || 0);
      }
    }
  } catch(e) {
    Logger.log('Talent fetch error: ' + e.message);
  }

  for (const [team, pts] of Object.entries(talentMap)) {
    talentRaw[team] = pts.reduce((a,b)=>a+b,0) / pts.length;
  }

  Logger.log('Talent source: CFBD/247');
}

// Important: only z-score talent using the same teams in the ratings model
const talentVals = teams
  .map(team => talentRaw[team])
  .filter(v => v !== undefined && !isNaN(v));

const talentMean = mean(talentVals);
const talentStd  = stdDev(talentVals) || 1;

const talentZ = {};
for (const team of teams) {
  if (talentRaw[team] !== undefined && !isNaN(talentRaw[team])) {
    talentZ[team] = (talentRaw[team] - talentMean) / talentStd;
  } else {
    talentZ[team] = 0; // neutral talent if team name is missing
  }
}
// Z-score all metrics across the league
// Overall
const zPpaOff = zScore(teams.map(t => adjOff[t]));
const zPpaDef = zScore(teams.map(t => adjDef[t])).map(z => -z);

const zSucOff = zScore(teams.map(t => rawRatings[t].suc_off));
const zSucDef = zScore(teams.map(t => rawRatings[t].suc_def)).map(z => -z);

const zPpdOff = zScore(teams.map(t => rawRatings[t].ppd_off));
const zPpdDef = zScore(teams.map(t => rawRatings[t].ppd_def)).map(z => -z);

// Run/pass splits
const zRushOff = zScore(teams.map(t => adjRushOff[t]));
const zRushDef = zScore(teams.map(t => adjRushDef[t])).map(z => -z);

const zPassOff = zScore(teams.map(t => adjPassOff[t]));
const zPassDef = zScore(teams.map(t => adjPassDef[t])).map(z => -z);

// League mean performance for mean-pull anchor
const rawPerfScores = teams.map((t, i) =>
  ((zPpaOff[i] + zSucOff[i] + zPpdOff[i]) / 3 +
   (zPpaDef[i] + zSucDef[i] + zPpdDef[i]) / 3) / 2 * 15
);

const leagueMeanPerf = mean(rawPerfScores);
const outputRows = [];
const exactQBRatings2026 =
  talentSourceMode === 'TalentOverride'
    ? getExactTopQBRatings2026(teams, ratingYear)
    : {};
let positionRatings2026 = {};

if (talentSourceMode === 'TalentOverride') {
  positionRatings2026 = computePositionGroupRatings2026(teams, ratingYear);
}

  for (let i = 0; i < teams.length; i++) {
    const team     = teams[i];
    const coach    = coachMap[team];
    const tierCfg  = coach ? coach.tierCfg  : TIER_CONFIG['Average'];
    const offTrust = coach ? coach.offTrust : 0.82;
    const defTrust = coach ? coach.defTrust : 0.82;

    // ── Overall off/def z-scores (3-metric blend) ─────────
    const rawOffZ = (zPpaOff[i] + zSucOff[i] + zPpdOff[i]) / 3;
    const rawDefZ = (zPpaDef[i] + zSucDef[i] + zPpdDef[i]) / 3;

    // Apply coaching tendency trust
    const adjOffZ = rawOffZ * offTrust;
    const adjDefZ = rawDefZ * defTrust;

    // Base performance score
    let perfScore = (adjOffZ + adjDefZ) / 2 * 15;

    // Trajectory bonus
    const traj = trajectoryBonus[team] || { off:0, def:0 };
    perfScore  += (traj.off - traj.def) * 5;

    // Mean-pull for Concerning/Unknown coaches
    if (tierCfg.meanPull > 0) {
      perfScore = perfScore * (1 - tierCfg.meanPull) + leagueMeanPerf * tierCfg.meanPull;
    }

    // Blend with talent
    const talent    = talentZ[team] || 0;
    const tw = tierCfg.talentWeight;

    const composite = (perfScore * (1 - tw)) + (talent * 10 * tw);

    // ── Run/pass split ratings ────────────────────────────
    // Each split uses just the one PPA metric (we don't have
    // success rate or PPD broken out by run/pass in RawStats).
    // We apply the same off/def trust and talent blend.

    // Rush offense: higher is better, apply offTrust
    const rawRushOffZ = zRushOff[i] * offTrust;
    // Rush defense: already flipped so higher = better D, apply defTrust
    const rawRushDefZ = zRushDef[i] * defTrust;
    // Pass offense
    const rawPassOffZ = zPassOff[i] * offTrust;
    // Pass defense
    const rawPassDefZ = zPassDef[i] * defTrust;

    // Scale to same range as off_rating/def_rating (×15)
    // then blend with talent at the same tier weight
    const rushOffPerf = rawRushOffZ * 15;
    const rushDefPerf = rawRushDefZ * 15;
    const passOffPerf = rawPassOffZ * 15;
    const passDefPerf = rawPassDefZ * 15;

    // Talent blend: same tw as overall composite
    let rushOffRating = (rushOffPerf * (1 - tw)) + (talent * 10 * tw);
    let rushDefRating = (rushDefPerf * (1 - tw)) + (talent * 10 * tw);
    let passOffRating = (passOffPerf * (1 - tw)) + (talent * 10 * tw);
    let passDefRating = (passDefPerf * (1 - tw)) + (talent * 10 * tw);


    if (talentSourceMode === 'TalentOverride') {
      const pos = positionRatings2026[team] || {};

      if (ratingYear !== 2026) {
        // Historical ratings should move when year-specific rosters move.
        // Use completed-season performance as the larger input, but anchor each
        // split to the position groups that actually drive that split.
        const configuredHistoricalTalent = parseFloat(config.HISTORICAL_POSITION_TALENT_WEIGHT);
        const talentSplit = !isNaN(configuredHistoricalTalent)
          ? Math.max(0, Math.min(0.60, configuredHistoricalTalent))
          : 0.30;
        const perfSplit = 1 - talentSplit;

        const rushOffTalent = ((pos.RB || 10) * 0.45) + ((pos.OL || 10) * 0.55);
        const passOffTalent = ((pos.QB || 10) * 0.40) + ((pos.WR || 10) * 0.25) +
                              ((pos.TE || 10) * 0.10) + ((pos.OL || 10) * 0.25);
        const rushDefTalent = ((pos.DL || 10) * 0.55) + ((pos.LB || 10) * 0.45);
        const passDefTalent = ((pos.DL || 10) * 0.30) + ((pos.CB || 10) * 0.40) +
                              ((pos.S  || 10) * 0.30);

        const rushOffInternal = ((rushOffTalent - 10) / 3 * 15 * talentSplit) +
                                (zRushOff[i] * offTrust * perfSplit * 15);
        const passOffInternal = ((passOffTalent - 10) / 3 * 15 * talentSplit) +
                                (zPassOff[i] * offTrust * perfSplit * 15);
        const rushDefInternal = ((rushDefTalent - 10) / 3 * 15 * talentSplit) +
                                (zRushDef[i] * defTrust * perfSplit * 15);
        const passDefInternal = ((passDefTalent - 10) / 3 * 15 * talentSplit) +
                                (zPassDef[i] * defTrust * perfSplit * 15);

        const SCALE = 3;
        const rawRushOffDisplay = 10 + rushOffInternal / SCALE;
        const rawPassOffDisplay = 10 + passOffInternal / SCALE;
        const rawRushDefDisplay = 10 + rushDefInternal / SCALE;
        const rawPassDefDisplay = 10 + passDefInternal / SCALE;
        const rawOffDisplay = (rawRushOffDisplay + rawPassOffDisplay) / 2;
        const rawDefDisplay = (rawRushDefDisplay + rawPassDefDisplay) / 2;
        const rawCompositeDisplay = (rawOffDisplay + rawDefDisplay) / 2;

        outputRows.push([
          team,
          rawOffDisplay,
          rawDefDisplay,
          rawCompositeDisplay,
          rawRatings[team] ? rawRatings[team].games : 0,
          rawRushOffDisplay,
          rawPassOffDisplay,
          rawRushDefDisplay,
          rawPassDefDisplay,
          exactQBRatings2026[team] !== undefined ? exactQBRatings2026[team] : round2(pos.QB || 10),
          round2(pos.RB || 10),
          round2(pos.WR || 10),
          round2(pos.TE || 10),
          round2(pos.OL || 10),
          round2(pos.DL || 10),
          round2(pos.LB || 10),
          round2(pos.CB || 10),
          round2(pos.S  || 10),
          round2(pos.K  || 10),
          round2(pos.P  || 10),
        ]);
        continue;
      }

      const hireYear   = coach ? coach.hireYear : 0;
      const coachYears = hireYear > 0 ? ratingYear - hireYear : 99;

      let talentSplit, perfSplit;
      // Split based only on coaching tenure — tier applies as a bonus below
      if (coachYears <= 0)       { talentSplit = 0.90; perfSplit = 0.10; }
      else if (coachYears === 1) { talentSplit = 0.75; perfSplit = 0.25; }
      else                       { talentSplit = 0.70; perfSplit = 0.30; }

      // Talent anchors built from position groups
      const offTalent =
        ((pos.QB || 10) * 0.35) + ((pos.WR || 10) * 0.20) +
        ((pos.OL || 10) * 0.25) + ((pos.RB || 10) * 0.10) +
        ((pos.TE || 10) * 0.10);
      const defTalent =
        ((pos.DL || 10) * 0.30) + ((pos.CB || 10) * 0.25) +
        ((pos.LB || 10) * 0.25) + ((pos.S  || 10) * 0.20);

      // Normalize to rating scale (position ratings avg ~10, std ~3)
      const talentOffRating = (offTalent - 10) / 3 * 15;
      const talentDefRating = (defTalent - 10) / 3 * 15;

      // Performance tendency — directional signal only, not raw rating
      const offTendency  = (zPpaOff[i] + zSucOff[i] + zPpdOff[i]) / 3;
      const defTendency  = (zPpaDef[i] + zSucDef[i] + zPpdDef[i]) / 3;
      const traj         = trajectoryBonus[team] || { off: 0, def: 0 };
      const trajSignal   = (traj.off - traj.def) * 3;

      const perfOffAdj   = offTendency * offTrust * perfSplit * 15;
      const perfDefAdj   = defTendency * defTrust * perfSplit * 15;
      const perfTrajAdj  = trajSignal  * perfSplit;

      let finalOffRating = (talentOffRating * talentSplit) + perfOffAdj + perfTrajAdj;
      let finalDefRating = (talentDefRating * talentSplit) + perfDefAdj + perfTrajAdj;

      // Mean-pull for Concerning/Unknown coaches
      if (tierCfg.meanPull > 0) {
        finalOffRating = finalOffRating * (1 - tierCfg.meanPull);
        finalDefRating = finalDefRating * (1 - tierCfg.meanPull);
      }

      // Coaching tier bonus — flat rating adjustment on top of formula
      // Elite coaches consistently outperform their roster talent
      // Concerning/Unknown coaches underperform or introduce uncertainty
      const tierBonus = {
        'Elite':      2,
        'Good':       1.0,
        'Average':    0.0,
        'Concerning': -1.5,
        'Unknown':    -0.5,
      };
      const bonus = tierBonus[coach ? coach.tier : 'Average'] || 0;
      finalOffRating += bonus * 0.55;
      finalDefRating += bonus * 0.45;
// Preseason override — bypasses formula entirely for exceptional cases
      // Set in Coaches sheet preseason_override column (e.g. Indiana = 18)
      // Leave blank for formula-driven rating
      if (coach && coach.preseasonOverride) {
        const overrideRating = coach.preseasonOverride;
        // Convert from display scale (10-avg) back to internal scale for consistency
        const overrideInternal = (overrideRating - 10) * 3;
        finalOffRating = overrideInternal * 0.55; // assume slight off lean
        finalDefRating = overrideInternal * 0.45;
      }
      // Run/pass splits using position-specific talent
      const rushOffTalent = ((pos.RB || 10) * 0.45) + ((pos.OL || 10) * 0.55);
      const passOffTalent = ((pos.QB || 10) * 0.40) + ((pos.WR || 10) * 0.25) +
                            ((pos.TE || 10) * 0.10) + ((pos.OL || 10) * 0.25);
      const rushDefTalent = ((pos.DL || 10) * 0.55) + ((pos.LB || 10) * 0.45);
      const passDefTalent = ((pos.DL || 10) * 0.30) + ((pos.CB || 10) * 0.40) +
                            ((pos.S  || 10) * 0.30);

      const rushOffRating2026 = ((rushOffTalent - 10) / 3 * 15 * talentSplit) + (zRushOff[i] * offTrust * perfSplit * 15);
      const passOffRating2026 = ((passOffTalent - 10) / 3 * 15 * talentSplit) + (zPassOff[i] * offTrust * perfSplit * 15);
      const rushDefRating2026 = ((rushDefTalent - 10) / 3 * 15 * talentSplit) + (zRushDef[i] * defTrust * perfSplit * 15);
      const passDefRating2026 = ((passDefTalent - 10) / 3 * 15 * talentSplit) + (zPassDef[i] * defTrust * perfSplit * 15);

      // Convert to 10-average display scale
      const SCALE = 3;
      const rawRushOffDisplay = 10 + rushOffRating2026 / SCALE;
      const rawPassOffDisplay = 10 + passOffRating2026 / SCALE;
      const rawRushDefDisplay = 10 + rushDefRating2026 / SCALE;
      const rawPassDefDisplay = 10 + passDefRating2026 / SCALE;
      const rawOffDisplay = (rawRushOffDisplay + rawPassOffDisplay) / 2;
      const rawDefDisplay = (rawRushDefDisplay + rawPassDefDisplay) / 2;
      const rawCompositeDisplay = (rawOffDisplay + rawDefDisplay) / 2;

      outputRows.push([
        team,
        rawOffDisplay,
        rawDefDisplay,
        rawCompositeDisplay,
        rawRatings[team] ? rawRatings[team].games : 0,
        rawRushOffDisplay,
        rawPassOffDisplay,
        rawRushDefDisplay,
        rawPassDefDisplay,
        exactQBRatings2026[team] !== undefined ? exactQBRatings2026[team] : round2(pos.QB || 10),
        round2(pos.RB || 10),
        round2(pos.WR || 10),
        round2(pos.TE || 10),
        round2(pos.OL || 10),
        round2(pos.DL || 10),
        round2(pos.LB || 10),
        round2(pos.CB || 10),
        round2(pos.S  || 10),
        round2(pos.K  || 10),
        round2(pos.P  || 10),
      ]);
    }
  }
  if (talentSourceMode === 'TalentOverride') {
  const maxCompositeRaw = Math.max(...outputRows.map(r => r[3]));

  for (let i = 0; i < outputRows.length; i++) {
    // Rush/pass ratings
    outputRows[i][5] = scaleRating2026(outputRows[i][5], maxCompositeRaw);
    outputRows[i][6] = scaleRating2026(outputRows[i][6], maxCompositeRaw);
    outputRows[i][7] = scaleRating2026(outputRows[i][7], maxCompositeRaw);
    outputRows[i][8] = scaleRating2026(outputRows[i][8], maxCompositeRaw);

    // Team ratings are rollups of the final split ratings.
    outputRows[i][1] = round2((outputRows[i][5] + outputRows[i][6]) / 2);
    outputRows[i][2] = round2((outputRows[i][7] + outputRows[i][8]) / 2);
    outputRows[i][3] = round2((outputRows[i][1] + outputRows[i][2]) / 2);

    // QB stays EXACT from On3RosterStaging. Do not scale column 10.

    // Other position groups still use grade scale
    for (let c = 10; c <= 19; c++) {
      outputRows[i][c] = scaleRating2026(outputRows[i][c], maxCompositeRaw);
    }
  }
}
  outputRows.sort((a, b) => b[3] - a[3]);

  // Write to Ratings sheet — clear old data first
  const outputWidth = talentSourceMode === 'TalentOverride' ? 20 : 9;
const oldRows = ratSheet.getLastRow() - 1;

if (oldRows > 0) {
ratSheet.getRange(2, 1, oldRows, outputWidth).clearContent();
ratSheet.getRange(2, 1, oldRows, outputWidth).clearFormat();
}

if (outputRows.length === 0) {
  SpreadsheetApp.getUi().alert(
    'No ratings were created.\n\n' +
    'This usually means RawStats has no usable rows, or team names did not match.'
  );
  Logger.log('No outputRows created.');
  return;
}

ratSheet.getRange(2, 1, outputRows.length, outputWidth).setValues(outputRows);

  // ── Color coding ──────────────────────────────────────────
  const colorCols =
  talentSourceMode === 'TalentOverride'
    ? [2,3,4,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]
    : [2,3,4,6,7,8,9];

  for (const c of colorCols) {
    const ranked = outputRows
      .map((row, idx) => ({ idx, val: parseFloat(row[c - 1]) }))
      .filter(item => !isNaN(item.val))
      .sort((a, b) => b.val - a.val);

    const colors = outputRows.map(() => ['#f4cccc']);

    for (let rankIdx = 0; rankIdx < ranked.length; rankIdx++) {
      const rank = rankIdx + 1;
      let color;

      if      (rank <= 10) color = '#b4c6e7';
      else if (rank <= 25) color = '#c6efce';
      else if (rank <= 50) color = '#fff2cc';
      else                 color = '#f4cccc';

      colors[ranked[rankIdx].idx] = [color];
    }

    ratSheet.getRange(2, c, outputRows.length, 1).setBackgrounds(colors);
  }

  Logger.log(`Ratings calculated for ${outputRows.length} teams.`);
  Logger.log(
    `Done! Ratings calculated for ${outputRows.length} teams.\n\n` +
    `Your Ratings sheet now has 9 columns:\n` +
    `  B: off_rating\n` +
    `  C: def_rating\n` +
    `  D: composite (overall)\n` +
    `  E: games\n` +
    `  F: rush_off_rating\n` +
    `  G: pass_off_rating\n` +
    `  H: rush_def_rating\n` +
    `  I: pass_def_rating`
  )
}


// ── UTILITIES ────────────────────────────────────────────────
function getConfig() {
  const cfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
  if (!cfg) throw new Error('Config sheet not found. Run setupSheets() first.');
  const obj = {};
  for (const [key, val] of cfg.getDataRange().getValues().slice(1)) {
    if (key) obj[key.trim()] = val;
  }
  return obj;
}

function fetchWithAuth(url, apiKey) {
  try {
    const r = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      muteHttpExceptions: true
    });
    if (r.getResponseCode() === 200) return r.getContentText();
    Logger.log(
      'Fetch non-200 ' + r.getResponseCode() + ' for ' + url +
      ' | ' + r.getContentText().substring(0, 250)
    );
    return null;
  } catch(e) { Logger.log('Fetch error: ' + e.message); return null; }
}

function mean(arr) {
  const v = arr.filter(x => x !== null && x !== undefined && !isNaN(x));
  return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0;
}

function stdDev(arr) {
  const m = mean(arr);
  const v = arr.filter(x => x !== null && x !== undefined && !isNaN(x));
  return v.length < 2 ? 1 : Math.sqrt(v.reduce((s,x)=>s+Math.pow(x-m,2),0)/v.length);
}

function zScore(arr) {
  const m = mean(arr), s = stdDev(arr) || 1;
  return arr.map(v => (v - m) / s);
}
function getExactTopQBRatings2026(teams, ratingYear) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = getOn3StagingSheetName(ratingYear);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(sheetName + ' sheet not found.');

  const data = sheet.getDataRange().getValues();
  const qbMap = {};

  for (let i = 1; i < data.length; i++) {
    const team = data[i][0];
    const pos = String(data[i][2] || '').toUpperCase().trim();
    const rating = parseFloat(data[i][3]);

    if (!team || pos !== 'QB' || isNaN(rating)) continue;

    if (qbMap[team] === undefined || rating > qbMap[team]) {
      qbMap[team] = rating;
    }
  }

  return qbMap;
}

function scaleRating2026(v, maxCompositeRaw) {
  const slope = maxCompositeRaw !== 10
    ? 20 / (maxCompositeRaw - 10)
    : 2.5;

  return round2(75 + ((v - 10) * slope));
}
function round2(v) { return Math.round(v * 100) / 100; }


// ── DEBUG ────────────────────────────────────────────────────
function debugAPI() {
  const config = getConfig();
  Logger.log('API Key: ' + config.API_KEY.substring(0, 8) + '...');
  Logger.log('SEASONS: ' + config.SEASONS);

  const teamsUrl = 'https://api.collegefootballdata.com/teams/fbs?year=2025';
  const teamsResp = fetchWithAuth(teamsUrl, config.API_KEY);
  Logger.log('Teams response null? ' + (teamsResp === null));
  if (teamsResp) Logger.log('Teams first 200 chars: ' + teamsResp.substring(0, 200));

  const statsUrl = 'https://api.collegefootballdata.com/stats/game/advanced?year=2025';
  const statsResp = fetchWithAuth(statsUrl, config.API_KEY);
  Logger.log('Stats response null? ' + (statsResp === null));
  if (statsResp) Logger.log('Stats first 200 chars: ' + statsResp.substring(0, 200));

  const gamesUrl = 'https://api.collegefootballdata.com/games?year=2025&seasonType=regular';
  const gamesResp = fetchWithAuth(gamesUrl, config.API_KEY);
  Logger.log('Games response null? ' + (gamesResp === null));
  if (gamesResp) Logger.log('Games first 200 chars: ' + gamesResp.substring(0, 200));
}

function debugRunPassRateSource2025() {
  const config = getConfig();
  const url = 'https://api.collegefootballdata.com/games/teams?year=2025&seasonType=regular';
  const resp = fetchWithAuth(url, config.API_KEY);
  Logger.log('games/teams response null? ' + (resp === null));
  if (!resp) return;

  const rows = JSON.parse(resp);
  Logger.log('games/teams rows: ' + rows.length);
  if (!rows.length) return;

  const sample = rows[0];
  Logger.log('Sample row: ' + JSON.stringify(sample).substring(0, 2000));
  const stats = sample.stats || (sample.teams && sample.teams[0] && sample.teams[0].stats) || [];
  if (Array.isArray(stats)) {
    Logger.log('Sample stat categories: ' + stats.map(function(s) {
      return s.category || s.name || s.statName;
    }).join(', '));
  } else {
    Logger.log('Sample stat keys: ' + Object.keys(stats).join(', '));
  }
}

function setupCoachesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Coaches');

  const existing = {};
  if (sheet) {
    const existingData = sheet.getDataRange().getValues().slice(1);
    for (const row of existingData) {
      const team = row[0];
      if (!team) continue;
      existing[team] = {
        coachName: row[1] || '',
        tier:      row[2] || 'Average',
        hireYear:  row[3] || '',
        offT:      row[4] || 3,
        defT:      row[5] || 3,
        override:  row[6] || '',
        notes:     row[7] || '',
      };
    }
    sheet.clear();
  } else {
    sheet = ss.insertSheet('Coaches');
  }

  const headers = ['team','coach_name','tier','hire_year','off_tendency','def_tendency','preseason_override','notes'];
  sheet.getRange(1, 1, 1, 8).setValues([headers]).setFontWeight('bold');
  sheet.setColumnWidths(1, 7, 150);
  sheet.setColumnWidth(7, 160);
  sheet.setColumnWidth(8, 260);

  const config = getConfig();
  const teamsUrl = 'https://api.collegefootballdata.com/teams/fbs?year=2025';
  const resp = fetchWithAuth(teamsUrl, config.API_KEY);
  if (!resp) { Logger.log('Could not fetch FBS teams.'); return; }

  const teams = JSON.parse(resp).map(t => t.school).sort();
  const rows = teams.map(t => {
    const e = existing[t] || {};
    return [t, e.coachName||'', e.tier||'Average', e.hireYear||'', e.offT||3, e.defT||3, e.override||'', e.notes||''];
  });
  sheet.getRange(2, 1, rows.length, 8).setValues(rows);

  const tierRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Elite','Good','Average','Concerning','Unknown'], true).build();
  sheet.getRange(2, 3, 200, 1).setDataValidation(tierRule);

  const tendencyRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['1','2','3','4','5'], true).build();
  sheet.getRange(2, 5, 200, 2).setDataValidation(tendencyRule);

  Logger.log('Coaches sheet rebuilt — existing data preserved.');
}
