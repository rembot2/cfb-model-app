const CFBD_BASE_URL = 'https://api.collegefootballdata.com';

export type CfbdClientOptions = {
  apiKey?: string;
  baseUrl?: string;
};

export type CfbdGame = {
  id: number;
  season: number;
  week: number;
  seasonType?: string;
  startDate?: string;
  neutralSite?: boolean;
  conferenceGame?: boolean;
  homeTeam: string;
  awayTeam: string;
  homeConference?: string | null;
  awayConference?: string | null;
  homePoints?: number | null;
  awayPoints?: number | null;
};

export type CfbdTeamGameStat = {
  gameId: number;
  season: number;
  seasonType: string;
  week: number;
  team: string;
  opponent: string;
  offense?: Record<string, any>;
  defense?: Record<string, any>;
};

export type CfbdTeamSeasonStat = {
  season: number;
  team: string;
  conference?: string | null;
  statName: string;
  statValue: number;
};

export type CfbdBettingLine = {
  id?: number;
  season?: number;
  week?: number;
  homeTeam?: string;
  awayTeam?: string;
  lines?: Array<{
    provider?: string;
    spread?: number | null;
    formattedSpread?: string | null;
  }>;
};

export class CfbdClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: CfbdClientOptions = {}) {
    const apiKey = options.apiKey || process.env.CFBD_API_KEY;
    if (!apiKey) {
      throw new Error('CFBD_API_KEY is required');
    }
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl || CFBD_BASE_URL;
  }

  async getTeams(year?: number) {
    const path = year ? `/teams/fbs?year=${year}` : '/teams/fbs';
    return this.request<any[]>(path);
  }

  async getGames(year: number, seasonType: 'regular' | 'postseason' = 'regular') {
    return this.request<CfbdGame[]>(`/games?year=${year}&seasonType=${seasonType}`);
  }

  async getBettingLines(year: number, seasonType: 'regular' | 'postseason' = 'regular') {
    return this.request<CfbdBettingLine[]>(`/lines?year=${year}&seasonType=${seasonType}`);
  }

  async getTeamGameStats(year: number, seasonType: 'regular' | 'postseason' = 'regular', week?: number) {
    const weekParam = week ? `&week=${week}` : '';
    return this.request<CfbdTeamGameStat[]>(`/games/teams?year=${year}&seasonType=${seasonType}${weekParam}`);
  }

  async getTeamSeasonStats(year: number) {
    return this.request<CfbdTeamSeasonStat[]>(`/stats/season?year=${year}`);
  }

  async getSeasonGamesAndPostseason(year: number) {
    const [regular, postseason] = await Promise.all([
      this.getGames(year, 'regular'),
      this.getGames(year, 'postseason')
    ]);
    return [...regular, ...postseason];
  }

  private async request<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CFBD ${response.status} for ${path}: ${text}`);
    }

    return response.json() as Promise<T>;
  }
}
