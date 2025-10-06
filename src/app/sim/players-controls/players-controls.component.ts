import {
  Component, ChangeDetectionStrategy, inject, input, signal, computed
} from '@angular/core';
import { AsyncPipe, JsonPipe, NgClass, NgFor, NgIf, TitleCasePipe } from '@angular/common';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs/operators';
import { MonitorReadService } from '../../services/monitor-read.service';
import { MonitorActionsService } from '../../services/monitor-actions.service';
import { PlayerDoc } from '../../models/monitor.models';
import { MatSnackBar } from '@angular/material/snack-bar';

// ⬇️ NEW: Firestore direct pour lire ownerUid si besoin
import { Firestore, doc, docData } from '@angular/fire/firestore';
import { of } from 'rxjs';

type RoleSimple = 'hunter' | 'prey';
type SortKey = 'none' | 'role' | 'name';
type BotLocal = { id: string; x:number; y:number; h:number|null };
type World = { minX:number; maxX:number; minY:number; maxY:number };

@Component({
  selector: 'app-players-controls',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    // Angular
    AsyncPipe, NgFor, NgIf, TitleCasePipe, FormsModule, ReactiveFormsModule,
    // Material
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatChipsModule, MatDividerModule,
    MatListModule, MatTooltipModule, MatButtonToggleModule,
    MatMenuModule, MatBadgeModule, MatProgressSpinnerModule, JsonPipe, NgClass
  ],
  templateUrl: './players-controls.component.html',
  styleUrls: ['./players-controls.component.scss'],
})
export class PlayersControlsComponent {

    worldSig = signal<World>({ minX:-45, maxX:45, minY:-30, maxY:30 });


    
  /** Room ciblée */
  roomId = input<string>('');
  snack = inject(MatSnackBar);

  // Formulaire "ajout joueur"
  displayName = signal<string>('');
  role = signal<RoleSimple>('prey');

  // Filtres / tri pour la liste
  query = signal<string>('');                 // recherche texte
  sortBy = signal<SortKey>('none');           // tri: rôle ou alphabétique

  // UI states
  busyAdd = signal<boolean>(false);
  busyRoleUid = signal<string | null>(null);
  busyRemoveUid = signal<string | null>(null);

  currentUid = signal<string>('');
  openMenuFor(uid?: string) { this.currentUid.set(uid ?? ''); }

  private read = inject(MonitorReadService);
  private act = inject(MonitorActionsService);

  // ⬇️ NEW: Firestore direct pour lire la room.ownerUid
  private fs = inject(Firestore);

  /** Flux des joueurs de la room */
  readonly playersSig = toSignal(
    toObservable(this.roomId).pipe(
      switchMap(id => this.read.players$(id || '')),
      map(list => (list ?? []) as PlayerDoc[])
    ),
    { initialValue: [] as PlayerDoc[], requireSync: false }
  );

  // ⬇️ NEW: ownerUid de la room (source de vérité)
  readonly ownerUidSig = toSignal(
    toObservable(this.roomId).pipe(
      switchMap(id => id
        ? docData(doc(this.fs, 'rooms', id))
        : of(null)
      ),
      map((room: any) => (room?.ownerUid as string | undefined) ?? '')
    ),
    { initialValue: '' }
  );

    botsSig = computed<BotLocal[]>(() => {
        const arr = this.playersSig();
        return arr.map(p => ({
            id: p.uid!,
            x: (p.spawn?.x ?? 0),
            y: (p.spawn?.y ?? 0),
            h: null,
        }));
    });

  /** Liste filtrée + triée (utilisée par le template) */
  readonly filteredPlayersSig = computed(() => {
    const q = this.query().toLowerCase();
    const sort = this.sortBy();

    let arr = [...this.playersSig()].filter(Boolean);

    if (q) {
      arr = arr.filter(p => {
        const hay = `${p.displayName ?? ''} ${p.uid ?? ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    if (sort === 'role') {
      arr.sort((a, b) => {
        const ah = this.isHunter(a) ? 0 : 1;
        const bh = this.isHunter(b) ? 0 : 1;
        if (ah !== bh) return ah - bh;
        return (a.displayName ?? a.uid ?? '').localeCompare(b.displayName ?? b.uid ?? '');
      });
    } else if (sort === 'name') {
      arr.sort((a, b) => (a.displayName ?? a.uid ?? '').localeCompare(b.displayName ?? b.uid ?? ''));
    }
    // sort === 'none' → pas de tri

    return arr;
  });

  /** Petits compteurs pour l’en-tête */
  readonly counts = computed(() => {
    const arr = this.playersSig();
    const total = arr.length;
    const hunters = arr.filter(p => normRole(p.role) === 'hunter').length;
    const preys = total - hunters;
    return { total, hunters, preys };
  });

  // === Actions ===

  async addPlayer(): Promise<void> {
    const roomId = (this.roomId() || '').trim();
    const name = this.displayName().trim();
    const role = this.role();

    if (!roomId || !name) return;

    this.busyAdd.set(true);
    try {
      await this.act.addOrUpdatePlayer(roomId, { displayName: name, role }, { singleHunter: true });
      this.displayName.set('');
      this.role.set('prey');
    } finally {
      this.busyAdd.set(false);
    }
  }

  async setRole(uid: string, role: RoleSimple): Promise<void> {
    const roomId = (this.roomId() || '').trim();
    if (!roomId || !uid) return;
    this.busyRoleUid.set(uid);
    try {
      await this.act.setPlayerRole(roomId, uid, role, { singleHunter: true });
    } finally {
      this.busyRoleUid.set(null);
    }
  }

    async randomizeAllSpawns(): Promise<void> {
        const roomId = (this.roomId() || '').trim();
        if (!roomId) { this.snack.open('Room ID manquant', 'OK', { duration: 2000 }); return; }
        try {
            await this.act.randomizeSpawns(roomId, this.worldSig(), { minGap: 4 }); // ajuste minGap si besoin
            this.snack.open('Spawns attribués', 'OK', { duration: 1800 });
        } catch (e:any) {
            console.error(e);
            this.snack.open(`Échec: ${e?.message ?? e}`, 'OK', { duration: 3500 });
        }
    }

  async remove(uid?: string): Promise<void> {
    const roomId = (this.roomId() || '').trim();
    const target = (uid ?? this.currentUid()).trim();

    if (!roomId) { this.snack.open('Room ID manquant', 'OK', { duration: 2000 }); return; }
    if (!target) { this.snack.open('UID invalide', 'OK', { duration: 2000 }); return; }
    if (!confirm('Retirer ce joueur ?')) return;

    this.busyRemoveUid.set(target);
    try {
      await this.act.removePlayer(roomId, target); // version callable côté service (admin)
      this.snack.open('Joueur retiré', 'OK', { duration: 1800 });
    } catch (e: any) {
      console.error('remove failed', e);
      const code = e?.code as string | undefined;
      const msg  = code === 'permission-denied'
        ? 'Accès refusé (admin/owner requis).'
        : code === 'not-found'
          ? 'Salle introuvable.'
          : (e?.message ?? e);
      this.snack.open(`Échec: ${msg}`, 'OK', { duration: 3500 });
    } finally {
      this.busyRemoveUid.set(null);
      this.currentUid.set('');
    }
  }

  // (Tu peux supprimer remove2 si inutile, sinon garde-la comme alias admin)
  async remove2(uid?: string): Promise<void> {
    const roomId = (this.roomId() || '').trim();
    const target = (uid ?? this.currentUid()).trim();

    if (!roomId) { this.snack.open('Room ID manquant', 'OK', { duration: 2000 }); return; }
    if (!target) { this.snack.open('UID invalide', 'OK', { duration: 2000 }); return; }
    if (!confirm('Retirer ce joueur ?')) return;

    this.busyRemoveUid.set(target);
    try {
      await this.act.removePlayerAdmin(roomId, target);
      this.snack.open('Joueur retiré', 'OK', { duration: 1800 });
    } catch (e: any) {
      const code = e?.code as string | undefined;
      const msg  = code === 'permission-denied'
        ? 'Accès refusé (admin/owner requis).'
        : code === 'not-found'
          ? 'Salle introuvable.'
          : (e?.message ?? e);
      console.error('remove failed', code, e);
      this.snack.open(`Échec: ${msg}`, 'OK', { duration: 3500 });
    } finally {
      this.busyRemoveUid.set(null);
      this.currentUid.set('');
    }
  }

  // Utils
  isHunter(p: any) { return normRole(p?.role) === 'hunter'; }

  // ⬇️ NEW: savoir si un uid est owner de la room
  isOwner(uid?: string) {
    const o = this.ownerUidSig();
    return !!uid && !!o && uid === o;
  }

  initials(name?: string, fallback = '??') {
    const s = (name ?? '').trim();
    if (!s) return fallback;
    const parts = s.split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase() ?? '');
    return parts.join('') || fallback;
  }

  copyUid(uid?: string) {
    const v = uid ?? this.currentUid();
    if (!v) return;
    navigator.clipboard?.writeText(v).catch(() => {});
  }

  async makeOwner(uid: string): Promise<void> {
    const roomId = (this.roomId() || '').trim();
    if (!roomId || !uid) { this.snack.open('Paramètres manquants', 'OK', { duration: 2000 }); return; }
    if (!confirm('Définir ce joueur comme propriétaire de la room ?')) return;

    this.busyRoleUid.set(uid);
    try {
      await this.act.setRoomOwner(roomId, uid);
      this.snack.open('Owner mis à jour', 'OK', { duration: 1800 });
    } catch (e: any) {
      console.error('set owner failed', e);
      this.snack.open(`Échec: ${e?.message ?? e}`, 'OK', { duration: 3500 });
    } finally {
      this.busyRoleUid.set(null);
    }
  }
}

function normRole(r?: any): RoleSimple {
  const v = String(r ?? '').toLowerCase().trim();
  return v === 'hunter' || v === 'chasseur' ? 'hunter' : 'prey';
}
