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
  
}
