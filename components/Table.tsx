import type { ReactNode } from 'react';

type Column<T> = {
  label: string;
  className?: string;
  render: (row: T, index: number) => ReactNode;
};

export function Table<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.label} className={column.className}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={index}>
              {columns.map(column => (
                <td key={column.label} className={column.className}>{column.render(row, index)}</td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length}>No rows loaded</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
