import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { MonitorService } from '../../services/monitor.service';
import { map } from 'rxjs/operators';

// === BOTS ===
import { BotService, Bot } from '../../services/bot.service';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';

// === DIAG RTDB ===
import { Database, ref, get, set, onValue } from '@angular/fire/database';

type RoomVM = {
  id: string;
  status: 'idle' | 'running' | 'ended';
  mode: 'classic' | 'transmission' | 'infection';
  playerUids?: string[];
  hunterUids?: string[];
  roles?: Record<string, 'hunter' | 'runner'>;
  lastEventAt?: Date | null;
  roundEndAtMs?: number;
};

@Component({
  standalone: true,
  selector: 'app-room-detail',
  imports: [RouterLink, AsyncPipe, DatePipe, NgIf, NgFor],
  templateUrl: './room-detail.component.html',
  styleUrls: ['./room-detail.component.scss'],
})
export class RoomDetailComponent {
  private route = inject(ActivatedRoute);
  private monitor = inject(MonitorService);

  // === BOTS ===
  private botSvc = inject(BotService);
  private auth = inject(Auth);

  // === DIAG RTDB ===
  private db = inject(Database);

  readonly roomId = this.route.snapshot.paramMap.get('id')!;
  readonly room$ = this.monitor.rooms$.pipe(
    map((list) => list.find((r) => r.id === this.roomId))
  );

  // BOTS
  bots$: Observable<Bot[]> = this.botSvc.bots$(this.roomId);
  selectedBotId: string | null = null;
  private randomWalkTimer: any = null;

  // DIAG
  diag = {
    uid: '',
    isAdminRTDB: false,
    ownerUid: '(inconnu)',
    canWriteBots: '(test non lancé)',
  };

  constructor() {
    // Tente de poser l'owner si absent (écriture autorisée si !data.exists() ou si admin selon tes rules)
    this.botSvc.ensureOwnership(this.roomId);
  }

  ngOnInit() {
    const u = this.auth.currentUser;
    if (u?.uid) {
      const adminRef = ref(this.db, `admins/${u.uid}`);
      onValue(adminRef, (snap) => {
        this.diag.isAdminRTDB = snap.val() === true;
      }, (err) => {
        console.warn('[admins read denied]', err?.message || err);
        this.diag.isAdminRTDB = false; // fallback
      });
    }
  }

  // === Actions BOT ===
  async addBot() {
    const name = `Bot ${Math.floor(Math.random() * 100)}`;
    // s’assurer d’être owner (ou admin) juste avant d’écrire
    await this.botSvc.ensureOwnership(this.roomId);
    const id = await this.botSvc.addBot(this.roomId, name);
    this.selectedBotId = id;
  }

  async step(dx: number, dy: number) {
    if (!this.selectedBotId) return;
    await this.botSvc.moveBot(this.roomId, this.selectedBotId, dx, dy);
  }

  selectBot(id: string) {
    this.selectedBotId = id;
  }

  toggleRandom() {
    if (!this.selectedBotId) return;
    if (this.randomWalkTimer) {
      clearInterval(this.randomWalkTimer);
      this.randomWalkTimer = null;
      return;
    }
    this.randomWalkTimer = setInterval(() => {
      const dx = Math.floor(Math.random() * 3) - 1; // -1..+1
      const dy = Math.floor(Math.random() * 3) - 1;
      this.botSvc.moveBot(this.roomId, this.selectedBotId!, dx, dy);
    }, 600);
  }

  // === DIAGNOSTIC ===
  async runDiag() {
    const u = this.auth.currentUser;
    this.diag.uid = u?.uid || '(no user)';

    if (u?.uid) {
      const adminSnap = await get(ref(this.db, `admins/${u.uid}`));
      this.diag.isAdminRTDB = adminSnap.val() === true;
    }

    const ownerSnap = await get(ref(this.db, `roomsMeta/${this.roomId}/ownerUid`));
    this.diag.ownerUid = ownerSnap.exists() ? String(ownerSnap.val()) : '(absent)';
  }

  async tryWriteTest() {
    try {
      const path = `bots/${this.roomId}/__perm_test`;
      await set(ref(this.db, path), { t: Date.now() });
      this.diag.canWriteBots = 'OK (écriture autorisée)';
    } catch (e: any) {
      this.diag.canWriteBots = 'REFUSÉ: ' + (e?.message || e);
    }
  }
}
