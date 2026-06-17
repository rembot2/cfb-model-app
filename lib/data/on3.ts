export type On3Player = {
  name: string;
  position: string;
  rating: number;
  rawRating: number | '';
  source: 'college' | 'transfer' | 'high_school' | 'unrated';
  rated: boolean;
};

export type On3TeamComposite = {
  team: string;
  season: number;
  talentScore: number;
  playerCount: number;
  ratedPlayerCount: number;
};

type RatingResult = {
  rawRating: number | '';
  rating: number;
  source: On3Player['source'];
};

export function parseOn3RosterHtml(html: string, teamName: string, rosterYear: number): On3Player[] {
  const players: On3Player[] = [];
  const seen = new Set<string>();
  const year = Number.parseInt(String(rosterYear), 10) || 2026;
  const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

  if (!jsonMatch) return players;

  let data: any;
  try {
    data = JSON.parse(jsonMatch[1]);
  } catch {
    return players;
  }

  const rosterRows = Array.isArray(data?.props?.pageProps?.rosterList?.list)
    ? data.props.pageProps.rosterList.list
    : [];

  for (const row of rosterRows) {
    if (!row?.player) continue;

    const name = findDirectPlayerName(row.player);
    const position = findPosition(row.player);
    const bestRating = findBestRating(row, year) || {
      rawRating: '',
      rating: 75.0,
      source: 'unrated' as const
    };

    if (!name || !position || seen.has(name)) continue;
    seen.add(name);

    players.push({
      name,
      position,
      rating: bestRating.rating,
      rawRating: bestRating.rawRating,
      source: bestRating.source,
      rated: bestRating.source !== 'unrated'
    });
  }

  return players;
}

export async function fetchOn3Roster(url: string, teamName: string, rosterYear: number) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 CFB Model App roster importer',
      Accept: 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) {
    throw new Error(`On3 roster fetch failed ${response.status} for ${url}`);
  }

  const html = await response.text();
  return parseOn3RosterHtml(html, teamName, rosterYear);
}

export function computeOn3Composite(ratings: number[], year: number): number {
  if (!ratings.length) return 600;

  const sorted = [...ratings].sort((a, b) => b - a).slice(0, 85);
  const minOn3 = 75.0;
  const maxOn3 = 100.0;
  const min247 = 0.78;
  const max247 = 1.0;

  const converted = sorted.map((rating) => {
    const mapped = ((rating - minOn3) / (maxOn3 - minOn3)) * (max247 - min247) + min247;
    return Math.min(Math.max(mapped, min247), max247);
  });

  const power = 5.0;
  const sum = converted.reduce((acc, rating, index) => {
    const positionBonus = index < 5 ? 1.5 : index < 15 ? 1.2 : 1.0;
    return acc + Math.pow(rating, power) * positionBonus;
  }, 0);

  const calibMin = 12.0;
  const calibMax = String(year) === '2026' ? 56.0 : 52.0;
  const normalized = ((sum - calibMin) / (calibMax - calibMin)) * (1050 - 600) + 600;
  return round1(Math.min(Math.max(normalized, 600), 1050));
}

export function buildOn3TeamComposite(team: string, season: number, players: On3Player[]): On3TeamComposite {
  const ratings = players.map((player) => player.rating).filter((rating) => Number.isFinite(rating));
  return {
    team,
    season,
    talentScore: computeOn3Composite(ratings, season),
    playerCount: players.length,
    ratedPlayerCount: players.filter((player) => player.rated).length
  };
}

export function getRosterYearFromUrl(url: string) {
  const match = String(url || '').match(/\/(20\d\d)\/roster/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function looksLikePlayerName(value: unknown) {
  if (!value) return false;
  const name = String(value).trim();
  if (name.length < 2 || name.length > 60) return false;
  if (!/^[A-Z]/.test(name)) return false;
  if (name.indexOf(' ') === -1 && name.indexOf('-') === -1) return false;
  if (/Texas A|Aggies|Football|College|Claim|Roster|Recruiting|Conference|Image|Logo/i.test(name)) return false;
  if (/class year|high school|hometown|position|height|weight/i.test(name)) return false;
  return true;
}

function findDirectPlayerName(obj: any) {
  if (!obj || typeof obj !== 'object') return null;
  const directName = obj.fullName || obj.displayName || obj.playerName || obj.name || null;
  if (looksLikePlayerName(directName)) return String(directName).trim();

  if (obj.firstName && obj.lastName) {
    const combined = `${String(obj.firstName).trim()} ${String(obj.lastName).trim()}`;
    if (looksLikePlayerName(combined)) return combined;
  }

  return null;
}

function findPosition(obj: any) {
  if (!obj || typeof obj !== 'object') return '';
  const rosterKeys = ['rosterPosition', 'playerPosition', 'listedPosition', 'primaryPosition', 'position'];

  for (const key of rosterKeys) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim()) return val.trim().toUpperCase();
    if (val && typeof val === 'object') {
      if (val.abbreviation) return String(val.abbreviation).trim().toUpperCase();
      if (val.abbr) return String(val.abbr).trim().toUpperCase();
      if (val.name) return String(val.name).trim().toUpperCase();
    }
  }

  if (obj.positionAbbr) return String(obj.positionAbbr).trim().toUpperCase();
  if (obj.rating?.positionAbbr) return String(obj.rating.positionAbbr).trim().toUpperCase();
  return '';
}

function normalizeRatingValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  let rating = Number.parseFloat(String(value));
  if (!Number.isFinite(rating)) return null;
  if (rating > 0.7 && rating <= 1.0) rating *= 100;
  if (rating < 70 || rating > 100) return null;
  return rating;
}

function getClassDowngradeMultiplier(row: any, rosterYear: number) {
  const player = row?.player || {};
  const rank = String(player.classRank || '').toLowerCase();
  const classYear = Number.parseInt(player.classYear, 10);

  if (/red\s*shirt\s*senior|rs-?sr|r-?sr/.test(rank)) return 0.35;
  if (/senior|sr\b/.test(rank)) return 0.45;
  if (/red\s*shirt\s*junior|rs-?jr|r-?jr/.test(rank)) return 0.55;
  if (/junior|jr\b/.test(rank)) return 0.65;
  if (/red\s*shirt\s*sophomore|rs-?so|r-?so/.test(rank)) return 0.75;
  if (/sophomore|so\b/.test(rank)) return 0.85;
  if (/freshman|fr\b/.test(rank)) return 1.0;

  if (Number.isFinite(classYear)) {
    if (classYear <= rosterYear - 4) return 0.35;
    if (classYear === rosterYear - 3) return 0.45;
    if (classYear === rosterYear - 2) return 0.65;
    if (classYear === rosterYear - 1) return 0.85;
  }

  return 1.0;
}

function scaleNonCollegeRating(rawRating: number, row: any, rosterYear: number) {
  const minRaw = 70.0;
  const maxRaw = 99.0;
  const floor = 75.0;
  const ceiling = 90.0;
  const clamped = Math.min(Math.max(rawRating, minRaw), maxRaw);
  const pct = (clamped - minRaw) / (maxRaw - minRaw);
  const curved = Math.pow(pct, 1.35);
  const freshmanScaled = floor + curved * (ceiling - floor);
  const cappedRaw = Math.min(clamped, ceiling);
  const downgrade = cappedRaw - freshmanScaled;
  const multiplier = getClassDowngradeMultiplier(row, rosterYear);
  return Math.min(cappedRaw - downgrade * multiplier, ceiling);
}

function finishRating(rawRating: unknown, source: RatingResult['source'], row: any, rosterYear: number): RatingResult | null {
  const normalized = normalizeRatingValue(rawRating);
  if (normalized === null) return null;
  const finalRating = source === 'college' ? normalized : scaleNonCollegeRating(normalized, row, rosterYear);
  return {
    rawRating: round2(normalized),
    rating: round2(finalRating),
    source
  };
}

function findIndustryRating(row: any, rankingType: string) {
  if (!Array.isArray(row?.industryComparison)) return null;
  for (const item of row.industryComparison) {
    if (!item) continue;
    if (String(item.type || '').toLowerCase() !== 'industry') continue;
    if (String(item.rankingType || '').toLowerCase() !== rankingType.toLowerCase()) continue;
    const rating = normalizeRatingValue(item.rating);
    if (rating !== null) return rating;
  }
  return null;
}

function findBestRating(row: any, rosterYear: number): RatingResult | null {
  if (!row || typeof row !== 'object') return null;

  if (row.rosterRating?.rating !== null && row.rosterRating?.rating !== undefined) {
    return finishRating(row.rosterRating.rating, 'college', row, rosterYear);
  }

  const transferRating = findIndustryRating(row, 'TransferPortal');
  if (transferRating !== null) return finishRating(transferRating, 'transfer', row, rosterYear);

  const highSchoolRating = findIndustryRating(row, 'Player');
  if (highSchoolRating !== null) return finishRating(highSchoolRating, 'high_school', row, rosterYear);

  return null;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

