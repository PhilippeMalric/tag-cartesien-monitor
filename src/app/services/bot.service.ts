import { Injectable, WritableSignal, inject } from '@angular/core';
import {
  Database, getDatabase, ref, onValue, push, set, update, runTransaction, get
} from '@angular/fire/database';
import { Auth } from '@angular/fire/auth';
import {
  Firestore, deleteField, doc, updateDoc,
  writeBatch, serverTimestamp, setDoc
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BotLocal } from '../sim/match-sim.types';

export type Bot = {
  id: string;
  displayName: string;
  x: number;
  y: number;
  createdAt: number;
  updatedAt: number;
  role?: string;
  random?: boolean;
};

@Injectable({ providedIn: 'root' })
export class BotService {
  private db: Database = getDatabase();
  private readonly fs = inject(Firestore);
  private auth = inject(Auth);

  private snack = inject(MatSnackBar);
  toast = (m: string): void => { this.snack.open(m, 'OK', { duration: 1800 }); };
  rnd(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
  clamp(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)); }

  /* -------------------- Helpers -------------------- */

  /** Normalise un rôle pour matcher la logique des règles (FR/EN) */
  private normalizeRole(role: string): 'hunter' | 'chasseur' | 'prey' | 'chassé' {
    if (!role) return 'chassé';
    const r = role.toLowerCase().trim();
    if (['hunter', 'chasseur'].includes(r)) return (r === 'chasseur' ? 'chasseur' : 'hunter');
    // tout le reste = proie
    return r === 'prey' ? 'prey' : 'chassé';
  }

  /** S’assure que roomsMeta/{roomId}/ownerUid est défini (si absent) */
  async ensureOwnership(roomId: string) {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    const ownerRef = ref(this.db, `roomsMeta/${roomId}/ownerUid`);
    const snap = await get(ownerRef);
    if (!snap.exists()) {
      // Règle RTDB: écriture permise si !data.exists()
      await set(ownerRef, uid);
    }
  }

  /** Vérifie sommairement le claim admin côté client (utile pour debug) */
  async isAdminClaim(): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) return false;
    const t = await user.getIdTokenResult(true);
    return t.claims?.['admin'] === true || t.claims?.['admin'] === 'true';
    // (On tolère 'true' string par précaution côté règles)
  }

  /* -------------------- Flux lecture -------------------- */

  /** Flux des bots d’une room (objets triés par displayName) */
  bots$(roomId: string): Observable<Bot[]> {
    const botsRef = ref(this.db, `bots/${roomId}`);
    return new Observable<Bot[]>(subscriber => {
      const off = onValue(botsRef, (snap) => {
        const val = snap.val() as Record<string, any> | null;
        const arr: Bot[] = val
          ? Object.entries(val).map(([id, b]) => ({ id, ...(b as object) })) as Bot[]
          : [];
        arr.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
        subscriber.next(arr);
      }, (err) => subscriber.error(err));
      return () => off();
    });
  }

  /* -------------------- Création / spawn -------------------- */

  /** Ajoute un bot simple et retourne son id virtuel (ex: 'bot-<key>') */
  async addBot(roomId: string, displayName = 'Bot', role: string = 'prey') {
    await this.ensureOwnership(roomId);

    // 1) RTDB
    const botsRef = ref(this.db, `bots/${roomId}`);
    const newRef = push(botsRef);
    const now = Date.now();
    const normRole = this.normalizeRole(role);
    await set(newRef, {
      displayName,
      x: 0, y: 0,
      role: normRole,
      type: 'bot',
      createdAt: now, updatedAt: now
    });

    // 2) Firestore (roles map)
    const botUid = `bot-${newRef.key!}`;
    await updateDoc(doc(this.fs, 'rooms', roomId), {
      [`roles.${botUid}`]: normRole
    });

    // 3) Firestore (player snapshot minimal – pratique pour UI/queries)
    await setDoc(doc(this.fs, `rooms/${roomId}/players/${botUid}`), {
      uid: botUid,
      displayName: `🤖 ${displayName}`,
      isConnected: false,
      ready: true,
      x: 0, y: 0,
      lastUpdate: serverTimestamp(),
      role: normRole
    }, { merge: true });

    return botUid;
  }

  /**
   * Spawn de N bots:
   * - RTDB: /bots/{roomId}/{botId}
   * - FS:   batch players/* + merge roles
   * Retourne les ids virtuels (bot-<key>) créés.
   */
  async spawnBots(roomId:string,role: string = 'prey',nbBots:number,bots:WritableSignal<BotLocal[]>): Promise<void> {
  
  if (!roomId) return this.toast('Room ID manquant');

  try {
    // 1) S’assure que l’owner est posé en RTDB (tes règles l’exigent)
    await this.ensureOwnership(roomId);

    const bound = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
    const count = bound(nbBots | 0, 1, 50);

    const now = Date.now();
    const list: BotLocal[] = [];
    const normRole = this.normalizeRole(role);

    // 2) Prépare batch Firestore + writes RTDB en parallèle
    const batch = writeBatch(this.fs);
    const rtdbWrites: Promise<any>[] = [];
    const rolesPatch: Record<string, string> = {}; // ➜ un seul merge pour roles
    const roomRef = doc(this.fs, `rooms/${roomId}`);

    for (let i = 0; i < count; i++) {
      const botId = `bot-${now}-${i}`;
      const x = this.rnd(-20, 20);
      const y = this.rnd(-20, 20);
      list.push({ id: botId, x, y, h: null });

      // RTDB (faible latence)
      rtdbWrites.push(
        set(ref(this.db, `bots/${roomId}/${botId}`), {
          x, y, t: Date.now(),
          name: `Bot ${i + 1}`,
          role: normRole,
          type: 'bot'
        })
      );

      // FS: player snapshot (whitelist ok avec tes règles)
      const pRef = doc(this.fs, `rooms/${roomId}/players/${botId}`);
      batch.set(pRef, {
        uid: botId,
        displayName: `🤖 Bot ${i + 1}`,
        isConnected: false,
        ready: true,
        x, y,
        lastUpdate: serverTimestamp(),
        role: normRole
      }, { merge: true });

      // On agrège les rôles pour un seul set/merge à la fin
      rolesPatch[botId] = normRole;
    }

    // 3) Un seul patch pour rooms/{id}.roles (évite d’écraser/émettre N fois)
    batch.set(roomRef, { roles: rolesPatch } as any, { merge: true });

    // 4) Exécutions
    await Promise.all(rtdbWrites);
    await batch.commit();

    // 5) État local + toast
    bots.update(b => [...b, ...list]);
    this.toast(`${count} bot${count > 1 ? 's' : ''} créé${count > 1 ? 's' : ''} (${normRole})`);
  } catch (err: any) {
    console.error('spawnBots error', err);
    // Aide rapide si permission_denied côté RTDB
    if (String(err?.message || '').includes('permission_denied')) {
      this.toast('Permission refusée (RTDB). Vérifie roomsMeta/ownerUid ou le claim admin.');
    } else {
      this.toast('Erreur lors de la création des bots.');
    }
  }
}

  /* -------------------- Opérations sur bots -------------------- */

  /** Déplacement relatif dx/dy (atomique via transaction) */
  async moveBot(roomId: string, botId: string, dx: number, dy: number) {
    const botRef = ref(this.db, `bots/${roomId}/${botId}`);
    await runTransaction(botRef, (cur: any) => {
      if (!cur) return cur;
      const nx = (cur.x ?? 0) + dx;
      const ny = (cur.y ?? 0) + dy;
      return { ...cur, x: nx, y: ny, updatedAt: Date.now() };
    });
  }

  /** Déplacement absolu */
  async setPos(roomId: string, botId: string, x: number, y: number) {
    const botRef = ref(this.db, `bots/${roomId}/${botId}`);
    await update(botRef, { x, y, updatedAt: Date.now() });
  }

  /** Change le rôle d’un bot (RTDB + Firestore.roles + player.role) */
  async setBotRole(roomId: string, botId: string, role: string) {
    const normRole = this.normalizeRole(role);

    // RTDB
    await update(ref(this.db, `bots/${roomId}/${botId}`), { role: normRole, updatedAt: Date.now() });

    // Firestore: roles map
    await updateDoc(doc(this.fs, 'rooms', roomId), { [`roles.${botId}`]: normRole });

    // Firestore: player snapshot
    await updateDoc(doc(this.fs, `rooms/${roomId}/players/${botId}`), { role: normRole, lastUpdate: serverTimestamp() });
  }

  /** Active/désactive le comportement aléatoire (RTDB) */
  async setBotRandom(roomId: string, botId: string, random: boolean) {
    await update(ref(this.db, `bots/${roomId}/${botId}`), { random, updatedAt: Date.now() });
  }

  /** Supprime une liste de bots */
  async clearBots(roomId: string, botKeys: string[]) {
    // RTDB
    const updates: Record<string, null> = {};
    for (const k of botKeys) updates[k] = null;
    await update(ref(this.db, `bots/${roomId}`), updates);

    // Firestore
    const batch = writeBatch(this.fs);
    const patch: any = {};

    for (const k of botKeys) {
      // k = clé RTDB sous /bots/{roomId}/{k}
      // Certains parcours auront k = 'bot-...' (spawnBots),
      // d'autres k = '<pushKey>' (addBot).
      const uid = k.startsWith('bot-') ? k : `bot-${k}`;
      patch[`roles.${uid}`] = deleteField();
      batch.delete(doc(this.fs, `rooms/${roomId}/players/${uid}`));
    }

    batch.update(doc(this.fs, 'rooms', roomId), patch);
    await batch.commit();
  }

  trackByUid = (_: number, p: { uid: string }) => p.uid;
}
