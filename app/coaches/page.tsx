import { Table } from '@/components/Table';
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
      <Table
        rows={rows}
        columns={[
          { label: 'Team', render: row => String(row.team ?? '') },
          { label: 'Coach', render: row => String(row.coach_name ?? '') },
          { label: 'Tier', render: row => String(row.tier ?? '') },
          { label: 'Hire Year', className: 'num', render: row => String(row.hire_year ?? '') },
          { label: 'Off Tendency', className: 'num', render: row => String(row.off_tendency ?? '') },
          { label: 'Def Tendency', className: 'num', render: row => String(row.def_tendency ?? '') },
          { label: 'Override', className: 'num', render: row => fmt(row.preseason_override) },
          { label: 'Source', render: row => String(row.source ?? '') },
          { label: 'Notes', render: row => String(row.notes ?? '') }
        ]}
      />
    </>
  );
}

function fmt(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2).replace(/\.00$/, '') : '';
}
