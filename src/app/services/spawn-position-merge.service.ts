// src/app/services/spawn-position-merge.service.ts
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';

// Firestore (spawns / infos player)
import {
  Firestore, collection, collectionData, DocumentData, CollectionReference,
} from '@angular/fire/firestore';

// RTDB (positions live)
import { Database, ref, onValue, off } from '@angular/fire/database';

export type Vec = { x:number; y:number };
export type SpawnDTO = {
  uid: string;
  displayName?: string;
  role?: string;           // 'hunter'/'prey' (ou 'chasseur'/'proie')
  spawn?: Vec;             // Firestore: players/{uid}.spawn
};
export type PosDTO = { x:number; y:number; t?:number; name?:string; role?:string };

export type MergedRow = {
  uid: string;
  name?: string;
  role?: string;
  spawnX?: number;
  spawnY?: number;
  x?: number;              // position courante (RTDB)
  y?: number;
  t?: number;              // timestamp RTDB si dispo
  isBot?: boolean;
};

@Injectable({ providedIn: 'root' })
export class SpawnPositionMergeService {
  private fs = inject(Firestore);
  private db = inject(Database);

  private subPlayersFS?: Subscription;
  private rtdbRefPlayers: any = null;
  private rtdbRefBots: any = null;
  private rtdbCbPlayers: any = null;
  private rtdbCbBots: any = null;

  private _spawns$    = new BehaviorSubject<Record<string, SpawnDTO>>({});
  private _rtdbP$     = new BehaviorSubject<Record<string, PosDTO>>({});
  private _rtdbBots$  = new BehaviorSubject<Record<string, PosDTO>>({});
  private _merged$    = new BehaviorSubject<MergedRow[]>([]);

  /** Flux public fusionné (table prête à afficher) */
  readonly merged$ = this._merged$.asObservable();

  /** Lance l’écoute Firestore + RTDB et publie le tableau fusionné */
  start(matchId: string) {
    this.stop();
    if (!matchId) return;

    // 1) Firestore: /rooms/{roomId}/players (pour spawn/role/displayName)
    const col = collection(this.fs, `rooms/${matchId}/players`) as CollectionReference<DocumentData>;
    this.subPlayersFS = collectionData(col, { idField: 'uid' }).subscribe((arr: any[]) => {
      const dict: Record<string, SpawnDTO> = {};
      for (const p of arr || []) {
        const uid = String(p?.uid || '');
        if (!uid) continue;
        const spawn = p?.spawn && Number.isFinite(p.spawn.x) && Number.isFinite(p.spawn.y)
          ? { x: Number(p.spawn.x), y: Number(p.spawn.y) } : undefined;
        const role = (p?.role ?? undefined);
        const displayName = (p?.displayName ?? undefined);
        dict[uid] = { uid, spawn, role, displayName };
      }
      this._spawns$.next(dict);
    });

    // 2) RTDB: positions/{roomId} (joueurs)
    this.rtdbRefPlayers = ref(this.db, `positions/${matchId}`);
    this.rtdbCbPlayers = (snap: any) => {
      const val = (snap.val() || {}) as Record<string, PosDTO>;
      const norm: Record<string, PosDTO> = {};
      for (const [uid, p] of Object.entries(val)) {
        if (!p) continue;
        const x = Number((p as any).x), y = Number((p as any).y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        norm[uid] = { x, y, t: typeof p.t === 'number' ? p.t : undefined, name: p.name, role: p.role };
      }
      this._rtdbP$.next(norm);
    };
    onValue(this.rtdbRefPlayers, this.rtdbCbPlayers);

    // 3) RTDB: bots/{roomId} (bots)
    this.rtdbRefBots = ref(this.db, `bots/${matchId}`);
    this.rtdbCbBots = (snap: any) => {
      const val = (snap.val() || {}) as Record<string, PosDTO>;
      const norm: Record<string, PosDTO> = {};
      for (const [id, p] of Object.entries(val || {})) {
        if (!p) continue;
        const x = Number((p as any).x), y = Number((p as any).y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        norm[id] = {
          x, y,
          t: typeof p.t === 'number' ? p.t : undefined,
          name: p.name ?? `Bot ${id}`,
          role: p.role ?? 'bot',
        };
      }
      this._rtdbBots$.next(norm);
    };
    onValue(this.rtdbRefBots, this.rtdbCbBots);

    // 4) Fusion continue → tableau MergedRow[]
    combineLatest([this._spawns$, this._rtdbP$, this._rtdbBots$]).subscribe(([spawns, posPlayers, posBots]) => {
      const rows: MergedRow[] = [];

      // joueurs (clé = uid)
      const playerUids = new Set<string>([...Object.keys(spawns), ...Object.keys(posPlayers)]);
      for (const uid of playerUids) {
        const s = spawns[uid];
        const p = posPlayers[uid];
        rows.push({
          uid,
          name: s?.displayName ?? p?.name,
          role: s?.role ?? p?.role,
          spawnX: s?.spawn?.x,
          spawnY: s?.spawn?.y,
          x: p?.x,
          y: p?.y,
          t: p?.t,
          isBot: false,
        });
      }

      // bots (clé = bot-<id> pour cohérence visuelle)
      for (const [id, p] of Object.entries(posBots)) {
        rows.push({
          uid: id.startsWith('bot-') ? id : `bot-${id}`,
          name: p.name ?? `Bot ${id}`,
          role: p.role ?? 'bot',
          spawnX: undefined,
          spawnY: undefined,
          x: p.x,
          y: p.y,
          t: p.t,
          isBot: true,
        });
      }

      // tri simple : bots après joueurs, puis uid
      rows.sort((a, b) => {
        if (!!a.isBot !== !!b.isBot) return a.isBot ? 1 : -1;
        return a.uid.localeCompare(b.uid);
      });

      this._merged$.next(rows);
    });
  }

  /** Stoppe tout et nettoie */
  stop() {
    this.subPlayersFS?.unsubscribe();
    this.subPlayersFS = undefined;

    if (this.rtdbRefPlayers && this.rtdbCbPlayers) off(this.rtdbRefPlayers, this.rtdbCbPlayers);
    if (this.rtdbRefBots && this.rtdbCbBots) off(this.rtdbRefBots, this.rtdbCbBots);
    this.rtdbRefPlayers = this.rtdbRefBots = this.rtdbCbPlayers = this.rtdbCbBots = null;

    this._spawns$.next({});
    this._rtdbP$.next({});
    this._rtdbBots$.next({});
    this._merged$.next([]);
  }
}
