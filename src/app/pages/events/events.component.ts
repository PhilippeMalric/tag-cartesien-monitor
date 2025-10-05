import { Component, inject } from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { MonitorService } from '../../services/monitor.service';

@Component({
  standalone: true,
  selector: 'app-events',
  imports: [AsyncPipe, DatePipe],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
})
export class EventsComponent {
  readonly events$ = inject(MonitorService).latestEvents$;
}
