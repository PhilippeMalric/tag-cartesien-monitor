// src/app/services/monitor.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  CollectionReference,
  collection,
  collectionData,
  collectionGroup,
  doc,
  docData,
  query,
  orderBy,
  where,
  limit as qLimit,
  deleteDoc,
} from '@angular/fire/firestore';
import {
  Database,
  ref as rtdbRef,
} from '@angular/fire/database';
import { objectVal } from 'rxfire/database';
import {
  Observable,
  map,
  shareReplay,
  combineLatest,
} from 'rxjs';

// --- Modèles (adapte/importe tes vrais types si déjà définis) ---
export type GameMode = 'classic' | 'transmission' | 'infection';
export type RoomState = 'idle' | 'running' | 'stopped';
export type Role = 'hunter' | 'runner' | 'bot' | 'chasseur' | 'chassé';

export interface RoomDoc {
  id?: string;
  ownerUid?: string;
  state?: RoomState | 'in-progress';
  mode?: GameMode | string;
  roles?: Record<string, Role | undefined>;
  lastEventAt?: any; // Firestore Timestamp | Date | number
  updatedAt?: any;
  // ... autres champs si besoin
}

export interface EventItem {
  id?: string;
  type?: string; // ex: 'tag'
  at?: any;      // Firestore Timestamp | Date | number
  // ... payloads éventuels
}

export interface PlayerDoc {
  uid?: string;
  displayName?: string;
  role?: Role;
  ready?: boolean;
  score?: number;
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

// --- Utils ---
const isDefined = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

// Alias de flux
type RoomsStream     = Observable<RoomDoc[]>;
type RoomStream      = Observable<RoomDoc | null>;
type PlayersStream   = Observable<PlayerDoc[]>;
type EventsStream    = Observable<EventItem[]>;
type PositionsStream = Observable<PosDTO[]>;
type LiveMapStream   = Observable<PosDTO[]>;

@Injectable({ providedIn: 'root' })
export class MonitorService {
  private fs = inject(Firestore);
  private rtdb = inject(Database);

  // Caches (évite de recréer les Observables)
  private _roomCache: Map<string, RoomStream> = new Map();
  private _playersCache: Map<string, PlayersStream> = new Map();
  private _eventsCache: Map<string, EventsStream> = new Map();
  private _positionsCache: Map<string, PositionsStream> = new Map();
  private _liveMapCache: Map<string, LiveMapStream> = new Map();

  // --- 1) ROOMS ---------------------------------------------------------------
  readonly rooms$: RoomsStream = (() => {
    const col = collection(this.fs, 'rooms') as CollectionReference<RoomDoc>;
    return collectionData(col, { idField: 'id' }).pipe(
      map(list => list ?? []),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  })();

  // Derniers événements globaux (monitor)
  readonly latestEvents$: EventsStream = (() => {
    const cg = collectionGroup(this.fs, 'events');
    const qy = query(cg, orderBy('at', 'desc'), qLimit(100));
    return collectionData(qy, { idField: 'id' }).pipe(
      map(list => (list ?? []) as EventItem[]),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  })();

  // Room par id (nullable si doc absent)
  room$(roomId: string): RoomStream {
    const cached = this._roomCache.get(roomId);
    if (cached) return cached;

    const d = doc(this.fs, 'rooms', roomId);
    const stream = docData(d, { idField: 'id' }).pipe(
      map((r: any) => (r ?? null) as RoomDoc | null),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this._roomCache.set(roomId, stream);
    return stream;
  }

  // --- 2) PLAYERS & EVENTS ----------------------------------------------------
  players$(roomId: string): PlayersStream {
    const cached = this._playersCache.get(roomId);
    if (cached) return cached;

    const col = collection(this.fs, 'rooms', roomId, 'players') as CollectionReference<PlayerDoc>;
    const stream = collectionData(col, { idField: 'uid' }).pipe(
      map(list => list ?? []),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this._playersCache.set(roomId, stream);
    return stream;
  }

  events$(roomId: string, limit = 50): EventsStream {
    const key = `${roomId}#${limit}`;
    const cached = this._eventsCache.get(key);
    if (cached) return cached;

    const col = collection(this.fs, 'rooms', roomId, 'events') as CollectionReference<EventItem>;
    const qy = query(col, orderBy('at', 'desc'), qLimit(limit));
    const stream = collectionData(qy, { idField: 'id' }).pipe(
      map(list => list ?? []),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this._eventsCache.set(key, stream);
    return stream;
  }

  // --- 3) POSITIONS (RTDB) ----------------------------------------------------
  positions$(roomId: string): PositionsStream {
    const cached = this._positionsCache.get(roomId);
    if (cached) return cached;

    const ref = rtdbRef(this.rtdb, `positions/${roomId}`);
    const stream = objectVal<Record<string, { x: number; y: number }> | null>(ref).pipe(
      map(obj => {
        if (!obj) return [] as PosDTO[];
        return Object.entries(obj)
          .filter(([, v]) => isDefined(v) && isFinite(v.x) && isFinite(v.y))
          .map(([uid, v]) => ({ uid, x: v.x, y: v.y } as PosDTO));
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this._positionsCache.set(roomId, stream);
    return stream;
  }

  // --- 4) VUE ENRICHIE (ex: pour un canvas) -----------------------------------
  liveMap$(roomId: string): LiveMapStream {
    const cached = this._liveMapCache.get(roomId);
    if (cached) return cached;

    // Pour l’instant = positions$ direct ; tu peux enrichir dans le composant
    const stream = this.positions$(roomId).pipe(
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this._liveMapCache.set(roomId, stream);
    return stream;
  }

  // --- 5) HELPERS -------------------------------------------------------------
  /** Dictionnaire uid -> role (priorité aux roles de room, fallback sur hunterUid si présent) */
  roleDictFromRoom(room: RoomDoc | null | undefined) {
    const dict: Record<string, Role> = {};
    if (!room) return dict;
    if (room.roles) {
      for (const [uid, r] of Object.entries(room.roles)) {
        if (r) dict[uid] = r;
      }
    }
    // Compat si tu as encore un champ historique:
    const anyRoom = room as any;
    if (anyRoom?.hunterUid) dict[anyRoom.hunterUid] = 'hunter';
    return dict;
  }

  /** Map positions + rôles (optionnel si tu préfères le faire côté composant) */
  enrichPositionsWithRoles(
    positions: PosDTO[],
    roleDict: Record<string, Role | undefined>,
    players: PlayerDoc[] = []
  ): PosDTO[] {
    if (!positions?.length) return [];
    const fallback: Record<string, Role> = {};
    for (const p of players) {
      if (p.uid && p.role && !roleDict[p.uid]) fallback[p.uid] = p.role;
    }
    return positions.map(p => {
      const role = (p.uid && (roleDict[p.uid] || fallback[p.uid])) ?? undefined;
      return role ? { ...p, role } : p;
    });
  }

  /** Stats agrégées de la journée courante (heure locale) */
  readonly dailyStats$: Observable<DailyStats> = (() => {
    const start = startOfTodayLocal();
    const end   = startOfTomorrowLocal();

    // a) Nombre d’événements "tag" aujourd’hui (via collectionGroup)
    const eventsToday$ = (() => {
      const cg = collectionGroup(this.fs, 'events');
      const qy = query(
        cg,
        where('type', '==', 'tag'),
        where('at', '>=', start),
        where('at', '<',  end),
      );
      return collectionData(qy, { idField: 'id' }).pipe(
        map(list => list?.length ?? 0),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    })();

    // b) Infos rooms (totales / running / idle) + lastEventAt(max)
    const roomsInfo$ = this.rooms$.pipe(
      map((rooms) => {
        const roomsTotal   = rooms.length;
        const roomsRunning = rooms.filter(r => r.state === 'running').length;
        const roomsIdle    = rooms.filter(r => r.state === 'idle').length;

        let lastEventAt: any | undefined = undefined;
        for (const r of rooms) {
          const v = (r as any)?.lastEventAt;
          if (!v) continue;
          if (!lastEventAt) { lastEventAt = v; continue; }
          const a = v?.toMillis ? v.toMillis() : new Date(v).getTime?.();
          const b = lastEventAt?.toMillis ? lastEventAt.toMillis() : new Date(lastEventAt).getTime?.();
          if ((a ?? 0) > (b ?? 0)) lastEventAt = v;
        }

        return { roomsTotal, roomsRunning, roomsIdle, lastEventAt };
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // c) Combine → DailyStats
    return combineLatest([eventsToday$, roomsInfo$]).pipe(
      map(([tagsTotal, r]) => ({
        tagsTotal,
        roomsTotal:   r.roomsTotal,
        roomsRunning: r.roomsRunning,
        roomsIdle:    r.roomsIdle,
        lastEventAt:  r.lastEventAt,
      }) as DailyStats),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  })();

  /** Alias (compat) */
  roomById$(roomId: string): RoomStream {
    return this.room$(roomId);
  }

  /** Suppression de room (attention aux sous-collections côté règles/Cloud Functions) */
  async deleteRoom(roomId: string): Promise<void> {
    await deleteDoc(doc(this.fs, 'rooms', roomId));
  }
}

// --- Helpers date locales (minuit → minuit+1) ---
function startOfTodayLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfTomorrowLocal(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
