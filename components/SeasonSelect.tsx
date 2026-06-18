'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function SeasonSelect({ seasons, selected }: { seasons: number[]; selected: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectSeason(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('season', value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="season-picker">
      <span>Season</span>
      <select
        aria-label="Select ratings season"
        value={selected ?? ''}
        onChange={event => selectSeason(event.target.value)}
      >
        {seasons.map(season => (
          <option key={season} value={season}>{season}</option>
        ))}
      </select>
    </label>
  );
}
