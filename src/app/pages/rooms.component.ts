import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { map, shareReplay } from 'rxjs';

import { MonitorReadService } from '../services/monitor-read.service';
import { RoomDoc } from '../models/monitor.models';

export type RoomItem = RoomDoc & { id: string; lastEventAt?: unknown };

@Component({
  selector: 'app-rooms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, NgFor, NgIf, DatePipe, RouterLink],
  template: `
    <section class="header">
      <h2>Rooms</h2>
      @if (stats$ | async; as s) {
        <div class="summary">
          <span class="pill running">running: {{ s.running }}</span>
          <span class="pill idle">idle: {{ s.idle }}</span>
          <span class="pill other">other: {{ s.other }}</span>
          <span class="total">total: {{ s.total }}</span>
        </div>
      }
    </section>

    @if (sortedRooms$ | async; as rooms) {
      @if (rooms.length === 0) {
        <p class="empty">Aucune room pour l’instant.</p>
      } @else {
        <ul class="rooms">
          @for (r of rooms; track r.id) {
            <li class="room">
              <div class="main">
                <a class="id mono" [routerLink]="['/room', r.id]">#{{ r.id }}</a>
                <span class="sep">—</span>
                <span class="state">status: <strong>{{ r.state || '—' }}</strong></span>
                <span class="sep">—</span>
                <span class="mode">mode: {{ r.mode || '—' }}</span>
              </div>

              <div class="meta">
                @if (r.lastEventAt) {
                  <span class="when">maj: {{ toMs(r.lastEventAt) | date:'short' }}</span>
                } @else if (r.updatedAt) {
                  <span class="when">maj: {{ toMs(r.updatedAt) | date:'short' }}</span>
                } @else {
                  <span class="when">maj: —</span>
                }
              </div>
            </li>
          }
        </ul>
      }
    } @else {
      <p>Chargement…</p>
    }
  `,
  styles: [`
    .header {
      display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px;
    }
    .summary { display: flex; gap: 8px; font-size: 13px; }
    .pill { padding: 2px 8px; border-radius: 999px; background: #eee; color: black;}
    .pill.running { background: #e6ffe6; }
    .pill.idle    { background: #f2f2ff; }
    .pill.other   { background: #fff2e6; }
    .total { margin-left: 6px; opacity: .8; }

    .rooms { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .room  { padding: 10px 12px; border: 1px solid rgba(0,0,0,.08); border-radius: 10px; }
    .main  { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .meta  { font-size: 12px; opacity: .8; margin-top: 2px; }
    .sep   { opacity: .5; }
    .mono  { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .id    { text-decoration: none; }
    .when  { }
    .empty { opacity: .7; }
  `],
})
export class RoomsComponent {
  private read = inject(MonitorReadService);

  // rooms triées par activité (lastEventAt puis updatedAt) décroissante
  sortedRooms$ = this.read.rooms$.pipe(
    map(list => [...(list ?? [])].sort((a, b) => this.whenMs(b) - this.whenMs(a))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // petit résumé (compte par état)
  stats$ = this.read.rooms$.pipe(
    map((rooms: RoomDoc[] = []) => {
      const total = rooms.length;
      const running = rooms.filter(r => r.state === 'running').length;
      const idle = rooms.filter(r => r.state === 'idle').length;
      const other = total - running - idle;
      return { total, running, idle, other };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  // helpers
  private whenMs(r: RoomItem): number {
    const a = this.toMs(r?.lastEventAt);
    const b = this.toMs(r?.updatedAt);
    return Math.max(a, b, 0);
  }
  toMs(v: any): number {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime?.() ?? 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    const t = new Date(v as any).getTime?.();
    return Number.isFinite(t) ? (t as number) : 0;
  }
}
