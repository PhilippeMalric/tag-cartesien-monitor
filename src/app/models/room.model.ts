export type GameMode = 'classic' | 'transmission' | 'infection';
export type RoomState = 'idle' | 'running' | 'ended';

export interface RoomDoc {
  status: RoomState;
  mode: GameMode;
  playerUids?: string[];
  hunterUids?: string[];
  roles?: Record<string, 'hunter'|'runner'>;
  lastEventAt?: any;         // Timestamp on backend
  roundEndAtMs?: number;
  timeLimit?: number;
}
