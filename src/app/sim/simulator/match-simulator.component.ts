import { Component, ChangeDetectionStrategy, inject, Injector, signal, effect } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';

import { RoomInputComponent } from '../../sim/room-input/room-input.component';
import { CreateRoomComponent } from '../../sim/create-room/create-room.component';
import { BotsControlsComponent } from '../../sim/bots-controls/bots-controls.component';
import { TagControlsComponent } from '../../sim/tag-controls/tag-controls.component';
import { FieldCanvasComponent } from '../../sim/field-canvas/field-canvas.component';
import { RoomSelectComponent } from '../../sim/room-select/room-select.component';

import { toObservable } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { distinctUntilChanged, map, switchMap, filter } from 'rxjs/operators';

import { Database, ref, update } from '@angular/fire/database';
import { Auth } from '@angular/fire/auth';

import { PositionsService } from '../../services/positions.service';
import { BotService } from '../../services/bot.service';
import { RtdbPositionsService } from '../../services/rtdb-positions.service';
import { MonitorActionsService } from '../../services/monitor-actions.service';
import { PlayersControlsComponent } from '../players-controls/players-controls.component';

export type BotLocal = { id: string; x: number; y: number; h: number | null };
export type DotDTO = { x: number; y: number; uid?: string };

@Component({
  selector: 'app-match-simulator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    MatCardModule, MatSnackBarModule, MatDividerModule,
    RoomInputComponent, CreateRoomComponent,
    BotsControlsComponent, TagControlsComponent, FieldCanvasComponent,
    RoomSelectComponent, PlayersControlsComponent
  ],
  templateUrl: './match-simulator.component.html',
  styleUrls: ['./match-simulator.component.css'],
})
export class MatchSimulatorComponent {
  private injector = inject(Injector);
  private db = inject(Database);
  private positions = inject(PositionsService);
  private route = inject(ActivatedRoute);
  private botService = inject(BotService);

  // nouveaux services
  private rtdbPos = inject(RtdbPositionsService);
  private actions = inject(MonitorActionsService);
  private auth = inject(Auth);

  // utils
  displayMs = (v: number | null): string => `${v ?? 0} ms`;

  newRoomName = signal<string>('');
  roomId = signal<string>('');
  nbBots = signal<number>(6);
  speed = signal<number>(300);
  victimUid = signal<string | null>(null);
  bots = signal<BotLocal[]>([]);

  constructor() {
    effect(() => {
      const id = this.route.snapshot.paramMap.get('id');
      if (id) this.roomId.set(id);
    });
  }

  dots$: Observable<DotDTO[]> = toObservable(this.roomId).pipe(
    map(id => (id ?? '').trim()),
    distinctUntilChanged(),
    filter(id => !!id.length),
    switchMap(id => this.rtdbPos.liveMap$(id) as Observable<DotDTO[]>),
  );

  async createRoomAndUseIt(): Promise<void> {
    const name = this.newRoomName().trim();
    if (!name) { this.botService.toast('Donne un nom de room'); return; }
    const ownerUid = this.auth.currentUser?.uid;
    if (!ownerUid) { this.botService.toast('Connecte-toi pour créer une room'); return; }

    try {
      const { roomId, name: finalName } = await this.actions.createRoomWithOwner(name, ownerUid);
      this.roomId.set(roomId);
      this.listen();
      this.botService.toast(`Room “${finalName}” créée (id: ${roomId.slice(0, 6)}…)`);
    } catch (e: any) {
      this.botService.toast(`Création échouée : ${e?.message ?? e}`);
    }
  }

  listen(): void {
    const id = this.roomId().trim();
    if (!id) return this.botService.toast('Entre un Room ID');
    this.positions.startListening(id);
  }

  unlisten(): void {
    this.positions.stop();
  }

  // Optionnel : normalise en valeurs attendues par les règles
  normalizeRole(role: string): 'hunter' | 'chasseur' | 'prey' | 'proie' {
    const r = (role ?? '').toLowerCase().trim();
    if (r === 'hunter' || r === 'chasseur') return (r as any);
    if (r === 'prey' || r === 'proie') return (r as any);
    // fallback utile : tout ce qui n'est pas hunter/chasseur => proie
    return 'prey';
  }

  /**
   * Spawn N bots et leur **assigne un rôle** :
   * - RTDB: /bots/{roomId}/{botId} (x,y,t,name,role,type)
   * - Firestore: /rooms/{roomId}/players/{botId} + rooms/{roomId}.roles[botId]
   * Compatible avec tes règles (owner requis pour MAJ room.roles).
   */
  async spawnBots(role: string = 'prey'): Promise<void> {
    await this.botService.spawnBots(this.roomId(), role, this.nbBots(), this.bots);
  }

  start(): void {
    const id = this.roomId().trim();
    if (!id) return this.botService.toast('Room ID manquant');

    const bots = this.bots();
    if (!bots.length) return this.botService.toast('Spawn des bots d’abord');

    const tick = Math.max(80, this.speed());
    const WORLD = { minX: -45, maxX: 45, minY: -30, maxY: 30 };

    for (let i = 0; i < bots.length; i++) {
      if (bots[i].h != null) continue;
      const h = window.setInterval(async () => {
        bots[i].x = this.botService.clamp(bots[i].x + this.botService.rnd(-1, 1), WORLD.minX, WORLD.maxX);
        bots[i].y = this.botService.clamp(bots[i].y + this.botService.rnd(-1, 1), WORLD.minY, WORLD.maxY);
        await update(ref(this.db, `bots/${id}/${bots[i].id}`), {
          x: bots[i].x, y: bots[i].y, t: Date.now(),
        });
      }, tick + ((i % 3) * 70));
      bots[i] = { ...bots[i], h };
    }

    this.bots.set([...bots]);
    this.botService.toast('Mouvements démarrés');
  }

  stop(): void {
    const bots = this.bots();
    bots.forEach(b => {
      if (b.h != null) {
        clearInterval(b.h);
        b.h = null;
      }
    });
    this.bots.set([...bots]);
    this.botService.toast('Mouvements stoppés');
  }

  async simulateTag(dots: DotDTO[]): Promise<void> {
    const id = this.roomId().trim();
    if (!id) return this.botService.toast('Room ID manquant');
    if (!dots?.length) return this.botService.toast('Pas de cibles');

    const victim = this.victimUid() || dots[0].uid;
    const target = victim ? dots.find(d => d.uid === victim) : undefined;
    if (!target || !target.uid) return this.botService.toast('Cible invalide');

    // Acteur = utilisateur courant (comme avant avec MatchService)
    const actorUid = this.auth.currentUser?.uid;
    if (!actorUid) { this.botService.toast('Connecte-toi pour émettre un TAG'); return; }

    try {
      await this.actions.emitTag(id, actorUid, target.uid, target.x, target.y);
      this.botService.toast(`TAG → ${target.uid.slice(0, 6)}…`);
    } catch (e: any) {
      this.botService.toast(`TAG refusé : ${e?.message ?? e}`);
    }
  }
}
