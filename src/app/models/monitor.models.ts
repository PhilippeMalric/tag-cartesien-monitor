// Types globaux pour le monitor + alias d'observables

import { Observable } from 'rxjs';

export type GameMode = 'classic' | 'transmission' | 'infection';
export type RoomState = 'idle' | 'running' | 'stopped';
export type Role =
  | 'hunter' | 'runner' | 'bot'   // anglais (legacy monitor)
  | 'chasseur' | 'chassé';         // français (legacy play)

// Normalisation simple pour les actions d'admin (monitor-actions)
export type RoleSimple = 'hunter' | 'prey';

export interface RoomDoc {
  id?: string;
  ownerUid?: string;
  state?: RoomState | 'in-progress';
  mode?: GameMode | string;
  roles?: Record<string, Role | undefined>;
  lastEventAt?: any;  // Firestore Timestamp | Date | number
  updatedAt?: any;
  name?: string;
  // autres champs éventuels...
}

export interface EventItem {
  id?: string;
  type?: string; // 'tag', ...
  at?: any;      // Firestore Timestamp | Date | number
  // payload additionnel...
}

export interface PlayerDoc {
  uid?: string;
  displayName?: string;
  role?: Role;
  ready?: boolean;
  score?: number;
  spawn?: { x: number; y: number };
}

export interface PosDTO {
  uid?: string;
  x: number;
  y: number;
  role?: Role;
}

export interface DailyStats {
  tagsTotal: number;
  roomsTotal: number;
  roomsRunning: number;
  roomsIdle: number;
  lastEventAt?: any;
}

// Flux alias pratiques
export type RoomsStream     = Observable<RoomDoc[]>;
export type RoomStream      = Observable<RoomDoc | null>;
export type PlayersStream   = Observable<PlayerDoc[]>;
export type EventsStream    = Observable<EventItem[]>;
export type PositionsStream = Observable<PosDTO[]>;
export type LiveMapStream   = Observable<PosDTO[]>;

// Actions
export type CreateRoomResult = { roomId: string; name: string; ownerUid: string; guestUid?: string };
export type AddPlayerInput   = { uid?: string; displayName: string; role?: RoleSimple };
