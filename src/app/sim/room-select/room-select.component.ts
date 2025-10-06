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
import { MonitorReadService } from '../../services/monitor-read.service';

/** ⬅️ Changement : propriétés "présentes mais possiblement undefined" */
type RoomItem = {
  id: string;
  name: string | undefined;
  mode: string | undefined; // affichage libre
  state: 'idle' | 'running' | string | undefined;
  lastEventAt: any;
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

  private read = inject(MonitorReadService);

  /** ⬅️ Changement : on fixe le générique <RoomItem[]> et l'initialValue matche exactement */
 private roomsSig = toSignal(
  this.read.rooms$.pipe(
    map(rooms => (rooms ?? []).map(r => ({
      id: r.id!,
      name: (r as any).name ?? undefined,
      mode: (r as any).mode ?? undefined,
      state: (r as any).state ?? undefined,
      lastEventAt: (r as any).lastEventAt,
    })) as RoomItem[])
  ),
  { initialValue: [] as RoomItem[] }
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
      rooms.sort((a, b) => (toMs(b.lastEventAt) || 0) - (toMs(a.lastEventAt) || 0));
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

/** Util: transforme Timestamp/Date/number/undefined → ms */
function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime?.() ?? 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const t = new Date(v as any).getTime?.();
  return Number.isFinite(t) ? (t as number) : 0;
}
