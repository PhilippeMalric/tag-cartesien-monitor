// src/app/sim/match-sim.types.ts
export type BotLocal = { id: string; x: number; y: number; h: number | null };
export type DotDTO = { x: number; y: number; uid?: string };

// Facilité pour la barre d'état
export type MatchStatusState = 'idle' | 'running' | 'ended' | 'done';
export interface MatchStatusVM {
  state: MatchStatusState;
  label: 'Préparation' | 'En cours' | 'Terminée';
  color: 'primary' | 'accent' | 'warn';
  elapsedMs: number | null;
  leftMs: number | null;
  progress01: number | null;
}
