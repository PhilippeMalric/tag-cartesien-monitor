import { Injectable, inject } from '@angular/core';
import { Database, ref as rtdbRef } from '@angular/fire/database';
import { objectVal } from 'rxfire/database';
import { map, shareReplay } from 'rxjs';
import { LiveMapStream, PositionsStream, PosDTO } from '../models/monitor.models';

const isDefined = <T>(v: T | null | undefined): v is T => v !== null && v !== undefined;

@Injectable({ providedIn: 'root' })
export class RtdbPositionsService {
  private rtdb = inject(Database);

  positions$(roomId: string): PositionsStream {
    const ref = rtdbRef(this.rtdb, `positions/${roomId}`);
    return objectVal<Record<string, { x: number; y: number }> | null>(ref).pipe(
      map(obj => {
        if (!obj) return [] as PosDTO[];
        return Object.entries(obj)
          .filter(([, v]) => isDefined(v) && isFinite(v.x) && isFinite(v.y))
          .map(([uid, v]) => ({ uid, x: v.x, y: v.y } as PosDTO));
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  // pour le canvas
  liveMap$(roomId: string): LiveMapStream {
    return this.positions$(roomId).pipe(
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }
}
