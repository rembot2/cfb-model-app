type BarItem = {
  name: string;
  value: number;
  suffix?: string;
};

export function BarList({ items }: { items: BarItem[] }) {
  const max = Math.max(1, ...items.map(item => item.value || 0));
  return (
    <div className="bar-list">
      {items.length ? items.map(item => (
        <div className="bar-row" key={item.name}>
          <div className="bar-name" title={item.name}>{item.name}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
          </div>
          <div className="bar-value">{format(item.value)}{item.suffix ?? ''}</div>
        </div>
      )) : <div className="muted">No data loaded</div>}
    </div>
  );
}

function format(value: number) {
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/\.00$/, '');
}
