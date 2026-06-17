// ============================================================
// ON3 ROSTER TALENT SCRAPER — Full Roster Composite Builder
// ============================================================
// HOW TO INSTALL:
//   1. Extensions > Apps Script in your Google Sheet
//   2. Replace the entire contents of On3TalentOverride.gs with this file
//   3. Save (Ctrl+S), reload your spreadsheet
//   4. Run addOn3Menu() ONCE from the Apps Script editor
//   5. Use "On3 Talent" > "Open Roster Scraper" to open the sidebar
//   6. Paste any team's On3 2022-2026 roster URL and click "Fetch & Add Team"
//   7. Repeat for all 138 teams
//   8. When done, click "Finalize → Write TalentOverride"
//   9. Run calculateRatings() as normal
//
// URL FORMAT:
//   https://www.on3.com/college/[team-slug]/football/[year]/roster/
//   Example: https://www.on3.com/college/texas-am-aggies/football/2026/roster/
//
// HOW IT WORKS:
//   - Fetches the On3 roster page for any team via UrlFetchApp
//   - Parses every player's name and best available On3 rating from the HTML
//   - Stores all players in a staging sheet (On3RosterStaging)
//   - When finalized, computes each team's talent composite:
//       takes all rated players, sorts by rating descending,
//       caps at 85 players, computes a weighted sum using
//       247-style composite formula, converts to 600-1050 scale
//   - Writes results to TalentOverride sheet for use by calculateRatings()
//
// RATING PRIORITY:
//   1. Official college rating
//   2. Transfer portal rating, scaled down to a max of 90
//   3. High school/recruiting rating, scaled down to a max of 90
//      with smaller downgrades for older players
//   Players with no rating are assigned a floor score of 75.0
//   (maps to ~580 on the talent scale — below all rated players)
// ============================================================


// ── MENU ─────────────────────────────────────────────────────
function addOn3Menu() {
  SpreadsheetApp.getUi()
    .createMenu('On3 Talent')
    .addItem('Open Roster Scraper',                   'showRosterScraper')
    .addItem('Finalize → Write TalentOverride',        'finalizeRosterData')
    .addItem('Finalize 2022 → Write TalentOverride2022', 'finalizeRosterData2022')
    .addItem('Finalize 2023 → Write TalentOverride2023', 'finalizeRosterData2023')
    .addItem('Finalize 2024 → Write TalentOverride2024', 'finalizeRosterData2024')
    .addItem('Finalize 2025 → Write TalentOverride2025', 'finalizeRosterData2025')
    .addItem('Clear Staging Sheet',                    'clearStagingSheet')
    .addItem('Clear 2022 Staging Sheet',               'clearStagingSheet2022')
    .addItem('Clear 2023 Staging Sheet',               'clearStagingSheet2023')
    .addItem('Clear 2024 Staging Sheet',               'clearStagingSheet2024')
    .addItem('Clear 2025 Staging Sheet',               'clearStagingSheet2025')
    .addItem('View Staging Summary',                   'showStagingSummary')
    .addItem('View 2022 Staging Summary',              'showStagingSummary2022')
    .addItem('View 2023 Staging Summary',              'showStagingSummary2023')
    .addItem('View 2024 Staging Summary',              'showStagingSummary2024')
    .addItem('View 2025 Staging Summary',              'showStagingSummary2025')
    .addItem('Fetch All Requested 2026 Rosters', 'fetchAllRequestedOn3Rosters2026')
    .addItem('Fetch All Requested 2022 Rosters', 'fetchAllRequestedOn3Rosters2022')
    .addItem('Fetch All Requested 2023 Rosters', 'fetchAllRequestedOn3Rosters2023')
    .addItem('Fetch All Requested 2024 Rosters', 'fetchAllRequestedOn3Rosters2024')
    .addItem('Fetch All Requested 2025 Rosters', 'fetchAllRequestedOn3Rosters2025')
    .addToUi();
}

function getRequestedOn3RosterUrls(year) {
  var y = String(year || 2026);
  var urls = [
    // ACC
    'https://www.on3.com/college/boston-college-eagles/football/2026/roster/',
    'https://www.on3.com/college/california-golden-bears/football/2026/roster/',
    'https://www.on3.com/college/clemson-tigers/football/2026/roster/',
    'https://www.on3.com/college/duke-blue-devils/football/2026/roster/',
    'https://www.on3.com/college/florida-state-seminoles/football/2026/roster/',
    'https://www.on3.com/college/georgia-tech-yellow-jackets/football/2026/roster/',
    'https://www.on3.com/college/louisville-cardinals/football/2026/roster/',
    'https://www.on3.com/college/miami-hurricanes/football/2026/roster/',
    'https://www.on3.com/college/nc-state-wolfpack/football/2026/roster/',
    'https://www.on3.com/college/north-carolina-tar-heels/football/2026/roster/',
    'https://www.on3.com/college/pittsburgh-panthers/football/2026/roster/',
    'https://www.on3.com/college/smu-mustangs/football/2026/roster/',
    'https://www.on3.com/college/stanford-cardinal/football/2026/roster/',
    'https://www.on3.com/college/syracuse-orange/football/2026/roster/',
    'https://www.on3.com/college/virginia-cavaliers/football/2026/roster/',
    'https://www.on3.com/college/virginia-tech-hokies/football/2026/roster/',
    'https://www.on3.com/college/wake-forest-demon-deacons/football/2026/roster/',

    // Big Ten
    'https://www.on3.com/college/illinois-fighting-illini/football/2026/roster/',
    'https://www.on3.com/college/indiana-hoosiers/football/2026/roster/',
    'https://www.on3.com/college/iowa-hawkeyes/football/2026/roster/',
    'https://www.on3.com/college/maryland-terrapins/football/2026/roster/',
    'https://www.on3.com/college/michigan-wolverines/football/2026/roster/',
    'https://www.on3.com/college/michigan-state-spartans/football/2026/roster/',
    'https://www.on3.com/college/minnesota-golden-gophers/football/2026/roster/',
    'https://www.on3.com/college/nebraska-cornhuskers/football/2026/roster/',
    'https://www.on3.com/college/northwestern-wildcats/football/2026/roster/',
    'https://www.on3.com/college/ohio-state-buckeyes/football/2026/roster/',
    'https://www.on3.com/college/oregon-ducks/football/2026/roster/',
    'https://www.on3.com/college/penn-state-nittany-lions/football/2026/roster/',
    'https://www.on3.com/college/purdue-boilermakers/football/2026/roster/',
    'https://www.on3.com/college/rutgers-scarlet-knights/football/2026/roster/',
    'https://www.on3.com/college/ucla-bruins/football/2026/roster/',
    'https://www.on3.com/college/usc-trojans/football/2026/roster/',
    'https://www.on3.com/college/washington-huskies/football/2026/roster/',
    'https://www.on3.com/college/wisconsin-badgers/football/2026/roster/',

    // Big 12
    'https://www.on3.com/college/arizona-wildcats/football/2026/roster/',
    'https://www.on3.com/college/arizona-state-sun-devils/football/2026/roster/',
    'https://www.on3.com/college/baylor-bears/football/2026/roster/',
    'https://www.on3.com/college/byu-cougars/football/2026/roster/',
    'https://www.on3.com/college/cincinnati-bearcats/football/2026/roster/',
    'https://www.on3.com/college/colorado-buffaloes/football/2026/roster/',
    'https://www.on3.com/college/houston-cougars/football/2026/roster/',
    'https://www.on3.com/college/iowa-state-cyclones/football/2026/roster/',
    'https://www.on3.com/college/kansas-jayhawks/football/2026/roster/',
    'https://www.on3.com/college/kansas-state-wildcats/football/2026/roster/',
    'https://www.on3.com/college/oklahoma-state-cowboys/football/2026/roster/',
    'https://www.on3.com/college/tcu-horned-frogs/football/2026/roster/',
    'https://www.on3.com/college/texas-tech-red-raiders/football/2026/roster/',
    'https://www.on3.com/college/ucf-knights/football/2026/roster/',
    'https://www.on3.com/college/utah-utes/football/2026/roster/',
    'https://www.on3.com/college/west-virginia-mountaineers/football/2026/roster/',

    // SEC
    'https://www.on3.com/college/alabama-crimson-tide/football/2026/roster/',
    'https://www.on3.com/college/arkansas-razorbacks/football/2026/roster/',
    'https://www.on3.com/college/auburn-tigers/football/2026/roster/',
    'https://www.on3.com/college/florida-gators/football/2026/roster/',
    'https://www.on3.com/college/georgia-bulldogs/football/2026/roster/',
    'https://www.on3.com/college/kentucky-wildcats/football/2026/roster/',
    'https://www.on3.com/college/lsu-tigers/football/2026/roster/',
    'https://www.on3.com/college/mississippi-state-bulldogs/football/2026/roster/',
    'https://www.on3.com/college/missouri-tigers/football/2026/roster/',
    'https://www.on3.com/college/oklahoma-sooners/football/2026/roster/',
    'https://www.on3.com/college/ole-miss-rebels/football/2026/roster/',
    'https://www.on3.com/college/south-carolina-gamecocks/football/2026/roster/',
    'https://www.on3.com/college/tennessee-volunteers/football/2026/roster/',
    'https://www.on3.com/college/texas-longhorns/football/2026/roster/',
    'https://www.on3.com/college/texas-am-aggies/football/2026/roster/',
    'https://www.on3.com/college/vanderbilt-commodores/football/2026/roster/',

    // Extra requested G5 teams
    'https://www.on3.com/college/troy-trojans/football/2026/roster/',
    'https://www.on3.com/college/south-florida-bulls/football/2026/roster/',
    'https://www.on3.com/college/fresno-state-bulldogs/football/2026/roster/',
    'https://www.on3.com/college/boise-state-broncos/football/2026/roster/',
    'https://www.on3.com/college/colorado-state-rams/football/2026/roster/',
    'https://www.on3.com/college/notre-dame-fighting-irish/football/2026/roster/'
  ];

  return urls.map(function(url) {
    return url.replace(/\/20\d\d\/roster\//, '/' + y + '/roster/');
  });
}

function fetchAllRequestedOn3Rosters2026() {
  fetchAllRequestedOn3RostersForYear(2026);
}

function fetchAllRequestedOn3Rosters2022() {
  fetchAllRequestedOn3RostersForYear(2022);
}

function fetchAllRequestedOn3Rosters2023() {
  fetchAllRequestedOn3RostersForYear(2023);
}

function fetchAllRequestedOn3Rosters2024() {
  fetchAllRequestedOn3RostersForYear(2024);
}

function fetchAllRequestedOn3Rosters2025() {
  fetchAllRequestedOn3RostersForYear(2025);
}

function fetchAllRequestedOn3RostersForYear(year) {
  var urls = getRequestedOn3RosterUrls(year);

  var results = [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var staging = ss.getSheetByName(getStagingSheetName(year));
  var stagedTeams = staging ? getStagedTeamMap(staging) : {};
  var skipped = 0;

  for (var i = 0; i < urls.length; i++) {
    var slugMatch = urls[i].match(/\/college\/([^\/]+)\/football/);
    var teamName = slugMatch ? slugToTeamName(slugMatch[1]) : '';

    if (teamName && stagedTeams[teamName]) {
      skipped++;
      Logger.log((i + 1) + '/' + urls.length + ': skipped ' + teamName + ' (already staged)');
      continue;
    }

    var result = fetchAndStageRoster(urls[i], year);
    results.push(result);
    Logger.log((i + 1) + '/' + urls.length + ': ' + result);
    Utilities.sleep(1200);
  }

  SpreadsheetApp.getUi().alert(
    'Finished scraping requested ' + year + ' teams.\n\n' +
    'Skipped already-staged teams: ' + skipped + '\n' +
    'Fetched this run: ' + results.length + '\n\nLast results:\n' +
    (results.length ? results.slice(-10).join('\n') : 'No missing teams found.')
  );
}


// ── SIDEBAR HTML ──────────────────────────────────────────────
function showRosterScraper() {
  var html = HtmlService.createHtmlOutput(getRosterScraperHtml())
    .setTitle('On3 Roster Scraper')
    .setWidth(320);
  SpreadsheetApp.getUi().showSidebar(html);
}

function getRosterScraperHtml() {
  return '<!DOCTYPE html><html><head>' +
    '<style>' +
    'body{font-family:Arial,sans-serif;font-size:13px;padding:10px;background:#f8f9fa;}' +
    'h3{margin:0 0 10px;color:#1a73e8;font-size:15px;}' +
    'label{display:block;font-weight:bold;margin-bottom:4px;color:#333;}' +
    'input[type=text]{width:100%;box-sizing:border-box;padding:7px;border:1px solid #ccc;border-radius:4px;font-size:12px;margin-bottom:10px;}' +
    'button{width:100%;padding:9px;border:none;border-radius:4px;font-size:13px;font-weight:bold;cursor:pointer;margin-bottom:8px;}' +
    '.btn-primary{background:#1a73e8;color:#fff;}' +
    '.btn-primary:hover{background:#1557b0;}' +
    '.btn-secondary{background:#34a853;color:#fff;}' +
    '.btn-secondary:hover{background:#2d7d46;}' +
    '.btn-danger{background:#ea4335;color:#fff;}' +
    '.btn-danger:hover{background:#c5221f;}' +
    '#status{margin-top:8px;padding:8px;border-radius:4px;font-size:12px;min-height:20px;background:#e8f0fe;color:#1a73e8;word-break:break-word;}' +
    '#status.error{background:#fce8e6;color:#c5221f;}' +
    '#status.success{background:#e6f4ea;color:#137333;}' +
    '#status.loading{background:#fff8e1;color:#e37400;}' +
    '.divider{border:none;border-top:1px solid #ddd;margin:10px 0;}' +
    '.small{font-size:11px;color:#666;margin-bottom:8px;}' +
    '</style></head><body>' +
    '<h3>On3 Roster Scraper</h3>' +
    '<label>On3 2022-2026 Roster URL:</label>' +
    '<input type="text" id="rosterUrl" placeholder="https://www.on3.com/college/texas-am-aggies/football/2025/roster/" />' +
    '<button class="btn-primary" onclick="fetchTeam()">Fetch & Add Team</button>' +
    '<hr class="divider">' +
    '<p class="small">After entering all teams:</p>' +
    '<button class="btn-secondary" onclick="finalize()">Finalize → Write TalentOverride</button>' +
    '<button class="btn-danger" onclick="clearStaging()">Clear Staging Sheet</button>' +
    '<div id="status">Ready. Paste a URL above and click Fetch.</div>' +
    '<script>' +
    'function fetchTeam(){' +
    '  var url=document.getElementById("rosterUrl").value.trim();' +
    '  if(!url){setStatus("Please enter a URL.","error");return;}' +
    '  if(url.indexOf("on3.com")<0){setStatus("URL must be from on3.com","error");return;}' +
    '  setStatus("Fetching roster...","loading");' +
    '  google.script.run' +
    '    .withSuccessHandler(function(r){setStatus(r,r.indexOf("ERROR")>=0?"error":"success");document.getElementById("rosterUrl").value="";})' +
    '    .withFailureHandler(function(e){setStatus("ERROR: "+e.message,"error");})' +
    '    .fetchAndStageRoster(url);' +
    '}' +
    'function finalize(){' +
    '  setStatus("Finalizing and writing TalentOverride...","loading");' +
    '  google.script.run' +
    '    .withSuccessHandler(function(r){setStatus(r,r.indexOf("ERROR")>=0?"error":"success");})' +
    '    .withFailureHandler(function(e){setStatus("ERROR: "+e.message,"error");})' +
    '    .finalizeRosterData();' +
    '}' +
    'function clearStaging(){' +
    '  if(!confirm("Clear all staged roster data?"))return;' +
    '  setStatus("Clearing...","loading");' +
    '  google.script.run' +
    '    .withSuccessHandler(function(r){setStatus(r,"success");})' +
    '    .withFailureHandler(function(e){setStatus("ERROR: "+e.message,"error");})' +
    '    .clearStagingSheet();' +
    '}' +
    'function setStatus(msg,type){' +
    '  var el=document.getElementById("status");' +
    '  el.textContent=msg;el.className=type||"";' +
    '}' +
    '</script></body></html>';
}


// ── FETCH AND STAGE ONE TEAM'S ROSTER ────────────────────────
function fetchAndStageRoster(url, year) {
  // Normalize URL
  url = url.trim().replace(/\/?$/, '/');
  var targetYear = String(year || getRosterYearFromUrl(url) || 2026);
  if (url.indexOf('/' + targetYear + '/roster') < 0) {
    // Try to force the requested roster year if the wrong year was given
    url = url.replace(/\/20\d\d\/roster/, '/' + targetYear + '/roster');
  }

  // Extract team slug from URL
  var slugMatch = url.match(/\/college\/([^\/]+)\/football/);
  if (!slugMatch) return 'ERROR: Could not parse team name from URL.';
  var teamSlug = slugMatch[1];
  var teamName = slugToTeamName(teamSlug);

  // Fetch the page
  var html;
  try {
  var response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (response.getResponseCode() !== 200) {
    return 'ERROR: HTTP ' + response.getResponseCode() + ' fetching ' + url;
  }

  html = response.getContentText();

  

} catch(e) {
  return 'ERROR fetching page: ' + e.message;
}

  // Parse players from HTML
  // On3 roster pages contain player names and ratings in a repeating pattern.
  // Each player block contains their name (in an anchor tag to /rivals/...) 
  // and their On3 score as a standalone number before "Natl"
  var players = parseRosterHtml(html, teamName, targetYear);

  if (players.length === 0) {
    return 'ERROR: No players found. On3 may have changed their page format, or the URL is incorrect. Check: ' + url;
  }

  // Write to staging sheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var staging = getOrCreateStagingSheet(ss, targetYear);

  // Check if this team already staged — remove old entries
  var existingData = staging.getDataRange().getValues();
  var rowsToDelete = [];
  for (var i = existingData.length - 1; i >= 1; i--) {
    if (existingData[i][0] === teamName) rowsToDelete.push(i + 1);
  }
  for (var d = 0; d < rowsToDelete.length; d++) {
    staging.deleteRow(rowsToDelete[d]);
  }

  // Append new rows
  var rows = players.map(function(p) {
    return [
      teamName,
      p.name,
      p.position || '',
      p.rating,
      p.rated ? 'rated' : 'unrated',
      p.source || '',
      p.rawRating || ''
    ];
  });
  var lastRow = staging.getLastRow();
  staging.getRange(lastRow + 1, 1, rows.length, 7).setValues(rows);

  var ratedCount = players.filter(function(p){ return p.rated; }).length;
  return '✓ ' + teamName + ': ' + players.length + ' players added (' + ratedCount + ' with On3 ratings).';
}


// ── PARSE ROSTER HTML ─────────────────────────────────────────
function parseRosterHtml(html, teamName, rosterYear) {
  var players = [];
  var seen = {};
  rosterYear = parseInt(rosterYear, 10) || 2026;

  // Find the big On3 JSON data block
  var jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

  if (!jsonMatch) {
    Logger.log("No __NEXT_DATA__ block found.");
    return players;
  }

  var data;
  try {
    data = JSON.parse(jsonMatch[1]);
  } catch (e) {
    Logger.log("Could not parse JSON: " + e.message);
    return players;
  }

  function looksLikePlayerName(name) {
    if (!name) return false;

    name = String(name).trim();

    if (name.length < 2 || name.length > 60) return false;
    if (!/^[A-Z]/.test(name)) return false;

    // Must look like a person, not a school/team/button
    if (name.indexOf(" ") === -1 && name.indexOf("-") === -1) return false;

    if (/Texas A|Aggies|Football|College|Claim|Roster|Recruiting|Conference|Image|Logo/i.test(name)) return false;
    if (/class year|high school|hometown|position|height|weight/i.test(name)) return false;

    return true;
  }

  function findDirectPlayerName(obj) {
    if (!obj || typeof obj !== "object") return null;

    var directName =
      obj.fullName ||
      obj.displayName ||
      obj.playerName ||
      obj.name ||
      null;

    if (looksLikePlayerName(directName)) {
      return String(directName).trim();
    }

    if (obj.firstName && obj.lastName) {
      var combined = String(obj.firstName).trim() + " " + String(obj.lastName).trim();
      if (looksLikePlayerName(combined)) return combined;
    }

    return null;
  }

  function normalizeRatingValue(value) {
    if (value === null || value === undefined || value === "") return null;
    var rating = parseFloat(value);
    if (isNaN(rating)) return null;

    // Some feeds store ratings as .9800 instead of 98.00.
    if (rating > 0.7 && rating <= 1.0) rating = rating * 100;

    if (rating < 70 || rating > 100) return null;
    return rating;
  }

  function getClassDowngradeMultiplier(row) {
    var player = row && row.player ? row.player : {};
    var rank = String(player.classRank || "").toLowerCase();
    var classYear = parseInt(player.classYear, 10);

    if (/red\s*shirt\s*senior|rs-?sr|r-?sr/.test(rank)) return 0.35;
    if (/senior|sr\b/.test(rank)) return 0.45;
    if (/red\s*shirt\s*junior|rs-?jr|r-?jr/.test(rank)) return 0.55;
    if (/junior|jr\b/.test(rank)) return 0.65;
    if (/red\s*shirt\s*sophomore|rs-?so|r-?so/.test(rank)) return 0.75;
    if (/sophomore|so\b/.test(rank)) return 0.85;
    if (/freshman|fr\b/.test(rank)) return 1.00;

    // Fallback for On3 rows that only expose classYear.
    // Uses the roster year, so 2025 and 2026 sheets age players correctly.
    if (!isNaN(classYear)) {
      if (classYear <= rosterYear - 4) return 0.35;
      if (classYear === rosterYear - 3) return 0.45;
      if (classYear === rosterYear - 2) return 0.65;
      if (classYear === rosterYear - 1) return 0.85;
    }

    return 1.00;
  }

  function scaleNonCollegeRating(rawRating, row) {
    // Non-college ratings should not be equal to proven college ratings.
    // This keeps a 99 HS/portal rating at 90. Older players keep back more
    // of their original rating because they have more college development.
    var MIN_RAW = 70.0;
    var MAX_RAW = 99.0;
    var FLOOR = 75.0;
    var CEILING = 90.0;
    var clamped = Math.min(Math.max(rawRating, MIN_RAW), MAX_RAW);
    var pct = (clamped - MIN_RAW) / (MAX_RAW - MIN_RAW);
    var curved = Math.pow(pct, 1.35);
    var freshmanScaled = FLOOR + curved * (CEILING - FLOOR);
    var cappedRaw = Math.min(clamped, CEILING);
    var downgrade = cappedRaw - freshmanScaled;
    var multiplier = getClassDowngradeMultiplier(row);

    return Math.min(cappedRaw - (downgrade * multiplier), CEILING);
  }

  function finishRating(rawRating, source, row) {
    rawRating = normalizeRatingValue(rawRating);
    if (rawRating === null) return null;

    var finalRating = source === "college" ? rawRating : scaleNonCollegeRating(rawRating, row);
    return {
      rawRating: Math.round(rawRating * 100) / 100,
      rating: Math.round(finalRating * 100) / 100,
      source: source
    };
  }

  function findIndustryRating(row, rankingType) {
    if (!row || !Array.isArray(row.industryComparison)) return null;

    for (var i = 0; i < row.industryComparison.length; i++) {
      var item = row.industryComparison[i];
      if (!item) continue;
      if (String(item.type || "").toLowerCase() !== "industry") continue;
      if (rankingType && String(item.rankingType || "").toLowerCase() !== String(rankingType).toLowerCase()) continue;

      var rating = normalizeRatingValue(item.rating);
      if (rating !== null) return rating;
    }

    return null;
  }

  function findBestRating(row) {
    if (!row || typeof row !== "object") return null;

    // 1. Official On3 college/roster rating.
    if (row.rosterRating && row.rosterRating.rating !== null && row.rosterRating.rating !== undefined) {
      return finishRating(row.rosterRating.rating, "college", row);
    }

    // 2. Transfer Portal Industry rating.
    var transferRating = findIndustryRating(row, "TransferPortal");
    if (transferRating !== null) {
      return finishRating(transferRating, "transfer", row);
    }

    // 3. High school Rivals Industry rating.
    var highSchoolRating = findIndustryRating(row, "Player");
    if (highSchoolRating !== null) {
      return finishRating(highSchoolRating, "high_school", row);
    }

    return null;
  }

function findPosition(obj) {
  if (!obj || typeof obj !== "object") return "";

  // 1. Prefer the REAL roster position shown beside the player name
  var rosterKeys = [
    "rosterPosition",
    "playerPosition",
    "listedPosition",
    "primaryPosition",
    "position"
  ];

  for (var i = 0; i < rosterKeys.length; i++) {
    var val = obj[rosterKeys[i]];

    if (typeof val === "string" && val.trim()) {
      return val.trim().toUpperCase();
    }

    if (val && typeof val === "object") {
      if (val.abbreviation) return String(val.abbreviation).trim().toUpperCase();
      if (val.abbr) return String(val.abbr).trim().toUpperCase();
      if (val.name) return String(val.name).trim().toUpperCase();
    }
  }

  // 2. Only use recruiting position as LAST resort
  if (obj.positionAbbr) {
    return String(obj.positionAbbr).trim().toUpperCase();
  }

  if (obj.rating && typeof obj.rating === "object" && obj.rating.positionAbbr) {
    return String(obj.rating.positionAbbr).trim().toUpperCase();
  }

  return "";
}

  var rosterRows =
    data &&
    data.props &&
    data.props.pageProps &&
    data.props.pageProps.rosterList &&
    Array.isArray(data.props.pageProps.rosterList.list)
      ? data.props.pageProps.rosterList.list
      : [];

  for (var r = 0; r < rosterRows.length; r++) {
    var row = rosterRows[r];
    if (!row || !row.player) continue;

    var name = findDirectPlayerName(row.player);
    var position = findPosition(row.player);
    var bestRating = findBestRating(row);

    if (!name || !position) continue;
    if (seen[name]) continue;
    seen[name] = true;

    if (!bestRating) {
      bestRating = {
        rawRating: '',
        rating: 75.0,
        source: 'unrated'
      };
    }

    players.push({
      name: name,
      position: position,
      rating: bestRating.rating,
      rawRating: bestRating.rawRating,
      source: bestRating.source,
      rated: bestRating.source !== 'unrated'
    });
  }

  Logger.log("JSON parser found " + players.length + " players.");
  if (players.length > 0) {
    Logger.log("First player found: " + players[0].name + " " + players[0].rating + " from " + players[0].source);
  }

  return players;
}


// ── FINALIZE: COMPUTE COMPOSITES AND WRITE TALENTOVERRIDE ─────
function finalizeRosterData() {
  return finalizeRosterDataForYear(2026);
}

function finalizeRosterData2022() {
  return finalizeRosterDataForYear(2022);
}

function finalizeRosterData2023() {
  return finalizeRosterDataForYear(2023);
}

function finalizeRosterData2024() {
  return finalizeRosterDataForYear(2024);
}

function finalizeRosterData2025() {
  return finalizeRosterDataForYear(2025);
}

function finalizeRosterDataForYear(year) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stagingName = getStagingSheetName(year);
  var overrideName = getTalentOverrideSheetName(year);
  var staging = ss.getSheetByName(stagingName);
  if (!staging || staging.getLastRow() < 2) {
    return 'ERROR: No ' + year + ' staged roster data found. Fetch some teams first.';
  }

  var data = staging.getDataRange().getValues();
  // Skip header row
  var teamPlayers = {};
  for (var i = 1; i < data.length; i++) {
    var team   = data[i][0];
    var name   = data[i][1];
    var rating = parseFloat(data[i][3]);
    if (!team || isNaN(rating)) continue;
    if (!teamPlayers[team]) teamPlayers[team] = [];
    teamPlayers[team].push(rating);
  }

  var teams = Object.keys(teamPlayers);
  if (teams.length === 0) return 'ERROR: No valid team data in staging sheet.';

  // Compute talent composite for each team
  // Method: sort players desc, cap at 85, compute weighted sum
  // using 247-style formula (each player contributes rating^n weight)
  // then normalize to 600-1050 scale
  var composites = {};
  for (var t = 0; t < teams.length; t++) {
    var teamName = teams[t];
    var ratings  = teamPlayers[teamName].sort(function(a,b){ return b-a; });
    if (ratings.length > 85) ratings = ratings.slice(0, 85);
    composites[teamName] = computeOn3Composite(ratings, year);
  }

  // Write TalentOverride sheet
  var sheetNames = ss.getSheets().map(function(s){ return s.getName(); });
  if (sheetNames.indexOf(overrideName) >= 0) {
    ss.deleteSheet(ss.getSheetByName(overrideName));
  }
  var ov = ss.insertSheet(overrideName);
  ov.setColumnWidth(1, 230);
  ov.setColumnWidth(2, 150);
  ov.setColumnWidth(3, 160);

  ov.getRange(1,1,1,3).merge();
  ov.getRange('A1')
    .setValue('TALENT OVERRIDE — ' + year + ' On3 Full Roster Composites (used by calculateRatings)')
    .setFontWeight('bold').setBackground('#e8f0fe');
  ov.getRange(2,1,1,3).merge();
  ov.getRange('A2')
    .setValue('Source: On3.com ' + year + ' full roster player ratings. ' +
              'Composite = weighted average of top-85 rated players per team, mapped to 600-1050 scale. ' +
              'College ratings used first; otherwise transfer portal/high school ratings are scaled to a max of 90. ' +
              'Unrated players assigned floor score of 75.0. ' +
              'Teams: ' + teams.length + '. Generated: ' + new Date().toLocaleDateString())
    .setFontStyle('italic');

  ov.getRange(4,1).setValue('team').setFontWeight('bold');
  ov.getRange(4,2).setValue('talent_score').setFontWeight('bold');
  ov.getRange(4,3).setValue('player_count').setFontWeight('bold');

  var overrideRows = [];
  var teamKeys = Object.keys(composites);
  for (var j = 0; j < teamKeys.length; j++) {
    var tn = teamKeys[j];
    overrideRows.push([tn, composites[tn], teamPlayers[tn].length]);
  }
  overrideRows.sort(function(a,b){ return b[1]-a[1]; });

  if (overrideRows.length > 0) {
    ov.getRange(5, 1, overrideRows.length, 3).setValues(overrideRows);
  }

  // Color by score tier
  var bgColors = overrideRows.map(function(r) {
    var s = r[1];
    if      (s >= 950) return ['#c9b037'];
    else if (s >= 850) return ['#c6efce'];
    else if (s >= 750) return ['#ebf7ee'];
    else if (s >= 650) return ['#fff2cc'];
    else               return ['#f4cccc'];
  });
  if (bgColors.length > 0) {
    ov.getRange(5, 2, bgColors.length, 1).setBackgrounds(bgColors);
  }

  return '✓ ' + overrideName + ' written! ' + teams.length + ' teams.\n' +
         'Top 5:\n' +
         overrideRows.slice(0,5).map(function(r,i){
           return (i+1)+'. '+r[0]+': '+r[1]+' ('+r[2]+' players)';
         }).join('\n') +
         '\n\nNow run calculateRatings() from your main menu.';
}


// ── ON3 COMPOSITE FORMULA ─────────────────────────────────────
// Takes an array of On3 player ratings (already sorted desc, max 85)
// Returns a talent score on the 600-1050 scale used by the model.
//
// Method:
//   1. Convert each On3 player rating (scale ~75-100) to a 247-equivalent
//      individual rating (scale ~0.8000 to 1.0000) using linear mapping
//   2. Compute 247-style weighted composite:
//      sum(rating_i ^ power) for top players, with diminishing returns
//   3. Normalize the result to 600-1050 range based on observed min/max
function computeOn3Composite(ratings, year) {
  if (!ratings || ratings.length === 0) return 600;

  // Convert On3 player ratings to 247-style individual player scores (0.8-1.0 range)
  // On3 scale: ~75 (floor/unrated) to ~100 (theoretical max, practical ~99)
  // 247 individual: ~0.8000 to ~1.0000
  var MIN_ON3 = 75.0, MAX_ON3 = 100.0;
  var MIN_247 = 0.7800, MAX_247 = 1.0000;

  var converted = ratings.map(function(r) {
    var mapped = ((r - MIN_ON3) / (MAX_ON3 - MIN_ON3)) * (MAX_247 - MIN_247) + MIN_247;
    return Math.min(Math.max(mapped, MIN_247), MAX_247);
  });

  // 247-style composite: power-weighted sum of top players
  // 247 uses: composite = sum(rating^(power*(1 + position_weight)))
  // Simplified version: each player's contribution = rating^6, 
  // with extra weight for top 5 players
  var POWER = 5.0;
  var sum = 0;
  for (var i = 0; i < converted.length; i++) {
    var positionBonus = i < 5 ? 1.5 : (i < 15 ? 1.2 : 1.0);
    sum += Math.pow(converted[i], POWER) * positionBonus;
  }

  // Normalize: 2022-2025 keep the more aggressive historical scale.
  // 2026 is stricter because its current roster data otherwise creates
  // too many 1000+ teams.
  var CALIB_MIN = 12.0;   // approx sum for worst FBS roster
  var CALIB_MAX = String(year) === '2026'
    ? 56.0
    : 52.0;

  var normalized = ((sum - CALIB_MIN) / (CALIB_MAX - CALIB_MIN)) * (1050 - 600) + 600;
  normalized = Math.min(Math.max(normalized, 600), 1050);
  return Math.round(normalized * 10) / 10;
}


// ── STAGING SHEET HELPERS ─────────────────────────────────────
function getRosterYearFromUrl(url) {
  var match = String(url || '').match(/\/(20\d\d)\/roster/);
  return match ? match[1] : '';
}

function getStagingSheetName(year) {
  year = String(year || 2026);
  return year === '2026' ? 'On3RosterStaging' : 'On3RosterStaging' + year;
}

function getTalentOverrideSheetName(year) {
  year = String(year || 2026);
  return year === '2026' ? 'TalentOverride' : 'TalentOverride' + year;
}

function getOrCreateStagingSheet(ss, year) {
  var sheetName = getStagingSheetName(year);
  var existing = null;

  try {
    existing = ss.getSheetByName(sheetName);
    if (existing) {
      // Touch the sheet to make sure Apps Script is not holding a stale
      // reference after a prior delete/recreate operation.
      existing.getSheetId();
      existing.getLastRow();
    }
  } catch (e) {
    Logger.log('Stale staging sheet reference for ' + sheetName + ': ' + e.message);
    SpreadsheetApp.flush();
    existing = ss.getSheetByName(sheetName);
  }

  if (existing) {
    try {
      formatStagingSheetHeader(existing);
      return existing;
    } catch (e2) {
      Logger.log('Could not format existing ' + sheetName + ': ' + e2.message);
      SpreadsheetApp.flush();
      existing = ss.getSheetByName(sheetName);
      if (existing) {
        formatStagingSheetHeader(existing);
        return existing;
      }
    }
  }

  var sheet = ss.insertSheet(sheetName);
  SpreadsheetApp.flush();
  formatStagingSheetHeader(sheet);
  return sheet;
}

function formatStagingSheetHeader(sheet) {
  sheet.getRange(1,1,1,7).setValues([['team','player_name','position','on3_rating','status','rating_source','raw_rating']]);
  sheet.getRange(1,1,1,7).setFontWeight('bold').setBackground('#e8f0fe');
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 90);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(7, 90);
}

function clearStagingSheet() {
  return clearStagingSheetForYear(2026);
}

function clearStagingSheet2022() {
  return clearStagingSheetForYear(2022);
}

function clearStagingSheet2023() {
  return clearStagingSheetForYear(2023);
}

function clearStagingSheet2024() {
  return clearStagingSheetForYear(2024);
}

function clearStagingSheet2025() {
  return clearStagingSheetForYear(2025);
}

function clearStagingSheetForYear(year) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var stagingName = getStagingSheetName(year);
  var staging = ss.getSheetByName(stagingName);
  if (!staging) return 'No ' + year + ' staging sheet found.';
  var lastRow = staging.getLastRow();
  if (lastRow > 1) {
    staging.deleteRows(2, lastRow - 1);
  }
  return stagingName + ' cleared.';
}

function countStagedTeams(staging) {
  return Object.keys(getStagedTeamMap(staging)).length;
}

function getStagedTeamMap(staging) {
  if (!staging) return {};

  var lastRow = staging.getLastRow();
  if (lastRow < 2) return {};

  var data = staging.getRange(2, 1, lastRow - 1, 1).getValues();
  var teams = {};
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) teams[data[i][0]] = true;
  }
  return teams;
}

function showStagingSummary() {
  return showStagingSummaryForYear(2026);
}

function showStagingSummary2022() {
  return showStagingSummaryForYear(2022);
}

function showStagingSummary2023() {
  return showStagingSummaryForYear(2023);
}

function showStagingSummary2024() {
  return showStagingSummaryForYear(2024);
}

function showStagingSummary2025() {
  return showStagingSummaryForYear(2025);
}

function showStagingSummaryForYear(year) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var staging = ss.getSheetByName(getStagingSheetName(year));
  if (!staging || staging.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('No ' + year + ' staging data found.');
    return;
  }
  var data = staging.getDataRange().getValues();
  var teams = {};
  for (var i = 1; i < data.length; i++) {
    var t = data[i][0];
    if (t) {
      if (!teams[t]) teams[t] = 0;
      teams[t]++;
    }
  }
  var keys = Object.keys(teams).sort();
  var msg = year + ' staged teams (' + keys.length + '):\n\n';
  msg += keys.map(function(k){ return k + ': ' + teams[k] + ' players'; }).join('\n');
  SpreadsheetApp.getUi().alert(msg);
}


// ── TEAM SLUG → TEAM NAME CONVERTER ──────────────────────────
// Converts On3 URL slug to a clean team name matching CFBD conventions
function slugToTeamName(slug) {
  var map = {
    'alabama-crimson-tide':        'Alabama',
    'arizona-wildcats':            'Arizona',
    'arizona-state-sun-devils':    'Arizona State',
    'arkansas-razorbacks':         'Arkansas',
    'arkansas-state-red-wolves':   'Arkansas State',
    'army-black-knights':          'Army',
    'auburn-tigers':               'Auburn',
    'air-force-falcons':           'Air Force',
    'akron-zips':                  'Akron',
    'appalachian-state-mountaineers': 'Appalachian State',
    'ball-state-cardinals':        'Ball State',
    'baylor-bears':                'Baylor',
    'boise-state-broncos':         'Boise State',
    'boston-college-eagles':       'Boston College',
    'bowling-green-falcons':       'Bowling Green',
    'buffalo-bulls':               'Buffalo',
    'byu-cougars':                 'BYU',
    'california-golden-bears':     'California',
    'central-michigan-chippewas':  'Central Michigan',
    'charlotte-49ers':             'Charlotte',
    'cincinnati-bearcats':         'Cincinnati',
    'clemson-tigers':              'Clemson',
    'coastal-carolina-chanticleers': 'Coastal Carolina',
    'colorado-buffaloes':          'Colorado',
    'colorado-state-rams':         'Colorado State',
    'connecticut-huskies':         'Connecticut',
    'duke-blue-devils':            'Duke',
    'east-carolina-pirates':       'East Carolina',
    'eastern-michigan-eagles':     'Eastern Michigan',
    'florida-gators':              'Florida',
    'florida-atlantic-owls':       'Florida Atlantic',
    'florida-international-panthers': 'Florida International',
    'florida-state-seminoles':     'Florida State',
    'fresno-state-bulldogs':       'Fresno State',
    'georgia-bulldogs':            'Georgia',
    'georgia-southern-eagles':     'Georgia Southern',
    'georgia-state-panthers':      'Georgia State',
    'georgia-tech-yellow-jackets': 'Georgia Tech',
    'hawaii-rainbow-warriors':     'Hawaii',
    'houston-cougars':             'Houston',
    'illinois-fighting-illini':    'Illinois',
    'indiana-hoosiers':            'Indiana',
    'iowa-hawkeyes':               'Iowa',
    'iowa-state-cyclones':         'Iowa State',
    'james-madison-dukes':         'James Madison',
    'jacksonville-state-gamecocks': 'Jacksonville State',
    'kansas-jayhawks':             'Kansas',
    'kansas-state-wildcats':       'Kansas State',
    'kennesaw-state-owls':         'Kennesaw State',
    'kent-state-golden-flashes':   'Kent State',
    'kentucky-wildcats':           'Kentucky',
    'liberty-flames':              'Liberty',
    'louisiana-ragin-cajuns':      'Louisiana Lafayette',
    'louisiana-lafayette-ragin-cajuns': 'Louisiana Lafayette',
    'louisiana-monroe-warhawks':   'Louisiana Monroe',
    'louisiana-tech-bulldogs':     'Louisiana Tech',
    'louisville-cardinals':        'Louisville',
    'lsu-tigers':                  'LSU',
    'marshall-thundering-herd':    'Marshall',
    'maryland-terrapins':          'Maryland',
    'massachusetts-minutemen':     'Massachusetts',
    'memphis-tigers':              'Memphis',
    'miami-hurricanes':            'Miami',
    'miami-ohio-redhawks':         'Miami Ohio',
    'michigan-wolverines':         'Michigan',
    'michigan-state-spartans':     'Michigan State',
    'middle-tennessee-blue-raiders': 'Middle Tennessee',
    'minnesota-golden-gophers':    'Minnesota',
    'mississippi-state-bulldogs':  'Mississippi State',
    'missouri-tigers':             'Missouri',
    'navy-midshipmen':             'Navy',
    'nc-state-wolfpack':           'NC State',
    'nebraska-cornhuskers':        'Nebraska',
    'nevada-wolf-pack':            'Nevada',
    'new-mexico-lobos':            'New Mexico',
    'new-mexico-state-aggies':     'New Mexico State',
    'north-carolina-tar-heels':    'North Carolina',
    'north-texas-mean-green':      'North Texas',
    'northern-illinois-huskies':   'Northern Illinois',
    'northwestern-wildcats':       'Northwestern',
    'notre-dame-fighting-irish':   'Notre Dame',
    'ohio-bobcats':                'Ohio',
    'ohio-state-buckeyes':         'Ohio State',
    'oklahoma-sooners':            'Oklahoma',
    'oklahoma-state-cowboys':      'Oklahoma State',
    'old-dominion-monarchs':       'Old Dominion',
    'ole-miss-rebels':             'Ole Miss',
    'oregon-ducks':                'Oregon',
    'oregon-state-beavers':        'Oregon State',
    'penn-state-nittany-lions':    'Penn State',
    'pittsburgh-panthers':         'Pittsburgh',
    'purdue-boilermakers':         'Purdue',
    'rice-owls':                   'Rice',
    'rutgers-scarlet-knights':     'Rutgers',
    'sam-houston-state-bearkats':  'Sam Houston State',
    'san-diego-state-aztecs':      'San Diego State',
    'san-jose-state-spartans':     'San Jose State',
    'smu-mustangs':                'SMU',
    'south-alabama-jaguars':       'South Alabama',
    'south-carolina-gamecocks':    'South Carolina',
    'south-florida-bulls':         'South Florida',
    'southern-miss-golden-eagles': 'Southern Miss',
    'stanford-cardinal':           'Stanford',
    'syracuse-orange':             'Syracuse',
    'tcu-horned-frogs':            'TCU',
    'temple-owls':                 'Temple',
    'tennessee-volunteers':        'Tennessee',
    'texas-longhorns':             'Texas',
    'texas-am-aggies':             'Texas A&M',
    'texas-state-bobcats':         'Texas State',
    'texas-tech-red-raiders':      'Texas Tech',
    'toledo-rockets':              'Toledo',
    'troy-trojans':                'Troy',
    'tulane-green-wave':           'Tulane',
    'tulsa-golden-hurricane':      'Tulsa',
    'uab-blazers':                 'UAB',
    'ucf-knights':                 'UCF',
    'ucla-bruins':                 'UCLA',
    'unlv-rebels':                 'UNLV',
    'usc-trojans':                 'USC',
    'utah-utes':                   'Utah',
    'utah-state-aggies':           'Utah State',
    'utep-miners':                 'UTEP',
    'utsa-roadrunners':            'UTSA',
    'vanderbilt-commodores':       'Vanderbilt',
    'virginia-cavaliers':          'Virginia',
    'virginia-tech-hokies':        'Virginia Tech',
    'wake-forest-demon-deacons':   'Wake Forest',
    'washington-huskies':          'Washington',
    'washington-state-cougars':    'Washington State',
    'west-virginia-mountaineers':  'West Virginia',
    'western-kentucky-hilltoppers': 'Western Kentucky',
    'western-michigan-broncos':    'Western Michigan',
    'wisconsin-badgers':           'Wisconsin',
    'wyoming-cowboys':             'Wyoming'
  };
  if (map[slug]) return map[slug];
  // Fallback: title-case the slug
  return slug.split('-').map(function(w){
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ').replace(/ (Aggies|Crimson Tide|Wildcats|Bulldogs|Tigers|Bears|Trojans|Bruins|Cougars|Gators|Hurricanes|Wolverines|Buckeyes|Sooners|Ducks|Nittany Lions|Boilermakers|Hoosiers|Spartans|Hawkeyes|Cyclones|Cornhuskers|Longhorns|Volunteers|Rebels|Cardinals|Seminoles|Commodores|Cavaliers|Hokies|Mountaineers|Tar Heels)$/, '');
}


// ── getTalentData() OVERRIDE ──────────────────────────────────
// Called by calculateRatings() — checks TalentOverride first,
// falls back to CFBD API if no override sheet present.
function getTalentData(config, maxSeason) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var overrideName = getTalentOverrideSheetName(parseInt(maxSeason, 10) || 2026);
  var ov = ss.getSheetByName(overrideName);

  if (ov) {
    var data      = ov.getDataRange().getValues();
    var talentRaw = {};
    for (var i = 4; i < data.length; i++) {
      var team  = data[i][0];
      var score = parseFloat(data[i][1]);
      if (team && !isNaN(score) && score > 0) talentRaw[team] = score;
    }
    if (Object.keys(talentRaw).length > 0) {
      Logger.log('Talent source: ' + overrideName + ' (' + Object.keys(talentRaw).length + ' teams)');
      return { talentZ: computeTalentZ(talentRaw), source: 'On3_' + maxSeason + '_Roster' };
    }
  }

  // Fallback: CFBD API
  Logger.log('Talent source: CFBD API (no ' + overrideName + ' found)');
  var talentMap = {};
  try {
    for (var si = 0; si < 2; si++) {
      var yr   = maxSeason - si;
      var resp = fetchWithAuth(
        'https://api.collegefootballdata.com/recruiting/teams?year=' + yr,
        config.API_KEY
      );
      if (!resp) continue;
      var entries = JSON.parse(resp);
      for (var ei = 0; ei < entries.length; ei++) {
        var e = entries[ei];
        if (!talentMap[e.team]) talentMap[e.team] = [];
        talentMap[e.team].push(e.points || 0);
      }
    }
  } catch(err) { Logger.log('Talent API error: ' + err.message); }

  var raw2 = {};
  var keys = Object.keys(talentMap);
  for (var ki = 0; ki < keys.length; ki++) {
    var k = keys[ki], pts = talentMap[k];
    raw2[k] = pts.reduce(function(a,b){return a+b;},0) / pts.length;
  }
  return { talentZ: computeTalentZ(raw2), source: 'CFBD_API' };
}

function computeTalentZ(raw) {
  var vals  = Object.values(raw);
  var tMean = mean(vals);
  var tStd  = stdDev(vals) || 1;
  var z     = {};
  var keys  = Object.keys(raw);
  for (var i = 0; i < keys.length; i++) {
    z[keys[i]] = (raw[keys[i]] - tMean) / tStd;
  }
  return z;
}


// ── UTILITIES ─────────────────────────────────────────────────
function round2(v) { return Math.round(v*100)/100; }
function mean(arr) {
  var v = arr.filter(function(x){return x!==null&&x!==undefined&&!isNaN(x);});
  return v.length ? v.reduce(function(a,b){return a+b;},0)/v.length : 0;
}
function stdDev(arr) {
  var m = mean(arr);
  var v = arr.filter(function(x){return x!==null&&x!==undefined&&!isNaN(x);});
  return v.length<2 ? 1 : Math.sqrt(v.reduce(function(s,x){return s+Math.pow(x-m,2);},0)/v.length);
}
// getConfig() and fetchWithAuth() are in your main script — shared automatically.
