import { Component, inject } from '@angular/core';
import { AsyncPipe, NgFor } from '@angular/common';
import { MonitorService } from '../services/monitor.service';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [AsyncPipe, NgFor],
  template: `
    <h2>Events</h2>
    <ul>
      <li *ngFor="let e of (events$ | async)">
        {{ e.type }} — {{ e.roomId }} — {{ e.ts?.toDate?.() || e.ts }}
      </li>
    </ul>
  `
})
export class EventsComponent {
  events$ = inject(MonitorService).latestEvents$;
}
