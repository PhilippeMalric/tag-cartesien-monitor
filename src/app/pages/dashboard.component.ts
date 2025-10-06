import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { AsyncPipe, NgFor, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { MonitorReadService } from '../services/monitor-read.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AsyncPipe, NgFor, DatePipe, RouterLink],
  template: `
    <section class="cards">

      <!-- Total tags -->
      <div class="card">
        <h3>Total tags (aujourd'hui)</h3>
        <div>{{ (daily$ | async)?.tagsTotal ?? 0 }}</div>
      </div>

      <!-- Rooms -->
      <div class="card">
        <h3>Rooms</h3>
        <ul>
          <li *ngFor="let r of (rooms$ | async)">
            <a [routerLink]="['/room', r.id]">{{ r.id }}</a>
            — {{ r.state || '—' }} — {{ r.mode || '—' }}
            @if (r.lastEventAt) {
              — maj: {{ r.lastEventAt | date:'short' }}
            }
          </li>
        </ul>
      </div>
    </section>
  `
})
export class DashboardComponent {
  private read = inject(MonitorReadService);

  rooms$ = this.read.rooms$;
  daily$ = this.read.dailyStats$;
}
