import { Component, inject } from '@angular/core';
import { AsyncPipe, DatePipe, NgIf, NgFor, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { MonitorService } from '../../services/monitor.service';
import { RoomVM } from '../../models/room.model';

import { Database, ref, objectVal, set, update, get } from '@angular/fire/database';
import { Auth } from '@angular/fire/auth';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

// Carte temps réel (présente sur la page)
import { RoomLiveMapComponent } from './room-live-map/room-live-map.component';

// ✅ Ajout: service des positions pour voir les coordonnées en direct
import { PositionsService } from '../../services/positions.service';

type Bot = { id: string; x?: number; y?: number; displayName?: string; random?: boolean };

// (optionnel) type pratique si tu veux typer finement la liste de positions
type PositionItem = { id: string; isBot: boolean; x: number; y: number };

@Component({
  standalone: true,
  selector: 'app-room-detail',
  imports: [AsyncPipe, DatePipe, NgIf, NgFor, RouterLink, RoomLiveMapComponent,DecimalPipe],
  templateUrl: './room-detail.component.html',
})
export class RoomDetailComponent {
  private route = inject(ActivatedRoute);
  private monitor = inject(MonitorService);
  private db = inject(Database);
  private auth = inject(Auth);

  // ✅ Ajout: positions live
  private positionsSvc = inject(PositionsService);

  readonly roomId = this.route.snapshot.paramMap.get('id')!;

  // Room VM fournie par le service (avec uids + lastEventAt déjà mappé)
  room$ = this.monitor.roomById$(this.roomId) as Observable<RoomVM | undefined>;

  // ===== POSITIONS (live) =====
  /**
   * On réutilise l’écoute déjà démarrée par <app-room-live-map>.
   * Si tu veux que la liste fonctionne même sans la carte, tu peux appeler
   * positionsSvc.startListening(this.roomId) ici.
   */
  positions$: Observable<PositionItem[]> = this.positionsSvc.positions$.pipe(
    map(mapObj =>
      Object.entries(mapObj ?? {}).map(([id, p]) => ({
        id,
        isBot: id.startsWith('bot-'),
        x: Number(p?.x ?? 0),
        y: Number(p?.y ?? 0),
      }))
      // joueurs d'abord, puis bots
      .sort((a, b) => Number(a.isBot) - Number(b.isBot))
    )
  );

  // ===== BOTS (RTDB: bots/{roomId}/{botId}) =====
  // On lit le noeud comme un objet -> tableau (id, ...val)
  bots$: Observable<Bot[]> = objectVal<Record<string, Omit<Bot, 'id'>> | null>(
    ref(this.db, `bots/${this.roomId}`)
  ).pipe(
    map(rec => {
      const obj = rec || {};
      return Object.keys(obj).map(id => ({ id, ...obj[id] }));
    })
  );

  // On garde une copie locale pour step()/toggleRandom()
  private latestBots: Record<string, Bot> = {};
  constructor() {
    // abonne une seule fois pour le cache local
    this.bots$.subscribe(list => {
      const next: Record<string, Bot> = {};
      for (const b of list) next[b.id] = b;
      this.latestBots = next;
    });
  }

  selectedBotId: string | null = null;
  selectBot(id: string) { this.selectedBotId = id; }

  async addBot() {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);

    const path = ref(this.db, `bots/${this.roomId}/${id}`);
    await set(path, {
      x: 0, y: 0, random: false,
      displayName: `Bot ${id}`
    });
    this.selectedBotId = id;
  }

  async step(dx: number, dy: number) {
    const id = this.selectedBotId;
    if (!id) return;
    const current = this.latestBots[id] || {};
    const x = (current.x ?? 0) + dx;
    const y = (current.y ?? 0) + dy;
    await update(ref(this.db, `bots/${this.roomId}/${id}`), { x, y });
  }

  async toggleRandom() {
    const id = this.selectedBotId;
    if (!id) return;
    const current = this.latestBots[id] || {};
    await update(ref(this.db, `bots/${this.roomId}/${id}`), { random: !current.random });
  }

  // ===== DIAGNOSTIC (RTDB + Auth) =====
  diag = {
    uid: '',
    isAdminRTDB: false,
    ownerUid: '',
    canWriteBots: false,
  };

  async runDiag() {
    // auth uid
    this.diag.uid = this.auth.currentUser?.uid || '';

    // ownerUid depuis RTDB roomsMeta/{roomId}
    const metaSnap = await get(ref(this.db, `roomsMeta/${this.roomId}`));
    this.diag.ownerUid = (metaSnap.val() && metaSnap.val().ownerUid) || '';

    // isAdminRTDB (flag optionnel sous users/{uid}/admin:true)
    const adminSnap = await get(ref(this.db, `users/${this.diag.uid}/admin`));
    this.diag.isAdminRTDB = !!adminSnap.val();
  }

  async tryWriteTest() {
    try {
      const testRef = ref(this.db, `bots/${this.roomId}/__test__`);
      await set(testRef, { t: Date.now() });
      this.diag.canWriteBots = true;
    } catch {
      this.diag.canWriteBots = false;
    } finally {
      // best effort: on nettoie le test si possible
      try { await set(ref(this.db, `bots/${this.roomId}/__test__`), null); } catch {}
    }
  }
}
