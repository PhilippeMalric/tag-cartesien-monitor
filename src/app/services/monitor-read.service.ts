import { Injectable, inject } from '@angular/core';
import {
  Firestore, CollectionReference,
  collection, collectionData, collectionGroup,
  doc, docData, query, orderBy, where,
  limit as qLimit, deleteDoc,
  onSnapshot, getDocs, startAfter,
  DocumentData, QueryDocumentSnapshot
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

import type { RoomDoc, PlayerDoc, EventItem, Role, Position } from '@tag/types';
import type { DailyStats } from '../models/monitor.models';
import { RoomItem } from '../pages/rooms/rooms.component';

// ---------- Types locaux (streams + DTO joueur avec uid injecté) ----------
type RoomWithId = RoomDoc & { id: string };

export type PlayerX = PlayerDoc & {
  uid: string;
  role?: Role;
  ready?: boolean;
  spawn?: Position;
  score?: number; 
};

export type RoomsStream   = Observable<RoomItem[]>;
export type RoomStream    = Observable<RoomWithId | null>;
export type PlayersStream = Observable<PlayerX[]>;
export type EventsStream  = Observable<EventItem[]>;

function toEventItem(id: string, data: Record<string, unknown>): EventItem | null {
  // Récupère un timestamp valide (ts | at | createdAt)
  const ts = (data['ts'] ?? data['at'] ?? data['createdAt']) as unknown;

  // Champs minimums requis
  const type = data['type'];
  const roomId = data['roomId'];

  if (typeof type === 'string' && typeof roomId === 'string' && ts != null) {
    // Complète ts si absent, et renvoie un EventItem
    const ev: any = { id, ...data };
    if (ev.ts == null) ev.ts = ts;
    return ev as EventItem;
  }
  return null; // doc incomplet → on l’ignore
}

@Injectable({ providedIn: 'root' })
export class MonitorReadService {
  private fs = inject(Firestore);

  // ---------------------------------------------------------------------------
  // ROOMS
  // ---------------------------------------------------------------------------
readonly rooms$: RoomsStream =
  collectionData<DocumentData>(
    collection(this.fs, 'rooms'),
    { idField: 'id' }
  ).pipe(
    map(list => (list ?? []).map(d => d as RoomWithId)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  room$(roomId: string): RoomStream {
    const d = doc(this.fs, 'rooms', roomId);
    return docData(d, { idField: 'id' }).pipe(
      map((r: unknown) => (r ?? null) as RoomWithId | null),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  // ---------------------------------------------------------------------------
  // PLAYERS
  // ---------------------------------------------------------------------------
players$(roomId: string): PlayersStream {
  const col = collection(this.fs, 'rooms', roomId, 'players') as CollectionReference<DocumentData>;
  return collectionData<DocumentData>(col, { idField: 'uid' }).pipe(
    map(list =>
      (list ?? []).map(d => d as unknown as PlayerX) // PlayerDoc + { uid } (+ ready?/role?)
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );
}

  // ---------------------------------------------------------------------------
  // EVENTS (flux simples – tri côté client)
  // ---------------------------------------------------------------------------
  events$(roomId: string, limit = 50): EventsStream {
    const col = collection(this.fs, 'rooms', roomId, 'events') as CollectionReference<EventItem>;
    // Pas d'orderBy Firestore (mix 'ts'/'at'), on trie côté client
    return collectionData(col, { idField: 'id' }).pipe(
      map(raw => {
        const arr = (raw ?? []) as EventItem[];
        arr.sort((a, b) => toMs(b) - toMs(a)); // desc par ts/at/createdAt
        return arr.slice(0, limit);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  // Derniers événements globaux (monitor)
  readonly latestEvents$: EventsStream = (() => {
    const cg = collectionGroup(this.fs, 'events');
    // Tri par 'ts' si présent (le code client retombe sur 'at' via toMs)
    const qy = query(cg, orderBy('ts', 'desc'), qLimit(100));
    return collectionData(qy, { idField: 'id' }).pipe(
      map(list => (list ?? []) as EventItem[]),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  })();

  eventsRaw$(roomId: string) {
    const col = collection(this.fs, 'rooms', roomId, 'events');
    return collectionData(col, { idField: 'id' });
  }

  // ---------------------------------------------------------------------------
  // EVENTS – Live + pagination (room & global)
  // ---------------------------------------------------------------------------

  /** Gestion des écoutes par roomId (live + pagination) */
  private roomFeeds = new Map<string, {
    subject: BehaviorSubject<EventItem[]>;
    lastDoc: QueryDocumentSnapshot<DocumentData> | null;
    unsubscribe: (() => void) | null;
  }>();

  /** Écoute en live des N derniers events d’une room (ordre desc par 'at') */
  listenRoomEvents(roomId: string, limit = 50): Observable<EventItem[]> {
    // reset si une écoute existe
    this.stopRoomEvents(roomId);

    const subject = new BehaviorSubject<EventItem[]>([]);
    let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;

    const col = collection(this.fs, 'rooms', roomId, 'events');
    const qy  = query(col, orderBy('at', 'desc'), qLimit(limit));

    const unsubscribe = onSnapshot(qy, (snap) => {
  const list: EventItem[] = [];
  snap.forEach(d => {
    const e = toEventItem(d.id, d.data() as Record<string, unknown>);
    if (e) list.push(e);
  });
  subject.next(list);
  lastDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
});

    this.roomFeeds.set(roomId, { subject, lastDoc, unsubscribe });
    return subject.asObservable();
  }

  /** Charge la page suivante pour une room (concatène) */
async loadMoreRoomEvents(roomId: string, limit = 50): Promise<void> {
  const feed = this.roomFeeds.get(roomId);
  if (!feed || !feed.lastDoc) return;

  const col = collection(this.fs, 'rooms', roomId, 'events');
  const qy  = query(col, orderBy('at', 'desc'), startAfter(feed.lastDoc), qLimit(limit));
  const snap = await getDocs(qy);

  const more = snap.docs
    .map(d => toEventItem(d.id, d.data() as Record<string, unknown>))
    .filter((e): e is EventItem => e !== null);

  if (more.length) {
    feed.subject.next([...feed.subject.value, ...more]);
    feed.lastDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : feed.lastDoc;
  }
}

  /** Stoppe l’écoute live d’une room */
  stopRoomEvents(roomId: string): void {
    const feed = this.roomFeeds.get(roomId);
    if (feed) {
      try { feed.unsubscribe?.(); } catch {}
      this.roomFeeds.delete(roomId);
    }
  }

  /** Stoppe toutes les écoutes room */
  stopAllRoomEvents(): void {
    for (const k of Array.from(this.roomFeeds.keys())) this.stopRoomEvents(k);
  }

  // ---------- GLOBAL (collectionGroup) : live + pagination ----------

  private globalFeed: {
    subject: BehaviorSubject<EventItem[]>;
    lastDoc: QueryDocumentSnapshot<DocumentData> | null;
    unsubscribe: (() => void) | null;
  } | null = null;

  /** Écoute globale live (toutes rooms) – événements triés par 'at' desc */
  listenLatestGlobalEvents(limit = 100): Observable<EventItem[]> {
    this.stopLatestGlobalEvents(); // reset

    const subject = new BehaviorSubject<EventItem[]>([]);
    let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;

    const cg = collectionGroup(this.fs, 'events');
    const qy = query(cg, orderBy('at', 'desc'), qLimit(limit));

   const unsubscribe = onSnapshot(qy, (snap) => {
      const list: EventItem[] = [];
      snap.forEach(d => {
        const data = d.data() as Record<string, unknown>;
        const ts = (data['ts'] ?? data['at'] ?? data['createdAt']) as unknown;
        const type = data['type'];
        const roomId = data['roomId'];
        if (typeof type === 'string' && typeof roomId === 'string' && ts != null) {
          const ev: any = { id: d.id, ...data };
          if (ev.ts == null) ev.ts = ts; // s'assure qu'on a toujours 'ts'
          list.push(ev as EventItem);
        }
        // sinon on ignore le doc incomplet
      });
      subject.next(list);
      lastDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : null;
    });


    this.globalFeed = { subject, lastDoc, unsubscribe };
    return subject.asObservable();
  }

  /** Pagination globale (collectionGroup) */
    async loadMoreLatestGlobalEvents(limit = 100): Promise<void> {
      if (!this.globalFeed || !this.globalFeed.lastDoc) return;

      const cg  = collectionGroup(this.fs, 'events');
      const qy  = query(cg, orderBy('at', 'desc'), startAfter(this.globalFeed.lastDoc), qLimit(limit));
      const snap = await getDocs(qy);

      const more: EventItem[] = [];
      snap.forEach(d => {
        const data = d.data() as Record<string, unknown>;
        const ts = (data['ts'] ?? data['at'] ?? data['createdAt']) as unknown;
        const type = data['type'];
        const roomId = data['roomId'];

        if (typeof type === 'string' && typeof roomId === 'string' && ts != null) {
          const ev: any = { id: d.id, ...data };
          if (ev.ts == null) ev.ts = ts; // normalise: toujours un 'ts'
          more.push(ev as EventItem);
        }
        // sinon: doc incomplet → ignoré
      });

      if (more.length) {
        this.globalFeed.subject.next([...this.globalFeed.subject.value, ...more]);
        this.globalFeed.lastDoc = snap.docs.length ? snap.docs[snap.docs.length - 1] : this.globalFeed.lastDoc;
      }
    }


  /** Stoppe l’écoute globale live */
  stopLatestGlobalEvents(): void {
    if (this.globalFeed) {
      try { this.globalFeed.unsubscribe?.(); } catch {}
      this.globalFeed = null;
    }
  }

  // ---------------------------------------------------------------------------
  // STATS JOURNALIÈRES
  // ---------------------------------------------------------------------------
  readonly dailyStats$ = (() => {
    const start = startOfTodayLocal();
    const end   = startOfTomorrowLocal();

    const eventsToday$ = (() => {
      const cg = collectionGroup(this.fs, 'events');
      // IMPORTANT : type 'tag/hit' (et non 'tag')
      const qy = query(
        cg,
        where('type', '==', 'tag/hit'),
        where('at', '>=', start),
        where('at', '<',  end),
      );
      return collectionData(qy, { idField: 'id' }).pipe(
        map(list => list?.length ?? 0),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    })();

    const roomsInfo$ = this.rooms$.pipe(
      map((rooms) => {
        const roomsTotal   = rooms.length;
        const roomsRunning = rooms.filter(r => r.state === 'running').length;
        const roomsIdle    = rooms.filter(r => r.state === 'idle').length;

        let lastEventAt: unknown | undefined = undefined;
        for (const r of rooms) {
          const v = (r as any)?.lastEventAt;
          if (!v) continue;
          if (!lastEventAt) { lastEventAt = v; continue; }
          const a = (v?.toMillis ? v.toMillis() : new Date(v).getTime?.()) ?? 0;
          const b = ((lastEventAt as any)?.toMillis ? (lastEventAt as any).toMillis() : new Date(lastEventAt as any).getTime?.()) ?? 0;
          if (a > b) lastEventAt = v;
        }
        return { roomsTotal, roomsRunning, roomsIdle, lastEventAt };
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

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

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------
  deleteRoom(roomId: string): Promise<void> {
    return deleteDoc(doc(this.fs, 'rooms', roomId));
  }

  roleDictFromRoom(room: RoomDoc | null | undefined) {
    const dict: Record<string, string> = {};
    if (!room) return dict;
    if (room.roles) {
      for (const [uid, r] of Object.entries(room.roles)) {
        if (r) dict[uid] = r;
      }
    }
    const anyRoom = room as any;
    if (anyRoom?.hunterUid) dict[anyRoom.hunterUid] = 'hunter';
    return dict;
  }

  enrichPositionsWithRoles(
    positions: Array<{ uid?: string; x: number; y: number }>,
    roleDict: Record<string, string | undefined>,
    players: PlayerDoc[] = []
  ) {
    if (!positions?.length) return [];
    const fallback: Record<string, string> = {};
    for (const p of players) {
      // si ton PlayerDoc inclut role/uid en base
      const uid = (p as any)?.uid as string | undefined;
      const role = (p as any)?.role as string | undefined;
      if (uid && role && !roleDict[uid]) fallback[uid] = role;
    }
    return positions.map(p => {
      const role = (p.uid && (roleDict[p.uid] || fallback[p.uid])) ?? undefined;
      return role ? { ...p, role } : p;
    });
  }
}

// Helpers dates & tri
function startOfTodayLocal(): Date { const d = new Date(); d.setHours(0,0,0,0); return d; }
function startOfTomorrowLocal(): Date { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(0,0,0,0); return d; }
function toMs(ev: any): number {
  const v = ev?.at ?? ev?.ts ?? ev?.createdAt ?? null;
  if (!v) return 0;
  if (v?.toMillis) return v.toMillis();             // Firestore Timestamp
  if (v instanceof Date) return v.getTime?.() ?? 0; // Date
  if (typeof v === 'number') return v;              // ms
  const t = new Date(v as any).getTime?.();         // ISO string
  return Number.isFinite(t) ? (t as number) : 0;
}
