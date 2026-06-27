import { CoachControls } from '@/components/CoachControls';
import { fetchFormulaData, fetchTable } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function CoachesPage() {
  const [rows, formula] = await Promise.all([
    fetchTable('coach_configs', 250),
    fetchFormulaData()
  ]);
  rows.sort((a, b) => String(a.team || '').localeCompare(String(b.team || '')));

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Coaching</div>
          <h2>Coach Configuration</h2>
          <div className="page-subtitle">{rows.length} teams</div>
        </div>
      </header>
      <CoachControls initialRows={rows} activeConfig={formula.activeConfig} />
    </>
  );
}
