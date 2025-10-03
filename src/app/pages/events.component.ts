// src/app/pages/events.component.ts
import { Component, inject } from '@angular/core';
import { AsyncPipe, NgFor, DatePipe } from '@angular/common';
import { MonitorService } from '../services/monitor.service';

@Component({
  standalone: true,
  selector: 'app-events',
  imports: [AsyncPipe, NgFor, DatePipe],
  template: `
    <h2>Derniers événements</h2>
    <ul>
      <li *ngFor="let e of (events$ | async)">
        {{ e.ts | date:'short' }} — {{ e.hunterUid }} → {{ e.victimUid }} @ ({{ e.x ?? '-' }},{{ e.y ?? '-' }})
        <small *ngIf="e.roomId">[{{ e.roomId }}]</small>
      </li>
    </ul>
  `
})
export class EventsComponent {
  events$ = inject(MonitorService).latestEvents$;
}
