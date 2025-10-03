import { Injectable, inject } from '@angular/core';
import { Database, ref, set, onValue, off, onDisconnect, update } from '@angular/fire/database';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';

export type PosDTO = { x: number; y: number; t?: number; name?: string; role?: string };
export type Vec = { x: number; y: number };

@Injectable({ providedIn: 'root' })
export class PositionsService {
  private db = inject(Database);

  private mergeSub?: Subscription;
  roomId!: string; // assigne-la depuis Play/Monitor si besoin

  private _players$   = new BehaviorSubject<Record<string, PosDTO>>({});
  private _bots$      = new BehaviorSubject<Record<string, PosDTO>>({});
  private _positions$ = new BehaviorSubject<Record<string, PosDTO>>({});

  // flux publics
  readonly positions$ = this._positions$.asObservable();
  // (optionnel) expose aussi ces deux-là si utile dans l’UI
  readonly players$   = this._players$.asObservable();
  readonly bots$      = this._bots$.asObservable();

  private listenRefPlayers: any = null;
  private listenRefBots: any = null;
  private cbPlayers: any = null;
  private cbBots: any = null;

  /** Marque présence (RTDB onDisconnect cleanup) */
  attachPresence(matchId: string, uid: string) {
    if (!matchId || !uid) return;
    const r = ref(this.db, `presence/${matchId}/${uid}`);
    set(r, true).catch(() => {});
    try { onDisconnect(r).remove(); } catch {}
  }

  /**
   * Écrit la position "self" (joueur) avec options.
   * - t par défaut = Date.now()
   * - name/role optionnels
   */
  async writeSelf(
    matchId: string,
    uid: string,
    x: number,
    y: number,
    opts?: { t?: number; name?: string; role?: string }
  ) {
    if (!matchId || !uid) return;
    const r = ref(this.db, `positions/${matchId}/${uid}`);
    const payload: PosDTO = {
      x, y,
      t: opts?.t ?? Date.now(),
      ...(opts?.name ? { name: opts.name } : {}),
      ...(opts?.role ? { role: opts.role } : {}),
    };
    await set(r, payload);
  }

  /** Met à jour uniquement le rôle d’un joueur (sans toucher x/y) */
  async updateSelfRole(matchId: string, uid: string, role: string) {
    if (!matchId || !uid) return;
    await update(ref(this.db, `positions/${matchId}/${uid}`), { role, t: Date.now() });
  }

  /** Met à jour uniquement le nom d’un joueur */
  async updateSelfName(matchId: string, uid: string, name: string) {
    if (!matchId || !uid) return;
    await update(ref(this.db, `positions/${matchId}/${uid}`), { name, t: Date.now() });
  }

  /** Lance l’écoute RTDB des joueurs et bots et publie positions$ fusionné */
  startListening(matchId: string) {
    this.stop();
    if (!matchId) return;

    // Joueurs
    this.listenRefPlayers = ref(this.db, `positions/${matchId}`);
    this.cbPlayers = (snap: any) => {
      const val = (snap.val() || {}) as Record<string, PosDTO>;
      // Normalise: force types nombre et garde role/name si présents
      const norm: Record<string, PosDTO> = {};
      for (const [id, p] of Object.entries(val)) {
        if (!p) continue;
        const x = Number((p as any).x);
        const y = Number((p as any).y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        norm[id] = {
          x, y,
          t: typeof (p as any).t === 'number' ? (p as any).t : undefined,
          name: (p as any).name,
          role: (p as any).role, // on propage le rôle tel quel
        };
      }
      this._players$.next(norm);
    };
    onValue(this.listenRefPlayers, this.cbPlayers);

    // Bots
    this.listenRefBots = ref(this.db, `bots/${matchId}`);
    this.cbBots = (snap: any) => {
      const val = (snap.val() || {}) as Record<string, PosDTO>;
      const norm: Record<string, PosDTO> = {};
      for (const [id, p] of Object.entries(val)) {
        if (!p) continue;
        const x = Number((p as any).x);
        const y = Number((p as any).y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        norm[id] = {
          x, y,
          t: typeof (p as any).t === 'number' ? (p as any).t : undefined,
          name: (p as any).name ?? `Bot ${id}`,
          role: (p as any).role ?? 'bot', // ⬅️ role par défaut pour bots
        };
      }
      this._bots$.next(norm);
    };
    onValue(this.listenRefBots, this.cbBots);

    // Fusion joueurs + bots (bots préfixés)
    this.mergeSub = combineLatest([this._players$, this._bots$]).subscribe(([p, b]) => {
      const merged: Record<string, PosDTO> = { ...p };
      for (const [id, pos] of Object.entries(b || {})) {
        // Prefix pour distinguer (cohérent avec le reste de l’app)
        const key = id.startsWith('bot-') ? id : `bot-${id}`;
        merged[key] = pos;
      }
      this._positions$.next(merged);
    });
  }

  /** Arrête toutes les écoutes et remet à zéro les flux */
  stop() {
    this.mergeSub?.unsubscribe();
    this.mergeSub = undefined;

    if (this.listenRefPlayers && this.cbPlayers) off(this.listenRefPlayers, this.cbPlayers);
    if (this.listenRefBots && this.cbBots) off(this.listenRefBots, this.cbBots);

    this.listenRefPlayers = this.cbPlayers = this.listenRefBots = this.cbBots = null;

    this._players$.next({});
    this._bots$.next({});
    this._positions$.next({});
  }
}
