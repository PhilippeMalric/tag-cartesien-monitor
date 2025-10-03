import { Component, inject } from '@angular/core';
import { AsyncPipe, NgFor, DatePipe, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MonitorService } from '../services/monitor.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AsyncPipe, NgFor, DatePipe,  RouterLink],
  template: `
    <section class="cards">

      <!-- Total tags -->
      <div class="card">
        <h3>Total tags (aujourd'hui)</h3>
        <div>{{ ((daily$ | async)?.['tagsTotal']) ?? 0 }}</div>
      </div>

      <!-- Rooms -->
      <div class="card">
        <h3>Rooms</h3>
        <ul>
          <li *ngFor="let r of (rooms$ | async)">
            <a [routerLink]="['/room', r['id']]">{{ r['id'] }}</a>
            — {{ r['state'] }} — {{ r['mode'] }}
            @if (r['lastEventAt']) {
              — maj: {{ r['lastEventAt'] | date:'short' }}
            }
          </li>
        </ul>
      </div>
    </section>
  `
})
export class DashboardComponent {
  rooms$ = inject(MonitorService).rooms$;
  daily$ = inject(MonitorService).dailyStats$;
}
