import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { MonitorService } from '../../services/monitor.service';
import { map } from 'rxjs/operators';

type RoomVM = {
  id: string;
  status: 'idle' | 'running' | 'ended';
  mode: 'classic' | 'transmission' | 'infection';
  playerUids?: string[];
  hunterUids?: string[];
  roles?: Record<string, 'hunter' | 'runner'>;
  lastEventAt?: Date | null;
  roundEndAtMs?: number;
};

@Component({
  standalone: true,
  selector: 'app-room-detail',
  imports: [RouterLink, AsyncPipe, DatePipe, NgIf, NgFor],
  templateUrl: './room-detail.component.html',
  styleUrls: ['./room-detail.component.scss'],
})
export class RoomDetailComponent {
  private route = inject(ActivatedRoute);
  private monitor = inject(MonitorService);

  readonly roomId = this.route.snapshot.paramMap.get('id')!;
  readonly room$ = this.monitor.rooms$.pipe(
    map((list) => list.find((r) => r.id === this.roomId))
  );
}
