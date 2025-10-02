import { Component, inject } from '@angular/core';
import { AsyncPipe, NgFor, DatePipe, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MonitorService } from '../services/monitor.service';

@Component({
  selector: 'app-rooms',
  standalone: true,
  imports: [AsyncPipe, NgFor, DatePipe,  RouterLink],
  template: `
    <h2>Rooms</h2>
    <ul>
      <li *ngFor="let r of (rooms$ | async)">
        <a [routerLink]="['/room', r.id]">{{ r.id }}</a>
        — status: {{ r.status }} — mode: {{ r.mode }}
        @if (r.lastEventAt) {
          — maj: {{ r.lastEventAt | date:'short' }}
        }
      </li>
    </ul>
  `
})
export class RoomsComponent {
  rooms$ = inject(MonitorService).rooms$;
}
