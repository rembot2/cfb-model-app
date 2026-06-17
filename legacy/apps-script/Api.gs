// ============================================================
// CFB MODEL WEB API
// ============================================================
// Paste this as a NEW Apps Script file named Api.gs in the same
// spreadsheet project as your ratings/backtest code.
//
// Deploy:
//   Apps Script > Deploy > New deployment > Web app
//   Execute as: Me
//   Who has access: Anyone with the link
//
// Example routes:
//   ?action=dashboard
//   ?action=ratings&year=2026
//   ?action=backtest&season=2025
//   ?action=summary
//   ?action=optimizer
//   ?action=buckets
// ============================================================

const CFB_WEB_API_VERSION = '1.0.0';

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};

  // Opening the /exec URL directly serves the web app.
  // Calling /exec?action=... serves JSON for external/static clients.
  if (!params.action && !params.callback) {
    return HtmlService
      .createHtmlOutputFromFile('Index')
      .setTitle('CFB Model Console')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const action = String(params.action || 'dashboard').toLowerCase();
  return sendApiResponse_(params, apiCall(action, params));
}

function apiCall(action, params) {
  params = params || {};
  action = String(action || params.action || 'dashboard').toLowerCase();

  try {
    return {
      ok: true,
      version: CFB_WEB_API_VERSION,
      generatedAt: new Date().toISOString(),
      action,
      data: getApiActionPayload_(action, params),
    };
  } catch (err) {
    return {
      ok: false,
      version: CFB_WEB_API_VERSION,
      generatedAt: new Date().toISOString(),
      action,
      error: err && err.message ? err.message : String(err),
    };
  }
}

function getApiActionPayload_(action, params) {
  switch (action) {
    case 'meta':
      return getApiMeta_();
    case 'ratings':
      return getRatingsPayload_(params);
    case 'backtest':
      return getBacktestPayload_(params);
    case 'summary':
      return getSheetPayload_('BacktestSummary');
    case 'optimizer':
      return getOptimizerPayload_(params);
    case 'buckets':
      return getBucketsPayload_();
    case 'dashboard':
    default:
      return getDashboardPayload_(params);
  }
}

function getApiMeta_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().map(s => s.getName());
  const ratingYears = sheets
    .map(name => {
      const m = name.match(/^Ratings(\d{4})$/);
      return m ? Number(m[1]) : null;
    })
    .filter(year => year)
    .sort((a, b) => b - a);

  return {
    spreadsheetName: ss.getName(),
    sheets,
    ratingYears,
    defaultRatingYear: ratingYears.length ? ratingYears[0] : null,
  };
}

function getRatingsPayload_(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const requestedYear = params.year ? Number(params.year) : null;
  const sheetName = resolveRatingsSheetName_(ss, requestedYear);
  const payload = getSheetPayload_(sheetName);

  payload.year = sheetName === 'Ratings'
    ? null
    : Number(String(sheetName).replace('Ratings', ''));
  payload.sheetName = sheetName;
  payload.rows = payload.rows
    .filter(row => row.team)
    .sort((a, b) => asNumber_(b.composite) - asNumber_(a.composite));

  return payload;
}

function getBacktestPayload_(params) {
  const payload = getSheetPayload_('Backtest');
  const season = params.season ? String(params.season) : '';
  const edgeOnly = String(params.edgeOnly || '').toLowerCase() === 'true';
  const limit = Math.max(1, Math.min(2000, Number(params.limit || 1000)));

  let rows = payload.rows;
  if (season) rows = rows.filter(row => String(row.season) === season);
  if (edgeOnly) rows = rows.filter(row => row.modelVegasResult);

  rows = rows
    .sort((a, b) =>
      asNumber_(b.season) - asNumber_(a.season) ||
      asNumber_(b.week) - asNumber_(a.week)
    )
    .slice(0, limit);

  return {
    sheetName: payload.sheetName,
    headers: payload.headers,
    count: rows.length,
    rows,
  };
}

function getOptimizerPayload_(params) {
  const limit = Math.max(1, Math.min(500, Number(params.limit || 50)));
  const payload = getSheetPayload_('WeightOptimizer');
  const rows = payload.rows.slice(0, limit);
  const best = payload.rows.find(row => String(row.useThis || '').toUpperCase() === 'BEST') ||
    payload.rows.find(row => Number(row.rank) === 1) ||
    payload.rows[0] ||
    null;

  return {
    sheetName: payload.sheetName,
    headers: payload.headers,
    best,
    count: rows.length,
    rows,
  };
}

function getBucketsPayload_() {
  return {
    spreadBuckets: getSheetPayload_('SpreadBuckets'),
    vegasDiffBuckets: getSheetPayload_('VegasDiffBuckets'),
  };
}

function getDashboardPayload_(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const meta = getApiMeta_();
  const ratings = getRatingsPayload_({ year: params.year || meta.defaultRatingYear });
  const summary = safeSheetPayload_('BacktestSummary');
  const optimizer = safeOptimizerPayload_();
  const buckets = safeBucketsPayload_();

  const topRatings = ratings.rows.slice(0, 25);
  const overallSummary = summary.rows
    ? summary.rows.find(row => String(row.week || '').toUpperCase() === 'OVERALL') ||
      summary.rows[summary.rows.length - 1] ||
      null
    : null;

  return {
    meta,
    spreadsheetName: ss.getName(),
    ratingsSheet: ratings.sheetName,
    topRatings,
    overallSummary,
    optimizerBest: optimizer.best || null,
    spreadBuckets: buckets.spreadBuckets ? buckets.spreadBuckets.rows : [],
    vegasDiffBuckets: buckets.vegasDiffBuckets ? buckets.vegasDiffBuckets.rows : [],
  };
}

function safeSheetPayload_(sheetName) {
  try {
    return getSheetPayload_(sheetName);
  } catch (err) {
    return { sheetName, headers: [], rows: [], error: err.message };
  }
}

function safeOptimizerPayload_() {
  try {
    return getOptimizerPayload_({ limit: 50 });
  } catch (err) {
    return { best: null, rows: [], error: err.message };
  }
}

function safeBucketsPayload_() {
  try {
    return getBucketsPayload_();
  } catch (err) {
    return { spreadBuckets: null, vegasDiffBuckets: null, error: err.message };
  }
}

function resolveRatingsSheetName_(ss, year) {
  if (year && ss.getSheetByName('Ratings' + year)) return 'Ratings' + year;

  const years = ss.getSheets()
    .map(s => {
      const m = s.getName().match(/^Ratings(\d{4})$/);
      return m ? Number(m[1]) : null;
    })
    .filter(v => v)
    .sort((a, b) => b - a);

  if (years.length) return 'Ratings' + years[0];
  if (ss.getSheetByName('Ratings')) return 'Ratings';
  throw new Error('No Ratings sheet found.');
}

function getSheetPayload_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  const range = sheet.getDataRange();
  const values = range.getValues();
  if (!values.length) return { sheetName, headers: [], rows: [] };

  const headers = values[0].map(h => String(h || '').trim());
  const keys = headers.map(normalizeHeaderKey_);
  const rows = values.slice(1)
    .filter(row => row.some(v => v !== '' && v !== null))
    .map(row => {
      const obj = {};
      for (let i = 0; i < keys.length; i++) {
        if (!keys[i]) continue;
        obj[keys[i]] = normalizeCellValue_(row[i]);
      }
      return obj;
    });

  return { sheetName, headers, rows };
}

function normalizeHeaderKey_(header) {
  const clean = String(header || '')
    .replace(/%/g, ' pct ')
    .replace(/\+/g, ' plus ')
    .replace(/-/g, ' ')
    .replace(/\?/g, '')
    .replace(/_/g, ' ')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .toLowerCase();

  if (!clean) return '';

  const parts = clean.split(/\s+/);
  return parts[0] + parts.slice(1).map(part =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('');
}

function normalizeCellValue_(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return Math.round(value * 10000) / 10000;
  if (typeof value === 'boolean') return value;
  return value === null || value === undefined ? '' : value;
}

function asNumber_(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function sendApiResponse_(params, payload) {
  const json = JSON.stringify(payload);
  const callback = params && params.callback
    ? String(params.callback).replace(/[^\w.$]/g, '')
    : '';

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
