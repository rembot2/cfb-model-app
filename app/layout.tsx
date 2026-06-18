import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'CFB Model App',
  description: 'College football ratings, projections, and backtests.'
};

const nav = [
  ['Dashboard', '/'],
  ['Ratings', '/ratings'],
  ['Coaches', '/coaches'],
  ['Games', '/games'],
  ['Backtest', '/backtest'],
  ['Optimizer', '/optimizer']
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-mark">CFB</div>
              <div>
                <h1>Model App</h1>
                <p>Database-backed engine</p>
              </div>
            </div>
            <nav className="nav">
              {nav.map(([label, href]) => (
                <Link key={href} href={href}>{label}</Link>
              ))}
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
