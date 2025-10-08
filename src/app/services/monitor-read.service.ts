import { Injectable, inject } from '@angular/core';
import {
  Firestore, CollectionReference,
  collection, collectionData, collectionGroup,
  doc, docData, query, orderBy, where,
  limit as qLimit, deleteDoc,
  // Ajouts pour live+pagination
  onSnapshot, getDocs, startAfter,
  DocumentData, QueryDocumentSnapshot
} from '@angular/fire/firestore';
import { BehaviorSubject, Observable, combineLatest, map, shareReplay } from 'rxjs';

import {
  DailyStats, EventItem, EventsStream, RoomDoc, RoomStream,
  RoomsStream, PlayersStream, PlayerDoc
} from '../models/monitor.models';

@Injectable({ providedIn: 'root' })
export class MonitorReadService {
  private fs = inject(Firestore);

  // ---------------------------------------------------------------------------
  // ROOMS
  // ---------------------------------------------------------------------------
  readonly rooms$: RoomsStream = (() => {
    const col = collection(this.fs, 'rooms') as CollectionReference<RoomDoc>;
    return collectionData(col, { idField: 'id' }).pipe(
      map(list => list ?? []),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  })();

  room$(roomId: string): RoomStream {
    const d = doc(this.fs, 'rooms', roomId);
    return docData(d, { idField: 'id' }).pipe(
      map((r: any) => (r ?? null) as RoomDoc | null),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  // ---------------------------------------------------------------------------
  // PLAYERS
  // ---------------------------------------------------------------------------
  players$(roomId: string): PlayersStream {
    const col = collection(this.fs, 'rooms', roomId, 'players') as CollectionReference<PlayerDoc>;
    return collectionData(col, { idField: 'uid' }).pipe(
      map(list => list ?? []),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  // ---------------------------------------------------------------------------
  // EVENTS (flux simples – comme tu avais)
  // ---------------------------------------------------------------------------
  events$(roomId: string, limit = 50): EventsStream {
    const col = collection(this.fs, 'rooms', roomId, 'events') as CollectionReference<EventItem>;
    // Pas d'orderBy Firestore → on trie côté client
    return collectionData(col, { idField: 'id' }).pipe(
      map(list => {
        const arr = (list ?? []) as EventItem[];
        // tri desc par (at || ts || createdAt || 0)
        arr.sort((a, b) => toMs(b) - toMs(a));
        return arr.slice(0, limit);
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }


// Derniers événements globaux (monitor)
readonly latestEvents$: EventsStream = (() => {
  const cg = collectionGroup(this.fs, 'events');
  // change 'at' -> 'ts'
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
  // EVENTS – Version "bonifiée" : écoute live + pagination (room & global)
  // ---------------------------------------------------------------------------

  /** Gestion des écoutes par roomId (live + pagination) */
  private roomFeeds = new Map<string, {
    subject: BehaviorSubject<EventItem[]>;
    lastDoc: QueryDocumentSnapshot<DocumentData> | null;
    unsubscribe: (() => void) | null;
  }>();

  /** Écoute en live des N derniers events d’une room (ordre desc par 'at') */
  listenRoomEvents(roomId: string, limit = 50): Observable<EventItem[]> {
    // Recrée l’écoute si elle existe déjà (reset)
    this.stopRoomEvents(roomId);

    const subject = new BehaviorSubject<EventItem[]>([]);
    let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;

    const col = collection(this.fs, 'rooms', roomId, 'events');
    const qy  = query(col, orderBy('at', 'desc'), qLimit(limit));

    const unsubscribe = onSnapshot(qy, (snap) => {
      const list: EventItem[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as any) }));
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

    const more: EventItem[] = [];
    snap.forEach(d => more.push({ id: d.id, ...(d.data() as any) }));

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
    this.stopLatestGlobalEvents(); // reset propre

    const subject = new BehaviorSubject<EventItem[]>([]);
    let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;

    const cg = collectionGroup(this.fs, 'events');
    const qy = query(cg, orderBy('at', 'desc'), qLimit(limit));

    const unsubscribe = onSnapshot(qy, (snap) => {
      const list: EventItem[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as any) }));
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
    snap.forEach(d => more.push({ id: d.id, ...(d.data() as any) }));

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
    positions: Array<{uid?: string; x: number; y: number}>,
    roleDict: Record<string, string | undefined>,
    players: PlayerDoc[] = []
  ) {
    if (!positions?.length) return [];
    const fallback: Record<string, string> = {};
    for (const p of players) {
      if (p.uid && p.role && !roleDict[p.uid]) fallback[p.uid] = p.role;
    }
    return positions.map(p => {
      const role = (p.uid && (roleDict[p.uid] || fallback[p.uid])) ?? undefined;
      return role ? { ...p, role } : p;
    });
  }
}

// Helpers dates locales
function startOfTodayLocal(): Date { const d = new Date(); d.setHours(0,0,0,0); return d; }
function startOfTomorrowLocal(): Date { const d = new Date(); d.setDate(d.getDate()+1); d.setHours(0,0,0,0); return d; }
function toMs(ev: any): number {
  const v = ev?.at ?? ev?.ts ?? ev?.createdAt ?? null;
  if (!v) return 0;
  // Firestore Timestamp
  if (v?.toMillis) return v.toMillis();
  // Date
  if (v instanceof Date) return v.getTime?.() ?? 0;
  // number (ms)
  if (typeof v === 'number') return v;
  // string ISO
  const t = new Date(v as any).getTime?.();
  return Number.isFinite(t) ? (t as number) : 0;
}