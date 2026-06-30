import { MatchupPredictor } from '@/components/MatchupPredictor';
import { fetchPredictorData } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function PredictPage() {
  const data = await fetchPredictorData();

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Matchup Tool</div>
          <h2>Game Predictor</h2>
          <p className="page-subtitle">Choose any two teams and generate a model spread with matchup edges.</p>
        </div>
      </header>
      <MatchupPredictor data={data} />
    </>
  );
}
