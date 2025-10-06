import { Injectable, inject } from '@angular/core';
import {
  Firestore, CollectionReference, collection, collectionData, collectionGroup,
  doc, docData, query, orderBy, where, limit as qLimit, deleteDoc
} from '@angular/fire/firestore';
import { combineLatest, map, shareReplay } from 'rxjs';

import {
  DailyStats, EventItem, EventsStream, RoomDoc, RoomStream,
  RoomsStream, PlayersStream, PlayerDoc
} from '../models/monitor.models';

@Injectable({ providedIn: 'root' })
export class MonitorReadService {
  private fs = inject(Firestore);

  // --- ROOMS ---------------------------------------------------------
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

  // --- PLAYERS -------------------------------------------------------
  players$(roomId: string): PlayersStream {
    const col = collection(this.fs, 'rooms', roomId, 'players') as CollectionReference<PlayerDoc>;
    return collectionData(col, { idField: 'uid' }).pipe(
      map(list => list ?? []),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  // --- EVENTS --------------------------------------------------------
  events$(roomId: string, limit = 50): EventsStream {
    const col = collection(this.fs, 'rooms', roomId, 'events') as CollectionReference<EventItem>;
    const qy = query(col, orderBy('at', 'desc'), qLimit(limit));
    return collectionData(qy, { idField: 'id' }).pipe(
      map(list => list ?? []),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  // Derniers événements globaux (monitor)
  readonly latestEvents$: EventsStream = (() => {
    const cg = collectionGroup(this.fs, 'events');
    const qy = query(cg, orderBy('at', 'desc'), qLimit(100));
    return collectionData(qy, { idField: 'id' }).pipe(
      map(list => (list ?? []) as EventItem[]),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  })();

  // --- STATS JOURNALIÈRES -------------------------------------------
  readonly dailyStats$ = (() => {
    const start = startOfTodayLocal();
    const end   = startOfTomorrowLocal();

    const eventsToday$ = (() => {
      const cg = collectionGroup(this.fs, 'events');
      const qy = query(cg,
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

  // --- HELPERS -------------------------------------------------------
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

  enrichPositionsWithRoles(positions: Array<{uid?: string; x: number; y: number}>,
                           roleDict: Record<string, string | undefined>,
                           players: PlayerDoc[] = []) {
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
