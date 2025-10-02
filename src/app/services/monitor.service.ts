import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  collectionGroup,
  query,
  orderBy,
  limit,
  doc,
  docData,
} from '@angular/fire/firestore';
import { Timestamp } from 'firebase/firestore';
import { Database, ref, objectVal } from '@angular/fire/database';
import { map, Observable, shareReplay } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { RoomDoc } from '../models/room.model';
import { EventItem } from '../models/event.model';
import { DailyStats } from '../models/stats.model';

type RoomVM = Omit<RoomDoc, 'lastEventAt'> & {
  id: string;
  lastEventAt?: Date | null;
};

function toJsDate(v: Timestamp | Date | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : (v as Timestamp).toDate();
}

@Injectable({ providedIn: 'root' })
export class MonitorService {
  private readonly fs = inject(Firestore);
  private readonly rtdb = inject(Database);
  private readonly destroyRef = inject(DestroyRef);

  readonly rooms$: Observable<RoomVM[]> = collectionData(
    query(collection(this.fs, 'rooms')), { idField: 'id' }
  ).pipe(
    map((arr: any[]) => arr.map(r => ({
      ...r,
      lastEventAt: toJsDate(r?.lastEventAt),
    } as RoomVM))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  readonly latestEvents$: Observable<(EventItem & { id: string })[]> = collectionData(
    query(collectionGroup(this.fs, 'events'), orderBy('ts', 'desc'), limit(100)),
    { idField: 'id' }
  ) as Observable<(EventItem & { id: string })[]>;

  readonly dailyStats$: Observable<DailyStats> =
    docData(doc(this.fs, 'admin/stats')) as Observable<DailyStats>;

  readonly currentHourCount = signal<number>(0);

  listenHourlyShardSum(hour: string): void {
    const hourRef = ref(this.rtdb, `counters/tags/hourly/${hour}/shards`);
    objectVal<Record<string, number> | null>(hourRef)
      .pipe(
        map((shards) => {
          const obj = shards ?? {};
          return Object.values(obj).reduce((a, b: any) => a + (b || 0), 0);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((sum) => this.currentHourCount.set(sum));
  }
}
