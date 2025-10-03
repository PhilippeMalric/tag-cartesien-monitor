// src/app/services/monitor.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, collectionData, collectionGroup,
} from '@angular/fire/firestore';
import { map, Observable } from 'rxjs';
import { RoomDoc, RoomVM } from '../models/room.model';
import { query, orderBy, limit } from 'firebase/firestore'; // 👈 important

function toJsDate(ts: any | undefined): Date | null {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  return null;
}

function deriveUidsFromRoles(roles: any): string[] {
  if (!Array.isArray(roles)) return [];
  const out: string[] = [];
  for (const it of roles) {
    if (!it) continue;
    if (typeof it === 'string') out.push(it);
    else if (typeof it === 'object') {
      if (typeof it.uid === 'string') out.push(it.uid);
      else if (typeof it.userId === 'string') out.push(it.userId);
      else if (typeof it.id === 'string') out.push(it.id);
    }
  }
  return Array.from(new Set(out));
}

export interface DailyStats {
  tagsTotal?: number;
}

export interface TagEventVM {
  id: string;
  roomId?: string;
  hunterUid?: string;
  victimUid?: string;
  x?: number;
  y?: number;
  ts?: Date | null;
}

@Injectable({ providedIn: 'root' })
export class MonitorService {
  private fs = inject(Firestore);

  /** Toutes les rooms mappées en VM pour l’UI */
  readonly rooms$: Observable<RoomVM[]> = collectionData(
    collection(this.fs, 'rooms'),
    { idField: 'id' }
  ).pipe(
    map(rows =>
      (rows as (RoomDoc & { id: string })[]).map((r) => {
        const lastEventAt =
          toJsDate((r as any).lastEventAt) ??
          toJsDate(r.updatedAt) ??
          toJsDate(r.createdAt) ?? null;

        const uids = deriveUidsFromRoles(r.roles);

        const vm: RoomVM = {
          id: r.id,
          ownerUid: r.ownerUid,
          state: r.state,
          mode: r.mode,
          targetScore: r.targetScore,
          timeLimit: r.timeLimit,
          players: r.players,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          roles: r.roles,
          roundEndAtMs: r.roundEndAtMs,

          lastEventAt,
          uids,
        };
        return vm;
      })
    )
  );

  /** Room par id (VM) */
  roomById$(id: string): Observable<RoomVM | undefined> {
    return this.rooms$.pipe(map(list => list.find(r => r.id === id)));
    // (Optionnel) si tu veux une lecture directe doc -> VM, je peux te donner une version docData().
  }

  /** Derniers événements (groupes 'events'), mappés en VM léger */
  readonly latestEvents$: Observable<TagEventVM[]> = collectionData(
    query(
      collectionGroup(this.fs, 'events'),
      orderBy('ts', 'desc'),
      limit(50)
    ),
    { idField: 'id' }
  ).pipe(
    map(rows => rows.map((e: any) => ({
      id: e.id,
      roomId: e.roomId, // si tu stockes roomId; sinon, on peut l’inférer via le path du doc
      hunterUid: e.hunterUid,
      victimUid: e.victimUid,
      x: e.x,
      y: e.y,
      ts: toJsDate(e.ts),
    } satisfies TagEventVM)))
  );

  /**
   * Stats quotidiennes très simples côté client :
   * - compte les events dont la date == aujourd’hui (locale)
   * - si tu as un doc 'metrics/daily', on peut brancher dessus à la place
   */
  readonly dailyStats$: Observable<DailyStats> = this.latestEvents$.pipe(
    map(list => {
      const today = new Date();
      const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
      const isToday = (dt: Date | null | undefined) =>
        !!dt && dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
      const tagsTotal = list.filter(e => isToday(e.ts)).length;
      return { tagsTotal };
    })
  );
}
