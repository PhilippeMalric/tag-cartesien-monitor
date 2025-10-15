// src/app/services/monitor-admin.service.ts
import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc,
  getDocs, writeBatch, deleteDoc,
  CollectionReference
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { MonitorReadService } from './monitor-read.service';

@Injectable({ providedIn: 'root' })
export class MonitorAdminService {
  private fs   = inject(Firestore);
  private read = inject(MonitorReadService);

  /** Supprime proprement une room + sous-collections (players, events) */
  async deleteRoom(roomId: string): Promise<void> {
    if (!roomId) return;
    // 1) purge des sous-collections (batch)
    const subcols: CollectionReference[] = [
      collection(this.fs, 'rooms', roomId, 'players') as CollectionReference,
      collection(this.fs, 'rooms', roomId, 'events')  as CollectionReference,
    ];

    for (const col of subcols) {
      const snap = await getDocs(col);
      if (!snap.empty) {
        const batch = writeBatch(this.fs);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // 2) suppression du document room
    await deleteDoc(doc(this.fs, 'rooms', roomId));
  }

  /** Supprime toutes les rooms visibles par le monitor */
  async deleteAllRooms(): Promise<void> {
    const rooms = await firstValueFrom(this.read.rooms$);
    for (const r of rooms) {
      try { await this.deleteRoom((r as any).id); } catch { /* continue */ }
    }
  }
}
