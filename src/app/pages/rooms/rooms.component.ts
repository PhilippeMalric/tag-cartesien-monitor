import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { map, shareReplay } from 'rxjs/operators';
import { MatToolbarModule }         from '@angular/material/toolbar';
import { MatChipsModule }           from '@angular/material/chips';
import { MatButtonModule }          from '@angular/material/button';
import { MatIconModule }            from '@angular/material/icon';
import { MatCardModule }            from '@angular/material/card';
import { MatListModule }            from '@angular/material/list';
import { MatDividerModule }         from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MonitorReadService } from 'src/app/services/monitor-read.service';
import { MonitorAdminService } from 'src/app/services/monitor-admin.service';
import { RoomDoc } from '@tag/types';

export type RoomItem = RoomDoc & { id: string; lastEventAt?: unknown };

@Component({
  selector: 'app-rooms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, NgFor, NgIf, DatePipe, RouterLink,
    MatToolbarModule, MatChipsModule, MatButtonModule, MatIconModule,
    MatCardModule, MatListModule, MatDividerModule, MatProgressSpinnerModule],
  templateUrl: './rooms.component.html',
  styleUrls: ['./rooms.component.scss'],
})
export class RoomsComponent {
  private readonly read  = inject(MonitorReadService);
  private readonly admin = inject(MonitorAdminService);

  // état UI
  busy = signal(false);

  // rooms triées par activité (lastEventAt puis updatedAt) décroissante
  sortedRooms$ = this.read.rooms$.pipe(
    map(list => [...(list ?? [])].sort((a, b) => this.whenMs(b) - this.whenMs(a))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // petit résumé (compte par état)
  stats$ = this.read.rooms$.pipe(
    map((rooms: RoomDoc[] = []) => {
      const total   = rooms.length;
      const running = rooms.filter(r => r.state === 'running').length;
      const idle    = rooms.filter(r => r.state === 'idle').length;
      const other   = total - running - idle;
      return { total, running, idle, other };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // helpers (utilisés par le template)
  toMs(v: any): number {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime?.() ?? 0;
    if (typeof (v as any).toMillis === 'function') return (v as any).toMillis();
    const t = new Date(v as any).getTime?.();
    return Number.isFinite(t) ? (t as number) : 0;
  }
  private whenMs(r: RoomItem): number {
    const a = this.toMs(r?.lastEventAt);
    const b = this.toMs(r?.updatedAt);
    return Math.max(a, b, 0);
  }

  // --- Suppression massive via services du monitor ---
  async deleteAllRooms(): Promise<void> {
    if (!confirm('Supprimer TOUTES les rooms (players + events inclus) ?')) return;

    this.busy.set(true);
    try {
      await this.admin.deleteAllRooms();
      alert('Toutes les rooms ont été supprimées.');
    } catch (e: any) {
      alert(`Échec de la suppression : ${e?.message ?? e}`);
    } finally {
      this.busy.set(false);
    }
  }
}
