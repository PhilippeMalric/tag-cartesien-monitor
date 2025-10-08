import { Injectable, inject } from '@angular/core';
import { authState, Auth as FirebaseAuth } from '@angular/fire/auth';
import { Firestore, doc, docData, collection, collectionData, updateDoc, query, orderBy, limit, getDoc, addDoc, serverTimestamp, writeBatch } from '@angular/fire/firestore';
import { Observable, firstValueFrom, map, shareReplay } from 'rxjs';

import { RoomDoc } from '../models/room.model';
import { MyPlayerDoc, TagEvent } from '../pages/room-detail/play.models';

@Injectable({ providedIn: 'root' })
export class MatchService {
  // expo interne pour Play (update iFrame)
  readonly fs = inject(Firestore);
  private auth = inject(FirebaseAuth);
  get uid(): string | undefined { return this.auth.currentUser?.uid || undefined; }
  
  private readonly EMIT_COOLDOWN_MS = 5000;
  private _lastEmitByHunter = new Map<string, number>(); // key = uid

  myPlayer$(matchId: string): Observable<MyPlayerDoc> {
    const uid = this.uid!;
    const meRef = doc(this.fs, `rooms/${matchId}/players/${uid}`);
    return docData(meRef).pipe(
      map(d => (d ?? {}) as MyPlayerDoc),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  room$(matchId: string): Observable<RoomDoc> {
    const roomRef = doc(this.fs, `rooms/${matchId}`);
    return docData(roomRef).pipe(
      map(d => (d ?? {}) as RoomDoc),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  events$ = (matchId: string): Observable<TagEvent[]> => {
    const eventsCol = collection(this.fs, `rooms/${matchId}/events`);
    const qEvents = query(eventsCol,  limit(20));
    return collectionData(qEvents, { idField: 'id' }).pipe(
      map(list => [...(list as TagEvent[])].reverse()),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

 
  private async getPlayer(matchId: string, uid: string) {
    const ref = doc(this.fs, `rooms/${matchId}/players/${uid}`);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as MyPlayerDoc) : undefined;
  }

  async emitTag(matchId: string, x: number, y: number, victimUid: string) {
    const uid = this.uid;
    if (!uid) return;
    const now = Date.now();

    // ⛔️ NEW: règle "sans retag"
    const me = await this.getPlayer(matchId, uid); // déjà existant chez toi
    if (me?.noRetagUid === victimUid && me?.noRetagUntilMs && now < me.noRetagUntilMs) {
      const err: any = new Error('no-retag');
      err.retryInMs = me.noRetagUntilMs - now;
      throw err; // à gérer côté UI (petit toast)
    }

    // (garde "lock" globale existante)
    if (me?.cantTagUntilMs && now < me.cantTagUntilMs) {
      const err: any = new Error('cant-tag-cooldown');
      err.retryInMs = me.cantTagUntilMs - now;
      throw err;
    }

    // (optionnel) vérifie rôle chasseur
    if (me?.role !== 'chasseur') {
      throw new Error('not-hunter');
    }

    // 🔒 Garde LOCALE anti double-émission
    const lastLocal = this._lastEmitByHunter.get(uid) ?? 0;
    if (now - lastLocal < this.EMIT_COOLDOWN_MS) {
      const err: any = new Error('emit-cooldown');
      err.retryInMs = this.EMIT_COOLDOWN_MS - (now - lastLocal);
      throw err;
    }

    // 🟢 Arme le cooldown local tout de suite, rollback si échec
    this._lastEmitByHunter.set(uid, now);
    try {
      await addDoc(collection(this.fs, `rooms/${matchId}/events`), {
        type: 'tag',
        hunterUid: uid,
        victimUid,
        x, y,
        ts: serverTimestamp(),
      });
    } catch (e) {
      this._lastEmitByHunter.delete(uid);
      throw e;
    }
  }

  async endIfTargetReached(matchId: string, projectedMyScore: number) {
    const uid = this.uid; if (!uid) return;
    const roomRef = doc(this.fs, `rooms/${matchId}`);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as RoomDoc;
    if (room.ownerUid !== uid) return;
    if (!room?.targetScore || projectedMyScore < room.targetScore) return;
    await updateDoc(roomRef, { state: 'ended' });
  }

  endByTimer = async (matchId: string) =>  {
    const uid = this.uid; if (!uid) return;
    const roomRef = doc(this.fs, `rooms/${matchId}`);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const room = snap.data() as RoomDoc;
    if (room.ownerUid !== uid) return;
    await updateDoc(roomRef, { state: 'ended' });
  }

  async getMyPlayerIdFromAuth(): Promise<string> {
    
    // essaie d’abord le courant
    const cur = this.auth.currentUser?.uid;
    if (cur) return cur;
    // sinon attends le prochain authState
    const u = await firstValueFrom(authState(this.auth));
    return u?.uid ?? '';
  }

  topPlayers$(roomId: string, top = 8): Observable<Array<{ uid: string; score: number; displayName?: string; combo?: number }>> {
    const col = collection(this.fs, `rooms/${roomId}/players`);
    const q = query(col, orderBy('score', 'desc'), limit(top));
    return collectionData(q, { idField: 'uid' }) as any;
  }

 
  /** Crée une room + 2 participants.
   *  - Le user courant est "chasseur"
   *  - Un invité synthétique est "chassé"
   *  Renvoie { roomId, name, ownerUid, guestUid } pour usage UI.
   */
  async createRoom(name: string): Promise<{ roomId: string; name: string; ownerUid: string; guestUid: string }> {
    const ownerUid = this.uid;
    if (!ownerUid) throw new Error('auth-required');

    const finalName = (name ?? '').trim() || 'Partie';

    // 1) Crée le doc room
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
    const roomId = roomRef.id;

    // 2) Prépare les 2 joueurs
    const guestUid = `guest-${Math.random().toString(36).slice(2, 8)}`;

    const p1: MyPlayerDoc = {
      role: 'chasseur',
      score: 0,
      spawn: { x: 0, y: 0 },
      iFrameUntilMs: 0,
      cantTagUntilMs: 0,
    };

    const p2: MyPlayerDoc = {
      role: 'chassé',
      score: 0,
      spawn: { x: 10, y: 0 },
      iFrameUntilMs: 0,
      cantTagUntilMs: 0,
    };

    // 3) Batch: players + roles + updatedAt
    const batch = writeBatch(this.fs);

    // players subcollection
    batch.set(doc(this.fs, `rooms/${roomId}/players/${ownerUid}`), p1);
    batch.set(doc(this.fs, `rooms/${roomId}/players/${guestUid}`), p2);

    // roles map (utilisé par MonitorService.normalizeRoles) + updatedAt
    batch.set(
      doc(this.fs, 'rooms', roomId),
      {
        roles: {
          [ownerUid]: 'chasseur',
          [guestUid]: 'chassé',
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();

    // ➜ On renvoie aussi le nom pour afficher "Room “X” créée"
    return { roomId, name: finalName, ownerUid, guestUid };
  }
}
