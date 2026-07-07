import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Phillips-David Model',
  description: 'College football ratings, projections, and backtesting command center.'
};

const navGroups = [
  {
    label: 'Model',
    links: [
      ['Command Center', '/'],
      ['Power Ratings', '/ratings'],
      ['Matchup Lab', '/predict'],
      ['Game Board', '/games']
    ]
  },
  {
    label: 'Engine Room',
    links: [
      ['Formula Studio', '/formula'],
      ['Coach Inputs', '/coaches'],
      ['Optimizer', '/optimizer']
    ]
  },
  {
    label: 'Validation',
    links: [
      ['Backtest Summary', '/backtest'],
      ['Game Results', '/backtest-results']
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
              <span>Live Model</span>
              <strong>Ratings, predictions, and validation in one workspace.</strong>
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
