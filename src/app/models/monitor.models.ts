import { Position, Role } from '@tag/types';

import type { EventType } from '@tag/types';
import { Observable } from 'rxjs';

export type {
  GameMode,
  Role,
  RoomDoc,
  PlayerDoc,
  Position,
  EventItem,
} from '@tag/types';

// DTO d’affichage si tu en as besoin dans l’UI
export type PosDTO = Position & { uid?: string; role?: Role };

export interface DailyStats {
  /** Nombre total de tags (type 'tag/hit') sur la journée. */
  tagsTotal: number;

  /** Nombre total de rooms, en cours, et à l'arrêt. */
  roomsTotal: number;
  roomsRunning: number;
  roomsIdle: number;

  /** Horodatage du dernier événement observé (Timestamp/Date/ISO/ms). */
  lastEventAt?: unknown;

  /** (Optionnel) Détail par type d’événement si tu veux l’ajouter plus tard. */
  byType?: Partial<Record<EventType, number>>;

  /** (Optionnel) Total agrégé tous types. */
  total?: number;
}


export type LiveMapPoint = Position & { uid?: string; role?: Role };
export type LiveMapSnapshot = LiveMapPoint[];
export type LiveMapStream = Observable<LiveMapSnapshot>;

// Types utilitaires pour les actions/returns
export type RoleSimple = 'hunter' | 'prey';

export interface CreateRoomResult {
  roomId: string;
  name: string;
  ownerUid: string;
  guestUid: string;
}