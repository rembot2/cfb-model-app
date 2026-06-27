import { CoachControls } from '@/components/CoachControls';
import { fetchTable } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function CoachesPage() {
  const rows = await fetchTable('coach_configs', 250);
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
      <CoachControls initialRows={rows} />
    </>
  );
}
