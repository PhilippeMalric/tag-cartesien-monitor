import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { MonitorReadService } from '../../services/monitor-read.service';

// Angular Material
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { catchError, interval, map, of, shareReplay, startWith, switchMap, tap } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    // Angular
    AsyncPipe, DatePipe, RouterLink,
    // Material
    MatCardModule, MatListModule, MatIconModule,
    MatChipsModule, MatDividerModule, MatButtonModule, MatTooltipModule,
    MatProgressBarModule, MatButtonToggleModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  private read = inject(MonitorReadService);

  // états UI
  loading = signal<boolean>(true);
  error = signal<boolean>(false);

  // données
  rooms$ = this.read.rooms$;
  daily$ = this.read.dailyStats$;

  // filtres
  stateFilter = signal<'all' | 'running' | 'idle'>('all');
  autoRefresh = signal<boolean>(true);
  toggleAutoRefresh() { this.autoRefresh.update(v => !v); }

  // Helper: convertit Timestamp | Date | number | string en ms pour le DatePipe
  toMs(v: any): number {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime?.() ?? 0;
    if (typeof v?.toMillis === 'function') return v.toMillis();
    const t = new Date(v as any).getTime?.();
    return Number.isFinite(t) ? (t as number) : 0;
  }

  // Tick réactif à l'état "autoRefresh" (si OFF → un tick initial seulement)
  private tick$ = toObservable(this.autoRefresh).pipe(
    switchMap(on => on
      ? interval(15_000).pipe(startWith(0))
      : of(0) // un seul tick immédiat
    )
  );

  // rooms triées par dernier mouvement (lastEventAt/updatedAt), avec filtre d’état
  filteredRooms$ = this.tick$.pipe(
    switchMap(() => {
      this.loading.set(true);
      this.error.set(false);
      return this.rooms$.pipe(
        tap(() => this.loading.set(false)),
        catchError(() => {
          this.loading.set(false);
          this.error.set(true);
          return of([] as any[]);
        })
      );
    }),
    map((list: any[]) => {
      const arr = [...(list ?? [])];

      // tri décroissant par activité
      arr.sort(
        (a, b) =>
          this.toMs(b?.lastEventAt ?? b?.updatedAt) -
          this.toMs(a?.lastEventAt ?? a?.updatedAt)
      );

      // filtre d'état
      const f = this.stateFilter();
      return f === 'all' ? arr : arr.filter(r => r?.state === f);
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  activityClass(r: any): 'now' | 'recent' | 'stale' | 'idle' {
    const t = this.toMs(r?.lastEventAt ?? r?.updatedAt);
    if (!t) return 'idle';
    const diff = Date.now() - t;
    if (diff < 60_000) return 'now';         // < 1 min
    if (diff < 10 * 60_000) return 'recent'; // < 10 min
    return 'stale';
  }

  async copy(str: string) {
    try { await navigator.clipboard.writeText(str); } catch {}
  }
}
