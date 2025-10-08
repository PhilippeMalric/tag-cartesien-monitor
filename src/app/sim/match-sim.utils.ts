// src/app/sim/match-sim.utils.ts
export function displayMs(v: number | null): string {
  return `${v ?? 0} ms`;
}

export function fmtTime(ms?: number | null): string {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function normalizeRole(role: string): 'hunter' | 'chasseur' | 'prey' | 'proie' {
  const r = (role ?? '').toLowerCase().trim();
  if (r === 'hunter' || r === 'chasseur') return r as any;
  if (r === 'prey' || r === 'proie') return r as any;
  return 'prey';
}
