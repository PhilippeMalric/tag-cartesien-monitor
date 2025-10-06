import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, addDoc, serverTimestamp, writeBatch, doc,
  runTransaction
} from '@angular/fire/firestore';

import {
  AddPlayerInput, CreateRoomResult, RoleSimple
} from '../models/monitor.models';
import { httpsCallable } from 'firebase/functions';
import { Functions } from '@angular/fire/functions';

export type World = { minX:number; maxX:number; minY:number; maxY:number };


@Injectable({ providedIn: 'root' })
export class MonitorActionsService {
  private fs = inject(Firestore);

  private fns = inject(Functions);
  // --- Utils ---------------------------------------------------------
  private normRole(r?: string): RoleSimple {
    const v = (r || '').toLowerCase().trim();
    return v === 'hunter' || v === 'chasseur' ? 'hunter' : 'prey';
  }

  private randomUid(): string {
    return 'p-' + Math.random().toString(36).slice(2, 10);
  }

  // --- Actions -------------------------------------------------------

  async createRoomWithOwner(name: string, ownerUid: string): Promise<CreateRoomResult> {
    const finalName = (name ?? '').trim() || 'Partie';

    const roomRef = await addDoc(collection(this.fs, 'rooms'), {
      name: finalName,
      ownerUid,
      state: 'idle',
      mode: 'default',
      targetScore: 10,
      timeLimit: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // invité synthétique
    const guestUid = `guest-${Math.random().toString(36).slice(2, 8)}`;

    const batch = writeBatch(this.fs);

    batch.set(doc(this.fs, `rooms/${roomRef.id}/players/${ownerUid}`), {
      role: 'chasseur', score: 0, spawn: { x: 0, y: 0 },
      iFrameUntilMs: 0, cantTagUntilMs: 0,
    });

    batch.set(doc(this.fs, `rooms/${roomRef.id}/players/${guestUid}`), {
      role: 'chassé', score: 0, spawn: { x: 10, y: 0 },
      iFrameUntilMs: 0, cantTagUntilMs: 0,
    });

    batch.set(doc(this.fs, 'rooms', roomRef.id), {
      roles: { [ownerUid]: 'chasseur', [guestUid]: 'chassé' },
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await batch.commit();
    return { roomId: roomRef.id, name: finalName, ownerUid, guestUid };
  }

  async addOrUpdatePlayer(
    roomId: string,
    input: { uid?: string; displayName: string; role?: 'hunter' | 'prey' },
    opts: { singleHunter?: boolean } = { singleHunter: true }
    ): Promise<string> {
    const uid = (input.uid?.trim() || ('p-' + Math.random().toString(36).slice(2, 10)));
    const role = (String(input.role ?? 'prey').toLowerCase() === 'hunter') ? 'hunter' : 'prey';

    const roomRef   = doc(this.fs, 'rooms', roomId);
    const playerRef = doc(this.fs, 'rooms', roomId, 'players', uid);

    await runTransaction(this.fs, async (tx) => {
        // 1) LECTURES (avant toute écriture)
        const [roomSnap, playerSnap] = await Promise.all([tx.get(roomRef), tx.get(playerRef)]);
        const now = serverTimestamp();

        const data  = roomSnap.data() || {};
        const roles = { ...(data['roles'] || {}) } as Record<string, 'hunter' | 'prey'>;

        if (opts.singleHunter && role === 'hunter') {
        for (const k of Object.keys(roles)) roles[k] = 'prey';
        roles[uid] = 'hunter';
        tx.update(roomRef, { roles, hunterUid: uid, updatedAt: now } as any);
        } else {
        roles[uid] = role;
        tx.update(roomRef, { roles, updatedAt: now } as any);
        }

        // 2) ÉCRITURES
        const base = {
        displayName: input.displayName,
        role,
        updatedAt: now,
        ...(playerSnap.exists() ? {} : { createdAt: now }),
        };
        tx.set(playerRef, base, { merge: true });
    });

    return uid;
    }

  async setPlayerRole(
    roomId: string,
    targetUid: string,
    roleIn: 'hunter' | 'prey',
    opts: { singleHunter?: boolean } = { singleHunter: true }
    ): Promise<void> {
    const role = (String(roleIn).toLowerCase() === 'hunter') ? 'hunter' : 'prey';
    const roomRef   = doc(this.fs, 'rooms', roomId);
    const playerRef = doc(this.fs, 'rooms', roomId, 'players', targetUid);

    await runTransaction(this.fs, async (tx) => {
        // 1) LECTURES
        const [roomSnap, playerSnap] = await Promise.all([tx.get(roomRef), tx.get(playerRef)]);
        const now = serverTimestamp();

        const data  = roomSnap.data() || {};
        const roles = { ...(data['roles'] || {}) } as Record<string, 'hunter' | 'prey'>;

        if (opts.singleHunter && role === 'hunter') {
        for (const k of Object.keys(roles)) roles[k] = 'prey';
        roles[targetUid] = 'hunter';
        tx.update(roomRef, { roles, hunterUid: targetUid, updatedAt: now } as any);
        } else {
        roles[targetUid] = role;
        tx.update(roomRef, { roles, updatedAt: now } as any);
        }

        // 2) ÉCRITURES
        const base = {
        role,
        updatedAt: now,
        ...(playerSnap.exists() ? {} : { createdAt: now }),
        };
        tx.set(playerRef, base, { merge: true });
    });
    }

  async removePlayer(roomId: string, targetUid: string): Promise<void> {
    const roomRef   = doc(this.fs, 'rooms', roomId);
    const playerRef = doc(this.fs, 'rooms', roomId, 'players', targetUid);

    await runTransaction(this.fs, async (tx) => {
        // 1) LECTURES
        const [roomSnap] = await Promise.all([tx.get(roomRef)]);
        const now = serverTimestamp();

        const data  = roomSnap.data() || {};
        const roles = { ...(data['roles'] || {}) } as Record<string, 'hunter' | 'prey'>;
        let hunterUid = (data as any)['hunterUid'] as string | undefined;

        if (roles[targetUid]) delete roles[targetUid];
        if (hunterUid === targetUid) hunterUid = undefined;

        // 2) ÉCRITURES
        tx.update(roomRef, { roles, hunterUid: hunterUid ?? null, updatedAt: now } as any);
        // (soft delete côté player; remplace par deleteDoc si tes règles le permettent)
        tx.set(playerRef, { disabled: true, updatedAt: now }, { merge: true });
    });
    }   

  async emitTag(roomId: string, actorUid: string, victimUid: string, x: number, y: number): Promise<void> {
    if (!roomId || !actorUid || !victimUid) throw new Error('missing-params');
    await addDoc(collection(this.fs, `rooms/${roomId}/events`), {
      type: 'tag',
      hunterUid: actorUid,
      victimUid,
      x, y,
      at: serverTimestamp(), // cohérent avec MonitorRead.latestEvents$ (champ 'at')
    });
  }

    async removePlayerAdmin(roomId: string, targetUid: string): Promise<void> {
    if (!roomId || !targetUid) throw new Error('missing-params');

    const call = httpsCallable<{ roomId: string; uid: string }, any>(this.fns, 'removePlayer');
    await call({ roomId, uid: targetUid });
    }

 async setRoomOwner(roomId: string, newOwnerUid: string): Promise<void> {
    const call = httpsCallable<{roomId:string; newOwnerUid:string}, any>(this.fns, 'setRoomOwner');
    await call({ roomId, newOwnerUid });
  }

    async randomizeSpawns(
        roomId: string,
        world: World,
        opts: { minGap?: number; seed?: number } = {}
        ): Promise<void> {
        if (!roomId) throw new Error('missing-roomId');

        const { minX, maxX, minY, maxY } = world;
        const minGap = Math.max(0, opts.minGap ?? 4); // distance mini entre joueurs (m)
        const seed   = opts.seed ?? Math.floor(Math.random()*1e9);

        // PRNG déterministe optionnel (mulberry32)
        function mulberry32(a:number){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
        const rnd = mulberry32(seed);

        // helpers
        const randIn = (lo:number, hi:number) => lo + (hi-lo)*rnd();
        const dist2 = (ax:number, ay:number, bx:number, by:number) => {
            const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy;
        };

        // 1) lire les joueurs
        const { collection, getDocs, doc, writeBatch, serverTimestamp } = await import('@angular/fire/firestore');
        const col = collection(this.fs, `rooms/${roomId}/players`);
        const snap = await getDocs(col);
        if (snap.empty) return;

        // 2) placer des points aléatoires en respectant minGap (rejection sampling simple)
        const placed: Array<{uid:string,x:number,y:number}> = [];
        const gap2 = minGap * minGap;

        for (const d of snap.docs) {
            const uid = d.id;
            let x=0, y=0, tries=0;
            const MAX_TRIES = 2_000;
            do {
            x = randIn(minX, maxX);
            y = randIn(minY, maxY);
            tries++;
            if (placed.every(p => dist2(p.x,p.y,x,y) >= gap2)) break;
            } while (tries < MAX_TRIES);

            placed.push({ uid, x, y });
        }

        // 3) batch update: spawn + (optionnel) x/y pour la carte live
        const batch = writeBatch(this.fs);
        for (const p of placed) {
            const pref = doc(this.fs, `rooms/${roomId}/players/${p.uid}`);
            batch.update(pref, {
            spawn: { x: p.x, y: p.y },
            // facultatif : si ta carte lit p.x/p.y pour l’affichage live
            x: p.x, y: p.y,
            updatedAt: serverTimestamp(),
            } as any);
        }
        await batch.commit();
    }

}
