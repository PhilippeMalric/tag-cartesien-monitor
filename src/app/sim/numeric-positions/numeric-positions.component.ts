import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, inject, input, signal } from '@angular/core';
import { AsyncPipe, DecimalPipe, DatePipe, NgFor, NgIf, NgClass } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { Subscription } from 'rxjs';

import { SpawnPositionMergeService, MergedRow } from '../../services/spawn-position-merge.service';
import { PlayerDoc, Role } from '../../models/monitor.models';





@Component({
  selector: 'app-numeric-positions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    // Angular
    AsyncPipe, DecimalPipe, DatePipe, NgFor, NgIf,
    // Material
    MatCardModule, MatIconModule, MatButtonModule, MatChipsModule,NgClass
  ],
  templateUrl: './numeric-positions.component.html',
  styleUrls: ['./numeric-positions.component.scss'],
})
export class NumericPositionsComponent implements OnInit, OnDestroy {
  private svc = inject(SpawnPositionMergeService);

  /** Room cible */
  roomId = input<string>('');

  /** Lignes fusionnées spawn + position */
  rows = signal<MergedRow[]>([]);

  private sub?: Subscription;

  ngOnInit(): void {
    const id = (this.roomId() || '').trim();
    if (id) this.svc.start(id);
    this.sub = this.svc.merged$.subscribe(rows => this.rows.set(rows));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.svc.stop();
  }

  refresh(): void {
    this.svc.stop();
    const id = (this.roomId() || '').trim();
    if (id) this.svc.start(id);
  }

  ageLabel(t?: number): string {
    if (!t) return '—';
    const dt = Math.max(0, Date.now() - t);
    if (dt < 1000) return `${dt} ms`;
    const s = Math.floor(dt / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m${r.toString().padStart(2,'0')}s`;
  }

  trackByUid = (_: number, r: MergedRow) => r.uid;
}
