import { Component, ChangeDetectionStrategy, inject, Injector, signal, effect, computed } from '@angular/core';
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
import { Observable, of } from 'rxjs';
import { distinctUntilChanged, map, switchMap, filter, startWith, catchError } from 'rxjs/operators';

import { Database, ref, update } from '@angular/fire/database';
import { Auth } from '@angular/fire/auth';

import { PositionsService } from '../../services/positions.service';
import { BotService } from '../../services/bot.service';
import { RtdbPositionsService } from '../../services/rtdb-positions.service';
import { MonitorActionsService } from '../../services/monitor-actions.service';
import { PlayersControlsComponent } from '../players-controls/players-controls.component';

// ⬇️ NEW: Firestore (lecture/écriture de l’état de manche)
import { Firestore, doc, docData, setDoc, serverTimestamp } from '@angular/fire/firestore';
import { MatChipsModule } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';

import { MatProgressBarModule } from '@angular/material/progress-bar';
import { NumericPositionsComponent } from '../numeric-positions/numeric-positions.component';

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
    RoomSelectComponent, PlayersControlsComponent, MatChipsModule,
    MatIcon,MatProgressBarModule,NumericPositionsComponent
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

  // services
  private rtdbPos = inject(RtdbPositionsService);
  private actions = inject(MonitorActionsService);
  private auth = inject(Auth);
  // ⬇️ NEW
  private fs = inject(Firestore);

  // utils
  displayMs = (v: number | null): string => `${v ?? 0} ms`;

  newRoomName = signal<string>('');
  roomId = signal<string>('');
  nbBots = signal<number>(6);
  speed = signal<number>(300);
  victimUid = signal<string | null>(null);
  bots = signal<BotLocal[]>([]);

  // état local → phase canvas
  gameStarted = signal<boolean>(false);
  phaseSig = computed<'pre' | 'running'>(() => this.gameStarted() ? 'running' : 'pre');

  // ⬇️ NEW: room live + statut de manche
  roomDocSig = signal<any | null>(null);

  // formateur mm:ss
  fmtTime(ms?: number | null) {
    if (!ms || ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const mm = Math.floor(s / 60).toString().padStart(2,'0');
    const ss = (s % 60).toString().padStart(2,'0');
    return `${mm}:${ss}`;
  }

  // Statut calculé pour l’UI à partir du doc room (fallback sur gameStarted si pas de state en DB)
  statusSig = computed(() => {
    const room = this.roomDocSig();
    const state = (room?.state ?? (this.gameStarted() ? 'running' : 'idle')) as 'idle'|'running'|'ended'|'done';

    // timeLimit (sec) + startedAt (ms) si disponibles
    const timeLimitSec: number | null = room?.timeLimit ?? null;
    const startedAtMs: number | null = room?.startedAt ?? null;

    let elapsedMs: number | null = null;
    let leftMs: number | null = null;
    let progress01: number | null = null;

    if (state === 'running' && timeLimitSec && startedAtMs) {
      const now = Date.now();
      elapsedMs = Math.max(0, now - startedAtMs);
      const totalMs = timeLimitSec * 1000;
      leftMs = Math.max(0, totalMs - elapsedMs);
      progress01 = Math.min(1, Math.max(0, elapsedMs / totalMs));
    }

    const label =
      state === 'running' ? 'En cours'
      : state === 'ended' || state === 'done' ? 'Terminée'
      : 'Préparation';

    const color: 'primary'|'accent'|'warn' =
      state === 'running' ? 'primary' : (state === 'idle' ? 'accent' : 'warn');

    return { state, label, color, elapsedMs, leftMs, progress01 };
  });

  constructor() {
    // RoomId depuis la route
    effect(() => {
      const id = this.route.snapshot.paramMap.get('id');
      if (id) this.roomId.set(id);
    });

    // ⬇️ NEW: subscribe au doc room quand roomId change
    effect(() => {
      const id = (this.roomId() || '').trim();
      if (!id) { this.roomDocSig.set(null); return; }

      const sub = docData(doc(this.fs, 'rooms', id))
        .pipe(startWith(null), catchError(() => of(null)))
        .subscribe(d => this.roomDocSig.set(d));
      return () => sub.unsubscribe();
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
      this.gameStarted.set(false);
      await this.setRoomState('idle'); // NEW: on écrit l’état
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

  normalizeRole(role: string): 'hunter' | 'chasseur' | 'prey' | 'proie' {
    const r = (role ?? '').toLowerCase().trim();
    if (r === 'hunter' || r === 'chasseur') return (r as any);
    if (r === 'prey' || r === 'proie') return (r as any);
    return 'prey';
  }

  async spawnBots(role: string = 'prey'): Promise<void> {
    await this.botService.spawnBots(this.roomId(), role, this.nbBots(), this.bots);
    this.gameStarted.set(false);
    await this.setRoomState('idle'); // NEW
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
    this.gameStarted.set(true);
    this.setRoomState('running'); // NEW
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
    this.gameStarted.set(false);
    this.setRoomState('idle'); // NEW
    this.botService.toast('Mouvements stoppés');
  }

  async simulateTag(dots: DotDTO[]): Promise<void> {
    const id = this.roomId().trim();
    if (!id) return this.botService.toast('Room ID manquant');
    if (!dots?.length) return this.botService.toast('Pas de cibles');

    const victim = this.victimUid() || dots[0].uid;
    const target = victim ? dots.find(d => d.uid === victim) : undefined;
    if (!target || !target.uid) return this.botService.toast('Cible invalide');

    const actorUid = this.auth.currentUser?.uid;
    if (!actorUid) { this.botService.toast('Connecte-toi pour émettre un TAG'); return; }

    try {
      await this.actions.emitTag(id, actorUid, target.uid, target.x, target.y);
      this.botService.toast(`TAG → ${target.uid.slice(0, 6)}…`);
    } catch (e: any) {
      this.botService.toast(`TAG refusé : ${e?.message ?? e}`);
    }
  }

  // ⬇️ NEW: écrit l’état de la manche dans rooms/{roomId}
  private async setRoomState(state: 'idle'|'running'|'ended') {
    const id = (this.roomId() || '').trim();
    if (!id) return;
    const roomRef = doc(this.fs, 'rooms', id);
    await setDoc(roomRef, {
      state,
      ...(state === 'running' ? { startedAt: Date.now() } : {}),
      updatedAt: serverTimestamp(),
    } as any, { merge: true });
  }
}
