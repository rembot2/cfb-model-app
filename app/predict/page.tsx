import { MatchupPredictor } from '@/components/MatchupPredictor';
import { fetchPredictorData } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function PredictPage() {
  const data = await fetchPredictorData();

  return (
    <>
      <header className="page-hero">
        <div>
          <div className="eyebrow">Matchup Lab</div>
          <h2>Build a custom game projection.</h2>
          <p className="page-subtitle">
            Pick a season, choose two teams, set the site, and the model returns the spread, score estimate, win probability, and matchup edges.
          </p>
        </div>
        <div className="page-hero-actions">
          <span className="summary-tile">
            <span>Available Seasons</span>
            <strong>{data.seasons.length}</strong>
            <small>{data.selectedSeason ?? '-'} loaded first</small>
          </span>
        </div>
      </header>
      <MatchupPredictor data={data} />
    </>
  );
}
