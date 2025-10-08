// src/app/sim/match-sim.store.ts
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, startWith, switchMap, tap } from 'rxjs/operators'; // + tap

import { Database, ref, update } from '@angular/fire/database';
import { Firestore, doc, docData, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

import { BotLocal, DotDTO, MatchStatusVM, MatchStatusState } from './match-sim.types';
import { BotService } from '../services/bot.service';
import { MonitorActionsService } from '../services/monitor-actions.service';
import { PositionsService } from '../services/positions.service';
import { RtdbPositionsService } from '../services/rtdb-positions.service';
import { MonitorReadService } from '../services/monitor-read.service';

// NEW (events): importe ton MonitorService (adapte le chemin si besoin)
// NEW (events): si tu as un type d'event, importe-le ici. Sinon on reste en `any`.
// import { EventItem } from '../models/event.model';

@Injectable({ providedIn: 'root' })
export class MatchSimStore {
  // Services
  private db = inject(Database);
  private fs = inject(Firestore);
  private route = inject(ActivatedRoute);
  private rtdbPos = inject(RtdbPositionsService);
  private positions = inject(PositionsService);
  private actions = inject(MonitorActionsService);
  private auth = inject(Auth);
  private botService = inject(BotService);
  // NEW (events)
  private monitor = inject(MonitorReadService);

  // Signals (état local)
  readonly newRoomName = signal<string>('');
  readonly roomId = signal<string>('');
  readonly nbBots = signal<number>(6);
  readonly speed = signal<number>(300);
  readonly victimUid = signal<string | null>(null);
  readonly bots = signal<BotLocal[]>([]);

  readonly gameStarted = signal<boolean>(false);
  readonly phaseSig = computed<'pre' | 'running'>(() => (this.gameStarted() ? 'running' : 'pre'));

  // Doc room courant (Firestore)
  readonly roomDocSig = signal<any | null>(null);

private tickerH: number | null = null;
private freezeUntilMs = new Map<string, number>(); // botId -> timestamp (ms) jusqu'à quand on le "gèle"

  // Statut combiné pour l’UI
  readonly statusSig = computed<MatchStatusVM>(() => {
    const room = this.roomDocSig();
    const state = (room?.state ?? (this.gameStarted() ? 'running' : 'idle')) as MatchStatusState;
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
      state === 'running' ? 'En cours' :
      state === 'ended' || state === 'done' ? 'Terminée' : 'Préparation';

    const color: 'primary' | 'accent' | 'warn' =
      state === 'running' ? 'primary' : (state === 'idle' ? 'accent' : 'warn');

    return { state, label, color, elapsedMs, leftMs, progress01 };
  });

  // Stream des positions (RTDB)
  readonly dots$: Observable<DotDTO[]> = toObservable(this.roomId).pipe(
    map(id => (id ?? '').trim()),
    distinctUntilChanged(),
    filter(id => !!id.length),
    switchMap(id => this.rtdbPos.liveMap$(id) as Observable<DotDTO[]>),
  );



  // NEW (events): anti-doublons pour ne pas traiter 2x le même event
  private processedEventIds = new Set<string>();

  constructor() {
    // RoomId initial depuis la route
    effect(() => {
      const id = this.route.snapshot.paramMap.get('id');
      if (id) this.roomId.set(id);
    });

    // Abonnement au doc room
    effect(() => {
      const id = (this.roomId() || '').trim();
      if (!id) { this.roomDocSig.set(null); return; }

      const sub = docData(doc(this.fs, 'rooms', id))
        .pipe(startWith(null), catchError(() => of(null)))
        .subscribe(d => this.roomDocSig.set(d));
      return () => sub.unsubscribe();
    });

    // NEW (events): écoute les derniers 50 events et téléporte les bots ciblés
    effect(() => {
      const roomId = (this.roomId() || '').trim();
      if (!roomId) return;

      const sub = this.monitor.events$(roomId, 50)
        .pipe(
          tap((list: any[]) => {
            // Suppose que chaque event a { id, targetUid, ... }
            const botIds = new Set(this.bots().map(b => b.id));
            for (const ev of (list || [])) {
              const evId: string | undefined = ev?.id;
              if (!evId || this.processedEventIds.has(evId)) continue;

              const targetUid: string | undefined = ev?.targetUid ?? ev?.victimUid ?? ev?.uid;
              if (targetUid && botIds.has(targetUid)) {
                this.processedEventIds.add(evId);
                // Téléporte aléatoirement le bot ciblé
                void this.teleportBotRandom(roomId, targetUid);
              }
            }
          })
        )
        .subscribe();

      return () => sub.unsubscribe();
    });
  }

  // --- Actions ---

  listen(): void {
    const id = this.roomId().trim();
    if (!id) return this.botService.toast('Entre un Room ID');
    this.positions.startListening(id);
  }

  unlisten(): void {
    this.positions.stop();
  }

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
      await this.setRoomState('idle');
      this.botService.toast(`Room “${finalName}” créée (id: ${roomId.slice(0, 6)}…)`);
    } catch (e: any) {
      this.botService.toast(`Création échouée : ${e?.message ?? e}`);
    }
  }

  async spawnBots(role: string = 'prey'): Promise<void> {
    await this.botService.spawnBots(this.roomId(), role, this.nbBots(), this.bots);
    this.gameStarted.set(false);
    await this.setRoomState('idle');
  }

  start(): void {
    const id = this.roomId().trim();
    if (!id) return this.botService.toast('Room ID manquant');

    // évite multiples tickers
    if (this.tickerH != null) return;

    const tick = Math.max(80, this.speed());
    const WORLD = { minX: -45, maxX: 45, minY: -30, maxY: 30 };

    this.gameStarted.set(true);

    this.tickerH = window.setInterval(async () => {
        const bots = [...this.bots()];
        if (!bots.length) return;

        const now = Date.now();
        for (let i = 0; i < bots.length; i++) {
            const b = bots[i];
            const frozenUntil = this.freezeUntilMs.get(b.id) ?? 0;

            if (now < frozenUntil) {
            // encore gelé : ne pas bouger (et on garde sa position telle quelle)
            continue;
            } else if (frozenUntil) {
            // le gel vient d’expirer : on supprime la marque
            this.freezeUntilMs.delete(b.id);
            }

            const nx = this.botService.clamp(b.x + this.botService.rnd(-1, 1), WORLD.minX, WORLD.maxX);
            const ny = this.botService.clamp(b.y + this.botService.rnd(-1, 1), WORLD.minY, WORLD.maxY);
            bots[i] = { ...b, x: nx, y: ny, h: null };
        }
        this.bots.set(bots);

        // payload batch (écrit aussi les bots gelés, mais sans les bouger)
        const t = Date.now();
        const payload: Record<string, unknown> = {};
        for (const b of bots) {
            payload[`bots/${id}/${b.id}/x`] = b.x;
            payload[`bots/${id}/${b.id}/y`] = b.y;
            payload[`bots/${id}/${b.id}/t`] = t;
        }
        await update(ref(this.db), payload);
        }, tick);

            this.setRoomState('running');
            this.botService.toast('Partie démarrée');
        }

  stop(): void {
    if (this.tickerH != null) {
      clearInterval(this.tickerH);
      this.tickerH = null;
    }
    const bots = this.bots().map(b => ({ ...b, h: null }));
    this.bots.set(bots);

    this.gameStarted.set(false);
    this.setRoomState('idle');
    this.botService.toast('Partie terminée');
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

  // --- Helpers ---

  // --- Modifie teleportBotRandom : maj locale + gel du bot ---
    private async teleportBotRandom(roomId: string, botId: string): Promise<void> {
        const WORLD = { minX: -45, maxX: 45, minY: -30, maxY: 30 };
        const rnd = (min: number, max: number) => Math.random() * (max - min) + min;
        const x = rnd(WORLD.minX, WORLD.maxX);
        const y = rnd(WORLD.minY, WORLD.maxY);

        // 1) MAJ locale immédiate (évite que le prochain tick reparte de l’ancienne position)
        this.bots.update(list => {
            const idx = list.findIndex(b => b.id === botId);
            if (idx >= 0) {
            const copy = [...list];
            copy[idx] = { ...copy[idx], x, y }; // pas de h ici
            return copy;
            }
            return list;
        });

        // 2) Geler le bot pendant 1500 ms (ajuste selon ton besoin)
        this.freezeUntilMs.set(botId, Date.now() + 1500);

        // 3) Écrire en RTDB (source de vérité)
        await update(ref(this.db, `bots/${roomId}/${botId}`), { x, y, t: Date.now() });
    }

  // --- Firestore helper ---
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
