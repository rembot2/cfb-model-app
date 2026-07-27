import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Phillips-David Model',
  description: 'Independent college football ratings, matchup projections, and backtest research.'
};

const navGroups = [
  {
    label: 'Explore',
    links: [
      ['Command Center', '/'],
      ['Power Ratings', '/ratings'],
      ['Matchup Lab', '/predict']
    ]
  },
  {
    label: 'Track Record',
    links: [
      ['Backtest Summary', '/backtest'],
      ['Game Results', '/backtest-results']
    ]
  },
  {
    label: 'The Project',
    links: [
      ['About Us', '/about']
    ]
  }
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-mark">
                <img src="/brand/pd-logo.png" alt="Phillips-David Model" />
              </div>
              <div>
                <h1>Phillips-David</h1>
                <p>College Football Analytics</p>
              </div>
            </div>
            <div className="sidebar-callout">
              <span>Independent Project</span>
              <strong>College football analytics built in public and refined all season.</strong>
            </div>
            <nav className="nav">
              {navGroups.map(group => (
                <div className="nav-group" key={group.label}>
                  <span>{group.label}</span>
                  {group.links.map(([label, href]) => (
                    <Link key={href} href={href}>{label}</Link>
                  ))}
                </div>
              ))}
            </nav>
          </aside>
          <main className="main">
            <div className="main-glow" />
            <div className="main-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
