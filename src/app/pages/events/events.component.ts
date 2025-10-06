import { Component, ChangeDetectionStrategy, inject, input, signal } from '@angular/core';
import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { toObservable } from '@angular/core/rxjs-interop';
import { combineLatest, map, switchMap, shareReplay, Observable } from 'rxjs';

import { MonitorReadService } from '../../services/monitor-read.service';

// --- Vue d’événement côté UI (ajoute les champs utilisés par le template)
export interface TagLikeEvent {
  id?: string;
  type?: string;       // 'tag'
  ts?: any;            // Firestore Timestamp | Date | number
  at?: any;            // compat si certaines collections ont 'at'
  hunterUid?: string;
  victimUid?: string;
  x?: number;
  y?: number;
}

@Component({
  selector: 'app-events',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe, DatePipe, NgIf, NgFor,
    MatCardModule, MatListModule, MatChipsModule, MatIconModule,
    MatFormFieldModule, MatSelectModule,
  ],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
})
export class EventsComponent {
  // Si fourni: événements de la room ; sinon: globaux
  roomId = input<string>('');

  // Doit être un signal local (pas InputSignal) pour faire .set() depuis le template
  limit = signal<number>(50);
  readonly limitOptions = [20, 50, 100];

  private read = inject(MonitorReadService);

  // ⚠️ Typage explicite en TagLikeEvent[] -> le template voit bien hunterUid/x/y/...
  readonly events$: Observable<TagLikeEvent[]> = combineLatest([
    toObservable(this.roomId),
    toObservable(this.limit),
  ]).pipe(
    switchMap(([id, lim]) => {
      const trimmed = (id ?? '').trim();
      if (trimmed.length > 0) {
        return this.read.events$(trimmed, lim);
      }
      return this.read.latestEvents$;
    }),
    // Normalise chaque item vers TagLikeEvent
    map(list =>
      (list ?? []).map(ev => ({
        id: (ev as any)?.id,
        type: (ev as any)?.type,
        ts: (ev as any)?.ts,
        at: (ev as any)?.at, // fallback si certains ont 'at' au lieu de 'ts'
        hunterUid: (ev as any)?.hunterUid,
        victimUid: (ev as any)?.victimUid,
        x: (ev as any)?.x,
        y: (ev as any)?.y,
      } as TagLikeEvent))
    ),
    // Tri décroissant par timestamp (ts|at)
    map(list => [...list].sort((a, b) => tsMs(b.ts ?? b.at) - tsMs(a.ts ?? a.at))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // Utils pour le template
  trackById(_: number, ev: TagLikeEvent) {
    return ev.id || `${ev.type}-${tsMs(ev.ts ?? ev.at)}`;
  }
  labelFor(ev: TagLikeEvent): string { return (ev?.type || 'event').toUpperCase(); }
  short(uid?: string): string { return uid ? uid.slice(0, 6) + '…' : ''; }
  dateMs(ev: TagLikeEvent): number { return tsMs(ev.ts ?? ev.at); }
}

// --- Helper hors classe ---
function tsMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime?.() ?? 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const t = new Date(v as any).getTime?.();
  return Number.isFinite(t) ? (t as number) : 0;
}
