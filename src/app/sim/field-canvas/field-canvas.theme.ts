import type { RoleNorm } from './field-canvas.model';

export const COLORS = {
  bg:   '#10151c',
  grid: '#223043',
  axes: '#8fa3bf',
  ticks:'#9fb0c8',
  label:'#c7d7ef',
  role: {
    hunter: '#ff9800', // orange
    prey:   '#6aa0ff', // bleu
    neutral:'#b0b9c6', // gris
  }
} as const;

export function normalizeRole(r?: string | null): RoleNorm {
  if (!r) return null;
  const v = r.toLowerCase();
  if (v === 'hunter' || v === 'chasseur') return 'hunter';
  if (v === 'prey'   || v === 'chassé')   return 'prey';
  return null;
}

export function colorForRole(r?: string | null): { point: string } {
  const nr = normalizeRole(r);
  if (nr === 'hunter') return { point: COLORS.role.hunter };
  if (nr === 'prey')   return { point: COLORS.role.prey };
  return { point: COLORS.role.neutral };
}
