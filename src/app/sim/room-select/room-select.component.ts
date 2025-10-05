import {
  Component, ChangeDetectionStrategy, inject, input, output, signal, computed
} from '@angular/core';
import { NgFor, NgIf } from '@angular/common';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule }     from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule }      from '@angular/material/input';
import { MatIconModule }       from '@angular/material/icon';
import { MatButtonModule }     from '@angular/material/button';
import { MatDividerModule }    from '@angular/material/divider';
import { MatChipsModule }      from '@angular/material/chips';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule }    from '@angular/material/tooltip';
import { MatCardModule }       from '@angular/material/card';

import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { MonitorService } from '../../services/monitor.service';

type RoomItem = {
  id: string;
  name?: string;
  mode?: string; // affichage libre
  state?: 'idle' | 'running' | string;
  lastEventAt?: any;
};

type StateFilter = 'all' | 'running' | 'idle';
type SortBy = 'recent' | 'name';

@Component({
  selector: 'app-room-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgFor, NgIf,
    MatFormFieldModule, MatSelectModule, MatAutocompleteModule,
    MatInputModule, MatIconModule, MatButtonModule, MatDividerModule,
    MatChipsModule, MatButtonToggleModule, MatTooltipModule, MatCardModule,
  ],
  templateUrl: './room-select.component.html',
  styleUrls: ['./room-select.component.css'],
})
export class RoomSelectComponent {
  /** Two-way binding: [(value)] */
  value = input<string>('');
  valueChange = output<string>();

  /** Recherche + filtres + tri */
  query = signal<string>('');
  filter = signal<StateFilter>('all');
  sortBy = signal<SortBy>('recent');

  private monitor = inject(MonitorService);

  /** rooms$ → RoomItem[] (conversion pour affichage + compat types) */
  private roomsSig = toSignal(
    this.monitor.rooms$.pipe(
      map(rooms => (rooms ?? []).map(r => ({
        id: r.id!, name: r.name,
        mode: (r as any).mode as string | undefined,
        state: r.state, lastEventAt: (r as any).lastEventAt,
      } satisfies RoomItem)))
    ),
    { initialValue: [] as any[] }
  );

  /** Liste filtrée + triée */
  filteredRooms = computed<RoomItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    const flt = this.filter();
    const sort = this.sortBy();
    let rooms = [...this.roomsSig()];

    if (flt !== 'all') rooms = rooms.filter(r => (r.state ?? 'idle') === flt);

    if (q) {
      rooms = rooms.filter(r => {
        const hay = `${r.name ?? ''} ${r.id} ${r.mode ?? ''} ${r.state ?? ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (sort === 'recent') {
      rooms.sort((a, b) => {
        const av = a.lastEventAt?.toMillis ? a.lastEventAt.toMillis() : new Date(a.lastEventAt ?? 0).getTime();
        const bv = b.lastEventAt?.toMillis ? b.lastEventAt.toMillis() : new Date(b.lastEventAt ?? 0).getTime();
        return (bv || 0) - (av || 0);
      });
    } else {
      rooms.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    }

    return rooms;
  });

  /** Room sélectionnée (id courant) */
  selectedRoom = computed<RoomItem | null>(() => {
    const id = this.value();
    if (!id) return null;
    return this.filteredRooms().find(r => r.id === id)
        ?? (this.roomsSig()).find(r => r.id === id)
        ?? null;
  });

  // Actions UI
  clearQuery() { this.query.set(''); }
  setFilter(v: StateFilter) { this.filter.set(v); }
  setSort(v: SortBy) { this.sortBy.set(v); }
  onSelect(id: string) { this.valueChange.emit(id); }
  emitCurrent() { if (this.value()) this.valueChange.emit(this.value()); }

  refresh() { this.query.set(this.query()); }

  // Helpers d’affichage
  stateColor(state?: string): 'primary' | 'warn' | 'accent' | undefined {
    switch (state) {
      case 'running': return 'primary';
      case 'idle':    return 'accent';
      default:        return undefined;
    }
  }
}
