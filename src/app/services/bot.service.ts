import { Injectable, inject } from '@angular/core';
import {
  Database, getDatabase, ref, onValue, push, set, update, runTransaction, get
} from '@angular/fire/database';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';
import { Firestore, deleteField, doc, updateDoc } from '@angular/fire/firestore';

export type Bot = {
  id: string;
  displayName: string;
  x: number;
  y: number;
  createdAt: number;
  updatedAt: number;
};

@Injectable({ providedIn: 'root' })
export class BotService {
  private db: Database = getDatabase();
  
  private readonly fs = inject(Firestore);
  
  private auth = inject(Auth);

  /** S’assure que roomsMeta/{matchId}/ownerUid est défini (si absent) */
  async ensureOwnership(matchId: string) {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    const ownerRef = ref(this.db, `roomsMeta/${matchId}/ownerUid`);
    const snap = await get(ownerRef);
    if (!snap.exists()) {
      // Rule côté RTDB: écriture permise si !data.exists()
      await set(ownerRef, uid);
    }
  }

  /** Flux des bots d’une room (objets triés par displayName) */
  bots$(matchId: string): Observable<Bot[]> {
    const botsRef = ref(this.db, `bots/${matchId}`);
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

  /** Ajoute un bot et retourne son id */
async addBot(roomId: string, displayName = 'Bot') {
  // 1) Crée le bot en RTDB (positions/comportement temps réel)
  const botsRef = ref(this.db, `bots/${roomId}`);
  const newRef = push(botsRef);
  const now = Date.now();
  await set(newRef, {
    displayName,
    x: 0, y: 0,
    createdAt: now, updatedAt: now
  });

  // 2) Expose ce bot côté UI via Firestore: rooms/{roomId}.roles
  //    On fabrique un uid "virtuel" stable pour l’UI:
  const botUid = `bot-${newRef.key!}`;
  await updateDoc(doc(this.fs, 'rooms', roomId), {
    // rôle par défaut; change en 'chasseur' si tu veux
    [`roles.${botUid}`]: 'chassé'
  });

  return botUid; // pratique pour log/gestion
}

  /** Déplacement relatif dx/dy (atomique via transaction) */
  async moveBot(matchId: string, botId: string, dx: number, dy: number) {
    const botRef = ref(this.db, `bots/${matchId}/${botId}`);
    await runTransaction(botRef, (cur: any) => {
      if (!cur) return cur;
      const nx = (cur.x ?? 0) + dx;
      const ny = (cur.y ?? 0) + dy;
      // (Optionnel) Clip dans une zone, ex. [-45,45]
      // const clip = (v: number) => Math.max(-45, Math.min(45, v));
      // return { ...cur, x: clip(nx), y: clip(ny), updatedAt: Date.now() };
      return { ...cur, x: nx, y: ny, updatedAt: Date.now() };
    });
  }

  /** Déplacement absolu */
  async setPos(matchId: string, botId: string, x: number, y: number) {
    const botRef = ref(this.db, `bots/${matchId}/${botId}`);
    await update(botRef, { x, y, updatedAt: Date.now() });
  }

  async clearBots(roomId: string, botKeys: string[]) {
    // RTDB
    const updates: Record<string, null> = {};
    for (const k of botKeys) updates[k] = null;
    await update(ref(this.db, `bots/${roomId}`), updates);

    // Firestore
    const patch: any = {};
    for (const k of botKeys) patch[`roles.bot-${k}`] = deleteField();
    await updateDoc(doc(this.fs, 'rooms', roomId), patch);
  }

}
