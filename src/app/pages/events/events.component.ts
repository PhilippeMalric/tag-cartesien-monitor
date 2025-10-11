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
import { EventItem } from '@tag/types';

// --- Vue d’événement côté UI
export interface TagLikeEvent {
  id?: string;
  type?: string;     // 'tag' | 'tag/hit' | ...
  ts?: any;
  at?: any;
  hunterUid?: string;
  victimUid?: string; // 👈 standardise sur victimUid
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
  roomId = input<string>('');
  limit = signal<number>(50);
  readonly limitOptions = [20, 50, 100];

  private read = inject(MonitorReadService);

  readonly events$: Observable<TagLikeEvent[]> = combineLatest([
    toObservable(this.roomId),
    toObservable(this.limit),
  ]).pipe(
    switchMap(([id, lim]) => {
      const trimmed = (id ?? '').trim();
      return trimmed.length > 0
        ? (this.read.events$(trimmed, lim) as Observable<EventItem[] | undefined>)
        : (this.read.latestEvents$ as Observable<EventItem[] | undefined>);
    }),
    // Normalisation → TagLikeEvent
    map((list: EventItem[] | undefined) =>
      (list ?? []).map((ev) => ({
        id:        (ev as any)?.id,
        type:      (ev as any)?.type,   // ex: 'tag/hit'
        ts:        (ev as any)?.ts,
        at:        (ev as any)?.at,
        hunterUid: (ev as any)?.hunterUid,
        // 👇 supporte preyUid OU victimUid en entrée, et sort toujours victimUid
        victimUid: (ev as any)?.victimUid ?? (ev as any)?.preyUid,
        x:         (ev as any)?.x,
        y:         (ev as any)?.y,
      } as TagLikeEvent)),
    ),
    // Tri décroissant
    map((list: TagLikeEvent[]) =>
      [...list].sort((a, b) => tsMs(b.ts ?? b.at) - tsMs(a.ts ?? a.at))
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // 👇👇👇 AJOUTS : helpers utilisés par le template

  /** Raccourci d'UID pour affichage */
  short(uid?: string | null): string {
    return (uid ?? '').slice(0, 6) || '—';
  }

  /** Label lisible selon le type */
  labelFor(ev: TagLikeEvent): string {
    const t = String(ev?.type ?? '').toLowerCase();
    if (t === 'tag/hit' || t === 'tag') return 'Tag';
    if (t === 'start') return 'Start';
    if (t === 'end') return 'End';
    if (t === 'join') return 'Join';
    if (t === 'leave') return 'Leave';
    if (t === 'modechange' || t === 'mode-change') return 'Mode';
    return t || 'Event';
    }

  /** trackBy pour la boucle */
  trackById = (i: number, ev: TagLikeEvent | null): string | number => ev?.id ?? i;

  /** Date en ms (pour pipe date) */
  dateMs(ev: unknown): number {
    const e: any = ev as any;
    const v = e?.ts ?? e?.at ?? e?.createdAt ?? null;
    if (!v) return 0;
    if (typeof v?.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime?.() ?? 0;
    if (typeof v === 'number') return v;
    const t = new Date(v as any).getTime?.();
    return Number.isFinite(t) ? (t as number) : 0;
  }
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
