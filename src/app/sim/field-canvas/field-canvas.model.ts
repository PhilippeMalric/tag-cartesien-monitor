// Types & interfaces partagés

export type World = { minX: number; maxX: number; minY: number; maxY: number };

export type RoleNorm = 'hunter' | 'prey' | null;

export type Marker = {
  id: string;
  x: number;
  y: number;
  role?: string | null;  // 'hunter'|'chasseur'|'prey'|'chassé'|autre
  isBot: boolean;        // carré si true, cercle sinon
};
