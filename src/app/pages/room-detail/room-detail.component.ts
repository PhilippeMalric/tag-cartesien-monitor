import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { AsyncPipe, DatePipe, DecimalPipe, JsonPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { MonitorReadService } from '../../services/monitor-read.service';
import { RtdbPositionsService } from '../../services/rtdb-positions.service';
import { RoomDoc, PosDTO } from '../../models/monitor.models';
import { RoomVM } from '../../models/room.model'; // garde si utilisé dans confirmDelete()

import { Database, ref, set, update, get } from '@angular/fire/database';
import { objectVal } from 'rxfire/database';
import { Auth } from '@angular/fire/auth';
import { map } from 'rxjs/operators';
import { combineLatest, firstValueFrom, Observable } from 'rxjs';

// Carte temps réel (présente sur la page)
import { RoomLiveMapComponent } from './room-live-map/room-live-map.component';

type Bot = { id: string; x?: number; y?: number; displayName?: string; random?: boolean };
type PositionItem = { id: string; isBot: boolean; x: number; y: number };

@Component({
  standalone: true,
  selector: 'app-room-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe, DatePipe, DecimalPipe, JsonPipe, RouterLink,
    RoomLiveMapComponent,
  ],
  templateUrl: './room-detail.component.html',
})
export class RoomDetailComponent {
  private route = inject(ActivatedRoute);
  private read = inject(MonitorReadService);
  private rtdbPos = inject(RtdbPositionsService);
  private db = inject(Database);
  private auth = inject(Auth);
  private router = inject(Router);

  readonly roomId: string = this.route.snapshot.paramMap.get('id')!;

  // Room seule
  readonly room$: Observable<RoomDoc> = this.read.room$(this.roomId) as any;

  // Players de la room (séparé)
  readonly players$ = this.read.players$(this.roomId);

  // VM combiné pour le template (évite d'accéder à room.players)
  readonly vm$ = combineLatest([this.room$, this.players$]).pipe(
    map(([room, players]) => ({ room, players }))
  );

  // Positions (live) transformées pour la liste
  readonly positions$: Observable<PositionItem[]> =
    this.rtdbPos.liveMap$(this.roomId).pipe(
      map((dots: PosDTO[]) =>
        (dots ?? [])
          .map((d: PosDTO) => ({
            id: d.uid ?? '',
            isBot: (d.uid ?? '').startsWith('bot-'),
            x: d.x,
            y: d.y,
          }))
          .sort((a, b) => Number(a.isBot) - Number(b.isBot))
      )
    );

  // ===== BOTS (RTDB: bots/{roomId}/{botId}) =====
  readonly bots$: Observable<Bot[]> = objectVal<Record<string, Omit<Bot, 'id'>> | null>(
    ref(this.db, `bots/${this.roomId}`)
  ).pipe(
    map(rec => {
      const obj = rec ?? {};
      return Object.keys(obj).map(id => ({ id, ...obj[id] }));
    })
  );

  /** cache local pour step() / toggleRandom() */
  private latestBots: Record<string, Bot> = {};

  constructor() {
    this.bots$.subscribe(list => {
      const next: Record<string, Bot> = {};
      for (const b of list) next[b.id] = b;
      this.latestBots = next;
    });
  }

  selectedBotId: string | null = null;
  selectBot(id: string) { this.selectedBotId = id; }

  async addBot(): Promise<void> {
    const id =
      typeof crypto !== 'undefined' && (crypto as any)?.randomUUID
        ? (crypto as any).randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);

    const path = ref(this.db, `bots/${this.roomId}/${id}`);
    await set(path, { x: 0, y: 0, random: false, displayName: `Bot ${id}` });
    this.selectedBotId = id;
  }

  async step(dx: number, dy: number): Promise<void> {
    const id = this.selectedBotId;
    if (!id) return;
    const current = this.latestBots[id] ?? {};
    const x = (current.x ?? 0) + dx;
    const y = (current.y ?? 0) + dy;
    await update(ref(this.db, `bots/${this.roomId}/${id}`), { x, y });
  }

  async toggleRandom(): Promise<void> {
    const id = this.selectedBotId;
    if (!id) return;
    const current = this.latestBots[id] ?? {};
    await update(ref(this.db, `bots/${this.roomId}/${id}`), { random: !current.random });
  }

  // ===== DIAGNOSTIC (RTDB + Auth) =====
  diag = {
    uid: '',
    isAdminRTDB: false,
    ownerUid: '',
    canWriteBots: false,
  };

  async runDiag(): Promise<void> {
    this.diag.uid = this.auth.currentUser?.uid || '';
    const metaSnap = await get(ref(this.db, `roomsMeta/${this.roomId}`));
    this.diag.ownerUid = (metaSnap.val() && metaSnap.val().ownerUid) || '';
    const adminSnap = await get(ref(this.db, `users/${this.diag.uid}/admin`));
    this.diag.isAdminRTDB = !!adminSnap.val();
  }

  async tryWriteTest(): Promise<void> {
    try {
      const testRef = ref(this.db, `bots/${this.roomId}/__test__`);
      await set(testRef, { t: Date.now() });
      this.diag.canWriteBots = true;
    } catch {
      this.diag.canWriteBots = false;
    } finally {
      try { await set(ref(this.db, `bots/${this.roomId}/__test__`), null); } catch {}
    }
  }

  async confirmDelete(): Promise<void> {
    const room = await firstValueFrom(this.room$);
    const roomId = (room as RoomDoc | RoomVM | undefined)?.id;
    if (!roomId) return;

    const ok = window.confirm(
      `Supprimer définitivement la room ${roomId} ?\n` +
      `Sous-collections 'events' et 'players' incluses.`
    );
    if (!ok) return;

    try {
      await this.read.deleteRoom(roomId);
      try { await set(ref(this.db, `bots/${roomId}`), null); } catch {}
      this.router.navigateByUrl('/rooms');
    } catch (e) {
      alert('Échec de suppression : ' + (e as Error).message);
    }
  }
}
